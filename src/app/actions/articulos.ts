'use server';

import { firestore } from '@/lib/firebase-admin';

// Define the structure of an article as it is in Firestore
export interface ArticuloData {
  codigoProducto: string;
  denominacionArticulo: string;
  razonSocial: string;
}

// Define the structure returned by the action
export interface ArticuloInfo {
    id: string; // Document ID from Firestore
    codigoProducto: string;
    denominacionArticulo: string;
}

export async function getArticulosByClient(clientName: string): Promise<ArticuloInfo[]> {
    if (!firestore) {
        console.error('Firebase Admin not initialized. Cannot fetch articulos.');
        return [];
    }

    if (!clientName) {
        return [];
    }

    try {
        const articulosSnapshot = await firestore.collection('articulos').where('razonSocial', '==', clientName).get();

        if (articulosSnapshot.empty) {
            return [];
        }
        
        const articulos = articulosSnapshot.docs.map(doc => {
            const data = doc.data() as ArticuloData;
            return {
                id: doc.id,
                codigoProducto: data.codigoProducto,
                denominacionArticulo: data.denominacionArticulo,
            };
        });

        // Sort alphabetically by denomination
        articulos.sort((a, b) => a.denominacionArticulo.localeCompare(b.denominacionArticulo));
        
        return articulos;
    } catch (error) {
        console.error('Error fetching articulos from Firestore:', error);
        return [];
    }
}
