

'use server';

import { firestore } from '@/lib/firebase-admin';
import { revalidatePath } from 'next/cache';
import admin from 'firebase-admin';
import { getDaysInMonth, startOfMonth, addDays, format, isBefore, isEqual, parseISO } from 'date-fns';

export interface ManualClientOperationData {
    clientName: string;
    operationDate?: string; // ISO string like '2024-07-23T15:49:01.859Z'
    startDate?: string;
    endDate?: string;
    concept: string;
    specificTariffs?: { tariffId: string; quantity: number }[];
    quantity?: number; // Kept for simple manual concepts
    numeroPersonas?: number;
    numeroPosiciones?: number;
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

function getColombiaDateFromISO(isoString: string): Date {
    const d = parseISO(isoString.substring(0, 10)); // Use only the date part to avoid time components
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 5, 0, 0));
}


export async function addManualClientOperation(data: ManualClientOperationData): Promise<{ success: boolean; message: string }> {
    if (!firestore) {
        return { success: false, message: 'El servidor no está configurado correctamente.' };
    }

    try {
        const { details, operationDate, startDate, endDate, ...restOfData } = data;
        
        const operationDateToSave = admin.firestore.Timestamp.fromDate(getColombiaDateFromISO(operationDate!));
        
        const operationWithTimestamp = {
            ...restOfData,
            details: details || {},
            operationDate: operationDateToSave,
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
        
        const dateList: Date[] = [];
        let currentDate = parseISO(startDate);
        const finalDate = parseISO(endDate);

        while (currentDate <= finalDate) {
            dateList.push(currentDate);
            currentDate = addDays(currentDate, 1);
        }

        const batch = firestore.batch();
        let operationsCount = 0;

        for (const day of dateList) {
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
                    numeroPersonas: roles.reduce((sum, r) => sum + r.numPersonas, 0),
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
        const { details, operationDate, startDate, endDate, ...restOfData } = data;
        let finalSpecificTariffs: { tariffId: string; quantity: number }[] = [];

        if (data.concept === 'TIEMPO EXTRA FRIOAL (FIJO)') {
            const bulkRoles = (data as any).bulkRoles || [];
            finalSpecificTariffs = bulkRoles.flatMap((role: any) => {
                if (role.numPersonas > 0) {
                    return [
                        { tariffId: role.diurnaId, quantity: 4 * role.numPersonas },
                        { tariffId: role.nocturnaId, quantity: 1 * role.numPersonas },
                    ];
                }
                return [];
            }).filter(Boolean);
        } else {
            finalSpecificTariffs = data.specificTariffs || [];
        }

        const docRef = firestore.collection('manual_client_operations').doc(id);
        
        const operationDateToSave = admin.firestore.Timestamp.fromDate(getColombiaDateFromISO(operationDate!));
       
        const operationWithTimestamp = {
            ...restOfData,
            specificTariffs: finalSpecificTariffs,
            details: details || {},
            operationDate: operationDateToSave,
        };
        
        delete (operationWithTimestamp as any).bulkRoles;

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
