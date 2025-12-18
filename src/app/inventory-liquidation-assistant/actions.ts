
'use server';

import { firestore } from '@/lib/firebase-admin';
import { revalidatePath } from 'next/cache';
import admin from 'firebase-admin';
import { startOfDay, endOfDay } from 'date-fns';

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
    plate?: string; // Nuevo campo
    pedidoSislog?: string; // Nuevo campo
    dailyEntries: DailyEntryData[];
    createdBy: {
        uid: string;
        displayName: string;
    };
}

const STORAGE_CONCEPT_NAME = 'SERVICIO DE CONGELACIÓN - PALLET/DÍA (-18ºC)';
const ENTRY_CONCEPT_NAME = 'MOVIMIENTO ENTRADA PRODUCTO - PALETA';
const EXIT_CONCEPT_NAME = 'MOVIMIENTO SALIDA PRODUCTO - PALETA';

export async function saveAssistantLiquidation(data: AssistantLiquidationData): Promise<{ success: boolean; message: string; count: number }> {
    if (!firestore) {
        return { success: false, message: 'El servidor no está configurado correctamente.', count: 0 };
    }

    try {
        const batch = firestore.batch();
        let operationCount = 0;
        
        const details = {
            plate: data.plate || '',
            pedidoSislog: data.pedidoSislog || '',
        };

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
                    details: details, // Guardar placa y pedido
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
                    details: details, // Guardar placa y pedido
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
                    details: details, // Guardar placa y pedido
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

export interface ReceptionWithoutContainer {
  id: string;
  fecha: string;
  pedidoSislog: string;
  placa: string;
  totalPaletas: number;
}

const calculateTotalPallets = (formType: string, formData: any): number => {
    const allItems = (formData.items || [])
        .concat((formData.destinos || []).flatMap((d: any) => d?.items || []))
        .concat((formData.placas || []).flatMap((p: any) => p?.items || []));

    if (formType.startsWith('fixed-weight-')) {
        return (formData.productos || []).reduce((sum: number, p: any) => sum + (Number(p.totalPaletas ?? p.paletas) || 0), 0);
    }
    
    if (formType.startsWith('variable-weight-')) {
        const isSummaryFormat = allItems.some((p: any) => p && Number(p.paleta) === 0);
        
        if (isSummaryFormat) {
            return allItems.reduce((sum: number, p: any) => sum + (Number(p.totalPaletas) || 0), 0);
        }
        
        const uniquePallets = new Set<number>();
        allItems.forEach((item: any) => {
            const paletaNum = Number(item.paleta);
            if (!isNaN(paletaNum) && paletaNum > 0) {
                uniquePallets.add(paletaNum);
            }
        });
        return uniquePallets.size;
    }

    return 0;
};


export async function findReceptionsWithoutContainer(
    clientName: string,
    startDate: string,
    endDate: string
): Promise<ReceptionWithoutContainer[]> {
    if (!firestore) {
        throw new Error('El servidor no está configurado correctamente.');
    }

    const queryStart = startOfDay(new Date(startDate));
    const queryEnd = endOfDay(new Date(endDate));

    const submissionsRef = firestore.collection('submissions');
    const querySnapshot = await submissionsRef
        .where('formData.fecha', '>=', queryStart)
        .where('formData.fecha', '<=', queryEnd)
        .get();
        
    const results: ReceptionWithoutContainer[] = [];
    
    querySnapshot.docs.forEach(doc => {
        const data = doc.data();
        const { formData, formType } = data;

        const docClientName = formData.cliente || formData.nombreCliente;
        const isReception = formType.includes('recepcion') || formType.includes('reception');
        const container = formData.contenedor?.trim().toUpperCase();
        const hasNoContainer = !container || container === 'N/A' || container === 'NO APLICA';
        const isGenericPedido = formData.tipoPedido === 'GENERICO';
        
        if (docClientName === clientName && isReception && hasNoContainer && isGenericPedido) {
            const totalPaletas = calculateTotalPallets(formType, formData);
            if (totalPaletas > 0) {
                results.push({
                    id: doc.id,
                    fecha: formData.fecha.toDate().toISOString(),
                    pedidoSislog: formData.pedidoSislog,
                    placa: formData.placa || 'Sin Placa',
                    totalPaletas: totalPaletas
                });
            }
        }
    });

    results.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

    return results;
}
