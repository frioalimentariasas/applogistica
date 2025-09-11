

'use server';

import { firestore } from '@/lib/firebase-admin';
import { revalidatePath } from 'next/cache';
import admin from 'firebase-admin';
import { eachDayOfInterval, parseISO } from 'date-fns';

export interface ManualClientOperationData {
    clientName: string;
    operationDate: string; // ISO string like '2024-07-23T15:49:01.859Z'
    concept: string;
    specificTariffs?: { tariffId: string; quantity: number }[];
    quantity?: number; // Kept for simple manual concepts
    numeroPersonas?: number;
    details?: {
        startTime?: string; // HH:mm
        endTime?: string; // HH:mm
        plate?: string;
        container?: string;
        totalPallets?: number;
        arin?: string;
    },
    createdAt?: string; // ISO string for timestamping
    createdBy?: {
        uid: string;
        displayName: string;
    }
}

// Helper to get a date object that correctly represents the local date in UTC.
// E.g., '2024-09-10T00:00:00.000Z' from the client (which is Sep 9, 7pm Colombia time)
// becomes a Date object representing Sep 10, 00:00 Colombia time.
function getColombiaDateFromISO(isoString: string): Date {
    const d = new Date(isoString);
    // The client sends the date as midnight in its local timezone, which gets converted to UTC.
    // We need to adjust it back to what the user intended in their local timezone.
    // A more robust way is to create a new date using UTC methods to avoid local timezone interference.
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 5, 0, 0)); // Set to midnight Colombia Time (UTC-5)
}

export async function addManualClientOperation(data: ManualClientOperationData): Promise<{ success: boolean; message: string }> {
    if (!firestore) {
        return { success: false, message: 'El servidor no está configurado correctamente.' };
    }

    try {
        const { details, ...restOfData } = data;
        
        const operationWithTimestamp = {
            ...restOfData,
            details: details || {}, // Ensure details is at least an empty object
            operationDate: admin.firestore.Timestamp.fromDate(getColombiaDateFromISO(data.operationDate)),
            createdAt: new Date().toISOString(),
        };

        await firestore.collection('manual_client_operations').add(operationWithTimestamp);

        revalidatePath('/billing-reports');
        revalidatePath('/operaciones-manuales-clientes');
        return { success: true, message: 'Operación manual de cliente agregada con éxito.' };

    } catch (error) {
        console.error('Error al agregar operación manual de cliente:', error);
        const errorMessage = error instanceof Error ? error.message : 'Ocurrió un error desconocido.';
        return { success: false, message: `Error del servidor: ${errorMessage}` };
    }
}

export interface BulkOperationData {
    clientName: string;
    concept: string;
    startDate: string; // ISO string
    endDate: string;   // ISO string
    roles: {
        diurnaId: string;
        nocturnaId: string;
        numPersonas: number;
    }[];
    createdBy: {
        uid: string;
        displayName: string;
    }
}

export async function addBulkManualClientOperation(data: BulkOperationData): Promise<{ success: boolean; message: string; count: number }> {
    if (!firestore) {
        return { success: false, message: 'El servidor no está configurado correctamente.', count: 0 };
    }

    try {
        const { startDate, endDate, clientName, concept, roles, createdBy } = data;
        
        const interval = eachDayOfInterval({ 
            start: getColombiaDateFromISO(startDate), 
            end: getColombiaDateFromISO(endDate) 
        });

        const batch = firestore.batch();
        let operationsCount = 0;

        for (const day of interval) {
            const specificTariffs = roles.flatMap(role => {
                if (role.numPersonas > 0) {
                    return [
                        { tariffId: role.diurnaId, quantity: 4 * role.numPersonas },
                        { tariffId: role.nocturnaId, quantity: 1 * role.numPersonas }
                    ];
                }
                return [];
            }).filter(Boolean);

            if (specificTariffs.length > 0) {
                const docRef = firestore.collection('manual_client_operations').doc();
                const operationData = {
                    clientName,
                    concept,
                    operationDate: admin.firestore.Timestamp.fromDate(day),
                    specificTariffs,
                    numeroPersonas: 1, // This is managed by the quantity of each tariff now
                    details: {
                        startTime: '17:00',
                        endTime: '22:00',
                    },
                    createdAt: new Date().toISOString(),
                    createdBy,
                };
                batch.set(docRef, operationData);
                operationsCount++;
            }
        }
        
        if (operationsCount > 0) {
            await batch.commit();
        }

        revalidatePath('/billing-reports');
        revalidatePath('/operaciones-manuales-clientes');
        
        return { success: true, message: `Se crearon ${operationsCount} operaciones manuales con éxito.`, count: operationsCount };

    } catch (error) {
        console.error('Error al agregar operaciones manuales en lote:', error);
        const errorMessage = error instanceof Error ? error.message : 'Ocurrió un error desconocido.';
        return { success: false, message: `Error del servidor: ${errorMessage}`, count: 0 };
    }
}


export async function updateManualClientOperation(id: string, data: Omit<ManualClientOperationData, 'createdAt' | 'createdBy'>): Promise<{ success: boolean; message: string }> {
    if (!firestore) {
        return { success: false, message: 'El servidor no está configurado correctamente.' };
    }

    try {
        const { details, ...restOfData } = data;
        const docRef = firestore.collection('manual_client_operations').doc(id);
        const operationWithTimestamp = {
            ...restOfData,
            details: details || {}, // Ensure details is at least an empty object
            operationDate: admin.firestore.Timestamp.fromDate(getColombiaDateFromISO(data.operationDate)),
        };
        await docRef.update(operationWithTimestamp);
        
        revalidatePath('/billing-reports');
        revalidatePath('/operaciones-manuales-clientes');
        return { success: true, message: 'Operación manual de cliente actualizada con éxito.' };
    } catch (error) {
        console.error(`Error al actualizar operación manual de cliente ${id}:`, error);
        const errorMessage = error instanceof Error ? error.message : 'Ocurrió un error desconocido.';
        return { success: false, message: `Error del servidor: ${errorMessage}` };
    }
}


export async function deleteManualClientOperation(id: string): Promise<{ success: boolean; message: string }> {
    if (!firestore) {
        return { success: false, message: 'El servidor no está configurado correctamente.' };
    }

    try {
        await firestore.collection('manual_client_operations').doc(id).delete();
        revalidatePath('/billing-reports');
        revalidatePath('/operaciones-manuales-clientes');
        return { success: true, message: 'Operación manual de cliente eliminada con éxito.' };
    } catch (error) {
        console.error(`Error al eliminar operación manual de cliente ${id}:`, error);
        const errorMessage = error instanceof Error ? error.message : 'Ocurrió un error desconocido.';
        return { success: false, message: `Error del servidor: ${errorMessage}` };
    }
}
