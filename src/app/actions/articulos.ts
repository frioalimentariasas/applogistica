'use server';

import { firestore } from '@/lib/firebase-admin';
import type { Query } from 'firebase-admin/firestore';

// Define the structure of an article as it is in Firestore
export interface ArticuloData {
  codigoProducto: string;
  denominacionArticulo: string;
  razonSocial: string;
  sesion: 'CO' | 'RE' | 'SE';
}

// Define the structure returned by the action
export interface ArticuloInfo {
    id: string; // Document ID from Firestore
    razonSocial: string;
    codigoProducto: string;
    denominacionArticulo: string;
    sesion: 'CO' | 'RE' | 'SE';
}

export async function getArticulosByClients(clientNames: string[]): Promise<ArticuloInfo[]> {
    if (!firestore) {
        console.error('Firebase Admin not initialized. Cannot fetch articulos.');
        return [];
    }

    if (!clientNames || clientNames.length === 0) {
        return [];
    }

    try {
        let query: Query = firestore.collection('articulos');

        // Firestore 'in' queries are limited to 30 elements. 
        // If more than 30 clients are selected, it's more efficient to fetch all and filter in memory.
        if (clientNames.length <= 30) {
            query = query.where('razonSocial', 'in', clientNames);
        }
        
        const articulosSnapshot = await query.get();

        if (articulosSnapshot.empty) {
            return [];
        }
        
        let articulos = articulosSnapshot.docs.map(doc => {
            const data = doc.data() as ArticuloData;
            return {
                id: doc.id,
                razonSocial: data.razonSocial,
                codigoProducto: data.codigoProducto,
                denominacionArticulo: data.denominacionArticulo,
                sesion: data.sesion,
            };
        });

        // If we fetched all articles because clientNames was > 30, we need to filter now.
        if (clientNames.length > 30) {
            articulos = articulos.filter(articulo => clientNames.includes(articulo.razonSocial));
        }

        // Sort alphabetically by client, then by denomination
        articulos.sort((a, b) => {
            const clientCompare = a.razonSocial.localeCompare(b.razonSocial);
            if (clientCompare !== 0) return clientCompare;
            return a.denominacionArticulo.localeCompare(b.denominacionArticulo);
        });
        
        return articulos;
    } catch (error) {
        console.error('Error fetching articulos from Firestore:', error);
        return [];
    }
}