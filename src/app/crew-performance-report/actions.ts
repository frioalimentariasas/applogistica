

'use server';

import { firestore } from '@/lib/firebase-admin';
import { revalidatePath } from 'next/cache';
import { differenceInMinutes, parse, format } from 'date-fns';
import admin from 'firebase-admin';

export interface ManualOperationData {
    clientName?: string;
    operationDate: string; // ISO string like '2024-07-23T15:49:01.859Z'
    startTime: string; // HH:mm
    endTime: string; // HH:mm
    plate?: string;
    concept: string;
    quantity: number;
    createdAt?: string; // ISO string for timestamping
    createdBy?: {
        uid: string;
        displayName: string;
    }
}

export async function addManualOperation(data: ManualOperationData): Promise<{ success: boolean; message: string }> {
    if (!firestore) {
        return { success: false, message: 'El servidor no está configurado correctamente.' };
    }

    try {
        const operationWithTimestamp = {
            ...data,
            operationDate: admin.firestore.Timestamp.fromDate(new Date(data.operationDate)),
            createdAt: new Date().toISOString(),
        };

        await firestore.collection('manual_operations').add(operationWithTimestamp);

        revalidatePath('/crew-performance-report');
        revalidatePath('/operaciones-manuales');
        return { success: true, message: 'Operación manual agregada con éxito.' };

    } catch (error) {
        console.error('Error al agregar operación manual:', error);
        const errorMessage = error instanceof Error ? error.message : 'Ocurrió un error desconocido.';
        return { success: false, message: `Error del servidor: ${errorMessage}` };
    }
}


export async function updateManualOperation(id: string, data: Omit<ManualOperationData, 'createdAt'>): Promise<{ success: boolean; message: string }> {
    if (!firestore) {
        return { success: false, message: 'El servidor no está configurado correctamente.' };
    }

    try {
        const docRef = firestore.collection('manual_operations').doc(id);
        const operationWithTimestamp = {
            ...data,
            operationDate: admin.firestore.Timestamp.fromDate(new Date(data.operationDate)),
        };
        await docRef.update(operationWithTimestamp);
        
        revalidatePath('/crew-performance-report');
        revalidatePath('/operaciones-manuales');
        return { success: true, message: 'Operación manual actualizada con éxito.' };
    } catch (error) {
        console.error(`Error al actualizar operación manual ${id}:`, error);
        const errorMessage = error instanceof Error ? error.message : 'Ocurrió un error desconocido.';
        return { success: false, message: `Error del servidor: ${errorMessage}` };
    }
}


export async function deleteManualOperation(id: string): Promise<{ success: boolean; message: string }> {
    if (!firestore) {
        return { success: false, message: 'El servidor no está configurado correctamente.' };
    }

    try {
        await firestore.collection('manual_operations').doc(id).delete();
        revalidatePath('/crew-performance-report');
        revalidatePath('/operaciones-manuales');
        return { success: true, message: 'Operación manual eliminada con éxito.' };
    } catch (error) {
        console.error(`Error al eliminar operación manual ${id}:`, error);
        const errorMessage = error instanceof Error ? error.message : 'Ocurrió un error desconocido.';
        return { success: false, message: `Error del servidor: ${errorMessage}` };
    }
}

export async function getAllManualOperations(): Promise<any[]> {
    if (!firestore) {
        return [];
    }
    try {
        const snapshot = await firestore.collection('manual_operations')
            .orderBy('operationDate', 'desc')
            .get();
        
        return snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                ...data,
                id: doc.id,
                operationDate: (data.operationDate as admin.firestore.Timestamp).toDate().toISOString(),
                createdAt: data.createdAt,
            }
        });
    } catch (error) {
        console.error("Error fetching all manual operations:", error);
        return [];
    }
}
