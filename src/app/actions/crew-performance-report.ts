
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
    if (formType.startsWith('fixed-weight-')) {
        return (formData.productos || []).reduce((sum: number, p: any) => sum + (Number(p.pesoBrutoKg) || 0), 0);
    }
    
    if (formType.startsWith('variable-weight-')) {
        const allItems = (formData.items || [])
            .concat((formData.destinos || []).flatMap((d: any) => d.items))
            .concat((formData.placas || []).flatMap((p: any) => p.items));

        if (allItems.some((p: any) => Number(p.paleta) === 0)) {
             return allItems.reduce((sum: number, p: any) => sum + (Number(p.totalPesoNeto) || 0), 0);
        }
        return allItems.reduce((sum: number, p: any) => sum + (Number(p.pesoNeto) || 0), 0);
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
}


const getLocalGroupingDate = (isoString: string): string => {
    if (!isoString) return '';
    try {
        const date = new Date(isoString);
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
    
    const unitMeasureMap: Record<string, BillingConcept['unitOfMeasure']> = {
      'Paletas': 'PALETA',
      'Canastillas': 'CANASTILLA',
      'Unidades': 'UNIDAD'
    };

    (formData.observaciones || []).forEach((obs: any) => {
        if (obs.executedByGrupoRosales === true) {
            const conceptType = obs.type;
            const quantityType = obs.quantityType;
            const totalQuantity = Number(obs.quantity) || 0;
            
            if (totalQuantity > 0 && quantityType && unitMeasureMap[quantityType]) {
                const targetUnitOfMeasure = unitMeasureMap[quantityType];
                const billingConcept = billingConcepts.find(
                    c => c.conceptName === conceptType && c.unitOfMeasure === targetUnitOfMeasure
                );

                if (billingConcept) {
                    settlements.push({
                        conceptName: billingConcept.conceptName,
                        unitValue: billingConcept.value,
                        quantity: totalQuantity,
                        unitOfMeasure: billingConcept.unitOfMeasure,
                        totalValue: totalQuantity * billingConcept.value,
                    });
                }
            }
        }
    });

    if (formData.aplicaCuadrilla === 'si') {
        const liquidableOrderTypes = ['GENERICO', 'TUNEL', 'TUNEL DE CONGELACIÓN', 'DESPACHO GENERICO'];
        
        if (liquidableOrderTypes.includes(formData.tipoPedido)) {
            const isReception = formType.includes('recepcion') || formType.includes('reception');
            const conceptName = isReception ? 'DESCARGUE' : 'CARGUE';
            const kilos = calculateTotalKilos(formType, formData);
            const operationConcept = billingConcepts.find(c => c.conceptName === conceptName && c.unitOfMeasure === 'TONELADA');
            
            if (operationConcept) {
                const isPending = formType.startsWith('fixed-weight-') && kilos === 0;
                if (isPending) {
                    settlements.push({ conceptName: conceptName, unitValue: 0, quantity: -1, unitOfMeasure: 'TONELADA', totalValue: 0 });
                } else if (kilos > 0) {
                    const toneladas = kilos / 1000;
                    settlements.push({ conceptName: conceptName, unitValue: operationConcept.value, quantity: toneladas, unitOfMeasure: 'TONELADA', totalValue: toneladas * operationConcept.value });
                }
            }
        }
        
        if (formData.tipoPedido === 'MAQUILA' && formData.tipoEmpaqueMaquila) {
            const conceptName = formData.tipoEmpaqueMaquila; // "EMPAQUE DE CAJAS" or "EMPAQUE DE SACOS"
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
                    settlements.push({ conceptName: maquilaConcept.conceptName, unitValue: maquilaConcept.value, quantity: quantity, unitOfMeasure: maquilaConcept.unitOfMeasure, totalValue: quantity * maquilaConcept.value });
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

    // Use the form's own date field for querying
    query = query.where('formData.fecha', '>=', criteria.startDate)
                 .where('formData.fecha', '<=', criteria.endDate);

    try {
        const [submissionsSnapshot, billingConcepts] = await Promise.all([
            query.get(),
            getBillingConcepts()
        ]);
        
        let allResultsInRange = submissionsSnapshot.docs.map(doc => ({ id: doc.id, ...serializeTimestamps(doc.data()) }));

        if (criteria.operario) {
            allResultsInRange = allResultsInRange.filter(sub => sub.userDisplayName === criteria.operario);
        }

        const finalReportRows: CrewPerformanceReportRow[] = [];

        for (const submission of allResultsInRange) {
            const { id, formType, formData, userDisplayName } = submission;
            
            const allSettlements = calculateSettlements(submission, billingConcepts);
            
            let indicatorOnlyOperation: { conceptName: string, toneladas: number } | null = null;
            
            if (allSettlements.length === 0 && formData.aplicaCuadrilla === 'no') {
                const isLoadOrUnload = formData.tipoPedido === 'GENERICO' || formData.tipoPedido === 'TUNEL' || formData.tipoPedido === 'TUNEL DE CONGELACIÓN' || formData.tipoPedido === 'DESPACHO GENERICO';
                if (isLoadOrUnload) {
                    indicatorOnlyOperation = {
                        conceptName: (formType.includes('recepcion') || formType.includes('reception')) ? 'DESCARGUE' : 'CARGUE',
                        toneladas: calculateTotalKilos(formType, formData) / 1000
                    };
                }
            }
            
            const hasCrewSettlements = allSettlements.length > 0;
            const hasNonCrewIndicator = indicatorOnlyOperation !== null;
            
            const isRelevantForReport = hasCrewSettlements || hasNonCrewIndicator;

            if (criteria.cuadrillaFilter === 'con' && !hasCrewSettlements) continue;
            if (criteria.cuadrillaFilter === 'sin' && !hasNonCrewIndicator) continue;
            
            if (isRelevantForReport) {
                const buildRow = (settlement?: typeof allSettlements[0]) => {
                    let tipoOperacion: 'Recepción' | 'Despacho' | 'N/A' = 'N/A';
                    if (formType.includes('recepcion') || formType.includes('reception')) tipoOperacion = 'Recepción';
                    else if (formType.includes('despacho')) tipoOperacion = 'Despacho';

                    let tipoProducto: 'Fijo' | 'Variable' | 'N/A' = 'N/A';
                    if (formType.includes('fixed-weight')) tipoProducto = 'Fijo';
                    else if (formType.includes('variable-weight')) tipoProducto = 'Variable';
                    
                    return {
                        id: settlement ? `${id}-${settlement.conceptName.replace(/\s+/g, '-')}` : id,
                        submissionId: id, formType, fecha: formData.fecha, operario: userDisplayName || 'N/A', cliente: formData.nombreCliente || formData.cliente || 'N/A',
                        tipoOperacion, tipoProducto, kilos: calculateTotalKilos(formType, formData), horaInicio: formData.horaInicio || 'N/A', horaFin: formData.horaFin || 'N/A',
                        totalDurationMinutes: null, operationalDurationMinutes: null, novelties: [], pedidoSislog: formData.pedidoSislog || 'N/A',
                        placa: formData.placa || 'N/A', contenedor: formData.contenedor || 'N/A', productType: tipoProducto === 'Fijo' ? 'fijo' : (tipoProducto === 'Variable' ? 'variable' : null),
                        standard: null, description: "Sin descripción",
                        conceptoLiquidado: settlement?.conceptName || indicatorOnlyOperation?.conceptName || 'N/A',
                        valorUnitario: settlement?.unitValue || 0,
                        cantidadConcepto: settlement?.quantity ?? indicatorOnlyOperation?.toneladas ?? 0,
                        unidadMedidaConcepto: settlement?.unitOfMeasure || (indicatorOnlyOperation ? 'TONELADA' : 'N/A'),
                        valorTotalConcepto: settlement?.totalValue || 0,
                        aplicaCuadrilla: formData.aplicaCuadrilla,
                    };
                };

                if (hasCrewSettlements) {
                    for (const settlement of allSettlements) {
                        finalReportRows.push(buildRow(settlement));
                    }
                } else if (hasNonCrewIndicator) {
                     finalReportRows.push(buildRow());
                }
            }
        }
        
        const enrichedRows = [];
        for (const row of finalReportRows) {
            // Apply client, product, and operation type filters
            if (criteria.clientNames && criteria.clientNames.length > 0 && !criteria.clientNames.includes(row.cliente)) continue;
            if (criteria.productType && row.productType !== criteria.productType) continue;
            if (criteria.operationType) {
                const rowOpType = (row.tipoOperacion === 'Recepción') ? 'recepcion' : (row.tipoOperacion === 'Despacho' ? 'despacho' : null);
                if(rowOpType !== criteria.operationType) continue;
            }
            if (criteria.filterPending && row.cantidadConcepto !== -1) continue;

            const novelties = await getNoveltiesForOperation(row.submissionId);
            const totalDuration = calculateDuration(row.horaInicio, row.horaFin);
            const downtimeMinutes = novelties.filter(n => n.impactsCrewProductivity).reduce((sum, n) => sum + n.downtimeMinutes, 0);
            
            row.novelties = novelties;
            row.totalDurationMinutes = totalDuration;
            row.operationalDurationMinutes = totalDuration !== null ? totalDuration - downtimeMinutes : null;

            row.standard = await findBestMatchingStandard({
                clientName: row.cliente,
                operationType: row.tipoOperacion === 'Recepción' ? 'recepcion' : 'despacho',
                productType: row.productType,
                tons: row.kilos / 1000
            });
            row.description = row.standard?.description || "Sin descripción";

            enrichedRows.push(row);
        }

        enrichedRows.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

        return enrichedRows;
    } catch (error: any) {
        console.error('Error fetching crew performance report:', error);
        throw error;
    }
}
