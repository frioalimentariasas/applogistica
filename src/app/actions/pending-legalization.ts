
'use server';

import admin from 'firebase-admin';
import { firestore } from '@/lib/firebase-admin';
import type { FormSubmissionData } from './save-form';

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


export interface PendingLegalizationCriteria {
  searchDateStart?: string;
  searchDateEnd?: string;
  nombreCliente?: string;
  pedidoSislog?: string;
}

export interface PendingLegalizationResult extends FormSubmissionData {
    id: string;
}


export async function searchPendingLegalization(criteria: PendingLegalizationCriteria): Promise<PendingLegalizationResult[]> {
    if (!firestore) {
        throw new Error('El servidor no está configurado correctamente.');
    }
    
    try {
        let query: admin.firestore.Query = firestore.collection('submissions');

        // Main filter: Fixed weight forms where totalPesoBrutoKg is 0
        query = query.where('formType', 'in', ['fixed-weight-recepcion', 'fixed-weight-reception', 'fixed-weight-despacho']);
        
        // This is a necessary filter, but might not be selective enough on its own.
        // For performance, we should combine it with another filter, like date.
        query = query.where('formData.totalPesoBrutoKg', '==', 0);
        
        // Optional filters from user
        if (criteria.searchDateStart && criteria.searchDateEnd) {
            query = query.where('formData.fecha', '>=', new Date(criteria.searchDateStart + 'T00:00:00-05:00'));
            query = query.where('formData.fecha', '<=', new Date(criteria.searchDateEnd + 'T23:59:59.999-05:00'));
        }

        if (criteria.nombreCliente) {
            // Note: Firestore does not support '!=' or 'in' with other range filters efficiently.
            // Filtering by client might be best done in-memory if a date range is also applied.
            // For now, we add it to the query.
            const clientField = 'formData.nombreCliente'; // Adjust if field name differs
            query = query.where(clientField, '==', criteria.nombreCliente);
        }
        
        if (criteria.pedidoSislog) {
            query = query.where('formData.pedidoSislog', '==', criteria.pedidoSislog);
        }
        
        const snapshot = await query.orderBy('formData.fecha', 'desc').get();
        
        const results = snapshot.docs.map(doc => {
            const data = doc.data();
            const serializedData = serializeTimestamps(data);
            
            return {
                id: doc.id,
                ...serializedData,
            } as PendingLegalizationResult;
        });

        return results;

    } catch (error) {
        console.error('Error searching pending submissions:', error);
        if (error instanceof Error && (error.message.includes('requires an index') || error.message.includes('needs an index'))) {
            // Re-throw the original error to pass the URL to the client
            throw error;
        }
        throw new Error('No se pudieron buscar los formularios pendientes.');
    }
}
