

'use server';

import { firestore } from '@/lib/firebase-admin';
import type { ClientBillingConcept, TariffRange, SpecificTariff, TemperatureTariffRange } from '@/app/gestion-conceptos-liquidacion-clientes/actions';
import { getClientBillingConcepts } from '@/app/gestion-conceptos-liquidacion-clientes/actions';
import admin from 'firebase-admin';
import { startOfDay, endOfDay, parseISO, differenceInHours, getDaysInMonth, getDay, format, addMinutes, addHours, differenceInMinutes, parse, isSaturday, isSunday, addDays, eachDayOfInterval, isWithinInterval, isBefore, isEqual } from 'date-fns';
import type { ArticuloData } from '@/app/actions/articulos';
import { getConsolidatedMovementReport } from '@/app/actions/consolidated-movement-report';
import { processTunelCongelacionData } from '@/lib/report-utils';
import { getSmylLotAssistantReport, type AssistantReport } from '@/app/smyl-liquidation-assistant/actions';
import { getDetailedInventoryForExport } from '@/app/actions/inventory-report';


export async function getAllManualClientOperations(): Promise<any[]> {
    if (!firestore) {
        return [];
    }
    try {
        const snapshot = await firestore.collection('manual_client_operations')
            .orderBy('operationDate', 'desc')
            .get();
        
        return snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                ...data,
                id: doc.id,
                operationDate: (data.operationDate as admin.firestore.Timestamp).toDate().toISOString(),
                createdAt: data.createdAt,
            }
        });
    } catch (error) {
        console.error("Error fetching all manual client operations:", error);
        return [];
    }
}


export interface ClientSettlementRow {
  date: string;
  totalPaletas: number;
  placa: string;
  container: string;
  camara: string;
  operacionLogistica: string;
  pedidoSislog: string; 
  conceptName: string;
  subConceptName?: string; // New field for child concept
  tipoVehiculo: string;
  quantity: number;
  unitOfMeasure: string;
  unitValue: number;
  totalValue: number;
  horaInicio?: string;
  horaFin?: string;
  numeroPersonas?: number | string;
  uniqueId?: boolean;
  isEdited?: boolean;
  isPending?: boolean; // Para marcar si necesita legalización
  submissionId?: string; // Para saber a qué formulario enlazar
  formType?: string; // NUEVA LÍNEA
}

export interface ClientSettlementResult {
    success: boolean;
    data?: ClientSettlementRow[];
    error?: string;
    errorLink?: string;
}

const findMatchingTariff = (tons: number, concept: ClientBillingConcept): TariffRange | undefined => {
    if (!concept.tariffRanges || concept.tariffRanges.length === 0) {
        return undefined;
    }
    // Prioritize finding the correct weight range first.
    const matchingRange = concept.tariffRanges.find(range => 
        tons >= range.minTons && 
        tons <= range.maxTons
    );
    return matchingRange;
};

const findMatchingTemperatureTariff = (temp: number, concept: ClientBillingConcept): TemperatureTariffRange | undefined => {
    if (!concept.tariffRangesTemperature || concept.tariffRangesTemperature.length === 0) {
        return undefined;
    }
    
    return concept.tariffRangesTemperature.find(range => {
        const min = Math.min(range.minTemp, range.maxTemp);
        const max = Math.max(range.minTemp, range.maxTemp);
        return temp >= min && temp <= max;
    });
};

const getOperationLogisticsType = (isoDateString: string, horaInicio: string, horaFin: string, concept: ClientBillingConcept): "Diurno" | "Nocturno" | "Extra" | "N/A" => {
    const specialConcepts = ["FMM DE INGRESO", "ARIN DE INGRESO", "FMM DE SALIDA", "ARIN DE SALIDA", "REESTIBADO", "ALISTAMIENTO POR UNIDAD", "FMM DE INGRESO ZFPC", "FMM DE SALIDA ZFPC", "FMM ZFPC", "TIEMPO EXTRA FRIOAL (FIJO)", "TIEMPO EXTRA FRIOAL", "SERVICIO DE TUNEL DE CONGELACIÓN RAPIDA"];
    if (specialConcepts.includes(concept.conceptName.toUpperCase())) {
      return "N/A";
    }

    if (concept.calculationType !== 'REGLAS' || concept.tariffType !== 'RANGOS' || !isoDateString || !horaInicio || !horaFin) {
        return "N/A";
    }

    try {
        const date = new Date(isoDateString);
        date.setUTCHours(date.getUTCHours() - 5);

        const dayOfWeek = date.getUTCDay(); // 0=Sunday, 6=Saturday

        const [startHours, startMinutes] = horaInicio.split(':').map(Number);
        const startTime = new Date(date);
        startTime.setUTCHours(startHours, startMinutes, 0, 0);

        const [endHours, endMinutes] = horaFin.split(':').map(Number);
        const endTime = new Date(date);
        endTime.setUTCHours(endHours, endMinutes, 0, 0);

        if (endTime <= startTime) {
            endTime.setUTCDate(endTime.getUTCDate() + 1);
        }

        let diurnoStartStr: string | undefined, diurnoEndStr: string | undefined;
        let shiftTypes: { diurno: "Diurno", other: "Nocturno" | "Extra" };

        if (dayOfWeek >= 1 && dayOfWeek <= 5) { // Monday to Friday
            diurnoStartStr = concept.weekdayDayShiftStart;
            diurnoEndStr = concept.weekdayDayShiftEnd;
            shiftTypes = { diurno: "Diurno", other: "Nocturno" };
        } else if (dayOfWeek === 6) { // Saturday
            diurnoStartStr = concept.saturdayDayShiftStart;
            diurnoEndStr = concept.saturdayDayShiftEnd;
            shiftTypes = { diurno: "Diurno", other: "Extra" };
        } else { // Sunday (dayOfWeek === 0)
            return "Extra";
        }
        
        if (!diurnoStartStr || !diurnoEndStr) {
            return "N/A"; // Shift times are not configured for this day
        }

        const [diurnoStartHours, diurnoStartMinutes] = diurnoStartStr.split(':').map(Number);
        const diurnoStart = new Date(date);
        diurnoStart.setUTCHours(diurnoStartHours, diurnoStartMinutes, 0, 0);

        const [diurnoEndHours, diurnoEndMinutes] = diurnoEndStr.split(':').map(Number);
        const diurnoEnd = new Date(date);
        diurnoEnd.setUTCHours(diurnoEndHours, diurnoEndMinutes, 0, 0);

        if (startTime >= diurnoStart && endTime <= diurnoEnd) {
            return shiftTypes.diurno;
        } else {
            return shiftTypes.other;
        }

    } catch (e) {
        console.error(`Error calculating logistics type:`, e);
        return 'N/A';
    }
};

const serializeTimestamps = (data: any): any => {
    if (data === null || data === undefined || typeof data !== 'object') {
        return data;
    }
    if (data instanceof admin.firestore.Timestamp) {
      return data.toDate().toISOString();
    }
    if (Array.isArray(data)) {
        return data.map(serializeTimestamps);
    }
    const newObj: { [key: string]: any } = {};
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
            newObj[key] = serializeTimestamps(data[key]);
      }
    }
    return newObj;
};

// Simplified operation structure for processing
interface BasicOperation {
    type: 'form' | 'manual' | 'crew_manual';
    data: any;
}


const getFilteredItems = (
    op: any,
    sessionFilter: 'CO' | 'RE' | 'SE' | 'AMBOS' | undefined,
    articleSessionMap: Map<string, string>
): any[] => {
    const allItems = (op.formData.productos || [])
        .concat(op.formData.items || [])
        .concat((op.formData.destinos || []).flatMap((d: any) => d.items || []))
        .concat((op.formData.placas || []).flatMap((p: any) => p.items || []));

    if (!sessionFilter || sessionFilter === 'AMBOS') {
        return allItems;
    }

    return allItems.filter((item: any) => {
        if (!item || !item.codigo) return false;
        const itemSession = articleSessionMap.get(item.codigo);
        return itemSession === sessionFilter;
    });
};


const calculateWeightForOperation = (
    op: any,
    sessionFilter: 'CO' | 'RE' | 'SE' | 'AMBOS' | undefined,
    articleSessionMap: Map<string, string>,
    forceNetWeight: boolean = false // Nuevo parámetro
): number => {
    const { formType, formData } = op;
    const items = getFilteredItems(op, sessionFilter, articleSessionMap);
    if (items.length === 0) return 0;

    if (formType === 'fixed-weight-despacho' || formType === 'fixed-weight-recepcion' || formType === 'fixed-weight-reception') {
        if (forceNetWeight) {
            return items.reduce((sum: number, p: any) => sum + (Number(p.pesoNetoKg) || 0), 0);
        }
        if (!sessionFilter || sessionFilter === 'AMBOS') {
            const grossWeight = Number(formData.totalPesoBrutoKg);
            if (grossWeight > 0) return grossWeight;
        }
        return items.reduce((sum: number, p: any) => sum + (Number(p.pesoNetoKg) || 0), 0);
    }
    
    if (formType === 'variable-weight-despacho' || formType === 'variable-weight-recepcion' || formType === 'variable-weight-reception') {
        if (forceNetWeight) {
             return items.reduce((sum: number, item: any) => sum + (Number(item.pesoNeto) || Number(item.totalPesoNeto) || 0), 0);
        }
        const isSummaryFormat = items.some((p: any) => Number(p.paleta) === 0);
        if (isSummaryFormat) {
            return items.reduce((sum: number, item: any) => sum + (Number(item.totalPesoNeto) || 0), 0);
        }
        
        if(formType.includes('recepcion') || formType.includes('reception')) {
             const totalPesoBruto = items.reduce((sum: number, p: any) => sum + (Number(p.pesoBruto) || 0), 0);
             const totalTaraEstiba = items.reduce((sum: number, p: any) => sum + (Number(p.taraEstiba) || 0), 0);
             return totalPesoBruto - totalTaraEstiba;
        }
        return items.reduce((sum: number, item: any) => sum + (Number(item.pesoNeto) || 0), 0);
    }

    return 0;
};

const calculatePalletsForOperation = (
    op: any,
    sessionFilter: 'CO' | 'RE' | 'SE' | 'AMBOS' | undefined,
    articleSessionMap: Map<string, string>,
    concept?: ClientBillingConcept 
): number => {
  const { formType, formData } = op;
  const allItems = getFilteredItems(op, sessionFilter, articleSessionMap);
  if (allItems.length === 0) return 0;
  
  const palletTypeFilter = concept?.palletTypeFilter || 'ambas';

  if (formData.tipoPedido === 'TUNEL DE CONGELACIÓN' && formData.recepcionPorPlaca) {
      const { totalGeneralPaletas } = processTunelCongelacionData(formData);
      return totalGeneralPaletas;
  }
  
  if (formType?.startsWith('fixed-weight')) {
      return allItems.reduce((sum: number, p: any) => sum + (Number(p.totalPaletas) || Number(p.paletasCompletas) || 0), 0);
  }

  if (formType?.startsWith('variable-weight')) {
    const isSummary = allItems.some((i: any) => Number(i.paleta) === 0);
    
    if (isSummary) {
      if (formType.includes('despacho') && formData.despachoPorDestino) {
        return Number(formData.totalPaletasDespacho) || 0;
      }
      
      return allItems.reduce((sum: number, i: any) => {
        if (palletTypeFilter === 'ambas') {
            return sum + (Number(i.paletasCompletas) || 0) + (Number(i.paletasPicking) || 0);
        }
        if (palletTypeFilter === 'completas') {
            return sum + (Number(i.paletasCompletas) || 0);
        }
        if (palletTypeFilter === 'picking') {
            return sum + (Number(i.paletasPicking) || 0);
        }
        return sum + (Number(i.totalPaletas) || 0);
      }, 0);
    }
    
    // Detailed (non-summary) logic
    const uniquePallets = new Set<number>();
    allItems.forEach((item: any) => {
      const paletaNum = Number(item.paleta);
      if (!isNaN(paletaNum) && paletaNum > 0) {
        let shouldCount = false;
        if (palletTypeFilter === 'ambas') {
            shouldCount = true;
        } else if (palletTypeFilter === 'completas') {
            shouldCount = !item.esPicking;
        } else if (palletTypeFilter === 'picking') {
            shouldCount = item.esPicking === true;
        }
        
        if (shouldCount) {
            uniquePallets.add(paletaNum);
        }
      }
    });
    return uniquePallets.size;
  }
  
  return 0;
};

const calculateUnitsForOperation = (
    op: any,
    sessionFilter: 'CO' | 'RE' | 'SE' | 'AMBOS' | undefined,
    articleSessionMap: Map<string, string>,
    concept?: ClientBillingConcept
): number => {
    const { formType, formData } = op;
    const palletTypeFilter = concept?.palletTypeFilter || 'ambas';
    const isDispatch = formType?.includes('despacho');

    let allItems = getFilteredItems(op, sessionFilter, articleSessionMap);

    if (formType === 'fixed-weight-despacho' && palletTypeFilter !== 'ambas') {
        const filteredProducts = formData.productos.filter((p: any) => {
            const hasSession = sessionFilter === 'AMBOS' || articleSessionMap.get(p.codigo) === sessionFilter;
            if (!hasSession) return false;

            if (palletTypeFilter === 'completas') {
                return (Number(p.paletasCompletas) || 0) > 0 && (Number(p.paletasPicking) || 0) === 0;
            }
            if (palletTypeFilter === 'picking') {
                return (Number(p.paletasPicking) || 0) > 0 && (Number(p.paletasCompletas) || 0) === 0;
            }
            return false;
        });
        return filteredProducts.reduce((sum: number, p: any) => sum + (Number(p.cajas) || 0), 0);
    }
    
    if (formType?.startsWith('fixed-weight')) {
        return allItems.reduce((sum: number, p: any) => sum + (Number(p.cajas) || 0), 0);
    }
    
    // --- Lógica para Despacho de Peso Variable ---
    if (isDispatch && formType.startsWith('variable-weight-')) {
        const isDespachoPorDestino = formData.despachoPorDestino === true;
        const sourceItems = isDespachoPorDestino ? (formData.destinos || []).flatMap((d: any) => d.items || []) : (formData.items || []);
        
        const itemsToProcess = sourceItems.filter((item: any) => {
            const hasSession = sessionFilter === 'AMBOS' || articleSessionMap.get(item.codigo) === sessionFilter;
            if (!hasSession) return false;
            
            if (palletTypeFilter === 'completas') {
                return !item.esPicking;
            }
            if (palletTypeFilter === 'picking') {
                return item.esPicking === true;
            }
            return true; // para 'ambas'
        });

        const isSummary = itemsToProcess.some((i: any) => Number(i.paleta) === 0);
        if (isSummary) {
            return itemsToProcess.reduce((sum: number, i: any) => sum + (Number(i.totalCantidad) || 0), 0);
        }
        return itemsToProcess.reduce((sum: number, i: any) => sum + (Number(i.cantidadPorPaleta) || 0), 0);
    }

    // --- Lógica para Recepción de Peso Variable (y fallback) ---
    const isSummary = allItems.some((i: any) => Number(i.paleta) === 0);
    if (isSummary) {
        return allItems.reduce((sum: number, i: any) => sum + (Number(i.totalCantidad) || 0), 0);
    }
    return allItems.reduce((sum: number, i: any) => sum + (Number(i.cantidadPorPaleta) || 0), 0);
};



const formatTime12Hour = (timeStr: string | undefined): string => {
    if (!timeStr) return 'N/A';

    // Check if it's already a formatted date-time string
    // e.g., "13/09/2025 06:50 PM"
    const dateTimeParts = timeStr.split(' ');
    if (dateTimeParts.length > 2 && (dateTimeParts[2] === 'AM' || dateTimeParts[2] === 'PM')) {
        return timeStr;
    }
    
    // Handle HH:mm format
    if (!timeStr.includes(':')) return 'N/A';

    const [hours, minutes] = timeStr.split(':');
    let h = parseInt(hours, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    h = h ? h : 12; // the hour '0' should be '12'
    return `${h.toString().padStart(2, '0')}:${minutes} ${ampm}`;
};

async function generateSmylLiquidation(
    startDate: string,
    endDate: string,
    lotIds: string[],
    allConcepts: ClientBillingConcept[],
    processedCrossDockLots: Set<string>
  ): Promise<ClientSettlementRow[]> {
      if (lotIds.length === 0) return [];
      
      let allLotRows: ClientSettlementRow[] = [];
      
      const mainConcept = allConcepts.find(c => c.conceptName.toUpperCase() === 'SERVICIO LOGÍSTICO MANIPULACIÓN CARGA');
      const dailyConcept = allConcepts.find(c => c.conceptName.toUpperCase() === 'SERVICIO LOGÍSTICO CONGELACIÓN (COBRO DIARIO)');
      
      if (!mainConcept?.value || !dailyConcept?.value) {
          throw new Error(`No se encontraron las tarifas para los conceptos de SMYL ('MANIPULACIÓN CARGA', 'COBRO DIARIO'). Verifique la configuración.`);
      }
      
      const mainTariff = mainConcept.value;
      const dailyPalletRate = dailyConcept.value;
  
      for (const lotId of lotIds) {
          if (processedCrossDockLots.has(lotId)) {
            continue; // Skip this lot if it was already processed by cross-docking logic
          }
          const report = await getSmylLotAssistantReport(lotId, startDate, endDate);
          if ('error' in report) {
              console.warn(`Skipping lot ${lotId}: ${report.error}`);
              continue;
          }
  
          const { initialReception, dailyBalances } = report;
          const receptionDate = startOfDay(initialReception.date);
          const queryStart = startOfDay(parseISO(startDate));
          const queryEnd = endOfDay(parseISO(endDate));
          
          if (isWithinInterval(receptionDate, { start: queryStart, end: queryEnd })) {
              const freezingTotal = initialReception.pallets * dailyPalletRate * 4;
              const manipulationTotal = mainTariff - freezingTotal;
  
              allLotRows.push({
                  date: format(receptionDate, 'yyyy-MM-dd'),
                  conceptName: 'SERVICIO LOGÍSTICO MANIPULACIÓN CARGA',
                  subConceptName: 'Servicio logístico Congelación (4 Días)',
                  quantity: initialReception.pallets,
                  unitOfMeasure: 'PALETA',
                  unitValue: dailyPalletRate,
                  totalValue: freezingTotal,
                  placa: '', container: initialReception.container, camara: 'CO', operacionLogistica: 'Recepción', 
                  pedidoSislog: initialReception.pedidoSislog, tipoVehiculo: '', totalPaletas: initialReception.pallets,
              });
  
              allLotRows.push({
                  date: format(receptionDate, 'yyyy-MM-dd'),
                  conceptName: 'SERVICIO LOGÍSTICO MANIPULACIÓN CARGA',
                  subConceptName: 'Servicio de Manipulación',
                  quantity: 1, unitOfMeasure: 'UNIDAD', unitValue: manipulationTotal, totalValue: manipulationTotal,
                  placa: '', container: initialReception.container, camara: 'CO', operacionLogistica: 'Recepción', 
                  pedidoSislog: initialReception.pedidoSislog, tipoVehiculo: '', totalPaletas: 0,
              });
          }
          
          const gracePeriodEndDate = addDays(receptionDate, 4);
          const relevantDailyBalances = dailyBalances.filter(day => {
              const dayDate = parseISO(day.date);
              return dayDate >= gracePeriodEndDate && dayDate >= queryStart && dayDate <= queryEnd;
          });
  
          for (const day of relevantDailyBalances) {
              if (day.finalBalance > 0) {
                  allLotRows.push({
                      date: day.date,
                      conceptName: 'SERVICIO LOGÍSTICO CONGELACIÓN (COBRO DIARIO)',
                      quantity: day.finalBalance,
                      unitOfMeasure: 'PALETA/DIA',
                      unitValue: dailyPalletRate,
                      totalValue: day.finalBalance * dailyPalletRate,
                      placa: '', container: initialReception.container, camara: 'CO', operacionLogistica: 'Servicio Congelación',
                      pedidoSislog: initialReception.pedidoSislog, tipoVehiculo: '', totalPaletas: day.finalBalance
                  });
              }
          }
      }
      
      return allLotRows;
  }
  
async function processCargueAlmacenamiento(
    concept: ClientBillingConcept,
    weightCondition: (weight: number) => boolean,
    allSubmissionsForClient: any[],
    serverQueryStartDate: Date,
    serverQueryEndDate: Date,
    settlementRows: ClientSettlementRow[],
    processedCrossDockLots: Set<string>,
    allConcepts: ClientBillingConcept[],
    containerNumber?: string 
) {
    let recepciones = allSubmissionsForClient
        .filter(op => 
            (op.formType === 'variable-weight-reception' || op.formType === 'variable-weight-recepcion') &&
            op.formData.tipoPedido === 'GENERICO'
        );
    
    if (containerNumber) {
        recepciones = recepciones.filter(op => op.formData.contenedor === containerNumber);
    }
    
    const congelacionConcept = allConcepts.find(c => c.conceptName === 'SERVICIO LOGÍSTICO CONGELACIÓN (1 DÍA)');
    const manipulacionConcept = allConcepts.find(c => c.conceptName === 'SERVICIO DE MANIPULACIÓN');

    if (!congelacionConcept || !manipulacionConcept) {
        console.warn("Sub-conceptos para SMYL (Congelación o Manipulación) no encontrados. Saltando lógica.");
        return;
    }
    const congelacionTariff = congelacionConcept.value || 8750;

    for (const recepcion of recepciones) {
        const lotesEnRecepcion: Record<string, { peso: number, paletas: Set<string> }> = (recepcion.formData.items || []).reduce((acc: any, item: any) => {
            if (item.lote) {
                if (!acc[item.lote]) {
                    acc[item.lote] = { peso: 0, paletas: new Set() };
                }
                acc[item.lote].peso += Number(item.pesoBruto) || 0;
                acc[item.lote].paletas.add(item.paleta);
            }
            return acc;
        }, {});

        for (const loteId in lotesEnRecepcion) {
            if (processedCrossDockLots.has(loteId)) continue;
            
            if (weightCondition(lotesEnRecepcion[loteId].peso)) {
                const fechaRecepcion = new Date(recepcion.formData.fecha);
                const fechaRecepcionStr = format(fechaRecepcion, 'yyyy-MM-dd');
                const fechaSiguienteStr = format(addDays(fechaRecepcion, 1), 'yyyy-MM-dd');
                
                 let despachosRelevantes = allSubmissionsForClient.filter(op => {
                    if (op.formType !== 'variable-weight-despacho') return false;
                    
                    const fechaDespachoStr = format(new Date(op.formData.fecha), 'yyyy-MM-dd');
                    const fechaValida = fechaDespachoStr === fechaRecepcionStr || fechaDespachoStr === fechaSiguienteStr;
                    if (!fechaValida) return false;
                    
                    const allItems = (op.formData.items || [])
                        .concat((op.formData.destinos || []).flatMap((d: any) => d.items || []));
                    
                    return allItems.some((item: any) => item.lote === loteId);
                });

                if (containerNumber) {
                    despachosRelevantes = despachosRelevantes.filter(op => op.formData.contenedor === containerNumber);
                }

                if (despachosRelevantes.length > 0) {
                    let totalPaletasDespachadas = 0;
                    const paletasContadas = new Set<string>();
                    let fechaDespachoMasReciente = new Date(0);

                    despachosRelevantes.forEach(despacho => {
                        const allItemsDespacho = (despacho.formData.items || [])
                            .concat((despacho.formData.destinos || []).flatMap((d: any) => d.items || []));
                        
                        const fechaDespachoActual = new Date(despacho.formData.fecha);
                        if(fechaDespachoActual > fechaDespachoMasReciente) {
                            fechaDespachoMasReciente = fechaDespachoActual;
                        }

                        allItemsDespacho.forEach((item: any) => {
                            if (item.lote === loteId && !item.esPicking && item.paleta) {
                                const palletIdentifier = `${despacho.id}-${item.paleta}`; // Identificador único por despacho y paleta
                                if (!paletasContadas.has(palletIdentifier)) {
                                    totalPaletasDespachadas++;
                                    paletasContadas.add(palletIdentifier);
                                }
                            }
                        });
                    });

                    if (totalPaletasDespachadas > 0 && totalPaletasDespachadas === lotesEnRecepcion[loteId].paletas.size) {
                        if (!isWithinInterval(fechaRecepcion, { start: serverQueryStartDate, end: serverQueryEndDate })) {
                            continue;
                        }

                        const totalPaletasRecepcion = lotesEnRecepcion[loteId].paletas.size;
                        const valorTotalConceptoPrincipal = concept.value || 0;
                        const fechaDespachoFinalStr = format(fechaDespachoMasReciente, 'yyyy-MM-dd');

                        if (fechaRecepcionStr === fechaDespachoFinalStr) {
                           settlementRows.push({
                               date: fechaRecepcionStr,
                               placa: recepcion.formData.placa,
                               container: recepcion.formData.contenedor,
                               camara: 'CO',
                               totalPaletas: totalPaletasRecepcion,
                               operacionLogistica: 'Cross-Docking',
                               pedidoSislog: recepcion.formData.pedidoSislog,
                               conceptName: "SERVICIO DE MANIPULACIÓN",
                               subConceptName: undefined,
                               tipoVehiculo: 'N/A',
                               quantity: 1,
                               unitOfMeasure: 'UNIDAD',
                               unitValue: valorTotalConceptoPrincipal,
                               totalValue: valorTotalConceptoPrincipal,
                           });
                       } else {
                           const totalCongelacion = totalPaletasRecepcion * congelacionTariff;
                           const totalManipulacion = valorTotalConceptoPrincipal - totalCongelacion;
                           
                           settlementRows.push({
                               date: fechaRecepcionStr,
                               placa: recepcion.formData.placa,
                               container: recepcion.formData.contenedor,
                               camara: 'CO',
                               totalPaletas: totalPaletasRecepcion,
                               operacionLogistica: 'Recepción',
                               pedidoSislog: recepcion.formData.pedidoSislog,
                               conceptName: concept.conceptName,
                               subConceptName: 'Servicio logístico Congelación (1 día)',
                               tipoVehiculo: 'N/A',
                               quantity: totalPaletasRecepcion,
                               unitOfMeasure: 'PALETA',
                               unitValue: congelacionTariff,
                               totalValue: totalCongelacion,
                           });
                           
                           settlementRows.push({
                               date: fechaRecepcionStr,
                               placa: recepcion.formData.placa,
                               container: recepcion.formData.contenedor,
                               camara: 'CO',
                               totalPaletas: 0,
                               operacionLogistica: 'Recepción',
                               pedidoSislog: recepcion.formData.pedidoSislog,
                               conceptName: concept.conceptName,
                               subConceptName: 'Servicio de Manipulación',
                               tipoVehiculo: 'N/A',
                               quantity: 1,
                               unitOfMeasure: 'UNIDAD',
                               unitValue: totalManipulacion,
                               totalValue: totalManipulacion,
                           });
                       }
                        processedCrossDockLots.add(loteId);
                    }
                }
            }
        }
    }
}

async function processAvicolaMaquila(
    concept: ClientBillingConcept,
    allSubmissionsForClient: any[],
    serverQueryStartDate: Date,
    serverQueryEndDate: Date,
    settlementRows: ClientSettlementRow[]
) {
    const alquilerConceptNameNormalized = 'ALQUILER DE ÁREA PARA EMPAQUE/DIA';
    const apoyoConceptNameNormalized = 'SERVICIO APOYO JORNAL';
    const currentConceptNameNormalized = concept.conceptName
        .replace('AREA', 'ÁREA')
        .toUpperCase();

    const recepcionesMaquila = allSubmissionsForClient.filter(op =>
        isWithinInterval(new Date(op.formData.fecha), { start: serverQueryStartDate, end: serverQueryEndDate }) &&
        (op.formType === 'variable-weight-reception' || op.formType === 'variable-weight-recepcion') &&
        op.formData.tipoPedido === 'MAQUILA' &&
        op.formData.tipoEmpaqueMaquila === 'EMPAQUE DE CAJAS'
    );
    
    for (const recepcion of recepcionesMaquila) {
        let quantity = 0;
        let unitOfMeasure = concept.unitOfMeasure;
        
        if (currentConceptNameNormalized === alquilerConceptNameNormalized) {
            quantity = 1;
        } else if (currentConceptNameNormalized === apoyoConceptNameNormalized) {
            quantity = 3;
            unitOfMeasure = 'UNIDAD';
        }

        if (quantity > 0) {
            settlementRows.push({
                date: recepcion.formData.fecha,
                placa: recepcion.formData.placa || 'N/A',
                container: recepcion.formData.contenedor || 'N/A',
                camara: 'N/A',
                totalPaletas: calculatePalletsForOperation(recepcion, 'AMBOS', new Map()),
                operacionLogistica: 'Maquila',
                pedidoSislog: recepcion.formData.pedidoSislog,
                conceptName: concept.conceptName,
                tipoVehiculo: 'N/A',
                quantity,
                unitOfMeasure: unitOfMeasure,
                unitValue: concept.value || 0,
                totalValue: quantity * (concept.value || 0),
                horaInicio: recepcion.formData.horaInicio,
                horaFin: recepcion.formData.horaFin,
            });
        }
    }
}


export async function generateClientSettlement(criteria: {
  clientName: string;
  startDate: string;
  endDate: string;
  conceptIds: string[];
  containerNumber?: string;
  lotIds?: string[];
}): Promise<ClientSettlementResult> {
  
  const { clientName, startDate, endDate, conceptIds, lotIds, containerNumber } = criteria;
  const processedCrossDockLots = new Set<string>();
  const allConcepts = await getClientBillingConcepts();

  if (clientName === 'SMYL TRANSPORTE Y LOGISTICA SAS' && lotIds && lotIds.length > 0) {
      if (conceptIds.length > 0) {
          return { success: false, error: "No puede seleccionar conceptos manuales al liquidar por lote en SMYL." };
      }
      try {
        const smylRows = await generateSmylLiquidation(startDate, endDate, lotIds, allConcepts, processedCrossDockLots);
        return { success: true, data: smylRows };
      } catch (e: any) {
        return { success: false, error: e.message || "Error al generar liquidación SMYL." };
      }
  }

  if (!firestore) {
    return { success: false, error: 'El servidor no está configurado correctamente.' };
  }
  
  const selectedConcepts = allConcepts.filter(c => conceptIds.includes(c.id));

  if (!clientName || !startDate || !endDate || selectedConcepts.length === 0) {
    return { success: false, error: 'Faltan criterios para la liquidación.' };
  }

  try {
    
    const serverQueryStartDate = new Date(`${startDate}T00:00:00-05:00`);
    const serverQueryEndDate = new Date(`${endDate}T23:59:59.999-05:00`);
    
    const allSubmissionsSnapshot = await firestore.collection('submissions')
        .where('formData.fecha', '<=', serverQueryEndDate)
        .get();

    const allSubmissionsForClient = allSubmissionsSnapshot.docs
        .map(doc => ({ id: doc.id, ...serializeTimestamps(doc.data()) }))
        .filter(op => {
            const docClientName = op.formData?.cliente || op.formData?.nombreCliente;
            return docClientName === clientName;
        });

    const operationsInDateRange = allSubmissionsForClient.filter(op => {
        const opDate = new Date(op.formData.fecha);
        return isWithinInterval(opDate, { start: serverQueryStartDate, end: serverQueryEndDate });
    });
    
    const [manualOpsSnapshot, crewManualOpsSnapshot, clientArticlesSnapshot] = await Promise.all([
        firestore.collection('manual_client_operations').where('clientName', '==', clientName).where('operationDate', '>=', serverQueryStartDate).where('operationDate', '<=', serverQueryEndDate).get(),
        firestore.collection('manual_operations').where('clientName', '==', clientName).where('operationDate', '>=', serverQueryStartDate).where('operationDate', '<=', serverQueryEndDate).get(),
        firestore.collection('articulos').where('razonSocial', '==', clientName).get(),
    ]);
    
    const articleSessionMap = new Map();
    clientArticlesSnapshot.forEach(doc => {
        const article = doc.data() as ArticuloData;
        articleSessionMap.set(article.codigoProducto, article.sesion);
    });
    
    const allOperations: BasicOperation[] = [];

    operationsInDateRange.forEach(data => allOperations.push({ type: 'form', data }));
    manualOpsSnapshot.docs.forEach(doc => allOperations.push({ type: 'manual', data: serializeTimestamps(doc.data()) }));
    crewManualOpsSnapshot.docs.forEach(doc => allOperations.push({ type: 'crew_manual', data: serializeTimestamps(doc.data()) }));
    
    let settlementRows: ClientSettlementRow[] = [];
    
    const smylCargueAlmacenamientoConcept = selectedConcepts.find(c => c.conceptName === 'SERVICIO LOGÍSTICO MANIPULACIÓN CARGA (CARGUE Y ALMACENAMIENTO 1 DÍA)' && c.calculationType === 'LÓGICA ESPECIAL');
    if (clientName === 'SMYL TRANSPORTE Y LOGISTICA SAS' && smylCargueAlmacenamientoConcept) {
        await processCargueAlmacenamiento(smylCargueAlmacenamientoConcept, peso => peso >= 20000, allSubmissionsForClient, serverQueryStartDate, serverQueryEndDate, settlementRows, processedCrossDockLots, allConcepts, containerNumber);
    }

    const smylCargueAlmacenamientoVehiculoLivianoConcept = selectedConcepts.find(c => c.conceptName === 'SERVICIO LOGÍSTICO MANIPULACIÓN CARGA VEHICULO LIVIANO (CARGUE Y ALMACENAMIENTO 1 DÍA)' && c.calculationType === 'LÓGICA ESPECIAL');
    if (clientName === 'SMYL TRANSPORTE Y LOGISTICA SAS' && smylCargueAlmacenamientoVehiculoLivianoConcept) {
        await processCargueAlmacenamiento(smylCargueAlmacenamientoVehiculoLivianoConcept, peso => peso > 0 && peso < 20000, allSubmissionsForClient, serverQueryStartDate, serverQueryEndDate, settlementRows, processedCrossDockLots, allConcepts, containerNumber);
    }

    const avicolaAlquilerConcept = selectedConcepts.find(c => c.conceptName.toUpperCase().replace('AREA', 'ÁREA') === 'ALQUILER DE ÁREA PARA EMPAQUE/DIA');
    const avicolaApoyoConcept = selectedConcepts.find(c => c.conceptName === 'SERVICIO APOYO JORNAL');

    if (clientName === 'AVICOLA EL MADROÑO S.A.') {
        if (avicolaAlquilerConcept) {
            await processAvicolaMaquila(avicolaAlquilerConcept, allSubmissionsForClient, serverQueryStartDate, serverQueryEndDate, settlementRows);
        }
        if (avicolaApoyoConcept) {
             await processAvicolaMaquila(avicolaApoyoConcept, allSubmissionsForClient, serverQueryStartDate, serverQueryEndDate, settlementRows);
        }
    }
    
    const operacionCargueConcept = selectedConcepts.find(c => c.conceptName === 'OPERACIÓN CARGUE');
    if (clientName === 'AVICOLA EL MADROÑO S.A.' && operacionCargueConcept) {
        const canastasOps = allOperations.filter(op => 
            op.type === 'crew_manual' && 
            op.data.concept === 'CARGUE DE CANASTAS'
        );

        for (const op of canastasOps) {
            const opData = op.data;
            const totalTons = opData.quantity; 
            
            const matchingTariff = findMatchingTariff(totalTons, operacionCargueConcept);
            if (matchingTariff) {
                const operacionLogistica = getOperationLogisticsType(opData.operationDate, opData.startTime, opData.endTime, operacionCargueConcept);
                const unitValue = operacionLogistica === 'Diurno' ? matchingTariff.dayTariff : matchingTariff.nightTariff;

                settlementRows.push({
                    date: opData.operationDate,
                    placa: opData.plate || 'Manual',
                    container: 'N/A',
                    camara: 'N/A',
                    totalPaletas: 0,
                    operacionLogistica: operacionLogistica,
                    pedidoSislog: 'Manual',
                    conceptName: 'OPERACIÓN CARGUE (CANASTILLAS)',
                    tipoVehiculo: matchingTariff.vehicleType,
                    quantity: 1,
                    unitOfMeasure: matchingTariff.vehicleType,
                    unitValue: unitValue,
                    totalValue: unitValue,
                    horaInicio: opData.startTime,
                    horaFin: op.data.endTime,
                });
            }
        }
    }
    
    const ruleConcepts = selectedConcepts.filter(c => c.calculationType === 'REGLAS');

    for (const concept of ruleConcepts) {
            
        for (const op of allOperations.filter(o => o.type === 'form')) {
            const submission = op.data;

             if (containerNumber && submission.formData.contenedor !== containerNumber) {
                continue;
            }
            
            const isRecepcion = submission.formType.includes('recepcion') || submission.formType.includes('reception');
            const isDespacho = submission.formType.includes('despacho');
            const opTypeMatch = concept.filterOperationType === 'ambos' ||
                                (concept.filterOperationType === 'recepcion' && isRecepcion) ||
                                (concept.filterOperationType === 'despacho' && isDespacho);
            if (!opTypeMatch) continue;

            const isFixed = submission.formType.includes('fixed-weight');
            const isVariable = submission.formType.includes('variable-weight');
            const prodTypeMatch = concept.filterProductType === 'ambos' ||
                                  (concept.filterProductType === 'fijo' && isFixed) ||
                                  (concept.filterProductType === 'variable' && isVariable);
            if (!prodTypeMatch) continue;
            
            const pedidoType = submission.formData?.tipoPedido;
            if (concept.filterPedidoTypes && concept.filterPedidoTypes.length > 0) {
                if (!pedidoType || !concept.filterPedidoTypes.includes(pedidoType)) {
                    continue;
                }
            }
            
            const items = getFilteredItems(submission, concept.filterSesion, articleSessionMap);
            if (items.length === 0) continue;


            let quantity = 0;
            let totalPallets = 0;
            let unitValue = 0;
            let operacionLogistica: string = 'N/A';
            let vehicleTypeForReport = 'N/A';
            let unitOfMeasureForReport = concept.unitOfMeasure;
            
            const isConceptTunel = concept.conceptName === 'SERVICIO DE TUNEL DE CONGELACIÓN RAPIDA';
            const isTariffPorTemperatura = concept.tariffType === 'POR_TEMPERATURA';
            const isPedidoTunel = submission.formData.tipoPedido === 'TUNEL DE CONGELACIÓN';
            const forceNetWeight = isConceptTunel && isTariffPorTemperatura && isPedidoTunel;
            
            let weightKg = calculateWeightForOperation(submission, concept.filterSesion, articleSessionMap, forceNetWeight);
            
                const isWeightBased = concept.calculationBase === 'TONELADAS' || concept.calculationBase === 'KILOGRAMOS';
                if (isWeightBased && weightKg <= 0) {
                settlementRows.push({
                    isPending: true,
                    submissionId: submission.id,
                    formType: submission.formType, 
                    date: submission.formData.fecha,
                    placa: submission.formData.placa || 'N/A',
                    container: submission.formData.contenedor || 'N/A',
                    camara: 'N/A',
                    totalPaletas: 0,
                    operacionLogistica: 'Pendiente',
                    pedidoSislog: submission.formData.pedidoSislog,
                    conceptName: concept.conceptName,
                    tipoVehiculo: 'N/A',
                    quantity: 0,
                    unitOfMeasure: concept.unitOfMeasure,
                    unitValue: 0,
                    totalValue: 0
                });
                continue; 
            }
            
            let finalWeightKg = weightKg;
            if (isConceptTunel && submission.formData.cliente === 'AVICOLA EL MADROÑO S.A.' && weightKg < 10000) {
                finalWeightKg = 10000;
            }
            
            switch (concept.calculationBase) {
                case 'TONELADAS': quantity = finalWeightKg / 1000; break;
                case 'KILOGRAMOS': quantity = finalWeightKg; break;
                case 'CANTIDAD_PALETAS': quantity = calculatePalletsForOperation(submission, concept.filterSesion, articleSessionMap, concept); break;
                case 'CANTIDAD_CAJAS': quantity = calculateUnitsForOperation(submission, concept.filterSesion, articleSessionMap, concept); break;
                case 'NUMERO_OPERACIONES': quantity = 1; break;
                case 'NUMERO_CONTENEDORES': quantity = submission.formData.contenedor ? 1 : 0; break;
                case 'PALETAS_SALIDA_MAQUILA_CONGELADOS':
                    if ((submission.formType === 'variable-weight-reception' || submission.formType === 'variable-weight-recepcion') && submission.formData.tipoPedido === 'MAQUILA') {
                        quantity = Number(submission.formData.salidaPaletasMaquilaCO) || 0;
                    } else {
                        quantity = 0;
                    }
                    totalPallets = quantity;
                    break;
                case 'PALETAS_SALIDA_MAQUILA_SECO':
                     if ((submission.formType.includes('reception') || submission.formType.includes('recepcion')) && submission.formData.tipoPedido === 'MAQUILA') {
                        quantity = Number(submission.formData.salidaPaletasMaquilaSE) || 0;
                    } else {
                        quantity = 0;
                    }
                    totalPallets = quantity;
                    break;
                case 'CANTIDAD_SACOS_MAQUILA':
                    if ((submission.formType.includes('reception') || submission.formType.includes('recepcion')) && submission.formData.tipoPedido === 'MAQUILA' && submission.formData.tipoEmpaqueMaquila === 'EMPAQUE DE SACOS') {
                        quantity = calculateUnitsForOperation(submission, concept.filterSesion, articleSessionMap, concept);
                    } else {
                        quantity = 0;
                    }
                    break;
            }
            
            if (quantity <= 0) continue;

            if (concept.tariffType === 'UNICA') {
                unitValue = concept.value || 0;
            } else if (concept.tariffType === 'RANGOS') {
                const totalTons = weightKg / 1000;
                operacionLogistica = getOperationLogisticsType(submission.formData.fecha, submission.formData.horaInicio, submission.formData.horaFin, concept);
                
                const matchingTariff = findMatchingTariff(totalTons, concept);

                if (!matchingTariff) {
                    continue;
                }

                vehicleTypeForReport = matchingTariff.vehicleType;
                if (concept.conceptName === 'OPERACIÓN CARGUE' || concept.conceptName === 'OPERACIÓN DESCARGUE') {
                    unitOfMeasureForReport = concept.unitOfMeasure;
                    if (operacionLogistica === 'Diurno') unitValue = matchingTariff.dayTariff;
                    else if (operacionLogistica === 'Nocturno') unitValue = matchingTariff.nightTariff;
                    else if (operacionLogistica === 'Extra') unitValue = matchingTariff.extraTariff;
                    quantity = 1;
                } else {
                    unitValue = operacionLogistica === 'Diurno' ? matchingTariff.dayTariff : matchingTariff.nightTariff;
                }
            } else if (concept.tariffType === 'POR_TEMPERATURA') {
                let tempSourceArray = [];
                if (submission.formType.startsWith('fixed-weight-')) {
                    tempSourceArray = submission.formData.productos || [];
                } else { // Variable Weight
                    tempSourceArray = (submission.formData.summary || []).concat(submission.formData.productos || []);
                }
            
                let tempFields: (number | null | undefined)[] = [];
                if (submission.formType.startsWith('fixed-weight-')) {
                    tempFields = tempSourceArray.flatMap((item: any) => [item.temperatura1, item.temperatura2, item.temperatura3]);
                } else {
                    tempFields = tempSourceArray.flatMap((item: any) => [item.temperatura1, item.temperatura2, item.temperatura3, item.temperatura]);
                }

                const allTemps: number[] = tempFields.filter((t: any): t is number => t !== null && t !== undefined && !isNaN(Number(t)));
            
                if (allTemps.length > 0) {
                    const highestTemp = Math.max(...allTemps);
                    const matchingTariff = findMatchingTemperatureTariff(highestTemp, concept);
                    if (matchingTariff) {
                        unitValue = matchingTariff.ratePerKg;
                    }
                }
            }
            
            if (concept.calculationBase !== 'PALETAS_SALIDA_MAQUILA_CONGELADOS' && concept.calculationBase !== 'PALETAS_SALIDA_MAQUILA_SECO') {
                totalPallets = calculatePalletsForOperation(submission, concept.filterSesion, articleSessionMap, concept);
            }

            const filteredItems = getFilteredItems(submission, concept.filterSesion, articleSessionMap);
            const firstProductCode = filteredItems[0]?.codigo;
            let camara = firstProductCode ? articleSessionMap.get(firstProductCode) || 'N/A' : 'N/A';
                
            if (
                clientName === 'AVICOLA EL MADROÑO S.A.' && 
                concept.conceptName === 'MOVIMIENTO SALIDA PRODUCTOS - PALLET (SECO)'
            ) {
                camara = 'SE';
            }
                
            settlementRows.push({
                submissionId: submission.id, 
                formType: submission.formType,
                date: submission.formData.fecha,
                placa: submission.formData.placa || 'N/A',
                container: submission.formData.contenedor || 'N/A',
                camara,
                totalPaletas: totalPallets,
                operacionLogistica,
                pedidoSislog: submission.formData.pedidoSislog,
                conceptName: concept.conceptName,
                tipoVehiculo: (concept.conceptName === 'OPERACIÓN CARGUE' || concept.conceptName === 'OPERACIÓN DESCARGUE') ? vehicleTypeForReport : 'N/A',
                quantity,
                unitOfMeasure: unitOfMeasureForReport,
                unitValue: unitValue,
                totalValue: quantity * unitValue,
                horaInicio: submission.formData.horaInicio,
                horaFin: submission.formData.horaFin,
            });
        }
    }
    
    const observationConcepts = selectedConcepts.filter(c => c.calculationType === 'OBSERVACION');
    if (observationConcepts.length > 0) {
        const opsWithObservations = allOperations.filter(op => op.type === 'form' && Array.isArray(op.data.formData.observaciones) && op.data.formData.observaciones.length > 0);
        
        for (const concept of observationConcepts) {
            const relevantOps = opsWithObservations.filter(op =>
                (op.data.formData.observaciones as any[]).some(obs => obs.type === concept.associatedObservation)
            );
            
            for (const op of relevantOps) {
                 if (containerNumber && op.data.formData.contenedor !== containerNumber) {
                    continue;
                }

                const obs = (op.data.formData.observaciones as any[]).find(o => o.type === concept.associatedObservation);
                const quantity = Number(obs?.quantity) || 0;

                if (quantity > 0) {
                    settlementRows.push({
                        date: op.data.formData.fecha,
                        placa: op.data.formData.placa || 'N/A',
                        container: op.data.formData.contenedor || 'N/A',
                        camara: 'N/A',
                        totalPaletas: 0, 
                        operacionLogistica: 'N/A',
                        pedidoSislog: op.data.formData.pedidoSislog,
                        conceptName: concept.conceptName,
                        tipoVehiculo: 'N/A',
                        quantity,
                        unitOfMeasure: concept.unitOfMeasure,
                        unitValue: concept.value || 0,
                        totalValue: quantity * (concept.value || 0),
                        horaInicio: op.data.formData.horaInicio,
                        horaFin: op.data.formData.horaFin,
                    });
                }
            }
        }
    }

    const conceptsToProcessManually = selectedConcepts.filter(c => 
        c.calculationType === 'MANUAL'
    );
    const manualOpsFiltered = allOperations.filter(op => {
        if (op.type !== 'manual' && op.type !== 'crew_manual') return false;
        if (containerNumber && op.data.details?.container !== containerNumber) return false;
        return true;
    });

    if (manualOpsFiltered.length > 0 && conceptsToProcessManually.length > 0) {
        for (const op of manualOpsFiltered) {
            const opData = op.data;
            const concept = conceptsToProcessManually.find(c => c.conceptName === opData.concept);
            if (!concept) continue;

            const date = opData.operationDate ? new Date(opData.operationDate).toISOString().split('T')[0] : startDate;
            
             if (concept.conceptName === 'TIEMPO EXTRA FRIOAL (FIJO)') {
                if (!concept.fixedTimeConfig || !concept.specificTariffs) continue;
                const { weekdayStartTime, weekdayEndTime, saturdayStartTime, saturdayEndTime, dayShiftEndTime } = concept.fixedTimeConfig;
                if (!weekdayStartTime || !weekdayEndTime || !saturdayStartTime || !saturdayEndTime || !dayShiftEndTime) continue;
                
                const localDate = parseISO(opData.operationDate);
                const dayStringForMap = format(localDate, 'yyyy-MM-dd');
                const excedentHours = opData.excedentes?.find((e: any) => e.date === dayStringForMap)?.hours || 0;
            
                (opData.bulkRoles || []).forEach((role: any) => {
                    const numPersonas = role.numPersonas;
                    if (numPersonas > 0) {
                        const diurnaTariff = concept.specificTariffs?.find(t => t.id === role.diurnaId);
                        const nocturnaTariff = concept.specificTariffs?.find(t => t.id === role.nocturnaId);
                        
                        const isSat = isSaturday(localDate);
                        const baseStart = parse(isSat ? saturdayStartTime : weekdayStartTime, 'HH:mm', localDate);
                        let baseEnd = parse(isSat ? saturdayEndTime : weekdayEndTime, 'HH:mm', localDate);
                        if (baseEnd < baseStart) baseEnd = addDays(baseEnd, 1);
                        
                        const finalEnd = addHours(baseEnd, excedentHours);
                        const dayShiftEnd = parse(dayShiftEndTime, 'HH:mm', localDate);
            
                        const totalDiurnoMinutes = Math.max(0, differenceInMinutes(Math.min(finalEnd.getTime(), dayShiftEnd.getTime()), baseStart.getTime()));
                        const totalNocturnoMinutes = Math.max(0, differenceInMinutes(finalEnd, Math.max(baseStart.getTime(), dayShiftEnd.getTime())));
            
                        if (totalDiurnoMinutes > 0 && diurnaTariff) {
                            const quantityHours = totalDiurnoMinutes / 60;
                            settlementRows.push({
                                date, conceptName: concept.conceptName, subConceptName: diurnaTariff.name, placa: 'N/A',
                                container: 'N/A', totalPaletas: 0, camara: 'N/A', operacionLogistica: 'Diurno',
                                pedidoSislog: 'Manual', tipoVehiculo: 'N/A', quantity: quantityHours,
                                numeroPersonas: numPersonas, unitOfMeasure: diurnaTariff.unit, unitValue: diurnaTariff.value || 0,
                                totalValue: quantityHours * (diurnaTariff.value || 0) * numPersonas,
                                horaInicio: format(baseStart, 'HH:mm'), horaFin: format(addMinutes(baseStart, totalDiurnoMinutes), 'HH:mm'),
                            });
                        }
                        if (totalNocturnoMinutes > 0 && nocturnaTariff) {
                            const quantityHours = totalNocturnoMinutes / 60;
                            settlementRows.push({
                                date, conceptName: concept.conceptName, subConceptName: nocturnaTariff.name, placa: 'N/A',
                                container: 'N/A', totalPaletas: 0, camara: 'N/A', operacionLogistica: 'Nocturno',
                                pedidoSislog: 'Manual', tipoVehiculo: 'N/A', quantity: quantityHours,
                                numeroPersonas: numPersonas, unitOfMeasure: nocturnaTariff.unit, unitValue: nocturnaTariff.value || 0,
                                totalValue: quantityHours * (nocturnaTariff.value || 0) * numPersonas,
                                horaInicio: format(dayShiftEnd, 'HH:mm'), horaFin: format(addMinutes(dayShiftEnd, totalNocturnoMinutes), 'HH:mm'),
                            });
                        }
                    }
                });

            } else if (concept.conceptName === 'TIEMPO EXTRA FRIOAL') {
                const { startTime, endTime } = opData.details || {};
                if (!startTime || !endTime) continue;
                
                const { dayShiftEndTime } = concept.fixedTimeConfig || { dayShiftEndTime: '19:00' };

                const opDate = parseISO(opData.operationDate);
                const start = parse(startTime, 'HH:mm', opDate);
                let end = parse(endTime, 'HH:mm', opDate);
                if (end <= start) end = addDays(end, 1);
                
                const dayShiftEnd = parse(dayShiftEndTime, 'HH:mm', opDate);

                const roles = opData.bulkRoles || [];
                
                roles.forEach((role: any) => {
                    const numPersonas = role.numPersonas;
                    if (numPersonas > 0) {
                        const diurnaTariff = concept.specificTariffs?.find(t => t.id === role.diurnaId);
                        const nocturnaTariff = concept.specificTariffs?.find(t => t.id === role.nocturnaId);

                        const totalDiurnoMinutes = Math.max(0, differenceInMinutes(Math.min(end.getTime(), dayShiftEnd.getTime()), start.getTime()));
                        const totalNocturnoMinutes = Math.max(0, differenceInMinutes(end, Math.max(start.getTime(), dayShiftEnd.getTime())));

                        if (totalDiurnoMinutes > 0 && diurnaTariff) {
                            const quantity = totalDiurnoMinutes / 60;
                            settlementRows.push({
                                date, conceptName: concept.conceptName, subConceptName: diurnaTariff.name, placa: opData.details?.plate || 'N/A',
                                container: opData.details?.container || 'N/A', totalPaletas: opData.details?.totalPallets || 0, camara: 'N/A',
                                operacionLogistica: 'Diurno', pedidoSislog: 'Manual', tipoVehiculo: 'N/A',
                                quantity: quantity, numeroPersonas: numPersonas, unitOfMeasure: diurnaTariff.unit,
                                unitValue: diurnaTariff.value || 0, totalValue: quantity * (diurnaTariff.value || 0) * numPersonas,
                                horaInicio: startTime, horaFin: format(addMinutes(start, totalDiurnoMinutes), 'HH:mm'),
                            });
                        }
                        if (totalNocturnoMinutes > 0 && nocturnaTariff) {
                            const quantity = totalNocturnoMinutes / 60;
                            settlementRows.push({
                                date, conceptName: concept.conceptName, subConceptName: nocturnaTariff.name, placa: opData.details?.plate || 'N/A',
                                container: opData.details?.container || 'N/A', totalPaletas: opData.details?.totalPallets || 0, camara: 'N/A',
                                operacionLogistica: 'Nocturno', pedidoSislog: 'Manual', tipoVehiculo: 'N/A',
                                quantity: quantity, numeroPersonas: numPersonas, unitOfMeasure: nocturnaTariff.unit,
                                unitValue: nocturnaTariff.value || 0, totalValue: quantity * (nocturnaTariff.value || 0) * numPersonas,
                                horaInicio: format(dayShiftEnd, 'HH:mm'), horaFin: endTime,
                            });
                        }
                    }
                });
            } else if (concept.tariffType === 'ESPECIFICA' && Array.isArray(opData.specificTariffs) && opData.specificTariffs.length > 0) {
                 opData.specificTariffs.forEach((appliedTariff: { tariffId: string, quantity: number, numPersonas?: number }) => {
                    const specificTariffInfo = concept.specificTariffs?.find(t => t.id === appliedTariff.tariffId);
                    if (!specificTariffInfo) return; 
                    
                    const numPersonas = appliedTariff.numPersonas || opData.numeroPersonas;
                    let quantityForCalc = appliedTariff.quantity || 0;
                    let totalValue = 0;
                    
                    let numeroPersonasParaReporte: number | string | undefined = numPersonas;
                    
                    if (concept.conceptName === 'POSICIONES FIJAS CÁMARA CONGELADOS') {
                        const operationDate = parseISO(opData.operationDate);
                        const numDias = getDaysInMonth(operationDate);
                        const baseQuantity = specificTariffInfo.baseQuantity;

                        if (baseQuantity !== undefined && baseQuantity > 0) {
                            quantityForCalc = baseQuantity;
                        }

                        totalValue = quantityForCalc * (specificTariffInfo.value || 0) * numDias;
                        numeroPersonasParaReporte = undefined;
                    } else {
                        totalValue = quantityForCalc * (specificTariffInfo.value || 0) * numPersonas;
                    }

                    if (totalValue > 0) {
                        settlementRows.push({
                            date,
                            placa: opData.details?.plate || 'N/A',
                            container: opData.details?.container || 'N/A',
                            totalPaletas: opData.details?.totalPallets || 0,
                            camara: 'CO', 
                            operacionLogistica: 'N/A',
                            pedidoSislog: opData.details?.pedidoSislog || 'Manual',
                            conceptName: concept.conceptName,
                            subConceptName: specificTariffInfo.name,
                            tipoVehiculo: 'N/A',
                            quantity: quantityForCalc,
                            unitOfMeasure: specificTariffInfo.unit,
                            unitValue: specificTariffInfo.value || 0,
                            totalValue: totalValue,
                            horaInicio: opData.details?.startTime || 'N/A',
                            horaFin: opData.details?.endTime || 'N/A',
                            numeroPersonas: numeroPersonasParaReporte,
                        });
                    }
                });
            } else if (concept.tariffType === 'ESPECIFICA' && concept.conceptName === 'TIEMPO EXTRA ZFPC') {
                const quantityForCalc = opData.quantity || 1;
                const numPersonas = opData.numeroPersonas || 1;
                const specificTariffInfo = concept.specificTariffs?.[0]; 
                if (specificTariffInfo) {
                    const totalValue = quantityForCalc * (specificTariffInfo.value || 0) * numPersonas;
                    const valorUnitario = specificTariffInfo.value || 0;
                     settlementRows.push({
                        date,
                        placa: opData.details?.plate || 'N/A',
                        container: opData.details?.container || 'N/A',
                        totalPaletas: opData.details?.totalPallets || 0,
                        camara: 'N/A',
                        operacionLogistica: 'N/A',
                        pedidoSislog: opData.details?.pedidoSislog || 'No aplica',
                        conceptName: concept.conceptName,
                        subConceptName: specificTariffInfo.name,
                        tipoVehiculo: 'N/A',
                        quantity: quantityForCalc,
                        unitOfMeasure: specificTariffInfo.unit,
                        unitValue: valorUnitario,
                        totalValue: totalValue,
                        horaInicio: opData.details?.startTime || 'N/A',
                        horaFin: opData.details?.endTime || 'N/A',
                        numeroPersonas: numPersonas,
                    });
                }
            } else if (concept.tariffType === 'UNICA') {
                const quantityForCalc = opData.quantity || 1;
                let totalValue;
                let numeroPersonasParaReporte: number | string | undefined = opData.numeroPersonas;
                
                let operacionLogistica = 'N/A';
                if (opData.concept === 'SERVICIO DE CONGELACIÓN - PALLET/DÍA (-18ºC)') {
                    operacionLogistica = 'Servicio Congelación';
                }
                let containerValue = opData.details?.container || 'N/A';
                const noDocumento = opData.details?.noDocumento;
            
                if (opData.concept.includes('FMM')) {
                    operacionLogistica = opData.opLogistica && opData.details?.fmmNumber
                        ? `${opData.opLogistica} - #${opData.details.fmmNumber}`
                        : 'N/A';
                } else if (opData.concept.includes('ARIN')) {
                    operacionLogistica = opData.opLogistica && opData.details?.arin
                    ? `${opData.opLogistica} - #${opData.details?.arin}`
                    : 'N/A';   

                    containerValue = opData.details?.container || 'N/A';
                } else if (noDocumento) {
                    containerValue = noDocumento; 
                }


                if (concept.conceptName === 'INSPECCIÓN ZFPC') {
                    numeroPersonasParaReporte = opData.numeroPersonas;
                    totalValue = quantityForCalc * (concept.value || 0) * (numeroPersonasParaReporte || 1);
                } else if (concept.billingPeriod === 'MENSUAL' && concept.conceptName !== 'IN-HOUSE INSPECTOR ZFPC') {
                    const operationDate = parseISO(opData.operationDate);
                    const numDias = getDaysInMonth(operationDate);
                    totalValue = numDias * (concept.value || 0);
                } else if (concept.billingPeriod === 'QUINCENAL') {
                    totalValue = 15 * (concept.value || 0);
                } else {
                    totalValue = quantityForCalc * (concept.value || 0);
                }
                const conceptsToHideNumeroPersonas = [
                    'IN-HOUSE INSPECTOR ZFPC',
                    'FMM DE INGRESO ZFPC (MANUAL)',
                    'FMM DE SALIDA ZFPC (MANUAL)',
                    'FMM DE INGRESO ZFPC NACIONAL',
                    'FMM DE SALIDA ZFPC NACIONAL',
                    'ARIN DE INGRESO ZFPC (MANUAL)',
                    'ARIN DE SALIDA ZFPC (MANUAL)',
                    'ARIN DE INGRESO ZFPC NACIONAL',
                    'ARIN DE SALIDA ZFPC NACIONAL',
                    'ALQUILER IMPRESORA ETIQUETADO',
                    'CONEXIÓN ELÉCTRICA CONTENEDOR'
            
                ];
                
        
                if (conceptsToHideNumeroPersonas.includes(concept.conceptName)) {
                     numeroPersonasParaReporte = undefined;
                }

                 let horaInicio = opData.details?.startTime || 'N/A';
                 let horaFin = opData.details?.endTime || 'N/A';

                if (concept.conceptName === 'CONEXIÓN ELÉCTRICA CONTENEDOR') {
                    const { fechaArribo, horaArribo, fechaSalida, horaSalida } = opData.details || {};
                    if (fechaArribo && horaArribo) {
                        horaInicio = `${format(parseISO(fechaArribo), 'dd/MM/yyyy')} ${formatTime12Hour(horaArribo)}`;
                    }
                    if (fechaSalida && horaSalida) {
                         horaFin = `${format(parseISO(fechaSalida), 'dd/MM/yyyy')} ${formatTime12Hour(horaSalida)}`;
                    }
                }

                 settlementRows.push({
                    date,
                    placa: opData.details?.plate || 'N/A',
                    container: containerValue,
                    totalPaletas: opData.details?.totalPallets || 0,
                    camara: 'N/A',
                    operacionLogistica,
                    pedidoSislog: opData.details?.pedidoSislog || 'N/A',
                    conceptName: concept.conceptName,
                    tipoVehiculo: 'N/A',
                    quantity: quantityForCalc,
                    unitOfMeasure: concept.unitOfMeasure,
                    unitValue: concept.value || 0,
                    totalValue: totalValue,
                    horaInicio: horaInicio,
                    horaFin: horaFin,
                    numeroPersonas: numeroPersonasParaReporte,
                });
            }
        }
    }
    
    const inventoryConcepts = selectedConcepts.filter(c => c.calculationType === 'SALDO_INVENTARIO' || c.calculationType === 'SALDO_CONTENEDOR');
    
    for (const concept of inventoryConcepts) {
        if (!concept.value) continue;
    
        if (concept.calculationType === 'SALDO_CONTENEDOR') {
            const containerMovements = allSubmissionsForClient.reduce((acc: Record<string, { date: Date; type: 'entry' | 'exit'; pallets: number }[]>, op) => {
                if (concept.filterPedidoTypes && concept.filterPedidoTypes.length > 0 && !concept.filterPedidoTypes.includes(op.formData?.tipoPedido)) {
                    return acc;
                }
                const container = op.formData?.contenedor?.trim();
                if (!container || container.toUpperCase() === 'N/A' || container.toUpperCase() === 'NO APLICA') return acc;
    
                const pallets = calculatePalletsForOperation(op, concept.inventorySesion, articleSessionMap, concept);
                if (pallets === 0) return acc;
    
                if (!acc[container]) {
                    acc[container] = [];
                }
                acc[container].push({
                    date: new Date(op.formData.fecha),
                    type: op.formType.includes('recepcion') ? 'entry' : 'exit',
                    pallets: pallets,
                });
                return acc;
            }, {});
    
            for (const container in containerMovements) {
                if (containerNumber && container !== containerNumber) {
                    continue; 
                }

                const movementsForContainer = containerMovements[container];
                
                const initialBalanceMovements = movementsForContainer.filter(m => isBefore(m.date, serverQueryStartDate));
                let balance = initialBalanceMovements.reduce((acc, mov) => acc + (mov.type === 'entry' ? mov.pallets : -mov.pallets), 0);
                
                const correctEndDate = new Date(`${endDate}T00:00:00-05:00`);
                const dateRangeArray = eachDayOfInterval({ start: serverQueryStartDate, end: correctEndDate });
                for (const date of dateRangeArray) {
                    const movementsForDay = movementsForContainer.filter(m => isEqual(startOfDay(m.date), date));
                    const entriesToday = movementsForDay.filter(m => m.type === 'entry').reduce((sum, m) => sum + m.pallets, 0);
                    const exitsToday = movementsForDay.filter(m => m.type === 'exit').reduce((sum, m) => sum + m.pallets, 0);
                    
                    balance += entriesToday - exitsToday;

                    if (balance > 0) {
                        settlementRows.push({
                            date: format(date, 'yyyy-MM-dd'),
                            placa: 'N/A',
                            container: container,
                            camara: concept.inventorySesion || 'N/A',
                            totalPaletas: balance,
                            operacionLogistica: 'Servicio Almacenamiento',
                            pedidoSislog: 'N/A',
                            conceptName: concept.conceptName,
                            tipoVehiculo: 'N/A',
                            quantity: balance,
                            unitOfMeasure: concept.unitOfMeasure,
                            unitValue: concept.value,
                            totalValue: balance * concept.value,
                        });
                    }
                }
            }
        } else if (concept.inventorySource === 'POSICIONES_ALMACENADAS' && concept.inventorySesion) {
            const consolidatedReport = await getConsolidatedMovementReport({
                clientName: clientName,
                startDate: startDate,
                endDate: endDate,
                sesion: concept.inventorySesion,
            });
    
            for (const dayData of consolidatedReport) {
                if (dayData.posicionesAlmacenadas > 0) {
                    settlementRows.push({
                        date: dayData.date,
                        placa: 'N/A',
                        container: 'N/A',
                        camara: concept.inventorySesion,
                        totalPaletas: dayData.posicionesAlmacenadas,
                        operacionLogistica: 'Servicio',
                        pedidoSislog: 'N/A',
                        conceptName: concept.conceptName,
                        tipoVehiculo: 'N/A',
                        quantity: dayData.posicionesAlmacenadas,
                        unitOfMeasure: concept.unitOfMeasure,
                        unitValue: concept.value,
                        totalValue: dayData.posicionesAlmacenadas * concept.value,
                    });
                }
            }
        }
    }

    settlementRows.forEach(row => {
        const upperConceptName = row.conceptName.toUpperCase().replace('AREA', 'ÁREA');
        if (upperConceptName === 'ALQUILER DE ÁREA PARA EMPAQUE/DIA') {
            row.conceptName = 'ALQUILER DE ÁREA PARA EMPAQUE/DIA';
        }

        const op = allOperations.find(o => o.type === 'form' && o.data.formData.pedidoSislog === row.pedidoSislog);
        if (clientName === 'AVICOLA EL MADROÑO S.A.' && row.conceptName === 'MOVIMIENTO SALIDA PRODUCTOS - PALLET (SECO)' && op && op.data.formData.tipoPedido === 'DESPACHO GENERICO') {
            row.camara = 'SE';
        }
    });
    
    const conceptOrder = [
'SERVICIO DE CONGELACIÓN - PALLET/DIA (-18ºC)',
'SERVICIO DE CONGELACIÓN - PALLET/DÍA (-18ºC)',
'SERVICIO DE CONGELACIÓN - PALLET/DIA (-18ºC) POR CONTENEDOR',
'SERVICIO LOGÍSTICO MANIPULACIÓN CARGA',
'SERVICIO LOGÍSTICO CONGELACIÓN (4 DÍAS)',
'SERVICIO LOGÍSTICO CONGELACIÓN (COBRO DIARIO)',
'SERVICIO LOGÍSTICO MANIPULACIÓN CARGA (CARGUE Y ALMACENAMIENTO 1 DÍA)',
'SERVICIO LOGÍSTICO MANIPULACIÓN CARGA VEHICULO LIVIANO (CARGUE Y ALMACENAMIENTO 1 DÍA)',
'POSICIONES FIJAS CÁMARA CONGELADOS',
'SERVICIO DE CONGELACIÓN - UBICACIÓN/DIA (-18ºC)',
'SERVICIO DE REFRIGERACIÓN - PALLET/DIA (0°C A 4ºC)',
'SERVICIO DE REFRIGERACIÓN - PALLET/DIA (0°C A 4ºC) POR CONTENEDOR',
'SERVICIO DE SECO -PALLET/DIA',
'SERVICIO DE SECO -PALLET/DIA POR CONTENEDOR',
'OPERACIÓN CARGUE',
'OPERACIÓN CARGUE/TONELADAS',
'OPERACIÓN DESCARGUE',
'OPERACIÓN DESCARGUE/TONELADAS',
'SERVICIO DE TUNEL DE CONGELACIÓN RAPIDA',
'MOVIMIENTO ENTRADA PRODUCTOS - PALLET (CONGELADO)',
'MOVIMIENTO ENTRADA PRODUCTOS - PALLET/CONGELADO',
'MOVIMIENTO ENTRADA PRODUCTO - PALETA',
'MOVIMIENTO ENTRADA PRODUCTOS - PALLET',
'MOVIMIENTO ENTRADA PRODUCTOS PALLET',
'MOVIMIENTO ENTRADA PRODUCTOS - PALLET/REFRIGERADO',
'MOVIMIENTO ENTRADA PRODUCTOS - PALLET (SECO)',
'MOVIMIENTO SALIDA PRODUCTOS - PALLET (CONGELADO)',
'MOVIMIENTO SALIDA PRODUCTOS - PALLET/CONGELADO',
'MOVIMIENTO SALIDA PRODUCTO - PALETA',
'MOVIMIENTO SALIDA PRODUCTOS - PALLET',
'MOVIMIENTO SALIDA PRODUCTOS PALLET',
'MOVIMIENTO SALIDA PRODUCTOS - PALLET/REFRIGERADO',
'MOVIMIENTO SALIDA PRODUCTOS - PALLET (SECO)',
'SERVICIO ALISTAMIENTO (UNIDAD)',
'SERVICIO DE ALISTAMIENTO (UNIDAD)',
'SERVICIO DE ALISTAMIENTO CAJAS',
'TOMA DE PESOS POR ETIQUETA HRS',
'REESTIBADO',
'CONEXIÓN ELÉCTRICA CONTENEDOR',
'ALQUILER DE AREA PARA EMPAQUE/DIA',
'ALQUILER DE ÁREA PARA EMPAQUE/DIA',
'SERVICIO APOYO JORNAL',
'SERVICIO DE APOYO JORNAL',
'SERVICIO EMPAQUE EN SACOS',
'IMPRESIÓN FACTURAS',
'TRANSBORDO CANASTILLA',
'ALQUILER IMPRESORA ETIQUEDADO',
'FMM DE INGRESO ZFPC',
'FMM DE INGRESO ZFPC (MANUAL)',
'FMM DE INGRESO ZFPC NACIONAL',
'FMM DE SALIDA ZFPC',
'FMM DE SALIDA ZFPC (MANUAL)',
'FMM DE SALIDA ZFPC NACIONAL',
'ARIN DE INGRESO ZFPC',
'ARIN DE INGRESO ZFPC (MANUAL)',
'ARIN DE INGRESO ZFPC NACIONAL',
'ARIN DE SALIDA ZFPC',
'ARIN DE SALIDA ZFPC (MANUAL)',
'ARIN DE SALIDA ZFPC NACIONAL',
'TIEMPO EXTRA ZFPC',
'INSPECCIÓN ZFPC',
'IN-HOUSE INSPECTOR ZFPC',
'HORA EXTRA DIURNA',
'HORA EXTRA NOCTURNA',
'HORA EXTRA DIURNA DOMINGO Y FESTIVO',
'HORA EXTRA NOCTURNA DOMINGO Y FESTIVO',
'ALIMENTACIÓN',
'TRANSPORTE EXTRAORDINARIO',
'TRANSPORTE DOMINICAL Y FESTIVO',
'TIEMPO EXTRA FRIOAL (FIJO)',
'TIEMPO EXTRA FRIOAL',
'HORA EXTRA DIURNA (SUPERVISOR)',
'HORA EXTRA DIURNA (MONTACARGUISTA NORMAL)',
'HORA EXTRA DIURNA (OPERARIO)',
'HORA EXTRA DIURNA (ASISTENTE)',
'HORA EXTRA NOCTURNA (SUPERVISOR)',
'HORA EXTRA NOCTURNA (MONTACARGUISTA NORMAL)',
'HORA EXTRA NOCTURNA (OPERARIO)',
'HORA EXTRA NOCTURNA (ASISTENTE)',
'ETIQUETADO POR CAJA - UNIDAD SUMINISTRA FAL',
'ETIQUETADO POR CAJA/ UNIDAD',
'ETIQUETADO POR CAJA/ UNIDAD FAL COLOCA ETIQUETA',
'ESTIBA MADERA RECICLADA',
'SERVICIO DE INSPECCIÓN POR CAJA'
];
    
    const roleOrder = ['SUPERVISOR', 'MONTACARGUISTA TRILATERAL', 'MONTACARGUISTA NORMAL', 'OPERARIO'];

    settlementRows.sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        if (dateA !== dateB) return dateA - dateB;

        const getSortOrder = (conceptName: string) => {
            const normalizedName = conceptName.toUpperCase().replace('AREA', 'ÁREA');
            const index = conceptOrder.indexOf(normalizedName);
            return index === -1 ? Infinity : index;
        };

        const orderA = getSortOrder(a.conceptName);
        const orderB = getSortOrder(b.conceptName);

        if (orderA !== orderB) return orderA - orderB;

        if (a.conceptName === 'TIEMPO EXTRA FRIOAL (FIJO)' || a.conceptName === 'TIEMPO EXTRA FRIOAL') {
            const subConceptA = a.subConceptName || '';
            const subConceptB = b.subConceptName || '';

            const roleA = roleOrder.find(role => subConceptA.includes(role));
            const roleB = roleOrder.find(role => subConceptB.includes(role));
            
            const roleIndexA = roleA ? roleOrder.indexOf(roleA) : Infinity;
            const roleIndexB = roleB ? roleOrder.indexOf(roleB) : Infinity;

            if (roleIndexA !== roleIndexB) {
                return roleIndexA - roleIndexB;
            }
        }
        
        return (a.subConceptName || '').localeCompare(b.subConceptName || '');
    });
    
    return { success: true, data: settlementRows };

  } catch (error: any) {
    console.error('Error in generateClientSettlement:', error);

     if (error.message && typeof error.message === 'string' && error.message.includes('requires an index')) {
      const linkMatch = error.message.match(/(https?:\/\/[^\s]+)/);
      const link = linkMatch ? linkMatch[0] : 'No se pudo extraer el enlace.';
      return {
          success: false,
          error: 'Se requiere un índice compuesto en Firestore.',
          errorLink: link
      };
    }
    
    return { success: false, error: error.message || 'Ocurrió un error desconocido en el servidor.' };
  }
}

const minutesToTime = (minutes: number): string => {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return `${h.toString().padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

    










    

    




    


    
