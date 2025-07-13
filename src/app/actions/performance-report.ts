
'use server';

import admin from 'firebase-admin';
import { firestore } from '@/lib/firebase-admin';
import { parse, differenceInMinutes, addDays } from 'date-fns';

// Helper to serialize Firestore Timestamps
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

// Helper to get a YYYY-MM-DD string adjusted for a specific timezone (e.g., UTC-5 for Colombia)
const getLocalGroupingDate = (isoString: string): string => {
    if (!isoString) return '';
    try {
        const date = new Date(isoString);
        date.setUTCHours(date.getUTCHours() - 5);
        return date.toISOString().split('T')[0];
    } catch (e) {
        return '';
    }
};

const calculateDuration = (horaInicio: string, horaFin: string): number | null => {
    if (!horaInicio || !horaFin) return null;
    try {
        const startTime = parse(horaInicio, 'HH:mm', new Date());
        const endTime = parse(horaFin, 'HH:mm', new Date());

        if (endTime < startTime) {
            endTime.setDate(endTime.getDate() + 1); // Handle overnight operations
        }
        
        return differenceInMinutes(endTime, startTime);
    } catch (e) {
        console.error("Error calculating duration", e);
        return null;
    }
};

export interface PerformanceReportCriteria {
    startDate?: string;
    endDate?: string;
    operario?: string;
}

export interface PerformanceReportRow {
    id: string;
    fecha: string;
    operario: string;
    cliente: string;
    tipoOperacion: string;
    pedidoSislog: string;
    horaInicio: string;
    horaFin: string;
    duracionMinutos: number | null;
}

export async function getPerformanceReport(criteria: PerformanceReportCriteria): Promise<PerformanceReportRow[]> {
    if (!firestore) {
        throw new Error('El servidor no está configurado correctamente.');
    }

    if (!criteria.startDate || !criteria.endDate) {
        throw new Error('Se requiere un rango de fechas para generar este informe.');
    }
    
    let query: admin.firestore.Query = firestore.collection('submissions');
    
    // Apply operario filter at the query level. This will require a composite index.
    if (criteria.operario) {
        query = query.where('userDisplayName', '==', criteria.operario);
    }
    
    // To include results from the end date, we need to query up to the start of the next day.
    const endDatePlusOne = addDays(new Date(criteria.endDate), 1);
    const endDateString = endDatePlusOne.toISOString().split('T')[0];

    query = query.where('createdAt', '>=', criteria.startDate)
                 .where('createdAt', '<', endDateString);

    try {
        const snapshot = await query.get();
        
        const results = snapshot.docs.map(submissionDoc => {
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
                fecha: formData.fecha,
                operario: userDisplayName || 'N/A',
                cliente: formData.nombreCliente || formData.cliente || 'N/A',
                tipoOperacion,
                pedidoSislog: formData.pedidoSislog || 'N/A',
                horaInicio: formData.horaInicio || 'N/A',
                horaFin: formData.horaFin || 'N/A',
                duracionMinutos: calculateDuration(formData.horaInicio, formData.horaFin),
            };
        });
        
        results.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

        return results;
    } catch (error: any) {
        if (error instanceof Error && error.message.includes('requires an index')) {
            console.error("Firestore composite index required. See the full error log for the creation link.", error);
            // Re-throw the original error to pass the link to the client for debugging
            throw new Error(error.message);
        }
        // Re-throw other errors to ensure they are logged.
        console.error('Error fetching performance report:', error);
        throw error;
    }
}


export async function getAvailableOperarios(startDate: string, endDate: string): Promise<string[]> {
    if (!firestore) {
        throw new Error('El servidor no está configurado correctamente.');
    }

    const serverQueryStartDate = new Date(startDate);
    
    const serverQueryEndDate = new Date(endDate);
    serverQueryEndDate.setDate(serverQueryEndDate.getDate() + 1);

    const snapshot = await firestore.collection('submissions')
        .where('createdAt', '>=', serverQueryStartDate.toISOString().split('T')[0])
        .where('createdAt', '<', serverQueryEndDate.toISOString().split('T')[0])
        .select('userDisplayName')
        .get();

    if (snapshot.empty) {
        return [];
    }

    const operarios = new Set<string>();
    snapshot.docs.forEach(doc => {
        const displayName = doc.data().userDisplayName;
        if (displayName) {
            operarios.add(displayName);
        }
    });

    return Array.from(operarios).sort();
}
