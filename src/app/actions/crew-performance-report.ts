

'use server';

import admin from 'firebase-admin';
import { firestore } from '@/lib/firebase-admin';
import { parse, differenceInMinutes, addDays } from 'date-fns';
import { findBestMatchingStandard, type PerformanceStandard } from '@/app/actions/standard-actions';
import { getBillingConcepts, type BillingConcept } from '../gestion-conceptos-liquidacion/actions';


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
        return (formData.productos || []).reduce((sum: number, p: any) => sum + (Number(p.pesoNetoKg) || 0), 0);
    } 
    
    if (formType.startsWith('variable-weight-')) {
        const items = formData.items || [];
        // Handle summary format in variable weight dispatch
        if (formType.includes('despacho') && items.some((p: any) => Number(p.paleta) === 0)) {
            return items.reduce((sum: number, p: any) => sum + (Number(p.totalPesoNeto) || 0), 0);
        }
        // Handle detailed format for variable weight (reception and dispatch)
        return items.reduce((sum: number, p: any) => sum + (Number(p.pesoNeto) || 0), 0);
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
}

export interface CrewPerformanceReportRow {
    id: string;
    formType: string;
    fecha: string;
    operario: string;
    cliente: string;
    tipoOperacion: 'Recepción' | 'Despacho' | 'N/A';
    tipoProducto: 'Fijo' | 'Variable' | 'N/A';
    kilos: number;
    horaInicio: string;
    horaFin: string;
    duracionMinutos: number | null;
    pedidoSislog: string;
    productType: 'fijo' | 'variable' | null;
    standard?: PerformanceStandard | null;
    description: string;
    settlements: { conceptName: string; value: number }[];
    totalValorLiquidacion: number;
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

const calculateSettlements = (submission: any, billingConcepts: BillingConcept[]): { conceptName: string; value: number }[] => {
    const settlements: { conceptName: string; value: number }[] = [];
    const { formData, formType } = submission;
    const observations = formData.observaciones || [];

    // --- Concept: REESTIBADO ---
    const reestibadoObservations = observations.filter(
        (obs: any) => obs.type === 'REESTIBADO' && obs.executedByGrupoRosales === true
    );
    
    if (reestibadoObservations.length > 0) {
        const reestibadoConcept = billingConcepts.find(
            c => c.conceptName === 'REESTIBADO' && c.unitOfMeasure === 'PALETA'
        );
        if (reestibadoConcept) {
            const totalPallets = reestibadoObservations.reduce(
                (sum: number, obs: any) => sum + (Number(obs.quantity) || 0), 0
            );
            if (totalPallets > 0) {
                settlements.push({
                    conceptName: 'REESTIBADO',
                    value: totalPallets * reestibadoConcept.value,
                });
            }
        }
    }

    // --- Concept: CARGUE / DESCARGUE ---
    if (formData.aplicaCuadrilla === 'si') {
        const isReception = formType.includes('recepcion') || formType.includes('reception');
        const conceptName = isReception ? 'DESCARGUE' : 'CARGUE';
        
        const operationConcept = billingConcepts.find(c => c.conceptName === conceptName);

        if (operationConcept) {
            settlements.push({
                conceptName: conceptName,
                value: operationConcept.value
            });
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
    
    query = query.where('formData.aplicaCuadrilla', '==', 'si');

    if (criteria.operario) {
        query = query.where('userDisplayName', '==', criteria.operario);
    }
    
    const serverQueryStartDate = new Date(criteria.startDate);
    const serverQueryEndDate = addDays(new Date(criteria.endDate), 1);
    
    query = query.where('createdAt', '>=', serverQueryStartDate.toISOString().split('T')[0])
                 .where('createdAt', '<', serverQueryEndDate.toISOString().split('T')[0]);


    try {
        const [snapshot, billingConcepts] = await Promise.all([
            query.get(),
            getBillingConcepts()
        ]);
        
        const allResults = snapshot.docs.map(submissionDoc => {
             const submission = {
                id: submissionDoc.id,
                ...serializeTimestamps(submissionDoc.data())
            };
            return submission;
        });

        const dateFilteredResults = allResults.filter(submission => {
            const formIsoDate = submission.formData?.fecha;
            if (!formIsoDate || typeof formIsoDate !== 'string') {
                return false;
            }
            const formDatePart = getLocalGroupingDate(formIsoDate);
            return formDatePart >= criteria.startDate! && formDatePart <= criteria.endDate!;
        });


        const results = await Promise.all(dateFilteredResults.map(async (submission) => {
            const { id, formType, formData, userDisplayName } = submission;

            let tipoOperacion: 'Recepción' | 'Despacho' | 'N/A' = 'N/A';
            let operationTypeForAction: 'recepcion' | 'despacho' | undefined = undefined;
            if (formType.includes('recepcion') || formType.includes('reception')) {
                tipoOperacion = 'Recepción';
                operationTypeForAction = 'recepcion';
            } else if (formType.includes('despacho')) {
                tipoOperacion = 'Despacho';
                operationTypeForAction = 'despacho';
            }

            let tipoProducto: 'Fijo' | 'Variable' | 'N/A' = 'N/A';
            let productTypeForAction: 'fijo' | 'variable' | null = null;
            if (formType.includes('fixed-weight')) {
                tipoProducto = 'Fijo';
                productTypeForAction = 'fijo';
            } else if (formType.includes('variable-weight')) {
                tipoProducto = 'Variable';
                productTypeForAction = 'variable';
            }
            
            const kilos = calculateTotalKilos(formType, formData);
            const toneladas = Math.round((kilos / 1000) * 100) / 100;
            const clientName = formData.nombreCliente || formData.cliente;

            const standard = await findBestMatchingStandard({
              clientName: clientName,
              operationType: operationTypeForAction,
              productType: productTypeForAction,
              tons: toneladas
            }); 
            
            const settlements = calculateSettlements(submission, billingConcepts);
            const totalValorLiquidacion = settlements.reduce((sum, s) => sum + s.value, 0);

            return {
                id,
                formType,
                fecha: formData.fecha,
                operario: userDisplayName || 'N/A',
                cliente: clientName || 'N/A',
                tipoOperacion,
                tipoProducto,
                kilos: kilos,
                horaInicio: formData.horaInicio || 'N/A',
                horaFin: formData.horaFin || 'N/A',
                duracionMinutos: calculateDuration(formData.horaInicio, formData.horaFin),
                pedidoSislog: formData.pedidoSislog || 'N/A',
                productType: productTypeForAction,
                standard,
                description: standard?.description || "Sin descripción",
                settlements,
                totalValorLiquidacion,
            };
        }));

        // Apply remaining filters in memory
        let filteredResults = results;
        if (criteria.clientNames && criteria.clientNames.length > 0) {
            filteredResults = filteredResults.filter(row => criteria.clientNames!.includes(row.cliente));
        }
        if (criteria.productType) {
            filteredResults = filteredResults.filter(row => row.productType === criteria.productType);
        }
        if (criteria.operationType) {
             filteredResults = filteredResults.filter(row => {
                const rowOpType = (row.tipoOperacion === 'Recepción') ? 'recepcion' : (row.tipoOperacion === 'Despacho' ? 'despacho' : null);
                return rowOpType === criteria.operationType;
            });
        }
        
        filteredResults.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

        return filteredResults;
    } catch (error: any) {
        if (error instanceof Error && error.message.includes('requires an index')) {
            console.error("Firestore composite index required. See the full error log for the creation link.", error);
            throw new Error(error.message);
        }
        console.error('Error fetching crew performance report:', error);
        throw error;
    }
}


    
