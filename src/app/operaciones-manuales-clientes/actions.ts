'use server';

import { firestore } from '@/lib/firebase-admin';
import { revalidatePath } from 'next/cache';
import admin from 'firebase-admin';
import { getDaysInMonth, startOfDay, addDays, format, isBefore, isEqual, parseISO, getDay, isSaturday, isSunday, eachDayOfInterval, differenceInMinutes, parse } from 'date-fns';
import { getClientBillingConcepts, type ClientBillingConcept } from '@/app/gestion-conceptos-liquidacion-clientes/actions';
import * as ExcelJS from 'exceljs';

// --- INICIO DE LA NUEVA FUNCIÓN (NO EXPORTADA) ---
/**
 * Calculates extra hours for an inspection based on specific business rules.
 * @returns An object with the calculated hours and the start/end times of the extra period.
 */
function calculateExtraHoursForInspeccion(operationDate: Date, startTime: string, endTime: string): { hours: number; extraStartTime: string; extraEndTime: string } {
    if (!operationDate || !startTime || !endTime) {
        return { hours: 0, extraStartTime: '', extraEndTime: '' };
    }

    const start = parse(startTime, 'HH:mm', operationDate);
    let end = parse(endTime, 'HH:mm', operationDate);

    if (end < start) {
        end = addDays(end, 1);
    }
    
    const dayOfWeek = getDay(operationDate); // 0=Sunday, 6=Saturday

    let extraTimeRuleStart: Date;

    if (isSunday(operationDate)) {
        extraTimeRuleStart = start;
    } else if (isSaturday(operationDate)) {
        extraTimeRuleStart = new Date(operationDate);
        extraTimeRuleStart.setHours(12, 0, 0, 0);
    } else {
        extraTimeRuleStart = new Date(operationDate);
        extraTimeRuleStart.setHours(18, 0, 0, 0);
    }

    const overlapStart = new Date(Math.max(start.getTime(), extraTimeRuleStart.getTime()));
    const overlapEnd = end;

    if (overlapEnd.getTime() <= overlapStart.getTime()) {
        return { hours: 0, extraStartTime: '', extraEndTime: '' };
    }

    const extraMinutes = (overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60);

    const integerHours = Math.floor(extraMinutes / 60);
    const remainingMinutes = extraMinutes % 60;
    
    let roundedHours = integerHours;
    if (remainingMinutes > 9) {
        roundedHours = integerHours + 1;
    }
    
    return {
        hours: roundedHours,
        extraStartTime: format(overlapStart, 'HH:mm'),
        extraEndTime: format(overlapEnd, 'HH:mm'),
    };
}
// --- FIN DE LA NUEVA FUNCIÓN ---



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
    specificTariffs?: { tariffId: string; quantity: number, role?: string, numPersonas?: number }[];
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
        fechaArribo?: string; // ISO string
        horaArribo?: string; // HH:mm
        fechaSalida?: string; // ISO string
        horaSalida?: string; // HH:mm
        opLogistica?: 'CARGUE' | 'DESCARGUE';
        fmmNumber?: string;
        pedidoSislog?: string;
        noDocumento?: string;
    },
    comentarios?: string;
    createdAt?: string; // ISO string for timestamping
    createdBy?: {
        uid: string;
        displayName: string;
    },
    // New fields for bulk operations
    bulkRoles?: any[],
    excedentes?: ExcedentEntry[];
    selectedDates?: string[]; // For multi-date selection
}

async function isFmmNumberDuplicate(fmmNumber: string, concept: string, currentOperationId?: string): Promise<boolean> {
    if (!firestore) throw new Error("Firestore no está inicializado.");
    if (!fmmNumber) return false;

    // Define los conceptos que requieren validación de FMM único
    const fmmConcepts = [
        'FMM DE INGRESO ZFPC (MANUAL)', 
        'FMM DE SALIDA ZFPC (MANUAL)',
        'FMM DE INGRESO ZFPC (NACIONALIZADO)',
        'FMM DE SALIDA ZFPC (NACIONALIZADO)'
    ];

    // Si el concepto actual no es uno de los que se deben validar, no es un duplicado.
    if (!fmmConcepts.includes(concept)) {
        return false;
    }

    const trimmedFmm = fmmNumber.trim();
    if (!trimmedFmm) return false;

    // Añade el filtro por concepto a la consulta
    let query: admin.firestore.Query = firestore.collection('manual_client_operations')
        .where('details.fmmNumber', '==', trimmedFmm)
        .where('concept', 'in', fmmConcepts);
    
    const querySnapshot = await query.get();

    if (querySnapshot.empty) {
        return false; // Not a duplicate
    }
    
    // Si estamos editando, asegúrate que el duplicado encontrado no sea el mismo documento
    if (currentOperationId) {
        return querySnapshot.docs.some(doc => doc.id !== currentOperationId);
    }
    
    // Si estamos agregando, cualquier resultado es un duplicado
    return true;
}

async function isArinNumberDuplicate(arinNumber: string, concept: string, currentOperationId?: string): Promise<boolean> {
    if (!firestore) throw new Error("Firestore no está inicializado.");
    if (!arinNumber) return false;

    const arinConcepts = [
        'ARIN DE INGRESO ZFPC (MANUAL)',
        'ARIN DE SALIDA ZFPC (MANUAL)',
        'ARIN DE INGRESO ZFPC (NACIONALIZADO)',
        'ARIN DE SALIDA ZFPC (NACIONALIZADO)',
    ];

    if (!arinConcepts.includes(concept)) {
        return false;
    }

    const trimmedArin = arinNumber.trim();
    if (!trimmedArin) return false;

    let query: admin.firestore.Query = firestore.collection('manual_client_operations')
        .where('details.arin', '==', trimmedArin)
        .where('concept', 'in', arinConcepts);
    
    const querySnapshot = await query.get();

    if (querySnapshot.empty) {
        return false;
    }
    
    if (currentOperationId) {
        return querySnapshot.docs.some(doc => doc.id !== currentOperationId);
    }
    
    return true;
}



export async function addManualClientOperation(data: ManualClientOperationData): Promise<{ success: boolean; message: string, extraHoursData?: any }> {
    if (!firestore) {
        return { success: false, message: 'El servidor no está configurado correctamente.' };
    }

    try {
        const { details, operationDate, startDate, endDate, numeroPersonas, ...restOfData } = data;
        
        if (details?.fmmNumber) {
            const isDuplicate = await isFmmNumberDuplicate(details.fmmNumber, data.concept);
            if (isDuplicate) {
                return { success: false, message: `El # FMM "${details.fmmNumber}" ya fue registrado en un concepto FMM.` };
            }
        }
        
        if (details?.arin) {
            const isDuplicate = await isArinNumberDuplicate(details.arin, data.concept);
            if (isDuplicate) {
                return { success: false, message: `El # ARIN "${details.arin}" ya fue registrado en un concepto ARIN o de Inspección.` };
            }
        }
        
        const operationDateToSave = admin.firestore.Timestamp.fromDate(new Date(operationDate!));
        
        const operationWithTimestamp: any = {
            ...restOfData,
            details: details || {},
            operationDate: operationDateToSave,
            createdAt: new Date().toISOString(),
        };

        const conceptsWithNumeroPersonas = ['INSPECCIÓN ZFPC', 'TOMA DE PESOS POR ETIQUETA HRS', 'SERVICIO APOYO JORNAL'];
        if (conceptsWithNumeroPersonas.includes(data.concept) && numeroPersonas !== undefined) {
            operationWithTimestamp.numeroPersonas = numeroPersonas;
        }

        await firestore.collection('manual_client_operations').add(operationWithTimestamp);

        revalidatePath('/billing-reports');
        revalidatePath('/operaciones-manuales-clientes');

       // Bloque de código NUEVO
        let extraHoursData;
        if (data.concept === 'INSPECCIÓN ZFPC' && data.operationDate && data.details?.startTime && data.details?.endTime) {
            const { hours, extraStartTime, extraEndTime } = calculateExtraHoursForInspeccion(new Date(data.operationDate), data.details.startTime, data.details.endTime);
            if (hours > 0) {
                extraHoursData = {
                    date: format(new Date(data.operationDate), 'yyyy-MM-dd'),
                    container: data.details.container || 'N/A',
                    arin: data.details.arin || 'N/A',
                    hours: hours,
                    startTime: extraStartTime,
                    endTime: extraEndTime
                };
            }
        }

        return { success: true, message: 'Operación manual de cliente agregada con éxito.', extraHoursData };


    } catch (error) {
        console.error('Error al agregar operación manual de cliente:', error);
        const errorMessage = error instanceof Error ? error.message : 'Ocurrió un error desconocido.';
        return { success: false, message: `Error del servidor: ${errorMessage}` };
    }
}

export interface BulkOperationData {
    clientName: string;
    concept: string;
    dates: string[]; // Array of ISO date strings
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
        const { dates, clientName, concept, roles, excedentes, createdBy } = data;
        
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

        const batch = firestore.batch();
        let operationsCount = 0;

        for (const dateString of dates) {
            const localDate = new Date(dateString + 'T05:00:00.000Z');
            const dayOfWeek = getDay(localDate);

            if (isSunday(localDate)) continue;

            const isSaturday = dayOfWeek === 6;
            const baseStartTimeStr = isSaturday ? saturdayStartTime : weekdayStartTime;
            const baseEndTimeStr = isSaturday ? saturdayEndTime : weekdayEndTime;
            
            const dayStringForMap = format(localDate, 'yyyy-MM-dd');
            const excedentHours = excedentesMap.get(dayStringForMap) || 0;
            
            const specificTariffsForDay = roles.flatMap(role => {
                if (role.numPersonas > 0) {
                    const startMinutes = timeToMinutes(baseStartTimeStr);
                    const endMinutes = timeToMinutes(baseEndTimeStr);
                    
                    const excedentMinutes = excedentHours * 60;
                    const finalEndMinutes = endMinutes + excedentMinutes;

                    const nocturnoStartPoint = dayShiftEndMinutes;

                    const totalDiurnoMinutes = Math.max(0, Math.min(finalEndMinutes, dayShiftEndMinutes) - startMinutes);
                    const totalNocturnoMinutes = Math.max(0, finalEndMinutes - nocturnoStartPoint);
                    
                    const tariffs = [];
                    if (totalDiurnoMinutes > 0) {
                        tariffs.push({ tariffId: role.diurnaId, quantity: totalDiurnoMinutes / 60, role: role.roleName, numPersonas: role.numPersonas });
                    }
                    if (totalNocturnoMinutes > 0) {
                         tariffs.push({ tariffId: role.nocturnaId, quantity: totalNocturnoMinutes / 60, role: role.roleName, numPersonas: role.numPersonas });
                    }
                    
                    return tariffs;
                }
                return [];
            }).filter((t): t is { tariffId: string; quantity: number; role: string; numPersonas: number; } => t !== undefined);

            if (specificTariffsForDay.length > 0) {
                const docRef = firestore.collection('manual_client_operations').doc();
                const operationData = {
                    clientName,
                    concept,
                    operationDate: admin.firestore.Timestamp.fromDate(localDate),
                    specificTariffs: specificTariffsForDay,
                    bulkRoles: roles.filter(r => r.numPersonas > 0),
                    details: { startTime: baseStartTimeStr, endTime: baseEndTimeStr },
                    createdAt: new Date().toISOString(),
                    createdBy,
                    excedentes: excedentesMap.has(dayStringForMap) ? [{ date: dayStringForMap, hours: excedentHours }] : [],
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

export interface SimpleBulkOperationData {
    clientName: string;
    concept: string;
    dates: string[]; // Array of ISO date strings
    quantity: number;
    numeroPersonas?: number;
    details?: any;
    comentarios?: string;
    createdBy: {
        uid: string;
        displayName: string;
    }
}

export async function addBulkSimpleOperation(data: SimpleBulkOperationData): Promise<{ success: boolean; message: string; count: number }> {
    if (!firestore) {
        return { success: false, message: 'El servidor no está configurado correctamente.', count: 0 };
    }

    try {
        const { dates, ...restOfData } = data;
        const batch = firestore.batch();
        let operationsCount = 0;
        
        for (const dateString of dates) {
            const localDate = new Date(dateString + 'T05:00:00.000Z');
            const docRef = firestore.collection('manual_client_operations').doc();
            
            const operationData: any = {
                ...restOfData,
                operationDate: admin.firestore.Timestamp.fromDate(localDate),
                createdAt: new Date().toISOString(),
                // Verificamos si numeroPersonas existe en los datos recibidos antes de añadirlo
                ...(data.numeroPersonas !== undefined && { numeroPersonas: data.numeroPersonas }),
            };
            
            batch.set(docRef, operationData);
            operationsCount++;
        }

        if (operationsCount > 0) {
            await batch.commit();
        }

        revalidatePath('/billing-reports');
        revalidatePath('/operaciones-manuales-clientes');
        
        return { success: true, message: `Se crearon ${operationsCount} registros con éxito.`, count: operationsCount };

    } catch (error) {
        console.error('Error al agregar operaciones en lote:', error);
        const errorMessage = error instanceof Error ? error.message : 'Ocurrió un error desconocido.';
        return { success: false, message: `Error del servidor: ${errorMessage}`, count: 0 };
    }
}

export interface DailyLocationOperationData {
  clientName: string;
  concept: string;
  dailyData: {
    date: string; // YYYY-MM-DD
    quantity: number;
  }[];
  createdBy: {
    uid: string;
    displayName: string;
  };
}

export async function addDailyLocationOperation(data: DailyLocationOperationData): Promise<{ success: boolean; message: string; count: number }> {
    if (!firestore) {
        return { success: false, message: 'El servidor no está configurado correctamente.', count: 0 };
    }
    
    try {
        const { clientName, concept, dailyData, createdBy } = data;
        const batch = firestore.batch();
        let operationsCount = 0;

        for (const day of dailyData) {
            if (day.quantity > 0) {
                const docRef = firestore.collection('manual_client_operations').doc();
                // Ensure date is treated as UTC to avoid timezone shifts
                const operationDate = new Date(day.date + 'T05:00:00.000Z');
                
                batch.set(docRef, {
                    clientName,
                    concept,
                    operationDate: admin.firestore.Timestamp.fromDate(operationDate),
                    quantity: day.quantity,
                    createdAt: new Date().toISOString(),
                    createdBy,
                });
                operationsCount++;
            }
        }
        
        if (operationsCount > 0) {
            await batch.commit();
        }

        revalidatePath('/billing-reports');
        revalidatePath('/operaciones-manuales-clientes');
        
        return { success: true, message: `Se crearon ${operationsCount} registros con éxito.`, count: operationsCount };
    } catch (error) {
        console.error('Error al agregar operaciones de ubicación diaria:', error);
        const errorMessage = error instanceof Error ? error.message : 'Ocurrió un error desconocido.';
        return { success: false, message: `Error del servidor: ${errorMessage}`, count: 0 };
    }
}


export async function updateManualClientOperation(id: string, data: Omit<ManualClientOperationData, 'createdAt' | 'createdBy'>): Promise<{ success: boolean; message: string; extraHoursData?: any }> {
    if (!firestore) {
        return { success: false, message: 'El servidor no está configurado correctamente.' };
    }

    try {
        const { details, operationDate, startDate, endDate, createdBy, ...restOfData } = data;
        let finalSpecificTariffs: { tariffId: string; quantity: number, role?: string, numPersonas?: number }[] = [];
        
        if (details?.fmmNumber) {
            const isDuplicate = await isFmmNumberDuplicate(details.fmmNumber, data.concept, id);
            if (isDuplicate) {
                return { success: false, message: `El # FMM "${details.fmmNumber}" ya existe en otro registro.` };
            }
        }

        if (details?.arin) {
            const isDuplicate = await isArinNumberDuplicate(details.arin, data.concept, id);
            if (isDuplicate) {
                return { success: false, message: `El # ARIN "${details.arin}" ya existe en otro registro.` };
            }
        }

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
                    const excedentMinutes = excedentHours * 60;
                    const finalEndMinutes = endMinutes + excedentMinutes;

                    const nocturnoStartPoint = dayShiftEndMinutes;
                    const totalDiurnoMinutes = Math.max(0, Math.min(finalEndMinutes, dayShiftEndMinutes) - startMinutes);
                    const totalNocturnoMinutes = Math.max(0, finalEndMinutes - nocturnoStartPoint);
                    
                    const tariffs = [];
                    if (totalDiurnoMinutes > 0) {
                        tariffs.push({ tariffId: role.diurnaId, quantity: totalDiurnoMinutes / 60, role: role.roleName, numPersonas: role.numPersonas });
                    }
                    if (totalNocturnoMinutes > 0) {
                         tariffs.push({ tariffId: role.nocturnaId, quantity: totalNocturnoMinutes / 60, role: role.roleName, numPersonas: role.numPersonas });
                    }
                    
                    return tariffs;
                }
                return [];
            }).filter((t): t is { tariffId: string; quantity: number; role: string; numPersonas: number; } => t !== undefined);
        
        } else if (data.concept === 'TIEMPO EXTRA FRIOAL') {
             const allConcepts = await getClientBillingConcepts();
            const conceptConfig = allConcepts.find(c => c.conceptName === data.concept);
            if (!conceptConfig || !conceptConfig.fixedTimeConfig) throw new Error("Config for TIEMPO EXTRA FRIOAL not found");
            const { dayShiftEndTime } = conceptConfig.fixedTimeConfig;
            if (!dayShiftEndTime || !data.details?.startTime || !data.details?.endTime) throw new Error("Missing times for TIEMPO EXTRA FRIOAL calculation");

            const timeToMinutes = (time: string): number => { const [hours, minutes] = time.split(':').map(Number); return hours * 60 + minutes; };
            const dayShiftEndMinutes = timeToMinutes(dayShiftEndTime);
            
            const startMinutes = timeToMinutes(data.details.startTime);
            let endMinutes = timeToMinutes(data.details.endTime);
            if (endMinutes <= startMinutes) {
                endMinutes += 24 * 60; // Add 24 hours in minutes if it's an overnight shift
            }

            const nocturnoStartPoint = dayShiftEndMinutes;

            const totalDiurnoMinutes = Math.max(0, Math.min(endMinutes, dayShiftEndMinutes) - startMinutes);
            const totalNocturnoMinutes = Math.max(0, endMinutes - nocturnoStartPoint);

            const roles = data.bulkRoles || [];

            finalSpecificTariffs = roles.flatMap(role => {
                 const diurnaTariff = conceptConfig.specificTariffs?.find(t => t.name.includes(role.roleName) && t.name.includes("DIURNA"));
                const nocturnaTariff = conceptConfig.specificTariffs?.find(t => t.name.includes(role.roleName) && t.name.includes("NOCTURNA"));

                const tariffs = [];
                 if (totalDiurnoMinutes > 0 && diurnaTariff) {
                    tariffs.push({ tariffId: diurnaTariff.id, quantity: totalDiurnoMinutes / 60, role: role.roleName, numPersonas: role.numPersonas });
                }
                if (totalNocturnoMinutes > 0 && nocturnaTariff) {
                    tariffs.push({ tariffId: nocturnaTariff.id, quantity: totalNocturnoMinutes / 60, role: role.roleName, numPersonas: role.numPersonas });
                }
                return tariffs;
            });


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
        
        if (data.concept !== 'TIEMPO EXTRA FRIOAL (FIJO)' && data.concept !== 'TIEMPO EXTRA FRIOAL') {
             delete (operationWithTimestamp as any).bulkRoles;
        }

        await docRef.update(operationWithTimestamp);
        
        revalidatePath('/billing-reports');
        revalidatePath('/operaciones-manuales-clientes');
        
        let extraHoursData;
        if (data.concept === 'INSPECCIÓN ZFPC' && data.operationDate && data.details?.startTime && data.details?.endTime) {
            const { hours, extraStartTime, extraEndTime } = calculateExtraHoursForInspeccion(new Date(data.operationDate), data.details.startTime, data.details.endTime);
            if (hours > 0) {
                extraHoursData = {
                    date: format(new Date(data.operationDate), 'yyyy-MM-dd'),
                    container: data.details.container || 'N/A',
                    arin: data.details.arin || 'N/A',
                    hours: hours,
                    startTime: extraStartTime,
                    endTime: extraEndTime
                };
            }
        }
        
        return { success: true, message: 'Operación manual de cliente actualizada con éxito.', extraHoursData };
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


export async function deleteMultipleManualClientOperations(ids: string[]): Promise<{ success: boolean; message: string }> {
    if (!firestore) {
        return { success: false, message: 'El servidor no está configurado correctamente.' };
    }
    if (!ids || ids.length === 0) {
        return { success: false, message: 'No se seleccionaron operaciones para eliminar.' };
    }

    try {
        const batch = firestore.batch();
        ids.forEach(id => {
            const docRef = firestore.collection('manual_client_operations').doc(id);
            batch.delete(docRef);
        });
        await batch.commit();
        
        revalidatePath('/billing-reports');
        revalidatePath('/operaciones-manuales-clientes');
        return { success: true, message: `${ids.length} operación(es) eliminada(s) con éxito.` };
    } catch (error) {
        console.error('Error al eliminar operaciones en lote:', error);
        const errorMessage = error instanceof Error ? error.message : 'Ocurrió un error desconocido.';
        return { success: false, message: `Error del servidor: ${errorMessage}` };
    }
}


interface FmmRow {
  Fecha: Date | string | number;
  Cliente: string;
  Concepto: 'FMM DE INGRESO ZFPC (MANUAL)' | 'FMM DE SALIDA ZFPC (MANUAL)';
  Cantidad: number;
  Contenedor: string;
  'Op. Logística': 'CARGUE' | 'DESCARGUE';
  '# FMM': string;
  Placa: string;
}

export async function uploadFmmOperations(
  formData: FormData
): Promise<{ success: boolean; message: string; createdCount: number, duplicateCount: number, errorCount: number, errors: string[] }> {
    if (!firestore) {
        return { success: false, message: 'El servidor no está configurado.', createdCount: 0, duplicateCount: 0, errorCount: 0, errors: [] };
    }

    const file = formData.get('file') as File;
    if (!file) {
        return { success: false, message: 'No se encontró el archivo.', createdCount: 0, duplicateCount: 0, errorCount: 0, errors: [] };
    }

    let rows: Partial<FmmRow>[] = [];

    try {
        const buffer = await file.arrayBuffer();
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);
        const worksheet = workbook.worksheets[0];

        const headers = (worksheet.getRow(1).values as string[]).map(h => h ? String(h).trim() : '');
        
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber > 1) {
                const rowData: any = {};
                row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                    const header = headers[colNumber];
                    if (header) rowData[header] = cell.value;
                });
                rows.push(rowData);
            }
        });

        if (rows.length === 0) throw new Error("El archivo está vacío.");
        
        let createdCount = 0;
        let duplicateCount = 0;
        let errorCount = 0;
        const errors: string[] = [];

        const fmmNumbersFromFile = rows.map(r => String(r['# FMM'] || '').trim()).filter(Boolean);
        const existingFmms = new Set<string>();
        if (fmmNumbersFromFile.length > 0) {
            const fmmChunks = [];
            for (let i = 0; i < fmmNumbersFromFile.length; i += 30) {
                fmmChunks.push(fmmNumbersFromFile.slice(i, i + 30));
            }
            const fmmConcepts = [
                'FMM DE INGRESO ZFPC (MANUAL)', 
                'FMM DE SALIDA ZFPC (MANUAL)',
                'FMM DE INGRESO ZFPC (NACIONALIZADO)',
                'FMM DE SALIDA ZFPC (NACIONALIZADO)'
            ];
            for (const chunk of fmmChunks) {
                const querySnapshot = await firestore.collection('manual_client_operations')
                    .where('details.fmmNumber', 'in', chunk)
                    .where('concept', 'in', fmmConcepts)
                    .get();
                querySnapshot.forEach(doc => {
                    existingFmms.add(String(doc.data().details.fmmNumber));
                });
            }
        }
        const createdBy = {
            uid: formData.get('userId') as string,
            displayName: formData.get('userDisplayName') as string,
        };

        const batch = firestore.batch();

        for (const [index, row] of rows.entries()) {
            const rowIndex = index + 2; // For user-friendly error messages (1-based index + header)
            const fmmNumber = String(row['# FMM'] || '').trim();
            const concepto = String(row.Concepto || '').trim().toUpperCase();
            const opLogistica = String(row['Op. Logística'] || '').trim().toUpperCase() as 'CARGUE' | 'DESCARGUE';

            // Validation Checks
            if (!row.Fecha) { errors.push(`Fila ${rowIndex}: Falta la fecha.`); errorCount++; continue; }
            if (!row.Cliente) { errors.push(`Fila ${rowIndex}: Falta el cliente.`); errorCount++; continue; }
            if (!concepto || !['FMM DE INGRESO ZFPC (MANUAL)', 'FMM DE SALIDA ZFPC (MANUAL)', 'FMM DE INGRESO ZFPC (NACIONALIZADO)', 'FMM DE SALIDA ZFPC (NACIONALIZADO)'].includes(concepto)) { errors.push(`Fila ${rowIndex}: Concepto inválido. Debe ser un concepto de tipo FMM.`); errorCount++; continue; }
            if (row.Cantidad === undefined || row.Cantidad === null || isNaN(Number(row.Cantidad))) { errors.push(`Fila ${rowIndex}: Cantidad inválida.`); errorCount++; continue; }
            if (!opLogistica || !['CARGUE', 'DESCARGUE'].includes(opLogistica)) { errors.push(`Fila ${rowIndex}: 'Op. Logística' inválida. Debe ser 'CARGUE' o 'DESCARGUE'.`); errorCount++; continue; }
            if (!fmmNumber) { errors.push(`Fila ${rowIndex}: Falta el # FMM.`); errorCount++; continue; }

            if (existingFmms.has(fmmNumber)) {
                duplicateCount++;
                continue;
            }

            let operationDate: Date;
            if (row.Fecha instanceof Date) {
                operationDate = row.Fecha;
            } else if (typeof row.Fecha === 'number') {
                const excelDate = new Date(Math.round((row.Fecha - 25569) * 86400 * 1000));
                excelDate.setMinutes(excelDate.getMinutes() + excelDate.getTimezoneOffset());
                operationDate = excelDate;
            } else if (typeof row.Fecha === 'string') {
                operationDate = parse(row.Fecha, 'dd-MM-yyyy', new Date());
                 if (isNaN(operationDate.getTime())) {
                    operationDate = parse(row.Fecha, 'd/M/yyyy', new Date());
                }
            } else {
                errors.push(`Fila ${rowIndex}: Formato de fecha no reconocido.`);
                errorCount++;
                continue;
            }

            operationDate.setUTCHours(operationDate.getUTCHours() + 5);

            const docRef = firestore.collection('manual_client_operations').doc();
            batch.set(docRef, {
                clientName: row.Cliente,
                concept: concepto,
                operationDate: admin.firestore.Timestamp.fromDate(operationDate),
                quantity: Number(row.Cantidad),
                details: {
                    container: row.Contenedor || '',
                    opLogistica: opLogistica,
                    fmmNumber: fmmNumber,
                    plate: row.Placa || ''
                },
                createdAt: new Date().toISOString(),
                createdBy: createdBy,
            });
            createdCount++;
            existingFmms.add(fmmNumber);
        }

        if (createdCount > 0) {
            await batch.commit();
        }
        
        revalidatePath('/operaciones-manuales-clientes');
        revalidatePath('/billing-reports');

        let message = `Se crearon ${createdCount} registros.`;
        if (duplicateCount > 0) message += ` Se omitieron ${duplicateCount} por ser duplicados.`;
        if (errorCount > 0) message += ` ${errorCount} filas tuvieron errores y no se cargaron.`;

        return { success: errorCount === 0, message, createdCount, duplicateCount, errorCount, errors };
    } catch (error) {
        console.error('Error al cargar operaciones FMM:', error);
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido.';
        return { success: false, message: errorMessage, createdCount: 0, duplicateCount: 0, errorCount: rows.length, errors: [errorMessage] };
    }
}

interface InspeccionRow {
  Fecha: Date | string | number;
  Cliente: string;
  Concepto: 'INSPECCIÓN ZFPC';
  Contenedor: string;
  Arin: string;
  '# FMM': string;
  Placa: string;
  'Hora Inicio': string | number | Date;
  'Hora Final': string | number | Date;
  '# Personas': number;
}

const excelTimeToHHMM = (excelTime: any): string => {
  if (excelTime instanceof Date) {
    const hours = String(excelTime.getUTCHours()).padStart(2, '0');
    const minutes = String(excelTime.getUTCMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }
  if (typeof excelTime === 'number') {
    if (excelTime < 0 || excelTime >= 1) {
      const fractionalDay = excelTime - Math.floor(excelTime);
      if (fractionalDay > 0) {
          return excelTimeToHHMM(fractionalDay);
      }
      throw new Error(`Valor de hora de Excel inválido: ${excelTime}. Debe ser un número entre 0 y 1.`);
    }
    const totalMinutes = Math.round(excelTime * 24 * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  if (typeof excelTime === 'string') {
    if (excelTime.match(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)) {
        return excelTime;
    }
    const amPmMatch = excelTime.match(/(\d{1,2}):(\d{2}):(\d{2})\s*([ap]\.?\s*m\.?)/i);
    if (amPmMatch) {
        let hours = parseInt(amPmMatch[1], 10);
        const minutes = amPmMatch[2];
        const period = amPmMatch[4].toLowerCase().replace(/\./g, '').replace(/\s/g, '');
        if (period === 'pm' && hours < 12) {
            hours += 12;
        }
        if (period === 'am' && hours === 12) {
            hours = 0;
        }
        return `${String(hours).padStart(2, '0')}:${minutes}`;
    }
  }

  throw new Error(`Formato de hora no reconocido: ${excelTime}`);
};

export async function uploadInspeccionOperations(
  formData: FormData
): Promise<{ success: boolean; message: string; createdCount: number; errorCount: number; errors: string[]; extraHoursData: any[] }> {
  if (!firestore) {
    return { success: false, message: 'El servidor no está configurado.', createdCount: 0, errorCount: 0, errors: [], extraHoursData: [] };
  }

  const file = formData.get('file') as File;
  if (!file) {
    return { success: false, message: 'No se encontró el archivo.', createdCount: 0, errorCount: 0, errors: [], extraHoursData: [] };
  }
  
  let rows: Partial<InspeccionRow>[] = [];
  try {
    const buffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const worksheet = workbook.worksheets[0];

    const headers = (worksheet.getRow(1).values as string[]).map(h => h ? String(h).trim() : '');
    
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        const rowData: any = {};
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          const header = headers[colNumber];
          if (header) rowData[header] = cell.value;
        });
        rows.push(rowData);
      }
    });

    if (rows.length === 0) throw new Error("El archivo está vacío.");
    
    const createdBy = {
        uid: formData.get('userId') as string,
        displayName: formData.get('userDisplayName') as string,
    };

    let createdCount = 0;
    let errorCount = 0;
    const errors: string[] = [];
    const extraHoursData = [];

    const batch = firestore.batch();

    for (const [index, row] of rows.entries()) {
      const rowIndex = index + 2;
      try {
        if (!row.Fecha) throw new Error("Falta la fecha.");
        if (!row.Cliente) throw new Error("Falta el cliente.");
        
        let operationDate: Date;
        if (row.Fecha instanceof Date) {
            operationDate = row.Fecha;
        } else if (typeof row.Fecha === 'number') {
            const excelDate = new Date(Math.round((row.Fecha - 25569) * 86400 * 1000));
            excelDate.setMinutes(excelDate.getMinutes() + excelDate.getTimezoneOffset());
            operationDate = excelDate;
        } else if (typeof row.Fecha === 'string') {
            operationDate = parse(row.Fecha, 'dd-MM-yyyy', new Date());
             if (isNaN(operationDate.getTime())) {
                operationDate = parse(row.Fecha, 'd/M/yyyy', new Date());
            }
        } else {
            throw new Error(`Formato de fecha no reconocido.`);
        }
        
        operationDate.setUTCHours(operationDate.getUTCHours() + 5);

        let startTime, endTime: string;
        
        try {
            startTime = excelTimeToHHMM(row['Hora Inicio']);
        } catch (e) {
            throw new Error("Formato de Hora Inicio inválido. " + (e as Error).message);
        }

        try {
            endTime = excelTimeToHHMM(row['Hora Final']);
        } catch (e) {
            throw new Error("Formato de Hora Final inválido. " + (e as Error).message);
        }
        
        // Bloque de código NUEVO en uploadInspeccionOperations
        const { hours, extraStartTime, extraEndTime } = calculateExtraHoursForInspeccion(operationDate, startTime, endTime);
        if (hours > 0) {
        extraHoursData.push({
            date: format(operationDate, 'yyyy-MM-dd'),
            container: String(row.Contenedor || 'N/A'),
            arin: String(row.Arin || 'N/A'),
            hours: hours,
            startTime: extraStartTime,
            endTime: extraEndTime
        });
        }

        const start = parse(startTime, 'HH:mm', new Date());
        const end = parse(endTime, 'HH:mm', new Date());
        const totalMinutes = differenceInMinutes(end, start);
        const integerHours = Math.floor(totalMinutes / 60);
        const remainingMinutes = totalMinutes % 60;
        let roundedHours = integerHours;
        
        if (totalMinutes > 0 && remainingMinutes >= 10) {
            roundedHours = integerHours + 1;
        }

        const docRef = firestore.collection('manual_client_operations').doc();
        batch.set(docRef, {
          clientName: row.Cliente,
          concept: 'INSPECCIÓN ZFPC',
          operationDate: admin.firestore.Timestamp.fromDate(operationDate),
          quantity: roundedHours,
          numeroPersonas: Number(row['# Personas']) || 1,
          details: {
            arin: String(row.Arin || ''),
            fmmNumber: String(row['# FMM'] || ''),
            plate: String(row.Placa || ''),
            startTime: startTime,
            endTime: endTime,
            container: String(row.Contenedor || ''),
          },
          createdAt: new Date().toISOString(),
          createdBy: createdBy,
        });
        createdCount++;
      } catch (e: any) {
        errors.push(`Fila ${rowIndex}: ${e.message}`);
        errorCount++;
      }
    }
    
    if (createdCount > 0) await batch.commit();

    revalidatePath('/operaciones-manuales-clientes');
    revalidatePath('/billing-reports');

    let message = `Se crearon ${createdCount} registros.`;
    if (errorCount > 0) message += ` ${errorCount} filas tuvieron errores y no se cargaron.`;
    
    return { success: errorCount === 0, message, createdCount, errorCount, errors, extraHoursData };

  } catch(error) {
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido al procesar el archivo.';
    return { success: false, message: errorMessage, createdCount: 0, errorCount: rows.length, errors: [errorMessage], extraHoursData: [] };
  }
}

interface ArinRow {
    Fecha: Date | string | number;
    Cliente: string;
    Concepto: 'ARIN DE INGRESO ZFPC (MANUAL)' | 'ARIN DE SALIDA ZFPC (MANUAL)';
    Cantidad: number;
    Contenedor: string;
    'Op. Logística': 'CARGUE' | 'DESCARGUE';
    '# ARIN': string;
    '# FMM': string;
    Placa: string;
}

export async function uploadArinOperations(
  formData: FormData
): Promise<{ success: boolean; message: string; createdCount: number, duplicateCount: number, errorCount: number, errors: string[] }> {
    if (!firestore) {
        return { success: false, message: 'El servidor no está configurado.', createdCount: 0, duplicateCount: 0, errorCount: 0, errors: [] };
    }

    const file = formData.get('file') as File;
    if (!file) {
        return { success: false, message: 'No se encontró el archivo.', createdCount: 0, duplicateCount: 0, errorCount: 0, errors: [] };
    }

    let rows: Partial<ArinRow>[] = [];

    try {
        const buffer = await file.arrayBuffer();
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);
        const worksheet = workbook.worksheets[0];

        const headers = (worksheet.getRow(1).values as string[]).map(h => h ? String(h).trim() : '');
        
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber > 1) {
                const rowData: any = {};
                row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                    const header = headers[colNumber];
                    if (header) rowData[header] = cell.value;
                });
                rows.push(rowData);
            }
        });

        if (rows.length === 0) throw new Error("El archivo está vacío.");
        
        let createdCount = 0;
        let duplicateCount = 0;
        let errorCount = 0;
        const errors: string[] = [];

        const arinNumbersFromFile = rows.map(r => String(r['# ARIN'] || '').trim()).filter(Boolean);
        const existingArins = new Set<string>();
        if (arinNumbersFromFile.length > 0) {
            const arinChunks = [];
            for (let i = 0; i < arinNumbersFromFile.length; i += 30) {
                arinChunks.push(arinNumbersFromFile.slice(i, i + 30));
            }
            const arinConcepts = [
                'ARIN DE INGRESO ZFPC (MANUAL)',
                'ARIN DE SALIDA ZFPC (MANUAL)',
                'ARIN DE INGRESO ZFPC (NACIONALIZADO)',
                'ARIN DE SALIDA ZFPC (NACIONALIZADO)',
                'INSPECCIÓN ZFPC'
            ];
            for (const chunk of arinChunks) {
                const querySnapshot = await firestore.collection('manual_client_operations')
                    .where('details.arin', 'in', chunk)
                    .where('concept', 'in', arinConcepts)
                    .get();
                querySnapshot.forEach(doc => {
                    existingArins.add(String(doc.data().details.arin));
                });
            }
        }
        const createdBy = {
            uid: formData.get('userId') as string,
            displayName: formData.get('userDisplayName') as string,
        };

        const batch = firestore.batch();

        for (const [index, row] of rows.entries()) {
            const rowIndex = index + 2;
            const arinNumber = String(row['# ARIN'] || '').trim();
            const concepto = String(row.Concepto || '').trim().toUpperCase();
            const opLogistica = String(row['Op. Logística'] || '').trim().toUpperCase() as 'CARGUE' | 'DESCARGUE';

            // Validation Checks
            if (!row.Fecha) { errors.push(`Fila ${rowIndex}: Falta la fecha.`); errorCount++; continue; }
            if (!row.Cliente) { errors.push(`Fila ${rowIndex}: Falta el cliente.`); errorCount++; continue; }
            if (!concepto || !['ARIN DE INGRESO ZFPC (MANUAL)', 'ARIN DE SALIDA ZFPC (MANUAL)', 'ARIN DE INGRESO ZFPC (NACIONALIZADO)', 'ARIN DE SALIDA ZFPC (NACIONALIZADO)'].includes(concepto)) { errors.push(`Fila ${rowIndex}: Concepto inválido.`); errorCount++; continue; }
            if (row.Cantidad === undefined || row.Cantidad === null || isNaN(Number(row.Cantidad))) { errors.push(`Fila ${rowIndex}: Cantidad inválida.`); errorCount++; continue; }
            if (!opLogistica || !['CARGUE', 'DESCARGUE'].includes(opLogistica)) { errors.push(`Fila ${rowIndex}: 'Op. Logística' inválida.`); errorCount++; continue; }
            if (!arinNumber) { errors.push(`Fila ${rowIndex}: Falta el # ARIN.`); errorCount++; continue; }

            if (existingArins.has(arinNumber)) {
                duplicateCount++;
                continue;
            }

            let operationDate: Date;
            if (row.Fecha instanceof Date) {
                operationDate = row.Fecha;
            } else if (typeof row.Fecha === 'number') {
                const excelDate = new Date(Math.round((row.Fecha - 25569) * 86400 * 1000));
                excelDate.setMinutes(excelDate.getMinutes() + excelDate.getTimezoneOffset());
                operationDate = excelDate;
            } else if (typeof row.Fecha === 'string') {
                operationDate = parse(row.Fecha, 'dd-MM-yyyy', new Date());
                 if (isNaN(operationDate.getTime())) {
                    operationDate = parse(row.Fecha, 'd/M/yyyy', new Date());
                }
            } else {
                errors.push(`Fila ${rowIndex}: Formato de fecha no reconocido.`);
                errorCount++;
                continue;
            }

            operationDate.setUTCHours(operationDate.getUTCHours() + 5);

            const docRef = firestore.collection('manual_client_operations').doc();
            batch.set(docRef, {
                clientName: row.Cliente,
                concept: concepto,
                operationDate: admin.firestore.Timestamp.fromDate(operationDate),
                quantity: Number(row.Cantidad),
                details: {
                    container: row.Contenedor || '',
                    opLogistica: opLogistica,
                    arin: arinNumber,
                    fmmNumber: String(row['# FMM'] || ''),
                    plate: row.Placa || ''
                },
                createdAt: new Date().toISOString(),
                createdBy: createdBy,
            });
            createdCount++;
            existingArins.add(arinNumber);
        }

        if (createdCount > 0) {
            await batch.commit();
        }
        
        revalidatePath('/operaciones-manuales-clientes');
        revalidatePath('/billing-reports');

        let message = `Se crearon ${createdCount} registros ARIN.`;
        if (duplicateCount > 0) message += ` Se omitieron ${duplicateCount} por ser duplicados.`;
        if (errorCount > 0) message += ` ${errorCount} filas tuvieron errores y no se cargaron.`;

        return { success: errorCount === 0, message, createdCount, duplicateCount, errorCount, errors };
    } catch (error) {
        console.error('Error al cargar operaciones ARIN:', error);
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido.';
        return { success: false, message: errorMessage, createdCount: 0, duplicateCount: 0, errorCount: rows.length, errors: [errorMessage] };
    }
}