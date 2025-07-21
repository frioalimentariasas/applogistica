
'use server';

import { firestore } from '@/lib/firebase-admin';
import { revalidatePath } from 'next/cache';

export interface PerformanceStandardMap {
    'recepcion-fijo': number;
    'recepcion-variable': number;
    'despacho-fijo': number;
    'despacho-variable': number;
}

const DOCUMENT_ID = 'performance_standards';

// Function to get all standards at once
export async function getPerformanceStandards(): Promise<PerformanceStandardMap | null> {
    if (!firestore) {
        console.error('Firestore is not initialized.');
        return null;
    }
    try {
        const docRef = firestore.collection('config').doc(DOCUMENT_ID);
        const doc = await docRef.get();
        if (!doc.exists) {
            return null; // Or return default values
        }
        return doc.data() as PerformanceStandardMap;
    } catch (error) {
        console.error("Error fetching performance standards:", error);
        return null;
    }
}

// Function to update a single standard
export async function updatePerformanceStandard(
    standardKey: keyof PerformanceStandardMap, 
    value: number
): Promise<{ success: boolean; message: string }> {
    if (!firestore) {
        return { success: false, message: 'Error de configuración del servidor.' };
    }
    
    if (typeof value !== 'number' || value <= 0) {
        return { success: false, message: 'El valor debe ser un número positivo.'};
    }

    try {
        const docRef = firestore.collection('config').doc(DOCUMENT_ID);
        // Use dot notation for updating a specific field in the document
        await docRef.set({ [standardKey]: value }, { merge: true });
        
        revalidatePath('/gestion-estandares');
        revalidatePath('/crew-performance-report');

        return { success: true, message: 'Estándar actualizado correctamente.' };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Ocurrió un error desconocido.";
        return { success: false, message: `Error del servidor: ${errorMessage}` };
    }
}
