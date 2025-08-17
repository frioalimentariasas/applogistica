

'use server';

import { firestore } from '@/lib/firebase-admin';
import { revalidatePath } from 'next/cache';
import { differenceInMinutes, parse, format } from 'date-fns';

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
        // operationDate is already an ISO string from the client
        // To query it as a string, we format it to YYYY-MM-DD
        const formattedDate = format(new Date(data.operationDate), 'yyyy-MM-dd');

        const operationWithTimestamp = {
            ...data,
            operationDate: formattedDate, // Store as YYYY-MM-DD string
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
