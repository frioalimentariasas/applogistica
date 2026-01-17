
'use server';

import { firestore } from '@/lib/firebase-admin';
import type { ClientInfo } from '../gestion-clientes/actions';

export async function getClients(): Promise<ClientInfo[]> {
    if (!firestore) {
        console.error('Firebase Admin not initialized. Cannot fetch clients.');
        return [];
    }

    try {
        const clientesSnapshot = await firestore.collection('clientes').orderBy('razonSocial').get();
        if (clientesSnapshot.empty) {
            return [];
        }
        const clients = clientesSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                razonSocial: data.razonSocial as string,
                paymentTermDays: data.paymentTermDays as number | string | undefined,
                posicionesFijasHistory: data.posicionesFijasHistory || []
            };
        });
        return clients;
    } catch (error) {
        console.error('Error fetching clients from Firestore:', error);
        return [];
    }
}
