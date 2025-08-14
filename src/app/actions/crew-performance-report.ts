

'use server';

import admin from 'firebase-admin';
import { firestore } from '@/lib/firebase-admin';
import { parse, differenceInMinutes, addDays } from 'date-fns';
import { findBestMatchingStandard, type PerformanceStandard } from '@/app/actions/standard-actions';
import { getBillingConcepts, type BillingConcept } from '../gestion-conceptos-liquidacion/actions';
import { getNoveltiesForOperation, type NoveltyData } from './novelty-actions';


const serializeTimestamps = (data: any): any => {
    if (data === null || data === undefined || typeof data !== 'object') {
        return data;
    }
    if (data instanceof admin.firestore.Timestamp) {
        return data.toDate().toISOString();
    }
    if (Array.isArray(data)) {
        return data.map(item => serializeTimestamps(item));
    }
    const newObj: { [key: string]: any } = {};
    for (const key in data) {
        if (Object.prototype.hasOwnProperty.call(data, key)) {
            newObj[key] = serializeTimestamps(data[key]);
        }
    }
    return newObj;
};

const calculateDuration = (horaInicio: string, horaFin: string): number | null => {
    if (!horaInicio || !horaFin) return null;
    try {
        const startTime = parse(horaInicio, 'HH:mm', new Date());
        const endTime = parse(horaFin, 'HH:mm', new Date());

        if (endTime < startTime) {
            endTime.setDate(endTime.getDate() + 1);
        }
        return differenceInMinutes(endTime, startTime);
    } catch (e) {
        console.error("Error calculating duration", e);
        return null;
    }
};

const calculateTotalKilos = (formType: string, formData: any): number => {
    // For fixed weight, the total gross weight is in a dedicated field.
    // This handles both new forms and older ones after legalization.
    if (formType.startsWith('fixed-weight-')) {
        return Number(formData.totalPesoBrutoKg || 0);
    }
    
    // For variable weight reception, settlement is by total GROSS WEIGHT.
    if (formType.includes('reception') || formType.includes('recepcion')) {
        const allItems = (formData.items || [])
            .concat((formData.placas || []).flatMap((p: any) => p.items));
        // Sum the gross weight of each item, regardless of whether it's summary or individual.
        return allItems.reduce((sum: number, p: any) => sum + (Number(p.pesoBruto) || 0), 0);
    }
    
    // For variable weight dispatch, use NET WEIGHT.
    if (formType.startsWith('variable-weight-')) {
        const allItems = (formData.items || [])
            .concat((formData.destinos || []).flatMap((d: any) => d.items));

        if (allItems.some((p: any) => Number(p.paleta) === 0)) {
             return allItems.reduce((sum: number, p: any) => sum + (Number(p.totalPesoNeto) || 0), 0);
        }
        return allItems.reduce((sum: number, p: any) => sum + (Number(p.pesoNeto) || 0), 0);
    }

    return 0;
};


const calculateTotalPallets = (formType: string, formData: any): number => {
    if (formType.startsWith('fixed-weight-')) {
        return (formData.productos || []).reduce((sum: number, p: any) => sum + (Number(p.totalPaletas ?? p.paletas) || 0), 0);
    } 
    
    if (formType.startsWith('variable-weight-')) {
        const allItems = (formData.items || [])
            .concat((formData.destinos || []).flatMap((d: any) => d.items))
            .concat((formData.placas || []).flatMap((p: any) => p.items));
        
        const isSummaryFormat = allItems.some((p: any) => Number(p.paleta) === 0);
        
        if (isSummaryFormat) {
             // For dispatch with destination and summary, a specific field holds the total
            if ((formType.includes('despacho') && formData.despachoPorDestino) || (formData.tipoPedido === 'TUNEL DE CONGELACIÓN')) {
                return Number(formData.totalPaletasDespacho) || allItems.reduce((sum: number, p: any) => sum + (Number(p.totalPaletas) || 0), 0);
            }
            return allItems.reduce((sum: number, p: any) => sum + (Number(p.totalPaletas) || 0), 0);
        }
        
        const uniquePallets = new Set<number>();
        allItems.forEach((item: any) => {
            const paletaNum = Number(item.paleta);
            if (!isNaN(paletaNum) && paletaNum > 0) {
                uniquePallets.add(paletaNum);
            }
        });
        return uniquePallets.size;
    }

    return 0;
};



export interface CrewPerformanceReportCriteria {
    startDate?: string;
    endDate?: string;
    operario?: string;
    operationType?: 'recepcion' | 'despacho';
    productType?: 'fijo' | 'variable';
    clientNames?: string[];
    filterPending?: boolean;
    cuadrillaFilter?: 'con' | 'sin' | 'todas';
    conceptos?: string[];
}

export interface CrewPerformanceReportRow {
    id: string; 
    submissionId: string;
    formType: string;
    fecha: string;
    operario: string;
    cliente: string;
    tipoOperacion: 'Recepción' | 'Despacho' | 'N/A';
    tipoProducto: 'Fijo' | 'Variable' | 'N/A';
    productos: any[]; // For pending legalization
    kilos: number;
    horaInicio: string;
    horaFin: string;
    totalDurationMinutes: number | null;
    operationalDurationMinutes: number | null;
    novelties: NoveltyData[];
    pedidoSislog: string;
    placa: string;
    contenedor: string;
    productType: 'fijo' | 'variable' | null;
    standard?: PerformanceStandard | null;
    description: string;
    conceptoLiquidado: string;
    valorUnitario: number;
    cantidadConcepto: number;
    unidadMedidaConcepto: string;
    valorTotalConcepto: number;
    aplicaCuadrilla: string | undefined;
    formData: any; // Include full formData for legalization modal
}


const getLocalGroupingDate = (isoString: string): string => {
    if (!isoString) return '';
    try {
        const date = new Date(isoString);
        // Correct for Colombia Timezone (UTC-5)
        date.setUTCHours(date.getUTCHours() - 5);
        return date.toISOString().split('T')[0];
    } catch (e) {
        console.error(`Invalid date string for grouping: ${isoString}`);
        return '';
    }
};

const calculateSettlements = (submission: any, billingConcepts: BillingConcept[]): { conceptName: string, unitValue: number, quantity: number, unitOfMeasure: string, totalValue: number }[] => {
    const settlements: { conceptName: string, unitValue: number, quantity: number, unitOfMeasure: string, totalValue: number }[] = [];
    const { formData, formType } = submission;
    
    // Process observations first
    const observaciones = Array.isArray(formData.observaciones) ? formData.observaciones : [];
    const specialHandledConcepts = ['REESTIBADO', 'SALIDA PALETAS TUNEL', 'TRANSBORDO CANASTILLA'];

    observaciones.forEach((obs: any) => {
        if (obs.executedByGrupoRosales === true) {
            const conceptType = obs.type.toUpperCase();
            let quantity = Number(obs.quantity) || 0;
            let quantityType = obs.quantityType;

            const isSpecialConcept = specialHandledConcepts.includes(conceptType);
            
            if (isSpecialConcept && quantity === 0) {
                 const conceptFromDb = billingConcepts.find(c => c.conceptName.toUpperCase() === conceptType.toUpperCase());
                 if (conceptFromDb) {
                     quantityType = conceptFromDb.unitOfMeasure;
                 }
            }
            
            if (quantity === 0 && quantityType) {
                 if (quantityType.toUpperCase().startsWith('PALETA')) {
                    quantity = calculateTotalPallets(formType, formData);
                } else if (quantityType.toUpperCase() === 'TONELADA') {
                    quantity = calculateTotalKilos(formType, formData) / 1000;
                }
            }
            
            if (quantity > 0 && quantityType) {
                const billingConcept = billingConcepts.find(
                    c => c.conceptName.toUpperCase() === conceptType.toUpperCase() && 
                         c.unitOfMeasure.toUpperCase() === quantityType.toUpperCase()
                );

                if (billingConcept) {
                    settlements.push({
                        conceptName: billingConcept.conceptName,
                        unitValue: billingConcept.value,
                        quantity: quantity,
                        unitOfMeasure: billingConcept.unitOfMeasure,
                        totalValue: quantity * billingConcept.value,
                    });
                }
            }
        }
    });

    // Then process the main operation concept (CARGUE/DESCARGUE)
    if (formData.aplicaCuadrilla === 'si') {
        const isReception = formType.includes('recepcion') || formType.includes('reception');
        const isDispatch = formType.includes('despacho');
        const conceptName = isReception ? 'DESCARGUE' : (isDispatch ? 'CARGUE' : null);
        
        if (conceptName) {
            const kilos = calculateTotalKilos(formType, formData);
            const operationConcept = billingConcepts.find(c => c.conceptName === conceptName && c.unitOfMeasure === 'TONELADA');
            
            if (operationConcept) {
                 // For fixed weight, the operation is pending if totalPesoBrutoKg is 0.
                 const isFixedWeightPending = formType.startsWith('fixed-weight-') && kilos === 0;

                 if (isFixedWeightPending) {
                      if (!settlements.some(s => s.conceptName === conceptName)) {
                         settlements.push({ 
                             conceptName: operationConcept.conceptName, 
                             unitValue: operationConcept.value, 
                             quantity: -1, // Use -1 as a flag for pending
                             unitOfMeasure: 'TONELADA', 
                             totalValue: 0
                         });
                     }
                 } else if (kilos >= 0) { // Also include operations with 0 kilos if not pending
                    const toneladas = kilos / 1000;
                    if (!settlements.some(s => s.conceptName === conceptName)) {
                        settlements.push({ 
                            conceptName: operationConcept.conceptName, 
                            unitValue: operationConcept.value, 
                            quantity: toneladas, 
                            unitOfMeasure: 'TONELADA', 
                            totalValue: toneladas * operationConcept.value 
                        });
                    }
                }
            }
        }
        
        if (formData.tipoPedido === 'MAQUILA' && formData.tipoEmpaqueMaquila) {
            const conceptName = formData.tipoEmpaqueMaquila;
            const unitOfMeasure = conceptName === 'EMPAQUE DE CAJAS' ? 'CAJA' : 'SACO';
            const maquilaConcept = billingConcepts.find(c => c.conceptName === conceptName && c.unitOfMeasure === unitOfMeasure);

            if (maquilaConcept) {
                let quantity = 0;
                if (formType.startsWith('fixed-weight-')) {
                    quantity = (formData.productos || []).reduce((sum: number, p: any) => sum + (Number(p.cajas) || 0), 0);
                } else if (formType.startsWith('variable-weight-')) {
                    quantity = (formData.items || []).reduce((sum: number, p: any) => sum + (Number(p.cantidadPorPaleta) || 0), 0);
                }
                
                if (quantity > 0) {
                    if (!settlements.some(s => s.conceptName === conceptName)) {
                        settlements.push({ 
                            conceptName: maquilaConcept.conceptName, 
                            unitValue: maquilaConcept.value, 
                            quantity: quantity, 
                            unitOfMeasure: maquilaConcept.unitOfMeasure, 
                            totalValue: quantity * maquilaConcept.value 
                        });
                    }
                }
            }
        }
    }
    
    return settlements;
};

export async function getCrewPerformanceReport(criteria: CrewPerformanceReportCriteria): Promise<CrewPerformanceReportRow[]> {
    if (!firestore) {
        throw new Error('El servidor no está configurado correctamente.');
    }

    if (!criteria.startDate || !criteria.endDate) {
        throw new Error('Se requiere un rango de fechas para generar este informe.');
    }
    
    let query: admin.firestore.Query = firestore.collection('submissions');

    const serverQueryStartDate = new Date(criteria.startDate);
    serverQueryStartDate.setDate(serverQueryStartDate.getDate() - 1);
    
    const serverQueryEndDate = new Date(criteria.endDate);
    serverQueryEndDate.setDate(serverQueryEndDate.getDate() + 2);

    query = query.where('createdAt', '>=', serverQueryStartDate.toISOString().split('T')[0])
                 .where('createdAt', '<', serverQueryEndDate.toISOString().split('T')[0]);


    try {
        const [submissionsSnapshot, billingConcepts] = await Promise.all([
            query.get(),
            getBillingConcepts()
        ]);
        
        let allResults = submissionsSnapshot.docs.map(doc => ({ id: doc.id, ...serializeTimestamps(doc.data()) }));

        allResults = allResults.filter(sub => {
            const formIsoDate = sub.formData?.fecha;
            if (!formIsoDate || typeof formIsoDate !== 'string') return false;
            
            const localDate = getLocalGroupingDate(formIsoDate);
            return localDate >= criteria.startDate! && localDate <= criteria.endDate!;
        });

        // Apply filter for pending weights first if requested.
        // This is a crucial filter that dramatically reduces the dataset for other filters.
        if (criteria.filterPending) {
             allResults = allResults.filter(sub => {
                 if (!sub.formType.startsWith('fixed-weight-')) return false;
                 // A submission is pending if the new field is 0 or undefined.
                 return (sub.formData.totalPesoBrutoKg === undefined || sub.formData.totalPesoBrutoKg === 0);
             });
        }

        if (criteria.operario) {
            allResults = allResults.filter(sub => sub.userDisplayName === criteria.operario);
        }

        const finalReportRows: CrewPerformanceReportRow[] = [];

        for (const submission of allResults) {
            const { id, formType, formData, userDisplayName } = submission;
            
            const allPossibleConcepts = calculateSettlements(submission, billingConcepts);
            
            let indicatorOnlyOperation: { conceptName: string, toneladas: number, isPending: boolean } | null = null;
            
             if (formData.aplicaCuadrilla === 'no') {
                const isReception = formType.includes('recepcion') || formType.includes('reception');
                const isDispatch = formType.includes('despacho');
                
                if (isReception || isDispatch) {
                    const concept = isReception ? 'DESCARGUE' : 'CARGUE';
                    const kilos = calculateTotalKilos(formType, formData);
                    const isPending = formType.startsWith('fixed-weight-') && kilos === 0;
                    
                    indicatorOnlyOperation = {
                        conceptName: concept,
                        toneladas: kilos / 1000,
                        isPending: isPending
                    };
                }
            }
            
            const hasCrewSettlements = allPossibleConcepts.length > 0;
            const hasNonCrewIndicator = indicatorOnlyOperation !== null;
            
            if (criteria.cuadrillaFilter === 'con' && !hasCrewSettlements) continue;
            if (criteria.cuadrillaFilter === 'sin' && !hasNonCrewIndicator) continue;
            
            const buildRow = (settlement?: typeof allPossibleConcepts[0]) => {
                let tipoOperacion: 'Recepción' | 'Despacho' | 'N/A' = 'N/A';
                if (formType.includes('recepcion') || formType.includes('reception')) tipoOperacion = 'Recepción';
                else if (formType.includes('despacho')) tipoOperacion = 'Despacho';

                let tipoProducto: 'Fijo' | 'Variable' | 'N/A' = 'N/A';
                if (formType.includes('fixed-weight')) tipoProducto = 'Fijo';
                else if (formType.includes('variable-weight')) tipoProducto = 'Variable';

                let quantity = 0;
                if (settlement) {
                    quantity = settlement.quantity;
                } else if (indicatorOnlyOperation) {
                    quantity = indicatorOnlyOperation.isPending ? -1 : indicatorOnlyOperation.toneladas;
                }
                
                return {
                    id: settlement ? `${id}-${settlement.conceptName.replace(/\s+/g, '-')}` : id,
                    submissionId: id, formType, fecha: formData.fecha, operario: userDisplayName || 'N/A', cliente: formData.nombreCliente || formData.cliente || 'N/A',
                    tipoOperacion, tipoProducto, productos: formData.productos || [], kilos: calculateTotalKilos(formType, formData), horaInicio: formData.horaInicio || 'N/A', horaFin: formData.horaFin || 'N/A',
                    totalDurationMinutes: null, operationalDurationMinutes: null, novelties: [], pedidoSislog: formData.pedidoSislog || 'N/A',
                    placa: formData.placa || 'N/A', contenedor: formData.contenedor || 'N/A', productType: tipoProducto === 'Fijo' ? 'fijo' : (tipoProducto === 'Variable' ? 'variable' : null),
                    standard: null, description: "Sin descripción",
                    conceptoLiquidado: settlement?.conceptName || indicatorOnlyOperation?.conceptName || 'N/A',
                    valorUnitario: settlement?.unitValue || 0,
                    cantidadConcepto: quantity,
                    unidadMedidaConcepto: settlement?.unitOfMeasure || (indicatorOnlyOperation ? 'TONELADA' : 'N/A'),
                    valorTotalConcepto: settlement?.totalValue || 0,
                    aplicaCuadrilla: formData.aplicaCuadrilla,
                    formData: formData,
                };
            };
            
            if (hasCrewSettlements) {
                for (const settlement of allPossibleConcepts) {
                    finalReportRows.push(buildRow(settlement));
                }
            } else if (hasNonCrewIndicator) {
                 finalReportRows.push(buildRow());
            }
        }
        
        const enrichedRows = [];
        for (const row of finalReportRows) {
            if (criteria.clientNames && criteria.clientNames.length > 0 && !criteria.clientNames.includes(row.cliente)) continue;
            if (criteria.productType && row.productType !== criteria.productType) continue;
            if (criteria.operationType) {
                const rowOpType = (row.tipoOperacion === 'Recepción') ? 'recepcion' : (row.tipoOperacion === 'Despacho' ? 'despacho' : null);
                if(rowOpType !== criteria.operationType) continue;
            }
            if (criteria.conceptos && criteria.conceptos.length > 0 && !criteria.conceptos.includes(row.conceptoLiquidado)) continue;
            
            const novelties = await getNoveltiesForOperation(row.submissionId);
            const totalDuration = calculateDuration(row.horaInicio, row.horaFin);
            
            let downtimeMinutes = 0;
            if (row.aplicaCuadrilla === 'si') {
                 downtimeMinutes = novelties
                    .filter(n => n.purpose === 'justification')
                    .reduce((sum, n) => sum + n.downtimeMinutes, 0);
            }
            
            row.novelties = novelties;
            row.totalDurationMinutes = totalDuration;
            row.operationalDurationMinutes = totalDuration !== null ? totalDuration - downtimeMinutes : null;

            if (row.tipoOperacion === 'Recepción' || row.tipoOperacion === 'Despacho') {
                 row.standard = await findBestMatchingStandard({
                    clientName: row.cliente,
                    operationType: row.tipoOperacion === 'Recepción' ? 'recepcion' : 'despacho',
                    productType: row.tipoProducto === 'Fijo' ? 'fijo' : 'variable',
                    tons: row.kilos / 1000
                });
                row.description = row.standard?.description || "Sin descripción";
            }

            enrichedRows.push(row);
        }

        enrichedRows.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

        return enrichedRows;
    } catch (error: any) {
        console.error('Error fetching crew performance report:', error);
        throw error;
    }
}
