

'use server';

import { firestore } from '@/lib/firebase-admin';
import { revalidatePath } from 'next/cache';
import { differenceInMinutes, parse, format } from 'date-fns';
import admin from 'firebase-admin';

interface ManualOperationData {
    clientName: string;
    operationDate: string; // ISO string like '2024-07-23T15:49:01.859Z'
    startTime: string; // HH:mm
    endTime: string; // HH:mm
    plate?: string;
    concept: string;
    quantity: number;
    createdAt: string; // ISO string for timestamping
}

export async function addManualOperation(data: Omit<ManualOperationData, 'createdAt'>): Promise<{ success: boolean; message: string }> {
    if (!firestore) {
        return { success: false, message: 'El servidor no está configurado correctamente.' };
    }

    try {
        const operationWithTimestamp = {
            ...data,
            // Convert the incoming string date to a Firestore Timestamp
            operationDate: admin.firestore.Timestamp.fromDate(new Date(data.operationDate)),
            createdAt: new Date().toISOString(),
        };

        await firestore.collection('manual_operations').add(operationWithTimestamp);

        revalidatePath('/crew-performance-report');
        return { success: true, message: 'Operación manual agregada con éxito.' };

    } catch (error) {
        console.error('Error al agregar operación manual:', error);
        const errorMessage = error instanceof Error ? error.message : 'Ocurrió un error desconocido.';
        return { success: false, message: `Error del servidor: ${errorMessage}` };
    }
}
