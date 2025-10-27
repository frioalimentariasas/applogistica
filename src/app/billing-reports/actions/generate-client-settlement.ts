'use server';

import { firestore } from '@/lib/firebase-admin';
import type { ClientBillingConcept, TariffRange, SpecificTariff, TemperatureTariffRange } from '@/app/gestion-conceptos-liquidacion-clientes/actions';
import { getClientBillingConcepts } from '@/app/gestion-conceptos-liquidacion-clientes/actions';
import admin from 'firebase-admin';
import { startOfDay, endOfDay, parseISO, differenceInHours, getDaysInMonth, getDay, format, addMinutes, addHours, differenceInMinutes, parse, isSaturday, isSunday, addDays, eachDayOfInterval, isWithinInterval, isBefore, subDays, isEqual } from 'date-fns';
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

const getOperationLogisticsType = (isoDateString: string, horaInicio: string, horaFin: string, concept: ClientBillingConcept): "Diurno" | "Nocturno" | "Extra" | "No Aplica" => {
    const specialConcepts = ["FMM DE INGRESO", "ARIN DE INGRESO", "FMM DE SALIDA", "ARIN DE SALIDA", "REESTIBADO", "ALISTAMIENTO POR UNIDAD", "FMM DE INGRESO ZFPC", "FMM DE SALIDA ZFPC", "FMM ZFPC", "TIEMPO EXTRA FRIOAL (FIJO)", "TIEMPO EXTRA FRIOAL", "SERVICIO DE TUNEL DE CONGELACIÓN RAPIDA"];
    if (specialConcepts.includes(concept.conceptName.toUpperCase())) {
      return "No Aplica";
    }

    if (concept.calculationType !== 'REGLAS' || concept.tariffType !== 'RANGOS' || !isoDateString || !horaInicio || !horaFin) {
        return "No Aplica";
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
            return "No Aplica"; // Shift times are not configured for this day
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
        return 'No Aplica';
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
    articleSessionMap: Map<string, string>
): number => {
    const { formType, formData } = op;
    const items = getFilteredItems(op, sessionFilter, articleSessionMap);
    if (items.length === 0) return 0;

    if (formType === 'fixed-weight-despacho' || formType === 'fixed-weight-recepcion' || formType === 'fixed-weight-reception') {
        if (!sessionFilter || sessionFilter === 'AMBOS') {
            const grossWeight = Number(formData.totalPesoBrutoKg);
            if (grossWeight > 0) return grossWeight;
        }
        // If filtered by session, we must calculate from items
        return items.reduce((sum: number, p: any) => sum + (Number(p.pesoNetoKg) || 0), 0);
    }
    
    if (formType === 'variable-weight-despacho' || formType === 'variable-weight-recepcion' || formType === 'variable-weight-reception') {
        const isSummaryFormat = items.some((p: any) => Number(p.paleta) === 0);
        if (isSummaryFormat) {
            return items.reduce((sum: number, item: any) => sum + (Number(item.totalPesoNeto) || 0), 0);
        }
        
        // For detailed variable weight reception, calculate net from gross
        if(formType.includes('recepcion') || formType.includes('reception')) {
             const totalPesoBruto = items.reduce((sum: number, p: any) => sum + (Number(p.pesoBruto) || 0), 0);
             const totalTaraEstiba = items.reduce((sum: number, p: any) => sum + (Number(p.taraEstiba) || 0), 0);
             return totalPesoBruto - totalTaraEstiba;
        }
        // For detailed dispatch, sum pre-calculated net weights
        return items.reduce((sum: number, item: any) => sum + (Number(item.pesoNeto) || 0), 0);
    }

    return 0;
};

const calculatePalletsForOperation = (
    op: any,
    sessionFilter: 'CO' | 'RE' | 'SE' | 'AMBOS' | undefined,
    articleSessionMap: Map<string, string>
): number => {
  const { formType, formData } = op;
  const items = getFilteredItems(op, sessionFilter, articleSessionMap);
  if (items.length === 0) return 0;

  if (formData.tipoPedido === 'TUNEL DE CONGELACIÓN' && formData.recepcionPorPlaca) {
      const { totalGeneralPaletas } = processTunelCongelacionData(formData);
      return totalGeneralPaletas;
  }
  
  if (formType?.startsWith('fixed-weight')) {
      return items.reduce((sum: number, p: any) => sum + (Number(p.totalPaletas) || Number(p.paletasCompletas) || 0), 0);
  }

  if (formType?.startsWith('variable-weight')) {
    const allItemsFromOp = (formData.items || [])
      .concat((formData.destinos || []).flatMap((d: any) => d.items || []));
      
    const isSummary = allItemsFromOp.some((i: any) => Number(i.paleta) === 0);
    
    if (isSummary) {
      if (formType.includes('despacho') && formData.despachoPorDestino) {
        return Number(formData.totalPaletasDespacho) || 0;
      }
      return items.reduce((sum: number, i: any) => sum + (Number(i.paletasCompletas) || 0) + (Number(i.paletasPicking) || 0) + (Number(i.totalPaletas) || 0), 0);
    }
    
    const uniquePallets = new Set();
    let pallets999Count = 0;
    items.forEach((item: any) => {
      const paletaNum = Number(item.paleta);
      if (!isNaN(paletaNum) && paletaNum > 0) {
        if (paletaNum === 999) {
          pallets999Count++;
        } else if (!item.esPicking) {
          uniquePallets.add(paletaNum);
        }
      }
    });
    return uniquePallets.size + pallets999Count;
  }
  
  return 0;
};

const calculateUnitsForOperation = (
    op: any,
    sessionFilter: 'CO' | 'RE' | 'SE' | 'AMBOS' | undefined,
    articleSessionMap: Map<string, string>
): number => {
  const { formType, formData } = op;
  const items = getFilteredItems(op, sessionFilter, articleSessionMap);
  if (items.length === 0) return 0;
  
  const clientName = formData.cliente || formData.nombreCliente;
  const isFrutelli = clientName === 'GRUPO FRUTELLI SAS';
  const isDispatch = formType?.includes('despacho');

  if (formType?.startsWith('fixed-weight')) {
      return items.reduce((sum: number, p: any) => {
          const quantity = Number(p.cajas) || 0;
          if (!isDispatch || isFrutelli) {
              return sum + quantity;
          }
          const paletasPicking = Number(p.paletasPicking) || 0;
          if (paletasPicking > 0) {
              return sum + quantity;
          }
          return sum;
      }, 0);
  }

  if (formType?.startsWith('variable-weight')) {
      const isSummary = items.some((i: any) => Number(i.paleta) === 0);
      if (isSummary) {
          return items.reduce((sum: number, i: any) => {
              const quantity = Number(i.totalCantidad) || 0;
              if (!isDispatch || isFrutelli) {
                  return sum + quantity;
              }
              const paletasPicking = Number(i.paletasPicking) || 0;
              if (paletasPicking > 0) {
                  return sum + quantity;
              }
              return sum;
          }, 0);
      }
      // Detailed variable weight
      return items.reduce((sum: number, i: any) => {
          const quantity = Number(i.cantidadPorPaleta) || 0;
          if (!isDispatch || isFrutelli) {
              return sum + quantity;
          }
          if (i.esPicking === true) {
              return sum + quantity;
          }
          return sum;
      }, 0);
  }

  return 0;
};

const formatTime12Hour = (timeStr: string | undefined): string => {
    if (!timeStr) return 'No Aplica';

    // Check if it's already a formatted date-time string
    // e.g., "13/09/2025 06:50 PM"
    const dateTimeParts = timeStr.split(' ');
    if (dateTimeParts.length > 2 && (dateTimeParts[2] === 'AM' || dateTimeParts[2] === 'PM')) {
        return timeStr;
    }
    
    // Handle HH:mm format
    if (!timeStr.includes(':')) return 'No Aplica';

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
    allConcepts: ClientBillingConcept[]
  ): Promise<ClientSettlementRow[]> {
      if (lotIds.length === 0) return [];
      
      let allLotRows: ClientSettlementRow[] = [];
      
      const conceptsToFind = [
          'SERVICIO LOGÍSTICO MANIPULACIÓN CARGA',
          'SERVICIO LOGÍSTICO CONGELACIÓN (COBRO DIARIO)'
      ];
  
      const mainConcept = allConcepts.find(c => c.conceptName.toUpperCase() === conceptsToFind[0]);
      const dailyConcept = allConcepts.find(c => c.conceptName.toUpperCase() === conceptsToFind[1]);
      
      if (!mainConcept?.value || !dailyConcept?.value) {
          throw new Error(`No se encontraron las tarifas para los conceptos de SMYL ('MANIPULACIÓN CARGA', 'COBRO DIARIO'). Verifique la configuración.`);
      }
      
      const mainTariff = mainConcept.value;
      const dailyPalletRate = dailyConcept.value;
  
      for (const lotId of lotIds) {
          const report = await getSmylLotAssistantReport(lotId, startDate, endDate);
          if ('error' in report) {
              console.warn(`Skipping lot ${lotId}: ${report.error}`);
              continue;
          }
  
          const { initialReception, dailyBalances } = report;
          const receptionDate = startOfDay(initialReception.date);
          const queryStart = startOfDay(parseISO(startDate));
          const queryEnd = endOfDay(parseISO(endDate));
          
          if (receptionDate >= queryStart && receptionDate <= queryEnd) {
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
          
          const gracePeriodEndDate = addDays(receptionDate, 3);
          const relevantDailyBalances = dailyBalances.filter(day => {
              const dayDate = parseISO(day.date);
              return dayDate > gracePeriodEndDate && dayDate >= queryStart && dayDate <= queryEnd;
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
  


export async function generateClientSettlement(criteria: {
  clientName: string;
  startDate: string;
  endDate: string;
  conceptIds: string[];
  containerNumber?: string;
  lotIds?: string[];
}): Promise<ClientSettlementResult> {
  
  const { clientName, startDate, endDate, conceptIds, lotIds } = criteria;
  
  const allConcepts = await getClientBillingConcepts();

  // --- SPECIAL SMYL by LOT ID LOGIC ---
  if (clientName === 'SMYL TRANSPORTE Y LOGISTICA SAS' && lotIds && lotIds.length > 0) {
      if (conceptIds.length > 0) {
          return { success: false, error: "No puede seleccionar conceptos manuales al liquidar por lote en SMYL." };
      }
      try {
        const smylRows = await generateSmylLiquidation(startDate, endDate, lotIds, allConcepts);
        return { success: true, data: smylRows };
      } catch (e: any) {
        return { success: false, error: e.message || "Error al generar liquidación SMYL." };
      }
  }

  // --- STANDARD LOGIC FOR ALL OTHER CASES ---
  if (!firestore) {
    return { success: false, error: 'El servidor no está configurado correctamente.' };
  }
  
  const { containerNumber } = criteria;

  const selectedConcepts = allConcepts.filter(c => conceptIds.includes(c.id));

  if (!clientName || !startDate || !endDate || selectedConcepts.length === 0) {
    return { success: false, error: 'Faltan criterios para la liquidación.' };
  }

  try {
    const serverQueryStartDate = startOfDay(parseISO(startDate));
    const serverQueryEndDate = endOfDay(parseISO(endDate));
    const dayBeforeStartDate = subDays(serverQueryStartDate, 1);

    const [articlesSnapshot, allSubmissionsSnapshot, manualOpsSnapshot, crewManualOpsSnapshot] = await Promise.all([
        firestore.collection('articulos').where('razonSocial', '==', clientName).get(),
        firestore.collection('submissions').where('formData.fecha', '<=', serverQueryEndDate).get(),
        firestore.collection('manual_client_operations').where('operationDate', '>=', serverQueryStartDate).where('operationDate', '<=', serverQueryEndDate).get(),
        firestore.collection('manual_operations').where('operationDate', '>=', serverQueryStartDate).where('operationDate', '<=', serverQueryEndDate).where('clientName', '==', clientName).get(),
    ]);
    
    const articleSessionMap = new Map();
    articlesSnapshot.forEach(doc => {
        const article = doc.data() as ArticuloData;
        articleSessionMap.set(article.codigoProducto, article.sesion);
    });

    const allOperations: BasicOperation[] = [];

    const allSubmissions = allSubmissionsSnapshot.docs.map(doc => serializeTimestamps(doc.data()));

    const clientSubmissions = allSubmissions.filter(data => {
        const docClientName = data.formData?.cliente || data.formData?.nombreCliente;
        return docClientName === clientName;
    });

    clientSubmissions.forEach(data => {
        if (containerNumber && data.formData.contenedor !== containerNumber) {
            return;
        }
        allOperations.push({ type: 'form', data });
    });
    
    manualOpsSnapshot.docs.forEach(doc => {
        const data = serializeTimestamps(doc.data());
        if (data.clientName === clientName) {
             if (containerNumber && data.details?.container !== containerNumber) {
                return;
            }
            allOperations.push({ type: 'manual', data });
        }
    });

    crewManualOpsSnapshot.docs.forEach(doc => {
        const data = serializeTimestamps(doc.data());
        allOperations.push({ type: 'crew_manual', data });
    });
    
    const settlementRows: ClientSettlementRow[] = [];
    
    const processCargueAlmacenamiento = async (concept: ClientBillingConcept, weightCondition: (weight: number) => boolean) => {
        const recepciones = allOperations
            .filter(op => op.type === 'form' && (op.data.formType === 'variable-weight-reception' || op.data.formType === 'variable-weight-recepcion') && op.data.formData.tipoPedido === 'GENERICO')
            .map(op => op.data);

        for (const recepcion of recepciones) {
            const lotesEnRecepcion = (recepcion.formData.items || []).reduce((acc: any, item: any) => {
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
                if (weightCondition(lotesEnRecepcion[loteId].peso)) {
                    const fechaRecepcion = new Date(recepcion.formData.fecha);
                    const fechaDespachoBuscada = addDays(fechaRecepcion, 1);

                    const despachoDelDiaSiguiente = allOperations.find(op => 
                        op.type === 'form' &&
                        op.data.formType === 'variable-weight-despacho' &&
                        format(new Date(op.data.formData.fecha), 'yyyy-MM-dd') === format(fechaDespachoBuscada, 'yyyy-MM-dd') &&
                        (op.data.formData.items || []).some((item: any) => item.lote === loteId)
                    );

                    if (despachoDelDiaSiguiente) {
                         const paletasEnDespacho = new Set(
                            (despachoDelDiaSiguiente.data.formData.items || [])
                                .filter((item: any) => item.lote === loteId && !item.esPicking)
                                .map((item: any) => item.paleta)
                        ).size;

                        if (paletasEnDespacho === lotesEnRecepcion[loteId].paletas.size) {
                             settlementRows.push({
                                date: format(fechaRecepcion, 'yyyy-MM-dd'),
                                placa: recepcion.formData.placa,
                                container: recepcion.formData.contenedor,
                                camara: 'CO', // Asumiendo Congelado
                                totalPaletas: paletasEnDespacho,
                                operacionLogistica: 'No Aplica',
                                pedidoSislog: recepcion.formData.pedidoSislog,
                                conceptName: concept.conceptName,
                                tipoVehiculo: 'No Aplica',
                                quantity: 1, // Se cobra una vez por la operación completa
                                unitOfMeasure: concept.unitOfMeasure,
                                unitValue: concept.value || 0,
                                totalValue: concept.value || 0,
                            });
                        }
                    }
                }
            }
        }
    };
    
    const smylCargueAlmacenamientoConcept = selectedConcepts.find(c => c.conceptName === 'SERVICIO LOGÍSTICO MANIPULACIÓN CARGA (CARGUE Y ALMACENAMIENTO 1 DÍA)' && c.calculationType === 'LÓGICA ESPECIAL');
    if (clientName === 'SMYL TRANSPORTE Y LOGISTICA SAS' && smylCargueAlmacenamientoConcept) {
        await processCargueAlmacenamiento(smylCargueAlmacenamientoConcept, peso => peso >= 20000);
    }

    const smylCargueAlmacenamientoVehiculoLivianoConcept = selectedConcepts.find(c => c.conceptName === 'SERVICIO LOGÍSTICO MANIPULACIÓN CARGA VEHICULO LIVIANO (CARGUE Y ALMACENAMIENTO 1 DÍA)' && c.calculationType === 'LÓGICA ESPECIAL');
    if (clientName === 'SMYL TRANSPORTE Y LOGISTICA SAS' && smylCargueAlmacenamientoVehiculoLivianoConcept) {
        await processCargueAlmacenamiento(smylCargueAlmacenamientoVehiculoLivianoConcept, peso => peso > 0 && peso < 20000);
    }
    
    const operacionCargueConcept = selectedConcepts.find(c => c.conceptName === 'OPERACIÓN CARGUE');
    if (clientName === 'AVICOLA EL MADROÑO S.A.' && operacionCargueConcept) {
        const canastasOps = allOperations.filter(op => 
            op.type === 'crew_manual' && 
            op.data.concept === 'CARGUE DE CANASTAS'
        );

        for (const op of canastasOps) {
            const opData = op.data;
            const totalTons = opData.quantity; // Quantity from manual crew op is TONS for this case
            
            const matchingTariff = findMatchingTariff(totalTons, operacionCargueConcept);
            if (matchingTariff) {
                const operacionLogistica = getOperationLogisticsType(opData.operationDate, opData.startTime, opData.endTime, operacionCargueConcept);
                const unitValue = operacionLogistica === 'Diurno' ? matchingTariff.dayTariff : matchingTariff.nightTariff;

                settlementRows.push({
                    date: opData.operationDate,
                    placa: opData.plate || 'Manual',
                    container: 'No Aplica',
                    camara: 'No Aplica',
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
        
        // START: Special handling for 'TUNEL DE CONGELACIÓN'
        if (concept.conceptName === 'OPERACIÓN DESCARGUE' && clientName === 'AVICOLA EL MADROÑO S.A.') {
            const tunelOperations = allOperations
                .filter(op => op.type === 'form' && op.data.formData?.tipoPedido === 'TUNEL DE CONGELACIÓN' && op.data.formData?.recepcionPorPlaca)
                .map(op => op.data)
                .filter(op => {
                    const opDate = startOfDay(new Date(op.formData.fecha));
                    return opDate >= serverQueryStartDate && opDate <= serverQueryEndDate;
                });
            
            for (const op of tunelOperations) {
                for (const placa of op.formData.placas || []) {
                    const weightKg = (placa.items || []).reduce((sum: number, item: any) => sum + ((Number(item.pesoBruto) || 0) - (Number(item.taraEstiba) || 0)), 0);
                    const totalTons = weightKg / 1000;
                    
                    if (totalTons <= 0) continue;

                    const operacionLogistica = getOperationLogisticsType(op.formData.fecha, op.formData.horaInicio, op.formData.horaFin, concept);
                    const matchingTariff = findMatchingTariff(totalTons, concept);
                    if (!matchingTariff) continue;

                    const unitValue = operacionLogistica === 'Diurno' ? matchingTariff.dayTariff : operacionLogistica === 'Nocturno' ? matchingTariff.nightTariff : matchingTariff.extraTariff;

                    settlementRows.push({
                        date: op.formData.fecha,
                        placa: placa.numeroPlaca,
                        container: 'N/A', // Not applicable per vehicle
                        camara: 'CO', // Assumed for this concept
                        totalPaletas: (placa.items || []).length,
                        operacionLogistica,
                        pedidoSislog: op.formData.pedidoSislog,
                        conceptName: concept.conceptName,
                        tipoVehiculo: matchingTariff.vehicleType,
                        quantity: 1, // Liquidate per vehicle
                        unitOfMeasure: 'VIAJE',
                        unitValue: unitValue,
                        totalValue: unitValue,
                        horaInicio: op.formData.horaInicio,
                        horaFin: op.formData.horaFin,
                    });
                }
            }
            continue; // Skip the general processing for this concept
        }
        // END: Special handling for 'TUNEL DE CONGELACIÓN'
            
        const applicableOperations = allOperations
            .filter(op => op.type === 'form' && op.data.formData?.tipoPedido !== 'TUNEL DE CONGELACIÓN')
            .map(op => op.data)
            .filter(op => {
                const opDate = startOfDay(new Date(op.formData.fecha));
                if (isBefore(opDate, serverQueryStartDate) || isBefore(serverQueryEndDate, opDate)) return false;

                const isRecepcion = op.formType.includes('recepcion') || op.formType.includes('reception');
                const isDespacho = op.formType.includes('despacho');
                const opTypeMatch = concept.filterOperationType === 'ambos' ||
                                    (concept.filterOperationType === 'recepcion' && isRecepcion) ||
                                    (concept.filterOperationType === 'despacho' && isDespacho);
                if (!opTypeMatch) return false;

                const isFixed = op.formType.includes('fixed-weight');
                const isVariable = op.formType.includes('variable-weight');
                const prodTypeMatch = concept.filterProductType === 'ambos' ||
                                      (concept.filterProductType === 'fijo' && isFixed) ||
                                      (concept.filterProductType === 'variable' && isVariable);
                if (!prodTypeMatch) return false;
                
                const pedidoType = op.formData?.tipoPedido;
                const pedidoTypeMatch = !concept.filterPedidoTypes || concept.filterPedidoTypes.length === 0 || (pedidoType && concept.filterPedidoTypes.includes(pedidoType));
                if (!pedidoTypeMatch) return false;

                const items = getFilteredItems(op, concept.filterSesion, articleSessionMap);
                if (items.length === 0) return false;
                
                return true;
            });

            
        for (const op of applicableOperations) {
            if (
                clientName === 'GRUPO FRUTELLI SAS' && 
                (op.formType === 'variable-weight-recepcion' || op.formType === 'variable-weight-reception')
            ) {
                continue; 
            }

            let quantity = 0;
            let totalPallets = 0;
            
            const weightKg = calculateWeightForOperation(op, concept.filterSesion, articleSessionMap);
            
            switch (concept.calculationBase) {
                case 'TONELADAS': quantity = weightKg / 1000; break;
                case 'KILOGRAMOS': quantity = weightKg; break;
                case 'CANTIDAD_PALETAS': quantity = calculatePalletsForOperation(op, concept.filterSesion, articleSessionMap); break;
                case 'CANTIDAD_CAJAS': quantity = calculateUnitsForOperation(op, concept.filterSesion, articleSessionMap); break;
                case 'NUMERO_OPERACIONES': quantity = 1; break;
                case 'NUMERO_CONTENEDORES': quantity = op.formData.contenedor ? 1 : 0; break;
                case 'PALETAS_SALIDA_MAQUILA_CONGELADOS':
                    if ((op.formType === 'variable-weight-reception' || op.formType === 'variable-weight-recepcion') && op.formData.tipoPedido === 'MAQUILA') {
                        quantity = Number(op.formData.salidaPaletasMaquilaCO) || 0;
                    } else {
                        quantity = 0;
                    }
                    totalPallets = quantity; // Ensure totalPallets reflects the calculated quantity
                    break;
                case 'PALETAS_SALIDA_MAQUILA_SECO':
                     if ((op.formType.includes('reception') || op.formType.includes('recepcion')) && op.formData.tipoPedido === 'MAQUILA') {
                        quantity = Number(op.formData.salidaPaletasMaquilaSE) || 0;
                    } else {
                        quantity = 0;
                    }
                    totalPallets = quantity; // Ensure totalPallets reflects the calculated quantity
                    break;
                case 'CANTIDAD_SACOS_MAQUILA':
                    if ((op.formType.includes('reception') || op.formType.includes('recepcion')) && op.formData.tipoPedido === 'MAQUILA' && op.formData.tipoEmpaqueMaquila === 'EMPAQUE DE SACOS') {
                        quantity = calculateUnitsForOperation(op, concept.filterSesion, articleSessionMap);
                    } else {
                        quantity = 0;
                    }
                    break;
            }
            
            if (quantity <= 0) continue;

            if (concept.calculationBase !== 'PALETAS_SALIDA_MAQUILA_CONGELADOS' && concept.calculationBase !== 'PALETAS_SALIDA_MAQUILA_SECO') {
                totalPallets = calculatePalletsForOperation(op, concept.filterSesion, articleSessionMap);
            }

            let unitValue = 0;
            let operacionLogistica: string = 'No Aplica';
            let vehicleTypeForReport = 'No Aplica';
            let unitOfMeasureForReport = concept.unitOfMeasure;
            
            if (concept.tariffType === 'UNICA') {
                unitValue = concept.value || 0;
            } else if (concept.tariffType === 'RANGOS') {
                const totalTons = weightKg / 1000;
                operacionLogistica = getOperationLogisticsType(op.formData.fecha, op.formData.horaInicio, op.formData.horaFin, concept);
                
                const matchingTariff = findMatchingTariff(totalTons, concept);

                if (!matchingTariff) {
                    continue; // If no range matches, skip this operation
                }

                vehicleTypeForReport = matchingTariff.vehicleType;
                if (concept.conceptName === 'OPERACIÓN CARGUE' || concept.conceptName === 'OPERACIÓN DESCARGUE') {
                    unitOfMeasureForReport = 'VIAJE';
                    if (operacionLogistica === 'Diurno') unitValue = matchingTariff.dayTariff;
                    else if (operacionLogistica === 'Nocturno') unitValue = matchingTariff.nightTariff;
                    else if (operacionLogistica === 'Extra') unitValue = matchingTariff.extraTariff;
                    quantity = 1; // It's per trip now
                } else {
                    unitValue = operacionLogistica === 'Diurno' ? matchingTariff.dayTariff : matchingTariff.nightTariff;
                }
            } else if (concept.tariffType === 'POR_TEMPERATURA') {
                let tempSourceArray = [];
                // Verifica si el formulario es de peso fijo o variable para saber de dónde sacar las temperaturas
                if (op.formType.startsWith('fixed-weight-')) {
                    tempSourceArray = op.formData.productos || [];
                } else {
                    tempSourceArray = op.formData.summary || [];
                }
            
                const allTemps: number[] = tempSourceArray.flatMap((item: any) => 
                    [
                        item.temperatura1, 
                        item.temperatura2, 
                        item.temperatura3,
                        // También busca `temperatura` por compatibilidad con datos antiguos
                        item.temperatura 
                    ].filter((t: any): t is number => t !== null && t !== undefined && !isNaN(Number(t)))
                );
            
                if (allTemps.length > 0) {
                    const averageTemp = allTemps.reduce((sum, current) => sum + Number(current), 0) / allTemps.length;
                    const matchingTariff = findMatchingTemperatureTariff(averageTemp, concept);
                    if (matchingTariff) {
                        unitValue = matchingTariff.ratePerKg;
                    }
                }
            }
            

            
            const filteredItems = getFilteredItems(op, concept.filterSesion, articleSessionMap);
            const firstProductCode = filteredItems[0]?.codigo;
            const camara = firstProductCode ? articleSessionMap.get(firstProductCode) || 'N/A' : 'N/A';

            settlementRows.push({
                date: op.formData.fecha,
                placa: op.formData.placa || 'N/A',
                container: op.formData.contenedor || 'N/A',
                camara,
                totalPaletas: totalPallets,
                operacionLogistica,
                pedidoSislog: op.formData.pedidoSislog,
                conceptName: concept.conceptName,
                tipoVehiculo: (concept.conceptName === 'OPERACIÓN CARGUE' || concept.conceptName === 'OPERACIÓN DESCARGUE') ? vehicleTypeForReport : 'No Aplica',
                quantity,
                unitOfMeasure: unitOfMeasureForReport,
                unitValue: unitValue,
                totalValue: quantity * unitValue,
                horaInicio: op.formData.horaInicio,
                horaFin: op.formData.horaFin,
            });
        }
    }
    
    const observationConcepts = selectedConcepts.filter(c => c.calculationType === 'OBSERVACION');
    if (observationConcepts.length > 0) {
        const opsWithObservations = allOperations.filter(op => op.type === 'form' && Array.isArray(op.data.formData.observaciones) && op.data.formData.observaciones.length > 0 && isWithinInterval(startOfDay(new Date(op.data.formData.fecha)), { start: serverQueryStartDate, end: serverQueryEndDate }));
        
        for (const concept of observationConcepts) {
            const relevantOps = opsWithObservations.filter(op =>
                (op.data.formData.observaciones as any[]).some(obs => obs.type === concept.associatedObservation)
            );
            
            for (const op of relevantOps) {
                const obs = (op.data.formData.observaciones as any[]).find(o => o.type === concept.associatedObservation);
                const quantity = Number(obs?.quantity) || 0;

                if (quantity > 0) {
                    settlementRows.push({
                        date: op.data.formData.fecha,
                        placa: op.data.formData.placa || 'N/A',
                        container: op.data.formData.contenedor || 'N/A',
                        camara: 'N/A',
                        totalPaletas: 0, 
                        operacionLogistica: 'No Aplica',
                        pedidoSislog: op.data.formData.pedidoSislog,
                        conceptName: concept.conceptName,
                        tipoVehiculo: 'No Aplica',
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
        c.calculationType === 'MANUAL' || 
        c.conceptName === 'MOVIMIENTO ENTRADA PRODUCTOS - PALLET' ||
        c.conceptName === 'MOVIMIENTO SALIDA PRODUCTOS - PALLET'
    );
    const manualOpsFiltered = allOperations.filter(op => op.type === 'manual' || op.type === 'crew_manual');

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
                                date, conceptName: concept.conceptName, subConceptName: diurnaTariff.name, placa: 'No Aplica',
                                container: 'No Aplica', totalPaletas: 0, camara: 'No Aplica', operacionLogistica: 'Diurno',
                                pedidoSislog: 'Manual', tipoVehiculo: 'No Aplica', quantity: quantityHours,
                                numeroPersonas: numPersonas, unitOfMeasure: diurnaTariff.unit, unitValue: diurnaTariff.value || 0,
                                totalValue: quantityHours * (diurnaTariff.value || 0) * numPersonas,
                                horaInicio: format(baseStart, 'HH:mm'), horaFin: format(addMinutes(baseStart, totalDiurnoMinutes), 'HH:mm'),
                            });
                        }
                        if (totalNocturnoMinutes > 0 && nocturnaTariff) {
                            const quantityHours = totalNocturnoMinutes / 60;
                            settlementRows.push({
                                date, conceptName: concept.conceptName, subConceptName: nocturnaTariff.name, placa: 'No Aplica',
                                container: 'No Aplica', totalPaletas: 0, camara: 'No Aplica', operacionLogistica: 'Nocturno',
                                pedidoSislog: 'Manual', tipoVehiculo: 'No Aplica', quantity: quantityHours,
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
                                date, conceptName: concept.conceptName, subConceptName: diurnaTariff.name, placa: opData.details?.plate || 'No Aplica',
                                container: opData.details?.container || 'No Aplica', totalPaletas: opData.details?.totalPallets || 0, camara: 'No Aplica',
                                operacionLogistica: 'Diurno', pedidoSislog: 'Manual', tipoVehiculo: 'No Aplica',
                                quantity: quantity, numeroPersonas: numPersonas, unitOfMeasure: diurnaTariff.unit,
                                unitValue: diurnaTariff.value || 0, totalValue: quantity * (diurnaTariff.value || 0) * numPersonas,
                                horaInicio: startTime, horaFin: format(addMinutes(start, totalDiurnoMinutes), 'HH:mm'),
                            });
                        }
                        if (totalNocturnoMinutes > 0 && nocturnaTariff) {
                            const quantity = totalNocturnoMinutes / 60;
                            settlementRows.push({
                                date, conceptName: concept.conceptName, subConceptName: nocturnaTariff.name, placa: opData.details?.plate || 'No Aplica',
                                container: opData.details?.container || 'No Aplica', totalPaletas: opData.details?.totalPallets || 0, camara: 'No Aplica',
                                operacionLogistica: 'Nocturno', pedidoSislog: 'Manual', tipoVehiculo: 'No Aplica',
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
                    if (!specificTariffInfo) return; // Skip if tariff info not found
                    
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
                            placa: opData.details?.plate || 'No Aplica',
                            container: opData.details?.container || 'No Aplica',
                            totalPaletas: opData.details?.totalPallets || 0,
                            camara: 'CO', // Hardcoded for this specific concept
                            operacionLogistica: 'No Aplica',
                            pedidoSislog: opData.details?.pedidoSislog || 'Manual',
                            conceptName: concept.conceptName,
                            subConceptName: specificTariffInfo.name,
                            tipoVehiculo: 'No Aplica',
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
                const specificTariffInfo = concept.specificTariffs?.[0]; // Assuming only one for this concept
                if (specificTariffInfo) {
                    const totalValue = quantityForCalc * (specificTariffInfo.value || 0) * numPersonas;
                     settlementRows.push({
                        date,
                        placa: opData.details?.plate || 'No Aplica',
                        container: opData.details?.container || 'No Aplica',
                        totalPaletas: opData.details?.totalPallets || 0,
                        camara: 'N/A',
                        operacionLogistica: 'No Aplica',
                        pedidoSislog: opData.details?.pedidoSislog || 'No aplica',
                        conceptName: concept.conceptName,
                        subConceptName: specificTariffInfo.name,
                        tipoVehiculo: 'No Aplica',
                        quantity: quantityForCalc,
                        unitOfMeasure: specificTariffInfo.unit,
                        unitValue: specificTariffInfo.value || 0,
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
                
                let operacionLogistica = 'No Aplica';
                // AQUÍ EMPIEZA LA LÓGICA
                if (opData.concept === 'SERVICIO DE CONGELACIÓN - PALLET/DÍA (-18ºC)') {
                    operacionLogistica = 'Servicio Congelación';
                }
                // AQUÍ TERMINA
                let containerValue = opData.details?.container || 'No Aplica';
                const noDocumento = opData.details?.noDocumento;
            
                if (opData.concept.includes('FMM')) {
                    operacionLogistica = opData.details?.opLogistica && opData.details?.fmmNumber
                        ? `${opData.details.opLogistica} - #${opData.details.fmmNumber}`
                        : 'No Aplica';
                    // containerValue mantiene el valor del contenedor
                } else if (opData.concept.includes('ARIN')) {
                    operacionLogistica = opData.details?.opLogistica && opData.details?.arin
                    ? `${opData.details.opLogistica} - #${opData.details?.arin}`
                    : 'No Aplica';   

                    containerValue = opData.details?.container || 'No Aplica'; // ARIN usa el número ARIN
                } else if (noDocumento) {
                    containerValue = noDocumento; // Fallback para otros conceptos
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
                //Conceptos Que no queremos que tenga # personas en Liquidación de Clientes 
                const conceptsToHideNumeroPersonas = [
                    'IN-HOUSE INSPECTOR ZFPC',
                    'FMM DE INGRESO ZFPC (MANUAL)',
                    'FMM DE SALIDA ZFPC (MANUAL)',
                    'FMM DE INGRESO ZFPC (NACIONALIZADO)',
                    'FMM DE SALIDA ZFPC (NACIONALIZADO)',
                    'ARIN DE INGRESO ZFPC (MANUAL)',
                    'ARIN DE SALIDA ZFPC (MANUAL)',
                    'ARIN DE INGRESO ZFPC (NACIONALIZADO)',
                    'ARIN DE SALIDA ZFPC (NACIONALIZADO)',
                    'ALQUILER IMPRESORA ETIQUEDADO',
                    'CONEXIÓN ELÉCTRICA CONTENEDOR',
                    'ETIQUETADO POR CAJA/ UNIDAD FAL COLOCA ETIQUETA',
                    'MOVIMIENTO ENTRADA PRODUCTOS PALLET',
                    'MOVIMIENTO SALIDA PRODUCTOS PALLET'
            
                ];
                
        
                if (conceptsToHideNumeroPersonas.includes(concept.conceptName)) {
                     //operacionLogistica = opData.comentarios || 'No Aplica';
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
                    placa: opData.details?.plate || 'No Aplica',
                    container: containerValue,
                    totalPaletas: opData.details?.totalPallets || 0,
                    camara: 'N/A',
                    operacionLogistica,
                    pedidoSislog: opData.details?.pedidoSislog || 'No Aplica',
                    conceptName: concept.conceptName,
                    tipoVehiculo: 'No Aplica',
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
            const containerMovements = allOperations.reduce((acc: Record<string, { date: Date; type: 'entry' | 'exit'; pallets: number }[]>, op) => {
                if (op.type !== 'form') return acc;
                const container = op.data.formData?.contenedor?.trim();
                if (!container || container.toUpperCase() === 'N/A' || container.toUpperCase() === 'NO APLICA') return acc;
    
                const pallets = calculatePalletsForOperation(op.data, concept.inventorySesion, articleSessionMap);
                if (pallets === 0) return acc;
    
                if (!acc[container]) {
                    acc[container] = [];
                }
                acc[container].push({
                    date: startOfDay(new Date(op.data.formData.fecha)),
                    type: op.data.formType.includes('recepcion') ? 'entry' : 'exit',
                    pallets: pallets,
                });
                return acc;
            }, {});
    
            for (const container in containerMovements) {
                // Find all movements for THIS container across ALL time
                const movementsForContainer = allSubmissions
                    .filter(op => (op.formData?.cliente === clientName || op.formData?.nombreCliente === clientName) && op.formData.contenedor === container)
                    .map(op => ({
                        date: startOfDay(new Date(op.formData.fecha)),
                        pallets: calculatePalletsForOperation(op, concept.inventorySesion, articleSessionMap),
                        type: op.formType.includes('recepcion') ? 'entry' : 'exit',
                    }));
    
                // Calculate balance before the selected start date
                const initialBalanceMovements = movementsForContainer.filter(m => isBefore(m.date, serverQueryStartDate));
                let balance = initialBalanceMovements.reduce((acc, mov) => acc + (mov.type === 'entry' ? mov.pallets : -mov.pallets), 0);
    
                const dateRangeArray = eachDayOfInterval({ start: serverQueryStartDate, end: serverQueryEndDate });
    
                for (const date of dateRangeArray) {
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
                            tipoVehiculo: 'No Aplica',
                            quantity: balance,
                            unitOfMeasure: concept.unitOfMeasure,
                            unitValue: concept.value,
                            totalValue: balance * concept.value,
                        });
                    }
    
                    const movementsForDay = movementsForContainer.filter(m => isEqual(m.date, date));
                    const entriesToday = movementsForDay.filter(m => m.type === 'entry').reduce((sum, m) => sum + m.pallets, 0);
                    const exitsToday = movementsForDay.filter(m => m.type === 'exit').reduce((sum, m) => sum + m.pallets, 0);
                    
                    balance += entriesToday - exitsToday;
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
                        tipoVehiculo: 'No Aplica',
                        quantity: dayData.posicionesAlmacenadas,
                        unitOfMeasure: concept.unitOfMeasure,
                        unitValue: concept.value,
                        totalValue: dayData.posicionesAlmacenadas * concept.value,
                    });
                }
            }
        }
    }
    
    const conceptOrder = [
        'OPERACIÓN DESCARGUE', 'OPERACIÓN CARGUE', 'OPERACIÓN CARGUE (CANASTILLAS)', 'ALISTAMIENTO POR UNIDAD', 
        'SERVICIO LOGÍSTICO MANIPULACIÓN CARGA',
        'Servicio logístico Congelación (4 Días)', // Child
        'Servicio de Manipulación', // Child
        'OPERACIÓN DESCARGUE/TONELADAS',
        'OPERACIÓN CARGUE/TONELADAS',
        'SERVICIO DE CONGELACIÓN - PALLET/DIA (-18ºC)',
        'SERVICIO DE REFRIGERACIÓN - PALLET/DIA (0°C A 4ºC)',
        'MOVIMIENTO ENTRADA PRODUCTOS - PALLET',
        'MOVIMIENTO SALIDA PRODUCTOS - PALLET',
        'SERVICIO LOGÍSTICO CONGELACIÓN (COBRO DIARIO)',
        'SERVICIO DE REFRIGERACIÓN - PALLET/DIA (0°C A 4ºC) POR CONTENEDOR',
        'FMM DE INGRESO ZFPC', 'FMM DE INGRESO ZFPC (MANUAL)', 'ARIN DE INGRESO ZFPC', 
        'FMM DE SALIDA ZFPC', 'FMM DE SALIDA ZFPC (MANUAL)', 'ARIN DE SALIDA ZFPC', 
        'REESTIBADO', 'TOMA DE PESOS POR ETIQUETA HRS', 'MOVIMIENTO ENTRADA PRODUCTOS PALLET',
        'MOVIMIENTO SALIDA PRODUCTOS PALLET', 'CONEXIÓN ELÉCTRICA CONTENEDOR', 'ESTIBA MADERA RECICLADA',
        'POSICIONES FIJAS CÁMARA CONGELADOS', 'INSPECCIÓN ZFPC', 'TIEMPO EXTRA FRIOAL (FIJO)', 'TIEMPO EXTRA FRIOAL', 
        'TIEMPO EXTRA ZFPC',
        'HORA EXTRA DIURNA',//child (TIEMPO EXTRA ZFPC)
        'HORA EXTRA NOCTURNA',//child (TIEMPO EXTRA ZFPC)
        'HORA EXTRA DIURNA DOMINGO Y FESTIVO',//child (TIEMPO EXTRA ZFPC)
        'HORA EXTRA NOCTURNA DOMINGO Y FESTIVO',//child (TIEMPO EXTRA ZFPC)
        'ALIMENTACION',//child (TIEMPO EXTRA ZFPC)
        'TRANSPORTE EXTRAORDINARIO',//child (TIEMPO EXTRA ZFPC)
        'TRANSPORTE DOMINICAL Y FESTIVO',//child (TIEMPO EXTRA ZFPC)
        'IN-HOUSE INSPECTOR ZFPC', 'ALQUILER IMPRESORA ETIQUETADO',
        'ALMACENAMIENTO PRODUCTOS CONGELADOS -PALLET/DIA (-18°C A -25°C)', 'ALMACENAMIENTO PRODUCTOS REFRIGERADOS -PALLET/DIA (0°C A 4ºC', 'SERVICIO DE TUNEL DE CONGELACIÓN RAPIDA',
        'MOVIMIENTO ENTRADA PRODUCTO - PALETA', 'MOVIMIENTO SALIDA PRODUCTO - PALETA'
    ];
    
    const roleOrder = ['SUPERVISOR', 'MONTACARGUISTA TRILATERAL', 'MONTACARGUISTA NORMAL', 'OPERARIO'];

    settlementRows.sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        if (dateA !== dateB) return dateA - dateB;

        const getSortOrder = (conceptName: string) => {
            const index = conceptOrder.indexOf(conceptName);
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
    

  

