

'use server';

import { firestore } from '@/lib/firebase-admin';
import admin from 'firebase-admin';
import { startOfDay, endOfDay, parseISO, differenceInHours, getDaysInMonth, getDay, format, addMinutes, addHours, differenceInMinutes, parse, isSaturday, isSunday, addDays, eachDayOfInterval, isWithinInterval, isBefore, isEqual } from 'date-fns';
import type { ArticuloData } from '@/app/actions/articulos';
import { getConsolidatedMovementReport } from '@/app/actions/consolidated-movement-report';
import { processTunelCongelacionData } from '@/lib/report-utils';
import { getSmylLotAssistantReport, type AssistantReport } from '@/app/smyl-liquidation-assistant/actions';
import { getDetailedInventoryForExport } from '@/app/actions/inventory-report';

import type { ClientBillingConcept } from '@/app/gestion-conceptos-liquidacion-clientes/actions';
import { getClientBillingConcepts } from '@/app/gestion-conceptos-liquidacion-clientes/actions';


export interface ClientSettlementRow {
    uniqueId?: string;
    isEdited?: boolean;
    isPending?: boolean;
    submissionId?: string;
    formType?: string;

    date: string; // ISO
    conceptId: string;
    conceptName: string;
    subConceptName?: string;
    quantity: number;
    unitOfMeasure: string;
    unitValue: number;
    totalValue: number;
    
    // Contextual data
    camara: string;
    placa?: string;
    container?: string;
    pedidoSislog?: string;
    operacionLogistica?: 'Diurno' | 'Nocturno' | 'Extra' | 'N/A';
    tipoVehiculo?: string;
    horaInicio?: string;
    horaFin?: string;
    numeroPersonas?: number;
    totalPaletas: number;
    lotId?: string;
}


interface SettlementCriteria {
    clientName: string;
    startDate: string;
    endDate: string;
    conceptIds: string[];
    containerNumber?: string;
    lotIds?: string[];
}


const serializeTimestamps = (data: any): any => {
    if (!data) return data;
    if (data instanceof admin.firestore.Timestamp) return data.toDate().toISOString();
    if (Array.isArray(data)) return data.map(serializeTimestamps);
    if (typeof data === 'object') {
        const res: { [key: string]: any } = {};
        for (const key in data) {
            res[key] = serializeTimestamps(data[key]);
        }
        return res;
    }
    return data;
};

const getOperationLogisticsType = (isoDateString: string, horaInicio: string, weekdayDayShiftStart: string, weekdayDayShiftEnd: string, saturdayDayShiftStart: string, saturdayDayShiftEnd: string): 'Diurno' | 'Nocturno' | 'Extra' | 'N/A' => {
    if (!isoDateString || !horaInicio) return 'N/A';

    try {
        const date = new Date(isoDateString);
        const dayOfWeek = getDay(date);

        const [startHours, startMinutes] = horaInicio.split(':').map(Number);
        
        let shiftStart: Date, shiftEnd: Date;
        let shiftType: { diurno: 'Diurno'; other: 'Nocturno' | 'Extra' };

        if (isSunday(date)) {
            return 'Extra';
        } else if (isSaturday(date)) {
            shiftStart = parse(saturdayDayShiftStart, 'HH:mm', date);
            shiftEnd = parse(saturdayDayShiftEnd, 'HH:mm', date);
            shiftType = { diurno: 'Diurno', other: 'Extra' };
        } else { // Monday to Friday
            shiftStart = parse(weekdayDayShiftStart, 'HH:mm', date);
            shiftEnd = parse(weekdayDayShiftEnd, 'HH:mm', date);
            shiftType = { diurno: 'Diurno', other: 'Nocturno' };
        }

        const operationTime = parse(horaInicio, 'HH:mm', date);
        
        if (isWithinInterval(operationTime, { start: shiftStart, end: shiftEnd })) {
            return shiftType.diurno;
        } else {
            return shiftType.other;
        }
    } catch (e) {
        console.error(`Error calculating logistics type:`, e);
        return 'N/A';
    }
};

const calculateTotalPallets = (formType: string, formData: any): number => {
    const allItems = (formData.items || [])
        .concat((formData.destinos || []).flatMap((d: any) => d?.items || []))
        .concat((formData.placas || []).flatMap((p: any) => p?.items || []));

    if (formType.startsWith('fixed-weight-')) {
        return (formData.productos || []).reduce((sum: number, p: any) => sum + (Number(p.totalPaletas ?? p.paletasCompletas) || 0), 0);
    }
    
    if (formType.startsWith('variable-weight-')) {
        const isSummaryFormat = allItems.some((p: any) => p && Number(p.paleta) === 0);
        if (isSummaryFormat) {
            return allItems.reduce((sum: number, p: any) => sum + ((Number(p.totalPaletas) || 0) + (Number(p.paletasCompletas) || 0)), 0);
        }
        
        const uniquePallets = new Set<number>();
        allItems.forEach((item: any) => {
            const paletaNum = Number(item.paleta);
            if (!isNaN(paletaNum) && paletaNum > 0 && !item.esPicking) {
                uniquePallets.add(paletaNum);
            }
        });
        return uniquePallets.size;
    }

    return 0;
};

const calculateTotalKilos = (formType: string, formData: any): number => {
    if (formType.startsWith('fixed-weight-')) {
        return Number(formData.totalPesoBrutoKg) || 0;
    }

    if (formType.startsWith('variable-weight-')) {
        const allItems = (formData.items || [])
            .concat((formData.destinos || []).flatMap((d: any) => d?.items || []))
            .concat((formData.placas || []).flatMap((p: any) => p?.items || []));

        const isSummaryFormat = allItems.some((p: any) => p && Number(p.paleta) === 0);

        if (formType.includes('recepcion') || formType.includes('reception')) {
            if (isSummaryFormat) {
                return allItems.reduce((sum: number, p: any) => sum + (Number(p.totalPesoNeto) || 0), 0);
            } else {
                const totalPesoBruto = allItems.reduce((sum: number, p: any) => sum + (Number(p.pesoBruto) || 0), 0);
                const totalTaraEstiba = allItems.reduce((sum: number, p: any) => sum + (Number(p.taraEstiba) || 0), 0);
                return totalPesoBruto - totalTaraEstiba;
            }
        } else if (formType.includes('despacho')) {
            if (isSummaryFormat) {
                return allItems.reduce((sum: number, p: any) => sum + (Number(p.totalPesoNeto) || 0), 0);
            } else {
                return allItems.reduce((sum: number, p: any) => sum + (Number(p.pesoNeto) || 0), 0);
            }
        }
    }
    
    return 0;
}

const getFirstSession = (items: any[], articleSessionMap: Map<string, string>): string => {
    for (const item of items) {
        if (item.codigo && articleSessionMap.has(item.codigo)) {
            return articleSessionMap.get(item.codigo) || 'N/A';
        }
    }
    return 'N/A';
};

export async function generateClientSettlement(
    criteria: SettlementCriteria
): Promise<{ success: boolean; data?: ClientSettlementRow[]; error?: string; errorLink?: string; }> {
    if (!firestore) {
        return { success: false, error: 'El servidor no está configurado.' };
    }

    try {
        const allConcepts = await getClientBillingConcepts();
        const conceptsToApply = allConcepts.filter(c => criteria.conceptIds.includes(c.id));

        if (conceptsToApply.length === 0) {
            return { success: true, data: [] };
        }
        
        const serverQueryStartDate = startOfDay(parseISO(criteria.startDate));
        const serverQueryEndDate = endOfDay(parseISO(criteria.endDate));

        const clientArticlesSnapshot = await firestore.collection('articulos').where('razonSocial', '==', criteria.clientName).get();
        const articleSessionMap = new Map<string, string>();
        clientArticlesSnapshot.forEach(doc => {
            const article = doc.data() as ArticuloData;
            articleSessionMap.set(article.codigoProducto, article.sesion);
        });

        const settlementRows: ClientSettlementRow[] = [];

        // Fetch submissions
        const submissionsQuery = firestore.collection('submissions')
            .where('formData.fecha', '>=', serverQueryStartDate)
            .where('formData.fecha', '<=', serverQueryEndDate);
            
        const submissionsSnapshot = await submissionsQuery.get();
        const allSubmissions = submissionsSnapshot.docs.map(doc => ({ id: doc.id, ...serializeTimestamps(doc.data()) }));
        
        // Fetch manual operations
        const manualOpsSnapshot = await firestore.collection('manual_client_operations')
            .where('operationDate', '>=', serverQueryStartDate)
            .where('operationDate', '<=', serverQueryEndDate)
            .where('clientName', '==', criteria.clientName)
            .get();
        
        const allManualOps = manualOpsSnapshot.docs.map(doc => ({ id: doc.id, ...serializeTimestamps(doc.data()) }));

        for (const concept of conceptsToApply) {
            
            // LOGIC FOR 'SALDO_INVENTARIO' & 'SALDO_CONTENEDOR'
             if ((concept.calculationType === 'SALDO_INVENTARIO' || concept.calculationType === 'SALDO_CONTENEDOR') && concept.inventorySesion) {
                
                let dailyBalances: { date: string, quantity: number }[] = [];

                if (concept.calculationType === 'SALDO_INVENTARIO') {
                    const consolidatedReport = await getConsolidatedMovementReport({
                        clientName: criteria.clientName,
                        startDate: criteria.startDate,
                        endDate: criteria.endDate,
                        sesion: concept.inventorySesion,
                        filterByArticleCodes: concept.filterByArticleCodes,
                        excludeArticleCodes: concept.excludeArticleCodes
                    });
                    dailyBalances = consolidatedReport.map(day => ({ date: day.date, quantity: day.posicionesAlmacenadas }));
                } else { // SALDO_CONTENEDOR
                    // Logic to get container balances per day
                }

                if (concept.billingPeriod === 'DIARIO') {
                    dailyBalances.forEach(day => {
                        if (day.quantity > 0) {
                            settlementRows.push({
                                date: day.date, conceptId: concept.id, conceptName: concept.conceptName,
                                quantity: day.quantity, unitOfMeasure: concept.unitOfMeasure, unitValue: concept.value || 0,
                                totalValue: day.quantity * (concept.value || 0),
                                camara: concept.inventorySesion || 'N/A', totalPaletas: day.quantity
                            });
                        }
                    });
                } else if (concept.billingPeriod === 'MENSUAL' || concept.billingPeriod === 'QUINCENAL') {
                    const groupedByMonth: Record<string, number> = {};
                    dailyBalances.forEach(day => {
                        const monthKey = format(parseISO(day.date), 'yyyy-MM');
                        groupedByMonth[monthKey] = Math.max(groupedByMonth[monthKey] || 0, day.quantity);
                    });

                    Object.entries(groupedByMonth).forEach(([month, maxQuantity]) => {
                        const daysInMonth = getDaysInMonth(parseISO(`${month}-01`));
                        let multiplier = 1;
                        if (concept.billingPeriod === 'MENSUAL') multiplier = daysInMonth;
                        if (concept.billingPeriod === 'QUINCENAL') multiplier = 15;
                        
                         settlementRows.push({
                            date: `${month}-01`, conceptId: concept.id, conceptName: concept.conceptName,
                            quantity: maxQuantity * multiplier, unitOfMeasure: concept.unitOfMeasure, unitValue: concept.value || 0,
                            totalValue: maxQuantity * multiplier * (concept.value || 0),
                            camara: concept.inventorySesion || 'N/A', totalPaletas: maxQuantity
                        });
                    });
                }
            }
             else if (concept.calculationType === 'MANUAL') {
                const relevantManualOps = allManualOps.filter(op => op.concept === concept.conceptName);
                
                relevantManualOps.forEach(op => {
                    const baseRow = {
                        date: op.operationDate, conceptId: concept.id, conceptName: concept.conceptName,
                        placa: op.details?.plate, container: op.details?.container,
                        camara: 'N/A', pedidoSislog: op.details?.pedidoSislog,
                        horaInicio: op.details?.startTime, horaFin: op.details?.endTime,
                        totalPaletas: op.details?.totalPallets || 0,
                    };
                    
                    if (concept.tariffType === 'ESPECIFICA' && Array.isArray(op.specificTariffs)) {
                        op.specificTariffs.forEach((st: any) => {
                             const tariffInfo = concept.specificTariffs?.find(t => t.id === st.tariffId);
                            if (tariffInfo) {
                                settlementRows.push({
                                    ...baseRow,
                                    subConceptName: tariffInfo.name,
                                    quantity: st.quantity,
                                    unitOfMeasure: tariffInfo.unit,
                                    unitValue: tariffInfo.value,
                                    totalValue: st.quantity * tariffInfo.value,
                                    numeroPersonas: st.numPersonas
                                });
                            }
                        });
                    } else if (concept.tariffType === 'UNICA') {
                        settlementRows.push({
                            ...baseRow,
                            quantity: op.quantity,
                            unitOfMeasure: concept.unitOfMeasure,
                            unitValue: concept.value || 0,
                            totalValue: op.quantity * (concept.value || 0),
                            numeroPersonas: op.numeroPersonas
                        });
                    }
                });
             } else if (concept.calculationType === 'REGLAS' || concept.calculationType === 'OBSERVACION') {
                const relevantSubmissions = allSubmissions.filter(sub => {
                    const docClientName = sub.formData?.cliente || sub.formData?.nombreCliente;
                    if (docClientName !== criteria.clientName) return false;
                    
                    if (criteria.containerNumber && sub.formData?.contenedor !== criteria.containerNumber) {
                        return false;
                    }
                    if (criteria.lotIds && criteria.lotIds.length > 0) {
                        const items = (sub.formData.items || []).concat((sub.formData.destinos || []).flatMap((d: any) => d.items));
                        if (!items.some((item: any) => criteria.lotIds!.includes(item.lote))) {
                           return false; 
                        }
                    }
                    
                    return true;
                });
                
                for (const op of relevantSubmissions) {
                     const { id, formType, formData } = op;
                     let quantity = 0;
                     let isApplicable = false;

                    if (concept.calculationType === 'REGLAS') {
                        const opTypeMatch = concept.filterOperationType === 'ambos' ||
                            (concept.filterOperationType === 'recepcion' && formType.includes('recepcion')) ||
                            (concept.filterOperationType === 'despacho' && formType.includes('despacho'));
                        const prodTypeMatch = concept.filterProductType === 'ambos' ||
                            (concept.filterProductType === 'fijo' && formType.includes('fixed-weight')) ||
                            (concept.filterProductType === 'variable' && formType.includes('variable-weight'));
                        const pedidoTypeMatch = !concept.filterPedidoTypes || concept.filterPedidoTypes.length === 0 || concept.filterPedidoTypes.includes(formData.tipoPedido);
                        
                        if(opTypeMatch && prodTypeMatch && pedidoTypeMatch) {
                            isApplicable = true;
                            const allItems = (formData.productos || []).concat((formData.items || [])).concat((formData.destinos || []).flatMap((d: any) => d.items || [])).concat((formData.placas || []).flatMap((p: any) => p.items || []));
                            const items = getFilteredItems(op, concept.filterSesion, articleSessionMap);
                            
                            if (items.length > 0) {
                                switch(concept.calculationBase) {
                                    case 'TONELADAS': quantity = calculateTotalKilos(formType, formData) / 1000; break;
                                    case 'KILOGRAMOS': quantity = calculateTotalKilos(formType, formData); break;
                                    case 'CANTIDAD_PALETAS': quantity = calculateTotalPallets(formType, formData); break;
                                    case 'CANTIDAD_CAJAS': quantity = allItems.reduce((s:number, i:any) => s + (Number(i.cajas) || Number(i.cantidadPorPaleta) || Number(i.totalCantidad) || 0), 0); break;
                                    case 'NUMERO_OPERACIONES': quantity = 1; break;
                                    case 'PALETAS_SALIDA_MAQUILA_CONGELADOS': quantity = Number(formData.salidaPaletasMaquilaCO || 0); break;
                                    case 'PALETAS_SALIDA_MAQUILA_SECO': quantity = Number(formData.salidaPaletasMaquilaSE || 0); break;
                                    case 'CANTIDAD_SACOS_MAQUILA': quantity = allItems.reduce((s:number, i:any) => s + (Number(i.cajas) || Number(i.cantidadPorPaleta) || 0), 0); break;
                                }
                            }
                        }

                    } else if (concept.calculationType === 'OBSERVACION') {
                        const observation = (formData.observaciones || []).find((obs: any) => obs.type === concept.associatedObservation);
                        if (observation) {
                           isApplicable = true;
                           quantity = Number(observation.quantity) || 0;
                        }
                    }

                     if (isApplicable && quantity > 0) {
                         const allItems = (formData.productos || []).concat(formData.items || []);
                         const firstItem = allItems.length > 0 ? allItems[0] : null;

                        const row: ClientSettlementRow = {
                            date: formData.fecha,
                            conceptId: concept.id,
                            conceptName: concept.conceptName,
                            quantity,
                            unitOfMeasure: concept.unitOfMeasure,
                            unitValue: 0,
                            totalValue: 0,
                            camara: getFirstSession(allItems, articleSessionMap),
                            placa: formData.placa,
                            container: formData.contenedor,
                            pedidoSislog: formData.pedidoSislog,
                            horaInicio: formData.horaInicio,
                            horaFin: formData.horaFin,
                            totalPaletas: calculateTotalPallets(formType, formData)
                        };
                        
                        if (concept.tariffType === 'UNICA') {
                            row.unitValue = concept.value!;
                            row.totalValue = quantity * concept.value!;
                        } else if (concept.tariffType === 'RANGOS' && concept.tariffRanges && concept.tariffRanges.length > 0) {
                             const opLogistica = getOperationLogisticsType(formData.fecha, formData.horaInicio, concept.weekdayDayShiftStart!, concept.weekdayDayShiftEnd!, concept.saturdayDayShiftStart!, concept.saturdayDayShiftEnd!);
                             row.operacionLogistica = opLogistica;
                             
                             const tons = calculateTotalKilos(formType, formData) / 1000;
                             const matchingRange = concept.tariffRanges.find(r => tons >= r.minTons && tons <= r.maxTons);
                             
                             if (matchingRange) {
                                let tariff = 0;
                                if (opLogistica === 'Diurno') tariff = matchingRange.dayTariff;
                                else if (opLogistica === 'Nocturno') tariff = matchingRange.nightTariff;
                                else if (opLogistica === 'Extra') tariff = matchingRange.extraTariff;
                                
                                row.unitValue = tariff;
                                row.totalValue = quantity * tariff;
                                row.tipoVehiculo = matchingRange.vehicleType;
                             }
                        }
                        
                        settlementRows.push(row);
                     }
                }
             }
             else if (concept.calculationType === 'LÓGICA ESPECIAL') {
                  if (concept.conceptName === 'SERVICIO LOGÍSTICO MANIPULACIÓN CARGA') {
                    // Logic for SMYL
                    const lotIds = criteria.lotIds || [];
                    for(const lotId of lotIds) {
                      const assistantReport = await getSmylLotAssistantReport(lotId, criteria.startDate, criteria.endDate);
                      if (!('error' in assistantReport)) {
                        settlementRows.push({
                            date: assistantReport.initialReception.date, conceptId: concept.id, conceptName: concept.conceptName,
                            quantity: assistantReport.initialReception.pallets, unitOfMeasure: concept.unitOfMeasure, unitValue: concept.value || 0,
                            totalValue: assistantReport.initialReception.pallets * (concept.value || 0),
                            camara: 'CO', totalPaletas: assistantReport.initialReception.pallets, lotId: lotId,
                            container: assistantReport.initialReception.container
                        });
                      }
                    }
                  } else if (concept.conceptName === 'SERVICIO LOGÍSTICO CONGELACIÓN (COBRO DIARIO)' || concept.conceptName === 'SERVICIO LOGÍSTICO CONGELACIÓN (4 DÍAS)') {
                    const lotIds = criteria.lotIds || [];
                     for(const lotId of lotIds) {
                       const assistantReport = await getSmylLotAssistantReport(lotId, criteria.startDate, criteria.endDate);
                       if (!('error' in assistantReport)) {
                         assistantReport.dailyBalances.forEach(day => {
                            if (day.finalBalance > 0) {
                                const isGrace = day.isGracePeriod;
                                if ((concept.conceptName === 'SERVICIO LOGÍSTICO CONGELACIÓN (4 DÍAS)' && isGrace) ||
                                    (concept.conceptName === 'SERVICIO LOGÍSTICO CONGELACIÓN (COBRO DIARIO)' && !isGrace)) {
                                    
                                     settlementRows.push({
                                        date: day.date, conceptId: concept.id, conceptName: concept.conceptName,
                                        quantity: day.finalBalance, unitOfMeasure: concept.unitOfMeasure, unitValue: concept.value || 0,
                                        totalValue: day.finalBalance * (concept.value || 0),
                                        camara: 'CO', totalPaletas: day.finalBalance, lotId: lotId
                                    });
                                }
                            }
                         });
                       }
                     }
                  }
             }
        }
        
        settlementRows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        return { success: true, data: settlementRows };
    } catch (error: any) {
        console.error('Error generating client settlement:', error);
         if (error.message.includes('requires an index')) {
            return { success: false, error: 'La consulta requiere un índice de base de datos que no existe.', errorLink: error.message };
        }
        return { success: false, error: error.message };
    }
}

    