
'use server';

import admin from 'firebase-admin';
import { firestore } from '@/lib/firebase-admin';
import type { FormSubmissionData } from './save-form';

export interface SearchCriteria {
  pedidoSislog?: string;
  nombreCliente?: string;
  fechaCreacion?: string; // YYYY-MM-DD
}

export interface SubmissionResult extends FormSubmissionData {
  id: string;
}


// This helper will recursively convert any Firestore Timestamps in an object to ISO strings.
const serializeTimestamps = (data: any): any => {
    if (data === null || data === undefined || typeof data !== 'object') {
        return data;
    }

    // Handle Firestore Timestamp
    if (data instanceof admin.firestore.Timestamp) {
        return data.toDate().toISOString();
    }

    // Handle array
    if (Array.isArray(data)) {
        return data.map(item => serializeTimestamps(item));
    }
    
    // Handle object
    const newObj: { [key: string]: any } = {};
    for (const key in data) {
        if (Object.prototype.hasOwnProperty.call(data, key)) {
            newObj[key] = serializeTimestamps(data[key]);
        }
    }
    return newObj;
};


export async function searchSubmissions(criteria: SearchCriteria): Promise<SubmissionResult[]> {
    if (!firestore) {
        console.error('Firebase Admin not initialized.');
        throw new Error('El servidor no está configurado correctamente.');
    }

    try {
        let query: admin.firestore.Query = firestore.collection('submissions');

        // Firestore limitation: We can't use range filters (<, <=, >, >=) on a field if we have
        // inequality filters on other fields. We also can't do OR queries across different fields.
        
        if (criteria.pedidoSislog) {
            query = query.where('formData.pedidoSislog', '==', criteria.pedidoSislog.trim());
        }

        if (criteria.fechaCreacion) {
            const startDate = new Date(criteria.fechaCreacion);
            startDate.setUTCHours(0, 0, 0, 0);
            const endDate = new Date(criteria.fechaCreacion);
            endDate.setUTCHours(23, 59, 59, 999);
            
            query = query.where('createdAt', '>=', startDate.toISOString())
                         .where('createdAt', '<=', endDate.toISOString());
        }

        const snapshot = await query.orderBy('createdAt', 'desc').get();

        let results = snapshot.docs.map(doc => {
            const data = doc.data();
            const serializedData = serializeTimestamps(data);
            
            return {
                id: doc.id,
                ...serializedData,
            } as SubmissionResult;
        });

        // Filter by client name in memory because field name varies ('cliente' vs 'nombreCliente')
        if (criteria.nombreCliente) {
            const searchClient = criteria.nombreCliente.toLowerCase().trim();
            results = results.filter(sub => {
                const clientName = sub.formData.nombreCliente || sub.formData.cliente;
                return clientName && clientName.toLowerCase().includes(searchClient);
            });
        }
        
        return results;
    } catch (error) {
        console.error('Error searching submissions:', error);
        if (error instanceof Error && error.message.includes('requires an index')) {
            throw new Error('La consulta requiere un índice compuesto en Firestore. Por favor, cree el índice desde la consola de Firebase. El enlace para crearlo debería estar en los logs del servidor.');
        }
        throw new Error('No se pudieron buscar los formularios.');
    }
}
