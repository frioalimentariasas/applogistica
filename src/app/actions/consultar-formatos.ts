
'use server';

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

        let results = snapshot.docs.map(doc => ({
            id: doc.id,
            ...(doc.data() as FormSubmissionData),
        }));

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
