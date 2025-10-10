
'use server';

import { firestore } from '@/lib/firebase-admin';
import { revalidatePath } from 'next/cache';
import admin from 'firebase-admin';

export interface DailyEntryData {
    date: string;
    initialBalance: number;
    entries: number;
    exits: number;
    finalBalance: number;
}

export interface AssistantLiquidationData {
    clientName: string;
    dateRange: {
        from: string;
        to: string;
    };
    plate?: string;
    container?: string;
    dailyEntries: DailyEntryData[];
    createdBy: {
        uid: string;
        displayName: string;
    };
}

const STORAGE_CONCEPT_NAME = 'SERVICIO LOGÍSTICO CONGELADOS - PALETA/DÍA';
const ENTRY_CONCEPT_NAME = 'MOVIMIENTO ENTRADA PRODUCTO - PALETA';
const EXIT_CONCEPT_NAME = 'MOVIMIENTO SALIDA PRODUCTO - PALETA';

export async function saveAssistantLiquidation(data: AssistantLiquidationData): Promise<{ success: boolean; message: string; count: number }> {
    if (!firestore) {
        return { success: false, message: 'El servidor no está configurado correctamente.', count: 0 };
    }

    try {
        const batch = firestore.batch();
        let operationCount = 0;
        
        for (const day of data.dailyEntries) {
            const operationDate = admin.firestore.Timestamp.fromDate(new Date(day.date));

            // Create Entry operation if there are entries
            if (day.entries > 0) {
                const entryRef = firestore.collection('manual_client_operations').doc();
                batch.set(entryRef, {
                    clientName: data.clientName,
                    concept: ENTRY_CONCEPT_NAME,
                    operationDate,
                    quantity: day.entries,
                    details: {
                        plate: data.plate || '',
                        container: data.container || '',
                    },
                    createdAt: new Date().toISOString(),
                    createdBy: data.createdBy,
                });
                operationCount++;
            }

            // Create Exit operation if there are exits
            if (day.exits > 0) {
                const exitRef = firestore.collection('manual_client_operations').doc();
                batch.set(exitRef, {
                    clientName: data.clientName,
                    concept: EXIT_CONCEPT_NAME,
                    operationDate,
                    quantity: day.exits,
                    details: {
                        plate: data.plate || '',
                        container: data.container || '',
                    },
                    createdAt: new Date().toISOString(),
                    createdBy: data.createdBy,
                });
                operationCount++;
            }

            // Create Storage operation if there's a final balance
            if (day.finalBalance > 0) {
                const storageRef = firestore.collection('manual_client_operations').doc();
                batch.set(storageRef, {
                    clientName: data.clientName,
                    concept: STORAGE_CONCEPT_NAME,
                    operationDate,
                    quantity: day.finalBalance, // Use final balance as per user request
                    details: {
                        plate: data.plate || '',
                        container: data.container || '',
                    },
                    createdAt: new Date().toISOString(),
                    createdBy: data.createdBy,
                });
                operationCount++;
            }
        }
        
        if (operationCount > 0) {
            await batch.commit();
        }

        revalidatePath('/billing-reports');

        return { success: true, message: `Se crearon ${operationCount} registros de liquidación.`, count: operationCount };

    } catch (error) {
        console.error('Error al guardar la liquidación del asistente:', error);
        const errorMessage = error instanceof Error ? error.message : 'Ocurrió un error desconocido.';
        return { success: false, message: `Error del servidor: ${errorMessage}`, count: 0 };
    }
}
