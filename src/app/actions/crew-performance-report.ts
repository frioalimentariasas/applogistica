
'use server';

import admin from 'firebase-admin';
import { firestore } from '@/lib/firebase-admin';
import { parse, differenceInMinutes, addDays } from 'date-fns';

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
}

export interface CrewPerformanceReportRow {
    id: string;
    fecha: string;
    operario: string;
    cliente: string;
    tipoOperacion: string;
    kilos: number;
    horaInicio: string;
    horaFin: string;
    duracionMinutos: number | null;
}

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
    
    const endDatePlusOne = addDays(new Date(criteria.endDate), 1);
    const endDateString = endDatePlusOne.toISOString().split('T')[0];

    query = query.where('createdAt', '>=', criteria.startDate)
                 .where('createdAt', '<', endDateString);

    try {
        const snapshot = await query.get();
        
        let results = snapshot.docs.map(submissionDoc => {
            const submission = {
                id: submissionDoc.id,
                ...serializeTimestamps(submissionDoc.data())
            };
            const { id, formType, formData, userDisplayName } = submission;

            let tipoOperacion = 'N/A';
            if (formType.includes('recepcion') || formType.includes('reception')) {
                tipoOperacion = 'Recepción';
            } else if (formType.includes('despacho')) {
                tipoOperacion = 'Despacho';
            }
            
            return {
                id,
                formType,
                fecha: formData.fecha,
                operario: userDisplayName || 'N/A',
                cliente: formData.nombreCliente || formData.cliente || 'N/A',
                tipoOperacion,
                kilos: calculateTotalKilos(formType, formData),
                horaInicio: formData.horaInicio || 'N/A',
                horaFin: formData.horaFin || 'N/A',
                duracionMinutos: calculateDuration(formData.horaInicio, formData.horaFin),
            };
        });

        // Filter by product and operation type in memory
        if (criteria.productType) {
            results = results.filter(row => {
                if (criteria.productType === 'fijo') return row.formType.includes('fixed-weight');
                if (criteria.productType === 'variable') return row.formType.includes('variable-weight');
                return true;
            });
        }
        if (criteria.operationType) {
             results = results.filter(row => {
                if (criteria.operationType === 'recepcion') {
                    return row.formType.includes('recepcion') || row.formType.includes('reception');
                }
                if (criteria.operationType === 'despacho') {
                    return row.formType.includes('despacho');
                }
                return true;
            });
        }
        
        results.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

        return results.map(({ formType, ...rest }) => rest);
    } catch (error: any) {
        if (error instanceof Error && error.message.includes('requires an index')) {
            console.error("Firestore composite index required. See the full error log for the creation link.", error);
            throw new Error(error.message);
        }
        console.error('Error fetching crew performance report:', error);
        throw error;
    }
}
