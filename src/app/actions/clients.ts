'use server';

import { firestore } from '@/lib/firebase-admin';

export async function getClients(): Promise<string[]> {
    if (!firestore) {
        console.error('Firebase Admin not initialized. Cannot fetch clients.');
        return [];
    }

    try {
        const clientesSnapshot = await firestore.collection('clientes').orderBy('razonSocial').get();
        if (clientesSnapshot.empty) {
            return [];
        }
        const clients = clientesSnapshot.docs.map(doc => doc.data().razonSocial as string);
        return clients;
    } catch (error) {
        console.error('Error fetching clients from Firestore:', error);
        return [];
    }
}
