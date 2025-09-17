

'use server';

import { firestore } from '@/lib/firebase-admin';
import { revalidatePath } from 'next/cache';
import admin from 'firebase-admin';
import { getDaysInMonth, startOfDay, addDays, format, isBefore, isEqual, parseISO, getDay, eachDayOfInterval, isSunday } from 'date-fns';
import { getClientBillingConcepts, type ClientBillingConcept } from '@/app/gestion-conceptos-liquidacion-clientes/actions';

export interface ExcedentEntry {
    date: string; // YYYY-MM-DD
    hours: number;
}

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
    },
    // New fields for bulk operations
    bulkRoles?: any[],
    excedentes?: ExcedentEntry[];
}


export async function addManualClientOperation(data: ManualClientOperationData): Promise<{ success: boolean; message: string }> {
    if (!firestore) {
        return { success: false, message: 'El servidor no está configurado correctamente.' };
    }

    try {
        const { details, operationDate, startDate, endDate, ...restOfData } = data;
        
        const operationDateToSave = admin.firestore.Timestamp.fromDate(new Date(operationDate!));
        
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
        roleName: string;
        diurnaId: string;
        nocturnaId: string;
        numPersonas: number;
    }[];
    excedentes: ExcedentEntry[];
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
        const { startDate, endDate, clientName, concept, roles, excedentes, createdBy } = data;
        
        const allConcepts = await getClientBillingConcepts();
        const conceptConfig = allConcepts.find(c => c.conceptName === concept);
        if (!conceptConfig || !conceptConfig.fixedTimeConfig) {
            throw new Error(`La configuración para el concepto "${concept}" no fue encontrada.`);
        }

        const { weekdayStartTime, weekdayEndTime, saturdayStartTime, saturdayEndTime, dayShiftEndTime } = conceptConfig.fixedTimeConfig;

        if (!weekdayStartTime || !weekdayEndTime || !saturdayStartTime || !saturdayEndTime || !dayShiftEndTime) {
            throw new Error(`La configuración de horarios para "${concept}" está incompleta.`);
        }

        const timeToMinutes = (time: string): number => {
            const [hours, minutes] = time.split(':').map(Number);
            return hours * 60 + minutes;
        };

        const dayShiftEndMinutes = timeToMinutes(dayShiftEndTime);
        const excedentesMap = new Map(excedentes.map(e => [e.date, e.hours]));

        const start = new Date(startDate.split('T')[0] + 'T05:00:00.000Z');
        const end = new Date(endDate.split('T')[0] + 'T05:00:00.000Z');

        const dateList = eachDayOfInterval({ start, end });

        const batch = firestore.batch();
        let operationsCount = 0;

        for (const day of dateList) {
            const dayOfWeek = getDay(day); // Sunday = 0, Saturday = 6
            if (isSunday(day)) continue; // Skip Sundays

            const isSaturday = dayOfWeek === 6;
            const baseStartTimeStr = isSaturday ? saturdayStartTime : weekdayStartTime;
            const baseEndTimeStr = isSaturday ? saturdayEndTime : weekdayEndTime;
            
            const dayString = format(day, 'yyyy-MM-dd');
            const excedentHours = excedentesMap.get(dayString) || 0;

            const specificTariffs = roles.flatMap(role => {
                if (role.numPersonas > 0) {
                    const startMinutes = timeToMinutes(baseStartTimeStr);
                    const endMinutes = timeToMinutes(baseEndTimeStr);
                    const totalBaseMinutes = endMinutes - startMinutes;
                    
                    const baseDiurnoMinutes = Math.max(0, Math.min(endMinutes, dayShiftEndMinutes) - startMinutes);
                    const baseNocturnoMinutes = Math.max(0, totalBaseMinutes - baseDiurnoMinutes);
                    
                    const baseDiurnoHours = baseDiurnoMinutes / 60;
                    const baseNocturnoHours = baseNocturnoMinutes / 60;

                    const finalDiurnoHours = baseDiurnoHours + (isSaturday ? excedentHours : 0);
                    const finalNocturnoHours = baseNocturnoHours + (!isSaturday ? excedentHours : 0);
                    
                    const tariffs = [];
                    if (finalDiurnoHours > 0) tariffs.push({ tariffId: role.diurnaId, quantity: finalDiurnoHours });
                    if (finalNocturnoHours > 0) tariffs.push({ tariffId: role.nocturnaId, quantity: finalNocturnoHours });
                    
                    return tariffs;
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
                    bulkRoles: roles.filter(r => r.numPersonas > 0),
                    details: { startTime: baseStartTimeStr, endTime: baseEndTimeStr },
                    createdAt: new Date().toISOString(),
                    createdBy,
                    excedentes: excedentesMap.has(dayString) ? [{ date: dayString, hours: excedentHours }] : [],
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
             const allConcepts = await getClientBillingConcepts();
            const conceptConfig = allConcepts.find(c => c.conceptName === data.concept);
            if (!conceptConfig || !conceptConfig.fixedTimeConfig) throw new Error("Config not found");
            const { weekdayStartTime, weekdayEndTime, saturdayStartTime, saturdayEndTime, dayShiftEndTime } = conceptConfig.fixedTimeConfig;
            const timeToMinutes = (time: string): number => { const [hours, minutes] = time.split(':').map(Number); return hours * 60 + minutes; };
            const dayShiftEndMinutes = timeToMinutes(dayShiftEndTime!);

            const day = new Date(data.operationDate!);
            const isSaturday = getDay(day) === 6;
            const baseStartTimeStr = isSaturday ? saturdayStartTime! : weekdayStartTime!;
            const baseEndTimeStr = isSaturday ? saturdayEndTime! : weekdayEndTime!;
            const dayString = format(day, 'yyyy-MM-dd');
            const excedentHours = data.excedentes?.find(e => e.date === dayString)?.hours || 0;

            finalSpecificTariffs = (data.bulkRoles || []).flatMap(role => {
                if (role.numPersonas > 0) {
                    const startMinutes = timeToMinutes(baseStartTimeStr);
                    const endMinutes = timeToMinutes(baseEndTimeStr);
                    const totalBaseMinutes = endMinutes - startMinutes;
                    const baseDiurnoMinutes = Math.max(0, Math.min(endMinutes, dayShiftEndMinutes) - startMinutes);
                    const baseNocturnoMinutes = Math.max(0, totalBaseMinutes - baseDiurnoMinutes);
                    const baseDiurnoHours = baseDiurnoMinutes / 60;
                    const baseNocturnoHours = baseNocturnoMinutes / 60;
                    const finalDiurnoHours = baseDiurnoHours + (isSaturday ? excedentHours : 0);
                    const finalNocturnoHours = baseNocturnoHours + (!isSaturday ? excedentHours : 0);
                    
                    const tariffs = [];
                    if (finalDiurnoHours > 0) tariffs.push({ tariffId: role.diurnaId, quantity: finalDiurnoHours });
                    if (finalNocturnoHours > 0) tariffs.push({ tariffId: role.nocturnaId, quantity: finalNocturnoHours });
                    return tariffs;
                }
                return [];
            }).filter(Boolean);
        } else if (data.concept === 'POSICIONES FIJAS CÁMARA CONGELADOS') {
            finalSpecificTariffs = (data.specificTariffs || []).map(tariff => {
                let quantity = tariff.quantity;
                if (tariff.tariffId.includes('600')) quantity = 600;
                if (tariff.tariffId.includes('200')) quantity = 200;
                return { ...tariff, quantity };
            });
        } else {
            finalSpecificTariffs = data.specificTariffs || [];
        }

        const docRef = firestore.collection('manual_client_operations').doc(id);
        
        const operationDateToSave = admin.firestore.Timestamp.fromDate(new Date(operationDate!));
       
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
