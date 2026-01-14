

'use server';

import { firestore } from '@/lib/firebase-admin';
import { revalidatePath } from 'next/cache';
import admin from 'firebase-admin';
import { startOfDay, endOfDay, parseISO, differenceInHours, getDay, format, addMinutes, addHours, differenceInMinutes, parse, isSaturday, isSunday, addDays, eachDayOfInterval, isWithinInterval, isBefore, isEqual } from 'date-fns';
import type { ArticuloData } from '@/app/actions/articulos';
import { getConsolidatedMovementReport } from '@/app/actions/consolidated-movement-report';
import { processTunelCongelacionData } from '@/lib/report-utils';
import { getSmylLotAssistantReport, type AssistantReport } from '@/app/smyl-liquidation-assistant/actions';
import { getDetailedInventoryForExport } from '@/app/actions/inventory-report';
import { getClientBillingConcepts, type SpecificTariff } from '@/app/gestion-conceptos-liquidacion-clientes/actions';
import { getHolidaysInRange } from '@/app/gestion-festivos/actions';

const assistantConcepts = [
    'SERVICIO DE CONGELACIÓN - PALLET/DÍA (-18ºC)',
    'MOVIMIENTO ENTRADA PRODUCTO - PALETA',
    'MOVIMIENTO SALIDA PRODUCTO - PALETA'
];

export interface AssistantGeneratedOperation {
    id: string;
    clientName: string;
    operationDate: string;
    concept: string;
    quantity: number;
    details?: {
        plate?: string;
        pedidoSislog?: string;
    };
    createdBy?: {
        displayName: string;
    };
}


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


export async function getAssistantGeneratedOperations(criteria: {
    clientName?: string;
    startDate?: string;
    endDate?: string;
    plate?: string;
    pedidoSislog?: string;
}): Promise<AssistantGeneratedOperation[]> {
    if (!firestore) {
        throw new Error('Firestore no está inicializado.');
    }

    let query: admin.firestore.Query = firestore.collection('manual_client_operations');

    query = query.where('concept', 'in', assistantConcepts);

    if (criteria.clientName) {
        query = query.where('clientName', '==', criteria.clientName);
    }
    if (criteria.startDate) {
        query = query.where('operationDate', '>=', startOfDay(parseISO(criteria.startDate)));
    }
    if (criteria.endDate) {
        query = query.where('operationDate', '<=', endOfDay(parseISO(criteria.endDate)));
    }
    if (criteria.plate) {
        query = query.where('details.plate', '==', criteria.plate);
    }
    if (criteria.pedidoSislog) {
        query = query.where('details.pedidoSislog', '==', criteria.pedidoSislog);
    }

    try {
        const snapshot = await query.orderBy('operationDate', 'desc').get();
        return snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                clientName: data.clientName,
                operationDate: (data.operationDate as admin.firestore.Timestamp).toDate().toISOString(),
                concept: data.concept,
                quantity: data.quantity,
                details: {
                    plate: data.details?.plate,
                    pedidoSislog: data.details?.pedidoSislog,
                },
                createdBy: {
                    displayName: data.createdBy?.displayName,
                },
            };
        });
    } catch (e: any) {
        if (e.message?.includes('requires an index')) {
            throw new Error(e.message); // Re-throw to be caught by the client
        }
        console.error("Error fetching assistant-generated operations:", e);
        throw new Error("Ocurrió un error al buscar las operaciones.");
    }
}


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
    opLogistica?: 'CARGUE' | 'DESCARGUE';
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
    dailyLocations?: { date: Date, quantity: number }[];
}

async function isFmmNumberDuplicate(fmmNumber: string, concept: string, currentOperationId?: string): Promise<boolean> {
    if (!firestore) throw new Error("Firestore no está inicializado.");
    if (!fmmNumber) return false;

    // Define los conceptos que requieren validación de FMM único
    const fmmConcepts = [
        'FMM DE INGRESO ZFPC (MANUAL)', 
        'FMM DE SALIDA ZFPC (MANUAL)',
        'FMM DE INGRESO ZFPC NACIONAL',
        'FMM DE SALIDA ZFPC NACIONAL'
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
        'ARIN DE INGRESO ZFPC NACIONAL',
        'ARIN DE SALIDA ZFPC NACIONAL',
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
            clientName: data.clientName || 'No Aplica',
            comentarios: data.comentarios || '',
            opLogistica: data.opLogistica || null,
            details: {
              ...(details || {}),
            },
            operationDate: operationDateToSave,
            createdAt: new Date().toISOString(),
        };

        const conceptsWithNumeroPersonas = ['INSPECCIÓN ZFPC', 'TOMA DE PESOS POR ETIQUETA HRS', 'SERVICIO DE APOYO JORNAL'];
        if (conceptsWithNumeroPersonas.includes(data.concept) && numeroPersonas !== undefined) {
            operationWithTimestamp.numeroPersonas = numeroPersonas;
        }

        await firestore.collection('manual_client_operations').add(operationWithTimestamp);

        revalidatePath('/billing-reports');
        revalidatePath('/operaciones-manuales-clientes');
        revalidatePath('/inventory-liquidation-assistant');

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

        const { weekdayStartTime, weekdayEndTime, saturdayStartTime, saturdayEndTime, sundayHolidayStartTime, sundayHolidayEndTime, dayShiftEndTime } = conceptConfig.fixedTimeConfig;

        if (!weekdayStartTime || !weekdayEndTime || !saturdayStartTime || !saturdayEndTime || !dayShiftEndTime) {
            throw new Error(`La configuración de horarios para "${concept}" está incompleta.`);
        }
        
        const holidaysInRange = await getHolidaysInRange(dates[0], dates[dates.length - 1]);
        const holidaySet = new Set(holidaysInRange.map(h => h.date));


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
            const isSundayOrHoliday = dayOfWeek === 0 || holidaySet.has(dateString);

            let baseStartTimeStr, baseEndTimeStr: string;

            if (isSundayOrHoliday) {
                baseStartTimeStr = sundayHolidayStartTime || weekdayStartTime; // Fallback
                baseEndTimeStr = sundayHolidayEndTime || weekdayEndTime; // Fallback
            } else if (dayOfWeek === 6) { // Saturday
                baseStartTimeStr = saturdayStartTime;
                baseEndTimeStr = saturdayEndTime;
            } else { // Weekday
                baseStartTimeStr = weekdayStartTime;
                baseEndTimeStr = weekdayEndTime;
            }
            
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
                    let diurnaTariff, nocturnaTariff;

                    if (isSundayOrHoliday) {
                        diurnaTariff = conceptConfig.specificTariffs?.find(t => t.name.includes(role.roleName) && t.name.includes("DIURNA DOMINGO Y FESTIVO"));
                        nocturnaTariff = conceptConfig.specificTariffs?.find(t => t.name.includes(role.roleName) && t.name.includes("NOCTURNA DOMINGO Y FESTIVO"));
                    } else {
                        diurnaTariff = conceptConfig.specificTariffs?.find(t => t.name.includes(role.roleName) && t.name.includes("DIURNA") && !t.name.includes("DOMINGO"));
                        nocturnaTariff = conceptConfig.specificTariffs?.find(t => t.name.includes(role.roleName) && t.name.includes("NOCTURNA") && !t.name.includes("DOMINGO"));
                    }
                    
                    if (totalDiurnoMinutes > 0 && diurnaTariff) {
                        tariffs.push({ tariffId: diurnaTariff.id, quantity: totalDiurnoMinutes / 60, role: role.roleName, numPersonas: role.numPersonas });
                    }
                    if (totalNocturnoMinutes > 0 && nocturnaTariff) {
                         tariffs.push({ tariffId: nocturnaTariff.id, quantity: totalNocturnoMinutes / 60, role: role.roleName, numPersonas: role.numPersonas });
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
            
            const { dayShiftEndTime, sundayHolidayStartTime, sundayHolidayEndTime, weekdayStartTime, weekdayEndTime, saturdayStartTime, saturdayEndTime } = conceptConfig.fixedTimeConfig;

            if (!dayShiftEndTime || !data.details?.startTime || !data.details?.endTime || !data.operationDate) throw new Error("Missing times for TIEMPO EXTRA FRIOAL calculation");

            const opDate = new Date(data.operationDate);
            const dateString = format(opDate, 'yyyy-MM-dd');
            const holidays = await getHolidaysInRange(dateString, dateString);
            const isSundayOrHoliday = opDate.getUTCDay() === 0 || holidays.length > 0;
            
            const timeToMinutes = (time: string): number => { const [hours, minutes] = time.split(':').map(Number); return hours * 60 + minutes; };
            
            const startMinutes = timeToMinutes(data.details.startTime);
            let endMinutes = timeToMinutes(data.details.endTime);
            if (endMinutes <= startMinutes) {
                endMinutes += 24 * 60; // Add 24 hours in minutes if it's an overnight shift
            }
            
            let diurnoStartMinutes, diurnoEndMinutes: number;

            if(isSundayOrHoliday && sundayHolidayStartTime && sundayHolidayEndTime) {
                diurnoStartMinutes = timeToMinutes(sundayHolidayStartTime);
                diurnoEndMinutes = timeToMinutes(sundayHolidayEndTime);
            } else if (opDate.getUTCDay() === 6 && saturdayStartTime && saturdayEndTime){
                diurnoStartMinutes = timeToMinutes(saturdayStartTime);
                diurnoEndMinutes = timeToMinutes(saturdayEndTime);
            } else {
                 diurnoStartMinutes = timeToMinutes(weekdayStartTime || "00:00");
                 diurnoEndMinutes = timeToMinutes(dayShiftEndTime);
            }

            const totalDiurnoMinutes = Math.max(0, Math.min(endMinutes, diurnoEndMinutes) - Math.max(startMinutes, diurnoStartMinutes));
            const totalNocturnoMinutes = Math.max(0, endMinutes - Math.max(startMinutes, diurnoEndMinutes));

            const roles = data.bulkRoles || [];

            finalSpecificTariffs = roles.flatMap(role => {
                let diurnaTariff, nocturnaTariff: SpecificTariff | undefined;

                if (isSundayOrHoliday) {
                    diurnaTariff = conceptConfig.specificTariffs?.find(t => t.name.includes(role.roleName) && t.name.includes("DIURNA DOMINGO Y FESTIVO"));
                    nocturnaTariff = conceptConfig.specificTariffs?.find(t => t.name.includes(role.roleName) && t.name.includes("NOCTURNA DOMINGO Y FESTIVO"));
                } else {
                    diurnaTariff = conceptConfig.specificTariffs?.find(t => t.name.includes(role.roleName) && t.name.includes("DIURNA") && !t.name.includes("DOMINGO"));
                    nocturnaTariff = conceptConfig.specificTariffs?.find(t => t.name.includes(role.roleName) && t.name.includes("NOCTURNA") && !t.name.includes("DOMINGO"));
                }

                const tariffs = [];
                 if (totalDiurnoMinutes > 0 && diurnaTariff) {
                    tariffs.push({ tariffId: diurnaTariff.id, quantity: totalDiurnoMinutes / 60, role: role.roleName, numPersonas: role.numPersonas });
                }
                if (totalNocturnoMinutes > 0 && nocturnaTariff) {
                    tariffs.push({ tariffId: nocturnaTariff.id, quantity: totalNocturnoMinutes / 60, role: role.roleName, numPersonas: role.numPersonas });
                }
                return tariffs;
            }).filter(Boolean) as { tariffId: string; quantity: number, role?: string, numPersonas?: number }[];


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
            clientName: data.clientName || 'No Aplica',
            comentarios: data.comentarios || '',
            specificTariffs: finalSpecificTariffs,
            opLogistica: data.opLogistica || null,
            details: {
                ...(details || {}),    
            },
            operationDate: operationDateToSave,
        };
        
        if (data.concept !== 'TIEMPO EXTRA FRIOAL (FIJO)' && data.concept !== 'TIEMPO EXTRA FRIOAL') {
             delete (operationWithTimestamp as any).bulkRoles;
        }
        delete (operationWithTimestamp as any).excedentes;
        delete (operationWithTimestamp as any).dailyLocations; // Delete new field for other concepts
        
        await docRef.update(operationWithTimestamp);
        
        revalidatePath('/billing-reports');
        revalidatePath('/operaciones-manuales-clientes');
        revalidatePath('/inventory-liquidation-assistant');
        
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
        revalidatePath('/inventory-liquidation-assistant');
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
        revalidatePath('/inventory-liquidation-assistant');
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
    Concepto: 'FMM DE INGRESO ZFPC (MANUAL)' | 'FMM DE SALIDA ZFPC (MANUAL)' | 'FMM DE INGRESO ZFPC NACIONAL' | 'FMM DE SALIDA ZFPC NACIONAL';
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
                'FMM DE INGRESO ZFPC NACIONAL',
                'FMM DE SALIDA ZFPC NACIONAL'
            ];
            for (const chunk of fmmChunks) {
                for (const concept of fmmConcepts) { // <-- Aquí está el bucle adicional
                    const querySnapshot = await firestore.collection('manual_client_operations')
                        .where('details.fmmNumber', 'in', chunk)
                        .where('concept', '==', concept) // <-- Y aquí el uso de '=='
                        .get();
                    querySnapshot.forEach(doc => {
                        existingFmms.add(String(doc.data().details.fmmNumber));
                    });
                }
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
            if (!concepto || !['FMM DE INGRESO ZFPC (MANUAL)', 'FMM DE SALIDA ZFPC (MANUAL)', 'FMM DE INGRESO ZFPC NACIONAL', 'FMM DE SALIDA ZFPC NACIONAL'].includes(concepto)) { errors.push(`Fila ${rowIndex}: Concepto inválido. Debe ser un concepto de tipo FMM.`); errorCount++; continue; }
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
                opLogistica: opLogistica,
                details: {
                    container: row.Contenedor || '',
                    
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

interface ArinRow {
    Fecha: Date | string | number;
    Cliente: string;
    Concepto: 'ARIN DE INGRESO ZFPC (MANUAL)' | 'ARIN DE SALIDA ZFPC (MANUAL)' | 'ARIN DE INGRESO ZFPC NACIONAL' | 'ARIN DE SALIDA ZFPC NACIONAL' ;
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
            for (let i = 0; i < arinNumbersFromFile.length; i += 10) { // Reduced chunk size
                arinChunks.push(arinNumbersFromFile.slice(i, i + 10));
            }
            const arinConcepts = [
                'ARIN DE INGRESO ZFPC (MANUAL)',
                'ARIN DE SALIDA ZFPC (MANUAL)',
                'ARIN DE INGRESO ZFPC NACIONAL',
                'ARIN DE SALIDA ZFPC NACIONAL',
            ];
            for (const chunk of arinChunks) {
                for (const concept of arinConcepts) {
                     const querySnapshot = await firestore.collection('manual_client_operations')
                        .where('details.arin', 'in', chunk)
                        .where('concept', '==', concept)
                        .get();
                    querySnapshot.forEach(doc => {
                        existingArins.add(String(doc.data().details.arin));
                    });
                }
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
            if (!concepto || !['ARIN DE INGRESO ZFPC (MANUAL)', 'ARIN DE SALIDA ZFPC (MANUAL)', 'ARIN DE INGRESO ZFPC NACIONAL', 'ARIN DE SALIDA ZFPC NACIONAL'].includes(concepto)) { errors.push(`Fila ${rowIndex}: Concepto inválido.`); errorCount++; continue; }
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
                opLogistica: opLogistica,
                details: {
                    container: row.Contenedor || '',
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

  
```
- src/lib/report-utils.ts:
```ts
export const processTunelCongelacionData = (formData: any) => {
    const placaGroups = (formData.placas || []).map((placa: any) => {
        const itemsByPresentation = (placa.items || []).reduce((acc: any, item: any) => {
            const presentation = item.presentacion || 'SIN PRESENTACIÓN';
            if (!acc[presentation]) {
                acc[presentation] = {
                    presentation: presentation,
                    products: [],
                };
            }
            acc[presentation].products.push(item);
            return acc;
        }, {});

        const presentationGroups = Object.values(itemsByPresentation).map((group: any) => {
             const productsWithSummary = group.products.reduce((acc: any, item: any) => {
                const desc = item.descripcion;
                if (!acc[desc]) {
                     const summaryItem = formData.summary?.find((s: any) => s.descripcion === desc && s.presentacion === group.presentation && s.placa === placa.numeroPlaca);
                     acc[desc] = {
                        descripcion: desc,
                        temperatura1: summaryItem?.temperatura1 || 'N/A',
                        temperatura2: summaryItem?.temperatura2 || 'N/A',
                        temperatura3: summaryItem?.temperatura3 || 'N/A',
                        totalPaletas: 0,
                        totalCantidad: 0,
                        totalPeso: 0,
                    };
                }
                acc[desc].totalPaletas += 1;
                acc[desc].totalCantidad += Number(item.cantidadPorPaleta) || 0;
                acc[desc].totalPeso += Number(item.pesoNeto) || 0;
                return acc;
             }, {});

             const subTotalPaletas = Object.values(productsWithSummary).reduce((sum: number, p: any) => sum + p.totalPaletas, 0);
             const subTotalCantidad = Object.values(productsWithSummary).reduce((sum: number, p: any) => sum + p.totalCantidad, 0);
             const subTotalPeso = Object.values(productsWithSummary).reduce((sum: number, p: any) => sum + p.totalPeso, 0);

            return {
                presentation: group.presentation,
                products: Object.values(productsWithSummary),
                subTotalPaletas,
                subTotalCantidad,
                subTotalPeso,
            };
        });

        const totalPaletasPlaca = presentationGroups.reduce((acc: number, group: any) => acc + group.subTotalPaletas, 0);
        const totalCantidadPlaca = presentationGroups.reduce((acc: number, group: any) => acc + group.subTotalCantidad, 0);
        const totalPesoPlaca = presentationGroups.reduce((acc: number, group: any) => acc + group.subTotalPeso, 0);

        return {
            placa: placa.numeroPlaca,
            conductor: placa.conductor,
            cedulaConductor: placa.cedulaConductor,
            presentationGroups: presentationGroups,
            totalPaletasPlaca,
            totalCantidadPlaca,
            totalPesoPlaca,
        };
    });

    const totalGeneralPaletas = placaGroups.reduce((acc, placa) => acc + placa.totalPaletasPlaca, 0);
    const totalGeneralCantidad = placaGroups.reduce((acc, placa) => acc + placa.totalCantidadPlaca, 0);
    const totalGeneralPeso = placaGroups.reduce((acc, placa) => acc + placa.totalPesoPlaca, 0);

    return { placaGroups, totalGeneralPaletas, totalGeneralCantidad, totalGeneralPeso };
};

```
- src/app/variable-weight-reception-form/page.tsx:
```tsx


import { Suspense } from 'react';
import VariableWeightReceptionFormComponent from './form-component';
import { getPedidoTypesForForm } from '../gestion-tipos-pedido/actions';
import { notFound } from 'next/navigation';
import type { PedidoType } from '@/app/gestion-tipos-pedido/actions';

export default async function VariableWeightReceptionFormPage({
  searchParams,
}: {
  searchParams: { operation: string };
}) {
  const operation = searchParams.operation;
  if (operation !== 'recepcion') {
    notFound();
  }

  const pedidoTypes: PedidoType[] = await getPedidoTypesForForm('variable-weight-reception');
  
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <VariableWeightReceptionFormComponent pedidoTypes={pedidoTypes} />
    </Suspense>
  );
}



```
- src/app/variable-weight-form/form-component.tsx:
```tsx


"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback, ReactNode } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useForm, useFieldArray, useWatch, FormProvider, useFormContext, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import Image from "next/image";
import { useAuth } from "@/hooks/use-auth";
import { getClients, type ClientInfo } from "@/app/actions/clients";
import { getArticulosByClients, type ArticuloInfo } from "@/app/actions/articulos";
import { getUsersList, type UserInfo } from "@/app/actions/users";
import { useFormPersistence } from "@/hooks/use-form-persistence";
import { useClientChangeHandler } from "@/hooks/useClientChangeHandler";
import { saveForm } from "@/app/actions/save-form";
import { storage } from "@/lib/firebase";
import { ref, uploadString, getDownloadURL } from "firebase/storage";
import { optimizeImage } from "@/lib/image-optimizer";
import { getSubmissionById, type SubmissionResult } from "@/app/actions/consultar-formatos";
import { getStandardObservations, type StandardObservation } from "@/app/gestion-observaciones/actions";
import { PedidoType } from "@/app/gestion-tipos-pedido/actions";
import { Html5Qrcode } from "html5-qrcode";
import { getPalletInfoByCode, type PalletInfo } from "@/app/actions/pallet-lookup";


import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
    ArrowLeft,
    Trash2,
    PlusCircle,
    UploadCloud,
    Camera,
    Send,
    RotateCcw,
    ChevronsUpDown,
    FileText,
    Edit2,
    Loader2,
    Check,
    CalendarIcon,
    Clock,
    MapPin,
    QrCode,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RestoreDialog } from "@/components/app/restore-dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription as AlertDialogDesc, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Calendar } from "@/components/ui/calendar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";

const itemSchema = z.object({
    paleta: z.coerce.number({ invalid_type_error: "La paleta debe ser un número."}).int().nullable(),
    totalCantidad: z.coerce.number({ invalid_type_error: "Debe ser un número."}).int().min(0, "Debe ser >= 0").optional(),
    paletasCompletas: z.coerce.number({invalid_type_error: "Debe ser numérico"}).int("Debe ser un número entero.").min(0, "No puede ser negativo.").default(0),
    paletasPicking: z.coerce.number({invalid_type_error: "Debe ser numérico"}).int("Debe ser un número entero.").min(0, "No puede ser negativo.").default(0),
    totalPaletas: z.coerce.number().optional(), // Campo antiguo
    totalPesoNeto: z.coerce.number({ invalid_type_error: "Debe ser un número."}).min(0, "Debe ser >= 0").optional(),
    cantidadPorPaleta: z.coerce.number({ invalid_type_error: "Debe ser un número." }).int().min(0, "Debe ser >= 0").optional(),
    pesoBruto: z.coerce.number({ invalid_type_error: "Debe ser un número." }).min(0, "Debe ser >= 0").optional(),
    taraEstiba: z.coerce.number({ invalid_type_error: "Debe ser un número." }).min(0, "Debe ser >= 0").optional(),
    taraCaja: z.coerce.number({ invalid_type_error: "Debe ser un número." }).min(0, "Debe ser >= 0").optional(),
    codigo: z.string().min(1, "El código es requerido."),
    descripcion: z.string().min(1, "La descripción es requerida."),
    lote: z.string().max(15, "Máximo 15 caracteres").optional(),
    presentacion: z.string().min(1, "Seleccione una presentación."),
    destino: z.string().optional(),
    totalTaraCaja: z.number().nullable().optional(),
    pesoNeto: z.number().nullable().optional(),
    esPicking: z.boolean().default(false),
    sesion: z.string().optional(),
}).superRefine((data, ctx) => {
    if (data.paleta === null || data.paleta === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "El campo Paleta es obligatorio.", path: ["paleta"] });
        return;
    }
    
    if (data.paleta === 0) { // Summary Row Validation
        if (data.totalCantidad === undefined || data.totalCantidad === null) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Total Cantidad es requerido.', path: ['totalCantidad'] });
        // Validation for paletasCompletas/Picking is implicit as they default to 0
        if (data.totalPesoNeto === undefined || data.totalPesoNeto === null) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Total Peso Neto es requerido.', path: ['totalPesoNeto'] });
    } else { // Individual Pallet Validation
        if (data.cantidadPorPaleta === undefined || data.cantidadPorPaleta === null) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Cant. Por Paleta es requerida.', path: ['cantidadPorPaleta'] });
        if (data.pesoBruto === undefined || data.pesoBruto === null) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'P. Bruto es requerido.', path: ['pesoBruto'] });
        if (data.taraEstiba === undefined || data.taraEstiba === null) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'T. Estiba es requerida.', path: ['taraEstiba'] });
        if (data.taraCaja === undefined || data.taraCaja === null) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'T. Caja es requerida.', path: ['taraCaja'] });
    }
});


const destinoSchema = z.object({
  nombreDestino: z.string().min(1, 'El destino es requerido.'),
  items: z.array(itemSchema).min(1, "Debe agregar al menos un ítem al destino."),
});

const tempSchema = z.preprocess(
    (val) => (val === "" || val === null ? null : val),
    z.coerce.number({ 
        invalid_type_error: "La temperatura debe ser un número." 
    })
      .min(-99, "El valor debe estar entre -99 y 99.")
      .max(99, "El valor debe estar entre -99 y 99.")
      .nullable()
);

const summaryItemSchema = z.object({
    descripcion: z.string(),
    temperatura: tempSchema,
    totalPeso: z.number(),
    totalCantidad: z.number(),
    totalPaletas: z.number(),
    totalPaletasCompletas: z.number(),
    totalPaletasPicking: z.number(),
    destino: z.string().optional(),
}).refine(data => {
    // Al menos una temperatura es requerida.
    return data.temperatura !== null;
}, {
    message: "Debe ingresar al menos una temperatura para el producto.",
    path: ["temperatura"], // report error on the first temperature field
});


const observationSchema = z.object({
  type: z.string().min(1, "Debe seleccionar un tipo de observación."),
  customType: z.string().optional(),
  quantity: z.coerce.number({invalid_type_error: "La cantidad debe ser un número."}).min(0, "La cantidad no puede ser negativa.").optional(),
  quantityType: z.string().optional(),
  executedByGrupoRosales: z.boolean().default(false),
}).refine(data => {
    if (data.type === 'OTRAS OBSERVACIONES' && !data.customType?.trim()) {
        return false;
    }
    return true;
}, {
    message: "La descripción para 'OTRAS OBSERVACIONES' es obligatoria.",
    path: ['customType']
});

const formSchema = z.object({
    pedidoSislog: z.string()
      .min(1, "El pedido SISLOG es obligatorio.")
      .max(15, "El pedido SISLOG no puede exceder los 15 caracteres."),
    cliente: z.string().min(1, "Seleccione un cliente."),
    fecha: z.date({ required_error: "La fecha es obligatoria." }),
    conductor: z.string()
      .min(1, "El nombre del conductor es obligatorio."),
    cedulaConductor: z.string()
      .min(1, "La cédula del conductor es obligatoria.").regex(/^[0-9]*$/, "La cédula solo puede contener números."),
    placa: z.string()
      .min(1, "La placa es obligatoria.")
      .regex(/^[A-Z]{3}[0-9]{3}$/, "Formato inválido. Deben ser 3 letras y 3 números (ej: ABC123)."),
    precinto: z.string().min(1, "El precinto es obligatorio."),
    setPoint: z.preprocess(
      (val) => (val === "" || val === null ? null : val),
      z.coerce.number({ invalid_type_error: "Set Point debe ser un número."})
        .min(-99, "El valor debe estar entre -99 y 99.").max(99, "El valor debe estar entre -99 y 99.").nullable()
    ),
    contenedor: z.string().min(1, "El contenedor es obligatorio.").refine(value => {
        const format1 = /^[A-Z]{4}[0-9]{7}$/;
        const format2 = /^[A-Z]{2}[0-9]{6}-[0-9]{4}$/;
        const upperValue = value.toUpperCase();
        return upperValue === 'N/A' || format1.test(upperValue) || format2.test(upperValue);
    }, {
        message: "Formato inválido. Debe ser 'N/A', 4 letras y 7 números, o 2 letras, 6 números, guion y 4 números."
    }),
    despachoPorDestino: z.boolean().default(false),
    totalPaletasDespacho: z.coerce.number().int().min(0, "Debe ser un número no negativo.").optional(),
    items: z.array(itemSchema),
    destinos: z.array(destinoSchema),
    summary: z.array(summaryItemSchema).nullable(),
    horaInicio: z.string().min(1, "La hora de inicio es obligatoria.").regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Formato de hora inválido (HH:MM)."),
    horaFin: z.string().min(1, "La hora de fin es obligatoria.").regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Formato de hora inválido (HH:MM)."),
    observaciones: z.array(observationSchema).optional(),
    coordinador: z.string().min(1, "Seleccione un coordinador."),
    aplicaCuadrilla: z.enum(["si", "no"], { required_error: "Seleccione una opción para 'Operación Realizada por Cuadrilla'." }),
    operarioResponsable: z.string().optional(),
    tipoPedido: z.string({required_error: "El tipo de pedido es obligatorio."}).min(1, "El tipo de pedido es obligatorio."),
    unidadDeMedidaPrincipal: z.string().optional(),
}).refine((data) => {
    if (data.horaInicio && data.horaFin && data.horaInicio === data.horaFin) {
        return false;
    }
    return true;
}, {
    message: "La hora de fin no puede ser igual a la de inicio.",
    path: ["horaFin"],
}).superRefine((data, ctx) => {
    const allItems = data.despachoPorDestino ? data.destinos.flatMap(d => d.items) : data.items;
    
    if (data.despachoPorDestino && data.destinos.length === 0) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Debe agregar al menos un destino.",
            path: ["destinos"],
        });
    }

    if (!data.despachoPorDestino && data.items.length === 0) {
         ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Debe agregar al menos un ítem.",
            path: ["items"],
        });
    }

    const hasSummaryRow = allItems.some(item => Number(item.paleta) === 0);
    if (data.despachoPorDestino && hasSummaryRow && (data.totalPaletasDespacho === undefined || data.totalPaletasDespacho === null || data.totalPaletasDespacho <= 0)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "El total de paletas del despacho es requerido.",
            path: ["totalPaletasDespacho"],
        });
    }
    
    // START: Pallet duplication validation
    if (data.despachoPorDestino) {
        data.destinos.forEach((destino, destinoIndex) => {
            const seenPallets = new Set<number>();
            destino.items.forEach((item, itemIndex) => {
                const paletaNum = Number(item.paleta);
                // Ignore summary (0) and special (999) pallets
                if (!isNaN(paletaNum) && paletaNum > 0 && paletaNum !== 999) {
                    if (seenPallets.has(paletaNum)) {
                        ctx.addIssue({
                            code: z.ZodIssueCode.custom,
                            message: "La paleta ya existe en este destino.",
                            path: [`destinos`, destinoIndex, 'items', itemIndex, 'paleta'],
                        });
                    }
                    seenPallets.add(paletaNum);
                }
            });
        });
    }
    // END: Pallet duplication validation
});

type FormValues = z.infer<typeof formSchema>;

const originalDefaultValues: FormValues = {
  pedidoSislog: "",
  cliente: "",
  fecha: new Date(),
  cedulaConductor: "",
  conductor: "",
  placa: "",
  precinto: "",
  setPoint: null,
  contenedor: "",
  despachoPorDestino: false,
  totalPaletasDespacho: undefined,
  items: [],
  destinos: [],
  summary: [],
  horaInicio: "",
  horaFin: "",
  observaciones: [],
  coordinador: "",
  aplicaCuadrilla: undefined,
  operarioResponsable: undefined,
  tipoPedido: undefined,
  unidadDeMedidaPrincipal: "PALETA",
};

// Mock data
const coordinadores = ["Cristian Acuña", "Sergio Padilla"];
const presentaciones = ["Cajas", "Sacos", "Canastillas"];
const clientesEspeciales = ["AVICOLA EL MADROÑO S.A.", "SMYL TRANSPORTE Y LOGISTICA SAS", "AVICOLA EMBUTIDOS", "COMERCIALIZADORA FRESMAR SAS", "W&L WORLDWIDE TRADING SAS"];

// Attachment Constants
const MAX_ATTACHMENTS = 60;
const MAX_TOTAL_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

function getByteSizeFromBase64(base64: string): number {
    return base64.length * (3 / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
}

export default function VariableWeightFormComponent({ pedidoTypes }: { pedidoTypes: PedidoType[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const operation = searchParams.get("operation") || "operación";
  const submissionId = searchParams.get("id");

  const { toast } = useToast();
  const { user, displayName, permissions, email } = useAuth();
  
  const [clientes, setClientes] = useState<ClientInfo[]>([]);
  const [allUsers, setAllUsers] = useState<UserInfo[]>([]);
  
  const [articulos, setArticulos] = useState<ArticuloInfo[]>([]);
  const [isLoadingArticulos, setIsLoadingArticulos] = useState(false);
  
  const [isProductDialogOpen, setProductDialogOpen] = useState(false);
  const [productDialogContext, setProductDialogContext] = useState<{itemIndex: number, destinoIndex?: number} | null>(null);
  const [isClientDialogOpen, setClientDialogOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState("");

  const [attachments, setAttachments] = useState<string[]>([]);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDeleteAllAlertOpen, setDeleteAllAlertOpen] = useState(false);
  const [isDiscardAlertOpen, setDiscardAlertOpen] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingForm, setIsLoadingForm] = useState(!!submissionId);
  const [originalSubmission, setOriginalSubmission] = useState<SubmissionResult | null>(null);
  const [standardObservations, setStandardObservations] = useState<StandardObservation[]>([]);
  const [isObservationDialogOpen, setObservationDialogOpen] = useState(false);
  const [observationDialogIndex, setObservationDialogIndex] = useState<number | null>(null);
  const [isMixErrorDialogOpen, setMixErrorDialogOpen] = useState(false);
  const [isPedidoTypeDialogOpen, setPedidoTypeDialogOpen] = useState(false);


  const isAdmin = permissions.canManageSessions;
  const isAuthorizedEditor = email === 'sistemas@frioalimentaria.com.co' || (submissionId && email === 'planta@frioalimentaria.com.co');


  const filteredClients = useMemo(() => {
    if (!clientSearch) return clientes;
    return clientes.filter(c => c.razonSocial.toLowerCase().includes(clientSearch.toLowerCase()));
  }, [clientSearch, clientes]);
  
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: originalDefaultValues,
    mode: "onSubmit",
    reValidateMode: "onSubmit"
  });

   const { handleClientChange, ClientChangeDialog, VerifyingClientSpinner, isVerifying } = useClientChangeHandler({
    form,
    setArticulos,
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });
  
   const { fields: destinoFields, append: appendDestino, remove: removeDestino } = useFieldArray({
    control: form.control,
    name: "destinos",
  });

  const { fields: observationFields, append: appendObservation, remove: removeObservation } = useFieldArray({
    control: form.control,
    name: "observaciones",
  });
  
  const watchedCliente = useWatch({ control: form.control, name: 'cliente' });
  const despachoPorDestino = useWatch({ control: form.control, name: 'despachoPorDestino' });
  const allDestinos = useWatch({ control: form.control, name: 'destinos' });
  const allItems = useWatch({ control: form.control, name: 'items' });
  const watchedItemsForSummary = useMemo(() => despachoPorDestino ? (allDestinos || []).flatMap(d => d.items) : (allItems || []), [despachoPorDestino, allDestinos, allItems]);
  const isSummaryMode = useMemo(() => watchedItemsForSummary.some(item => Number(item?.paleta) === 0), [watchedItemsForSummary]);

  const formIdentifier = submissionId ? `variable-weight-dispatch-edit-${submissionId}` : `variable-weight-${operation}`;
  const { isRestoreDialogOpen, onOpenChange, onRestore, onDiscard: handleDiscardHook, clearDraft } = useFormPersistence(formIdentifier, form, originalDefaultValues, attachments, setAttachments, !!submissionId);

  const isClientChangeDisabled = useMemo(() => {
    if (isAuthorizedEditor) return false;
    const itemsToProcess = despachoPorDestino ? (allDestinos || []).flatMap(d => d.items) : (allItems || []);
    return itemsToProcess.length > 1 || (itemsToProcess.length === 1 && !!itemsToProcess[0]?.descripcion);
  }, [despachoPorDestino, allDestinos, allItems, isAuthorizedEditor]);
  
  const handleDiscard = () => {
    handleDiscardHook();
    form.reset(originalDefaultValues);
    setAttachments([]);
    setDiscardAlertOpen(false);
  };

  useEffect(() => {
    const shouldEnableDestino = clientesEspeciales.includes(watchedCliente);
    if (!shouldEnableDestino && despachoPorDestino) {
        form.setValue('despachoPorDestino', false);
    }
  }, [watchedCliente, despachoPorDestino, form]);

  const calculatedSummary = useMemo(() => {
      const itemsToProcess = despachoPorDestino ? (allDestinos || []).flatMap(d => d.items.map(i => ({...i, destino: d.nombreDestino}))) : (allItems || []);
      const isIndividualPalletMode = itemsToProcess.every(item => Number(item?.paleta) > 0);
      const shouldGroupByDestino = despachoPorDestino && isIndividualPalletMode;
      
      const grouped = itemsToProcess.reduce((acc:any, item:any) => {
          if (!item?.descripcion?.trim()) return acc;
          const key = shouldGroupByDestino ? `${item.destino}|${item.descripcion}` : item.descripcion;

          if (!acc[key]) {
              const summaryItem = form.getValues('summary')?.find((s: any) => (s.destino ? `${s.destino}|${s.descripcion}` : s.descripcion) === key);
              acc[key] = {
                  descripcion: item.descripcion,
                  destino: item.destino,
                  items: [],
                  temperatura: summaryItem?.temperatura,
              };
          }
          acc[key].items.push(item);
          return acc;
      }, {} as Record<string, { descripcion: string; destino?: string, items: any[], temperatura: any }>);
      
      return Object.values(grouped).map((group:any) => {
          let totalPeso = 0;
          let totalCantidad = 0;
          let totalPaletas = 0;
          let pallets999Count = 0;
          const uniquePallets = new Set<number>();
          let totalPaletasCompletas = 0;
          let totalPaletasPicking = 0;

          if (isSummaryMode) {
              group.items.forEach((item:any) => {
                  totalPeso += Number(item.totalPesoNeto) || 0;
                  totalCantidad += Number(item.totalCantidad) || 0;
                  totalPaletasCompletas += (Number(item.paletasCompletas) || 0);
                  totalPaletasPicking += (Number(item.paletasPicking) || 0);
              });
              totalPaletas = totalPaletasCompletas + totalPaletasPicking;
          } else {
              group.items.forEach((item:any) => {
                  totalPeso += Number(item.pesoNeto) || 0;
                  totalCantidad += Number(item.cantidadPorPaleta) || 0;
                  const paletaNum = Number(item.paleta);
                  if (!isNaN(paletaNum) && paletaNum > 0) {
                    if (paletaNum === 999) {
                        pallets999Count++;
                    } else if (!item.esPicking) {
                        uniquePallets.add(paletaNum);
                    }
                  }
              });
              totalPaletas = uniquePallets.size + pallets999Count;
          }
          return { ...group, totalPeso, totalCantidad, totalPaletas, totalPaletasCompletas, totalPaletasPicking };
      });
  }, [despachoPorDestino, allDestinos, allItems, isSummaryMode, form]);

  const totalGeneralPeso = useMemo(() => calculatedSummary.reduce((acc, p) => acc + p.totalPeso, 0), [calculatedSummary]);
  const totalGeneralCantidad = useMemo(() => calculatedSummary.reduce((acc, p) => acc + p.totalCantidad, 0), [calculatedSummary]);
  const totalGeneralPaletasCompletas = useMemo(() => calculatedSummary.reduce((acc, p) => acc + p.totalPaletasCompletas, 0), [calculatedSummary]);
  const totalGeneralPaletasPicking = useMemo(() => calculatedSummary.reduce((acc, p) => acc + p.totalPaletasPicking, 0), [calculatedSummary]);
  
  const totalGeneralPaletas = useMemo(() => {
    if (isSummaryMode) {
        return totalGeneralPaletasCompletas + totalGeneralPaletasPicking;
    }
    const itemsToProcess = despachoPorDestino ? (allDestinos || []).flatMap(d => d.items) : (allItems || []);
    const uniquePallets = new Set<number>();
    let count999 = 0;
    itemsToProcess.forEach((i: any) => {
        const pNum = Number(i.paleta);
        if (!isNaN(pNum) && pNum > 0) {
            if (pNum === 999) {
                count999++;
            } else if (!i.esPicking) { // Solo contar las paletas completas
                uniquePallets.add(pNum);
            }
        }
    });
    return uniquePallets.size + count999;
  }, [calculatedSummary, despachoPorDestino, allDestinos, allItems, isSummaryMode, form, totalGeneralPaletasCompletas, totalGeneralPaletasPicking]);

  useEffect(() => {
    const currentSummaryInForm = form.getValues('summary') || [];
    const newSummaryState = calculatedSummary.map(newItem => {
        const existingItem = currentSummaryInForm.find(oldItem => oldItem.descripcion === newItem.descripcion && oldItem.destino === newItem.destino);
        return {
            ...newItem,
            temperatura: existingItem?.temperatura,
        };
    });

    if (JSON.stringify(newSummaryState) !== JSON.stringify(currentSummaryInForm)) {
        form.setValue('summary', newSummaryState, { shouldValidate: false });
    }
  }, [calculatedSummary, form]);

  const showSummary = (despachoPorDestino ? allDestinos : allItems)?.some(item => item && (item.descripcion || item.nombreDestino) && (item.descripcion?.trim() !== '' || item.nombreDestino?.trim() !== ''));

  useEffect(() => {
    const fetchInitialData = async () => {
      const [clientList, obsList, userList] = await Promise.all([
        getClients(),
        getStandardObservations(),
        isAdmin ? getUsersList() : Promise.resolve([]),
      ]);
      setClientes(clientList);
      setStandardObservations(obsList);
      if (isAdmin) {
          setAllUsers(userList);
      }
    };
    fetchInitialData();

    if (!submissionId) {
        form.reset(originalDefaultValues);
    }
    window.scrollTo(0, 0);
  }, [submissionId, form, isAdmin, operation]);
  
  useEffect(() => {
    const loadSubmissionData = async () => {
      if (!submissionId) {
        setIsLoadingForm(false);
        return;
      }
      setIsLoadingForm(true);
      try {
        const submission = await getSubmissionById(submissionId);
        if (submission) {
          setOriginalSubmission(submission);
          let formData = submission.formData;
          
          const sanitizedFormData = {
              ...originalDefaultValues,
              ...formData,
              observaciones: formData.observaciones ?? [],
              setPoint: formData.setPoint ?? null,
              aplicaCuadrilla: formData.aplicaCuadrilla ?? undefined,
              tipoPedido: formData.tipoPedido ?? undefined,
              operarioResponsable: submission.userId,
              unidadDeMedidaPrincipal: formData.unidadDeMedidaPrincipal ?? 'PALETA',
              despachoPorDestino: formData.despachoPorDestino ?? false,
              totalPaletasDespacho: formData.totalPaletasDespacho,
              summary: (formData.summary || []).map((s: any) => ({...s, temperatura: s.temperatura ?? null})),
          };

          if (sanitizedFormData.fecha && typeof sanitizedFormData.fecha === 'string') {
            sanitizedFormData.fecha = new Date(sanitizedFormData.fecha);
          }
          
          form.reset(sanitizedFormData);
          setAttachments(submission.attachmentUrls);

          if (sanitizedFormData.cliente) {
            setIsLoadingArticulos(true);
            const fetchedArticulos = await getArticulosByClients([sanitizedFormData.cliente]);
            setArticulos(fetchedArticulos);
            setIsLoadingArticulos(false);
          }
        } else {
          toast({ variant: 'destructive', title: 'Error', description: 'No se encontró el formulario para editar.' });
          router.push('/consultar-formatos');
        }
      } catch (error) {
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo cargar el formulario.' });
      } finally {
        setIsLoadingForm(false);
      }
    };
    loadSubmissionData();
  }, [submissionId, form, router, toast]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
        const files = Array.from(event.target.files);
        const imageFiles = files.filter(file => file.type.startsWith('image/'));
        
        if (imageFiles.length === 0) return;

        if (imageFiles.length !== files.length) {
            toast({
                variant: "destructive",
                title: "Archivos no válidos",
                description: "Por favor, seleccione solo archivos de imagen.",
            });
        }
        
        if (attachments.length + imageFiles.length > MAX_ATTACHMENTS) {
            toast({
                variant: "destructive",
                title: "Límite de archivos excedido",
                description: `No puede adjuntar más de ${MAX_ATTACHMENTS} archivos.`,
            });
            return;
        }

        const processingToast = toast({
            title: "Optimizando imágenes...",
            description: `Procesando ${imageFiles.length} imagen(es). Por favor espere.`,
        });

        try {
            const optimizedImages = await Promise.all(imageFiles.map(file => {
                return new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        optimizeImage(reader.result as string)
                            .then(resolve)
                            .catch(reject);
                    };
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });
            }));
            
            const newImagesSize = optimizedImages.reduce((sum, base64) => sum + getByteSizeFromBase64(base64.split(',')[1]), 0);
            const existingImagesSize = attachments
                .filter(a => a.startsWith('data:image'))
                .reduce((sum, base64) => sum + getByteSizeFromBase64(base64.split(',')[1]), 0);

            if (existingImagesSize + newImagesSize > MAX_TOTAL_SIZE_BYTES) {
                 toast({
                    variant: "destructive",
                    title: "Límite de tamaño excedido",
                    description: `El tamaño total de los adjuntos no puede superar los ${MAX_TOTAL_SIZE_BYTES / 1024 / 1024} MB.`,
                });
                return;
            }

            setAttachments(prev => [...prev, ...optimizedImages]);
        } catch (error) {
            console.error("Image optimization error:", error);
            toast({
                variant: "destructive",
                title: "Error de optimización",
                description: "No se pudo optimizar una o más imágenes.",
            });
        } finally {
            processingToast.dismiss();
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        }
    }
  };

  const handleRemoveAttachment = (indexToRemove: number) => {
      setAttachments(prev => prev.filter((_, index) => index !== indexToRemove));
  };
  
  const handleRemoveAllAttachments = () => {
    setAttachments([]);
    setDeleteAllAlertOpen(false);
  };

  const handleOpenCamera = async () => {
      setIsCameraOpen(true);
  };
  
  const handleCapture = async () => {
    if (attachments.length >= MAX_ATTACHMENTS) {
        toast({
            variant: "destructive",
            title: "Límite de archivos excedido",
            description: `No puede adjuntar más de ${MAX_ATTACHMENTS} archivos.`,
        });
        handleCloseCamera();
        return;
    }

    if (videoRef.current && canvasRef.current) {
        const video = videoRef.current;
        const canvas = canvasRef.current;

        if (video.videoWidth === 0 || video.videoHeight === 0) {
            toast({
                variant: 'destructive',
                title: 'Error de Cámara',
                description: 'No se pudo obtener la imagen de la cámara. Por favor, intente de nuevo.',
            });
            handleCloseCamera();
            return;
        }

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext('2d');
        if (context) {
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg');
            
            handleCloseCamera(); // Close camera UI immediately

            const processingToast = toast({
              title: "Optimizando imagen...",
              description: "Por favor espere un momento.",
            });
          
            try {
                const optimizedImage = await optimizeImage(dataUrl);

                const newImageSize = getByteSizeFromBase64(optimizedImage.split(',')[1]);
                const existingImagesSize = attachments
                    .filter(a => a.startsWith('data:image'))
                    .reduce((sum, base64) => sum + getByteSizeFromBase64(base64.split(',')[1]), 0);

                if (existingImagesSize + newImageSize > MAX_TOTAL_SIZE_BYTES) {
                    toast({
                        variant: "destructive",
                        title: "Límite de tamaño excedido",
                        description: `El tamaño total de los adjuntos no puede superar los ${MAX_TOTAL_SIZE_BYTES / 1024 / 1024} MB.`,
                    });
                    return;
                }

                setAttachments(prev => [...prev, ...optimizedImage]);
            } catch (error) {
                 console.error("Image optimization error:", error);
                 toast({
                    variant: "destructive",
                    title: "Error de optimización",
                    description: "No se pudo optimizar la imagen capturada.",
                 });
            } finally {
                processingToast.dismiss();
            }
        } else {
          // Make sure camera is closed even if context is not available
          handleCloseCamera();
        }
    }
  };

  const handleCloseCamera = () => {
      if (videoRef.current && videoRef.current.srcObject) {
          const stream = videoRef.current.srcObject as MediaStream;
          stream.getTracks().forEach(track => track.stop());
          videoRef.current.srcObject = null;
      }
      setIsCameraOpen(false);
  };

  useEffect(() => {
    let stream: MediaStream;
    const enableCamera = async () => {
        if (isCameraOpen) {
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                const rearCameraConstraints = { video: { facingMode: { exact: "environment" } } };
                const anyCameraConstraints = { video: true };
                try {
                    stream = await navigator.mediaDevices.getUserMedia(rearCameraConstraints);
                    if (videoRef.current) {
                        videoRef.current.srcObject = stream;
                    }
                } catch (err) {
                    console.warn("Rear camera not available, trying any camera.", err);
                    try {
                       stream = await navigator.mediaDevices.getUserMedia(anyCameraConstraints);
                        if (videoRef.current) {
                            videoRef.current.srcObject = stream;
                        }
                    } catch (finalErr) {
                         console.error("Error accessing camera: ", finalErr);
                        toast({
                            variant: 'destructive',
                            title: 'Acceso a la cámara denegado',
                            description: 'Por favor, habilite los permisos de la cámara en la configuración de su navegador.',
                        });
                        setIsCameraOpen(false);
                    }
                }
            } else {
                toast({
                    variant: 'destructive',
                    title: 'Cámara no disponible',
                    description: 'Su navegador no soporta el acceso a la cámara.',
                });
                setIsCameraOpen(false);
            }
        }
    };
    enableCamera();
    return () => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }
    }
  }, [isCameraOpen, toast]);

  async function onSubmit(data: FormValues) {
    if (!user || !storage) {
        toast({ variant: "destructive", title: "Error", description: "Debe iniciar sesión para guardar el formato." });
        return;
    }

    setIsSubmitting(true);
    try {
        
        const finalSummary = (data.summary || []).map(item => {
            const { paletas, ...rest } = item as any;
            return rest;
        });

        let dataToSave = { ...data, summary: finalSummary };

        const newAttachmentsBase64 = attachments.filter(a => a.startsWith('data:image'));
        const existingAttachmentUrls = attachments.filter(a => a.startsWith('http'));

        const uploadedUrls = await Promise.all(
            newAttachmentsBase64.map(async (base64) => {
                const fileName = `submission-${Date.now()}-${Math.random().toString(36).substring(2)}.jpg`;
                const storageRef = ref(storage, `attachments/${user.uid}/${fileName}`);
                const base64String = base64.split(',')[1];
                const snapshot = await uploadString(storageRef, base64String, 'base64', { contentType: 'image/jpeg' });
                return getDownloadURL(snapshot.ref);
            })
        );
        
        const finalAttachmentUrls = [...existingAttachmentUrls, ...uploadedUrls];
        const isUpdating = !!submissionId;
        const editor = { id: user.uid, displayName: displayName || 'N/A' };
        
        let responsibleUser = { id: editor.id, displayName: editor.displayName };
        if (isUpdating && isAdmin && data.operarioResponsable) {
            const selectedUser = allUsers.find(u => u.uid === data.operarioResponsable);
            if (selectedUser) {
                responsibleUser = { id: selectedUser.uid, displayName: selectedUser.displayName };
            }
        } else if (isUpdating && originalSubmission) {
            responsibleUser = { id: originalSubmission.userId, displayName: originalSubmission.userDisplayName };
        }

        const result = await saveForm({
            formData: dataToSave,
            formType: `variable-weight-despacho`,
            attachmentUrls: finalAttachmentUrls,
            responsibleUser: responsibleUser,
            editor: editor,
            createdAt: originalSubmission?.createdAt,
        }, submissionId ?? undefined);

        if (result.success) {
            toast({ title: "Formulario Guardado", description: `El despacho de peso variable ha sido ${submissionId ? 'actualizado' : 'guardado'}.` });
            await clearDraft(!!submissionId);
            router.push('/');
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        console.error("Submission error:", error);
        const errorMessage = error instanceof Error ? error.message : "No se pudo guardar el formulario.";
        toast({ variant: "destructive", title: "Error al Enviar", description: errorMessage });
    } finally {
        setIsSubmitting(false);
    }
  }
  
  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    form.handleSubmit((data) => {
        const allItems = data.despachoPorDestino ? data.destinos.flatMap(d => d.items) : data.items;
        const hasSummaryRow = allItems.some(item => Number(item.paleta) === 0);
        const hasDetailRow = allItems.some(item => Number(item.paleta) > 0);

        if (hasSummaryRow && hasDetailRow) {
            setMixErrorDialogOpen(true);
            return;
        }
        
        onSubmit(data);
    }, (errors) => {
        console.log("Validation Errors:", errors);
        toast({
            variant: "destructive",
            title: "Error de Validación",
            description: "Por favor, revise los campos marcados en rojo.",
        });
    })(e);
  };
  
  const handleClientSelection = async (clientName: string) => {
    setClientDialogOpen(false);
    setClientSearch('');
    await handleClientChange(clientName);
  };

  const handleProductDialogOpening = async (context: { itemIndex: number, destinoIndex?: number }) => {
      setProductDialogContext(context);
      const clientName = form.getValues('cliente');
      if (!clientName) {
          toast({ variant: 'destructive', title: 'Error', description: 'Por favor, seleccione un cliente primero.' });
          return;
      }
      setIsLoadingArticulos(true);
      setProductDialogOpen(true);
      try {
          const fetchedArticulos = await getArticulosByClients([clientName]);
          setArticulos(fetchedArticulos);
      } catch (error) {
          toast({ variant: "destructive", title: "Error", description: "No se pudieron cargar los productos." });
          setProductDialogOpen(false);
      } finally {
          setIsLoadingArticulos(false);
      }
  };

  const handleObservationDialogOpening = (index: number) => {
    setObservationDialogIndex(index);
    setObservationDialogOpen(true);
  };
  
  const handleCaptureTime = (fieldName: 'horaInicio' | 'horaFin') => {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    form.setValue(fieldName, `${hours}:${minutes}`, { shouldValidate: true });
  };
  
  const title = `${submissionId ? 'Editando' : 'Formato de'} Despacho - Peso Variable`;

  const handleAddItem = () => {
    const items = form.getValues('items');
    const lastItem = items.length > 0 ? items[items.length - 1] : null;

    if (!lastItem) {
        append({ ...originalDefaultValues.items![0] });
        return;
    }
    
    if (lastItem.paleta === 0) {
        append({
            ...originalDefaultValues.items![0],
            codigo: lastItem.codigo,
            paleta: 0,
            descripcion: lastItem.descripcion,
            lote: lastItem.lote,
            presentacion: lastItem.presentacion,
        });
    } else {
        append({
            ...originalDefaultValues.items![0],
            codigo: lastItem.codigo,
            descripcion: lastItem.descripcion,
            lote: lastItem.lote,
            presentacion: lastItem.presentacion,
            cantidadPorPaleta: lastItem.cantidadPorPaleta,
            taraCaja: lastItem.taraCaja,
            paleta: null,
            pesoBruto: null,
            taraEstiba: null,
            totalTaraCaja: null,
            pesoNeto: null,
            totalCantidad: null,
            paletasCompletas: 0,
            paletasPicking: 0,
            totalPesoNeto: null,
            esPicking: false,
        });
    }
  };
  
  if (isLoadingForm) {
      return (
          <div className="flex min-h-screen w-full items-center justify-center">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="ml-4 text-lg">Cargando formulario...</p>
          </div>
      );
  }

  return (
    <FormProvider {...form}>
      <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8 relative">
        <RestoreDialog
            open={isRestoreDialogOpen}
            onOpenChange={onOpenChange}
            onRestore={onRestore}
            onDiscard={handleDiscard}
        />
        {ClientChangeDialog}
        {VerifyingClientSpinner}
        <ProductSelectorDialog
            open={isProductDialogOpen}
            onOpenChange={setProductDialogOpen}
            articulos={articulos}
            isLoading={isLoadingArticulos}
            clientSelected={!!form.getValues('cliente')}
            onSelect={(articulo) => {
                if (productDialogContext) {
                    const { itemIndex, destinoIndex } = productDialogContext;
                    const basePath = despachoPorDestino && destinoIndex !== undefined ? `destinos.${destinoIndex}.items` : 'items';
                    form.setValue(`${basePath}.${itemIndex}.descripcion`, articulo.denominacionArticulo);
                    form.setValue(`${basePath}.${itemIndex}.codigo`, articulo.codigoProducto);
                    form.setValue(`${basePath}.${itemIndex}.sesion`, articulo.sesion);
                }
            }}
        />
        <ObservationSelectorDialog
            open={isObservationDialogOpen}
            onOpenChange={setObservationDialogOpen}
            standardObservations={standardObservations}
            onSelect={(obs) => {
                if (observationDialogIndex !== null) {
                    form.setValue(`observaciones.${observationDialogIndex}.type`, obs.name);
                    form.setValue(`observaciones.${observationDialogIndex}.quantityType`, obs.quantityType);
                }
            }}
        />
         <PedidoTypeSelectorDialog
          open={isPedidoTypeDialogOpen}
          onOpenChange={setPedidoTypeDialogOpen}
          pedidoTypes={pedidoTypes}
          onSelect={(pt) => {
              form.setValue('tipoPedido', pt.name);
              setPedidoTypeDialogOpen(false);
          }}
        />
        <div className="max-w-6xl mx-auto">
          <header className="mb-6 md:mb-8">
            <div className="relative flex items-center justify-center text-center">
              <Button variant="ghost" size="icon" className="absolute left-0 top-1/2 -translate-y-1/2" onClick={() => router.push(submissionId ? '/consultar-formatos' : '/')}>
                <ArrowLeft className="h-6 w-6" />
              </Button>
              <div>
                <div className="flex items-center justify-center gap-2">
                    <FileText className="h-7 w-7 md:h-8 md:w-8 text-primary"/>
                    <h1 className="text-xl md:text-2xl font-bold text-primary">{title}</h1>
                </div>
                <p className="text-xs md:text-sm text-gray-500">Complete todos los campos requeridos para registrar la operación.</p>
              </div>
            </div>
          </header>

          <Form {...form}>
            <form onSubmit={handleFormSubmit} className="space-y-6">
                <FormField
                  control={form.control}
                  name="unidadDeMedidaPrincipal"
                  render={({ field }) => <input type="hidden" {...field} />}
                />
                <Card>
                  <CardHeader>
                      <CardTitle>Información General</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                       <FormField
                            control={form.control}
                            name="tipoPedido"
                            render={({ field }) => (
                                <FormItem className="flex flex-col">
                                    <FormLabel>Tipo de Pedido <span className="text-destructive">*</span></FormLabel>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="w-full justify-between text-left font-normal"
                                        onClick={() => setPedidoTypeDialogOpen(true)}
                                    >
                                        {field.value || "Seleccione un tipo..."}
                                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField control={form.control} name="pedidoSislog" render={({ field }) => (
                            <FormItem>
                              <FormLabel>Pedido SISLOG <span className="text-destructive">*</span></FormLabel>
                              <FormControl><Input placeholder="Máximo 15 caracteres" {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                        )}/>
                        <FormField
                          control={form.control}
                          name="cliente"
                          render={({ field }) => (
                              <FormItem className="flex flex-col">
                                  <FormLabel>Cliente <span className="text-destructive">*</span></FormLabel>
                                  <Dialog open={isClientDialogOpen} onOpenChange={(isOpen) => {
                                      if (isVerifying) return;
                                      if (!isOpen) setClientSearch('');
                                      setClientDialogOpen(isOpen);
                                  }}>
                                      <DialogTrigger asChild>
                                          <Button
                                              variant="outline"
                                              className="w-full justify-between text-left font-normal"
                                              disabled={isClientChangeDisabled}
                                          >
                                              {field.value || "Seleccione un cliente..."}
                                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                          </Button>
                                      </DialogTrigger>
                                      <DialogContent className="sm:max-w-[425px]">
                                          <DialogHeader>
                                              <DialogTitle>Seleccionar Cliente</DialogTitle>
                                              <DialogDescription>Busque y seleccione un cliente de la lista. Esto cargará los productos asociados.</DialogDescription>
                                          </DialogHeader>
                                          <div className="p-4">
                                              <Input
                                                  placeholder="Buscar cliente..."
                                                  value={clientSearch}
                                                  onChange={(e) => setClientSearch(e.target.value)}
                                                  className="mb-4"
                                              />
                                              <ScrollArea className="h-72">
                                                  <div className="space-y-1">
                                                      {filteredClients.map((cliente) => (
                                                          <Button
                                                              key={cliente.id}
                                                              variant="ghost"
                                                              className="w-full justify-start"
                                                              onClick={() => handleClientSelection(cliente.razonSocial)}
                                                          >
                                                              {cliente.razonSocial}
                                                          </Button>
                                                      ))}
                                                      {filteredClients.length === 0 && <p className="text-center text-sm text-muted-foreground">No se encontraron clientes.</p>}
                                                  </div>
                                              </ScrollArea>
                                          </div>
                                      </DialogContent>
                                  </Dialog>
                                    {isClientChangeDisabled && !isAuthorizedEditor && (
                                      <FormDescription>
                                        Para cambiar de cliente, elimine todos los ítems.
                                      </FormDescription>
                                    )}
                                  <FormMessage />
                              </FormItem>
                          )}
                          />
                        <FormField
                          control={form.control}
                          name="fecha"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Fecha <span className="text-destructive">*</span></FormLabel>
                              {isAuthorizedEditor ? (
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <FormControl>
                                      <Button
                                        variant={"outline"}
                                        className={cn(
                                          "w-full pl-3 text-left font-normal",
                                          !field.value && "text-muted-foreground"
                                        )}
                                      >
                                        {field.value ? (
                                          format(field.value, "PPP", { locale: es })
                                        ) : (
                                          <span>Seleccione una fecha</span>
                                        )}
                                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                      </Button>
                                    </FormControl>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                      mode="single"
                                      selected={field.value}
                                      onSelect={field.onChange}
                                      initialFocus
                                    />
                                  </PopoverContent>
                                </Popover>
                              ) : (
                                <FormControl>
                                  <Input
                                    disabled
                                    value={field.value ? format(field.value, "dd/MM/yyyy") : ""}
                                  />
                                </FormControl>
                              )}
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField control={form.control} name="conductor" render={({ field }) => (
                            <FormItem>
                              <FormLabel>Conductor <span className="text-destructive">*</span></FormLabel>
                              <FormControl><Input placeholder="Nombre del conductor" {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                        )}/>
                        <FormField control={form.control} name="cedulaConductor" render={({ field }) => (
                            <FormItem>
                              <FormLabel>Cédula Conductor <span className="text-destructive">*</span></FormLabel>
                              <FormControl><Input placeholder="Número de cédula" {...field} type="text" inputMode="numeric" pattern="[0-9]*" /></FormControl>
                              <FormMessage />
                            </FormItem>
                        )}/>
                        <FormField control={form.control} name="placa" render={({ field }) => (
                            <FormItem>
                              <FormLabel>Placa del vehículo <span className="text-destructive">*</span></FormLabel>
                              <FormControl><Input placeholder="ABC123" {...field} onChange={(e) => field.onChange(e.target.value.toUpperCase())} maxLength={6} /></FormControl>
                              <FormMessage />
                            </FormItem>
                        )}/>
                        <FormField control={form.control} name="precinto" render={({ field }) => (
                            <FormItem>
                              <FormLabel>Precinto <span className="text-destructive">*</span></FormLabel>
                              <FormControl><Input placeholder="Precinto (máx. 50)" {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                        )}/>
                        <FormField control={form.control} name="setPoint" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Set Point (°C)</FormLabel>
                                <FormControl><Input type="text" inputMode="decimal" placeholder="0" {...field} onChange={e => field.onChange(e.target.value === '' ? null : e.target.value)} value={field.value ?? ''} /></FormControl>
                                <FormMessage />
                            </FormItem>
                        )}/>
                        <FormField control={form.control} name="contenedor" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Contenedor <span className="text-destructive">*</span></FormLabel>
                                <FormControl><Input placeholder="ABCD1234567 o N/A" {...field} onChange={(e) => field.onChange(e.target.value.toUpperCase())} value={field.value ?? ''} /></FormControl>
                                <FormMessage />
                            </FormItem>
                        )}/>
                    </div>
                  </CardContent>
                </Card>
              
                <Card>
                  <CardHeader>
                      <CardTitle>Detalle del Despacho <span className="text-destructive">*</span></CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                     {clientesEspeciales.includes(watchedCliente) && (
                        <div className="space-y-4">
                            <FormField
                                control={form.control}
                                name="despachoPorDestino"
                                render={({ field }) => (
                                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                    <div className="space-y-0.5">
                                    <FormLabel className="text-base">Pedido por Destino</FormLabel>
                                    <FormDescription>
                                        Marque esta opción para agrupar ítems por destinos de entrega.
                                    </FormDescription>
                                    </div>
                                    <FormControl>
                                    <Checkbox
                                        checked={field.value}
                                        onCheckedChange={(checked) => {
                                            field.onChange(checked)
                                            if (checked) form.setValue('items', []); else form.setValue('destinos', []);
                                        }}
                                    />
                                    </FormControl>
                                </FormItem>
                                )}
                            />
                            {despachoPorDestino && isSummaryMode && (
                                <FormField
                                    control={form.control}
                                    name="totalPaletasDespacho"
                                    render={({ field }) => (
                                        <FormItem className="max-w-xs">
                                            <FormLabel>Total Paletas Despacho <span className="text-destructive">*</span></FormLabel>
                                            <FormControl><Input type="text" inputMode="numeric" min="1" placeholder="0" {...field} onChange={e => field.onChange(e.target.value === '' ? null : e.target.value)} value={field.value ?? ''} /></FormControl>
                                            <FormDescription>Total de paletas para el despacho completo.</FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            )}
                        </div>
                     )}
                     {despachoPorDestino ? (
                        <div className="space-y-4">
                            {destinoFields.map((destino, destinoIndex) => (
                                <div key={destino.id} className="p-4 border rounded-lg bg-gray-50/50">
                                    <div className="flex justify-between items-center mb-4">
                                        <h3 className="text-lg font-semibold text-primary flex items-center gap-2">
                                            <MapPin className="h-5 w-5" />
                                            Destino #{destinoIndex + 1}
                                        </h3>
                                        <Button type="button" variant="destructive" size="sm" onClick={() => removeDestino(destinoIndex)}>
                                            <Trash2 className="mr-2 h-4 w-4" /> Eliminar Destino
                                        </Button>
                                    </div>
                                    <FormField
                                        control={form.control}
                                        name={`destinos.${destinoIndex}.nombreDestino`}
                                        render={({ field }) => (
                                            <FormItem className="mb-4">
                                                <FormLabel>Nombre del Destino</FormLabel>
                                                <FormControl><Input placeholder="Ej: BOGOTÁ, CALI" {...field} onChange={(e) => field.onChange(e.target.value.toUpperCase())} /></FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <ItemsPorDestino control={form.control} remove={remove} handleProductDialogOpening={handleProductDialogOpening} destinoIndex={destinoIndex} />
                                </div>
                            ))}
                            <Button type="button" variant="secondary" onClick={() => appendDestino({ nombreDestino: '', items: [] })}><MapPin className="mr-2 h-4 w-4" />Agregar Destino</Button>
                        </div>
                     ) : (
                        <div className="space-y-4">
                            {fields.map((field, index) => (
                                <ItemFields key={field.id} control={form.control} itemIndex={index} handleProductDialogOpening={handleProductDialogOpening} remove={remove} />
                            ))}
                            <Button type="button" variant="outline" onClick={handleAddItem}><PlusCircle className="mr-2 h-4 w-4" />Agregar Ítem</Button>
                        </div>
                     )}
                  </CardContent>
                </Card>

                 {showSummary && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Resumen Agrupado de Productos</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="rounded-md border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            {despachoPorDestino && !isSummaryMode && <TableHead>Destino</TableHead>}
                                            <TableHead>Descripción del Producto</TableHead>
                                            <TableHead className="w-[120px]">Temp. (°C) <span className="text-destructive">*</span></TableHead>
                                            <TableHead className="text-right">Total Cantidad</TableHead>
                                            {isSummaryMode ? (
                                                <>
                                                    <TableHead className="text-right">Pal. Completas</TableHead>
                                                    <TableHead className="text-right">Pal. Picking</TableHead>
                                                </>
                                            ) : (
                                                <TableHead className="text-right">Total Paletas</TableHead>
                                            )}
                                            <TableHead className="text-right">Total Peso (kg)</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {calculatedSummary.map((summaryItem, index) => {
                                            const summaryIndex = (form.getValues('summary') || []).findIndex(s => s.descripcion === summaryItem.descripcion && s.destino === summaryItem.destino);
                                            return(
                                            <TableRow key={index}>
                                                {despachoPorDestino && !isSummaryMode && <TableCell>{summaryItem.destino}</TableCell>}
                                                <TableCell className="font-medium">{summaryItem.descripcion}</TableCell>
                                                <TableCell>
                                                    <FormField
                                                        control={form.control}
                                                        name={`summary.${summaryIndex}.temperatura`}
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormControl>
                                                                    <Input type="text" inputMode="decimal" placeholder="Temp." {...field} onChange={e => field.onChange(e.target.value === '' ? null : e.target.value)} value={field.value ?? ''} className="w-20 text-center" />
                                                                </FormControl>
                                                                <FormMessage className="text-xs" />
                                                            </FormItem>
                                                        )}
                                                    />
                                                </TableCell>
                                                <TableCell className="text-right">{summaryItem.totalCantidad}</TableCell>
                                                {isSummaryMode ? (
                                                    <>
                                                        <TableCell className="text-right">{summaryItem.totalPaletasCompletas}</TableCell>
                                                        <TableCell className="text-right">{summaryItem.totalPaletasPicking}</TableCell>
                                                    </>
                                                ) : (
                                                    <TableCell className="text-right">{summaryItem.totalPaletas}</TableCell>
                                                )}
                                                <TableCell className="text-right">{summaryItem.totalPeso.toFixed(2)}</TableCell>
                                            </TableRow>
                                        )})}
                                        <TableRow className="font-bold bg-primary/10 text-primary">
                                            <TableCell colSpan={despachoPorDestino && !isSummaryMode ? 2 : 1} className="text-right text-lg">TOTAL GENERAL:</TableCell>
                                            <TableCell></TableCell>
                                            <TableCell className="text-right text-lg">{totalGeneralCantidad}</TableCell>
                                             {isSummaryMode ? (
                                                    <>
                                                        <TableCell className="text-right text-lg">{totalGeneralPaletasCompletas}</TableCell>
                                                        <TableCell className="text-right text-lg">{totalGeneralPaletasPicking}</TableCell>
                                                    </>
                                                ) : (
                                                    <TableCell className="text-right text-lg">{totalGeneralPaletas}</TableCell>
                                                )}
                                            <TableCell className="text-right text-lg">{totalGeneralPeso.toFixed(2)}</TableCell>
                                        </TableRow>
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                )}
              
                <Card>
                  <CardHeader><CardTitle>Tiempo y Observaciones de la Operación</CardTitle></CardHeader>
                  <CardContent className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <FormField control={form.control} name="horaInicio" render={({ field }) => (
                          <FormItem>
                              <FormLabel>Hora Inicio <span className="text-destructive">*</span></FormLabel>
                               <div className="flex items-center gap-2">
                                <FormControl>
                                    <Input type="time" placeholder="HH:MM" {...field} className="flex-grow" />
                                </FormControl>
                                <Button type="button" variant="outline" size="icon" onClick={() => handleCaptureTime('horaInicio')}>
                                    <Clock className="h-4 w-4" />
                                </Button>
                              </div>
                              <FormMessage />
                          </FormItem>
                          )}/>
                          <FormField control={form.control} name="horaFin" render={({ field }) => (
                          <FormItem>
                              <FormLabel>Hora Fin <span className="text-destructive">*</span></FormLabel>
                              <div className="flex items-center gap-2">
                                <FormControl>
                                    <Input type="time" placeholder="HH:MM" {...field} className="flex-grow" />
                                </FormControl>
                                 <Button type="button" variant="outline" size="icon" onClick={() => handleCaptureTime('horaFin')}>
                                    <Clock className="h-4 w-4" />
                                </Button>
                              </div>
                              <FormMessage />
                          </FormItem>
                          )}/>
                      </div>
                       <div>
                        <Label>Observaciones</Label>
                        <div className="space-y-4 mt-2">
                            {observationFields.map((field, index) => {
                                const selectedObservation = form.watch(`observaciones.${index}`);
                                const stdObsData = standardObservations.find(obs => obs.name === selectedObservation?.type);
                                const isOtherType = selectedObservation?.type === 'OTRAS OBSERVACIONES';
                                const showCrewCheckbox = selectedObservation?.type === 'REESTIBADO' || selectedObservation?.type === 'TRANSBORDO CANASTILLA';
                                
                                return (
                                <div key={field.id} className="p-4 border rounded-lg relative bg-white space-y-4">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="absolute top-2 right-2 text-destructive hover:bg-destructive/10"
                                        onClick={() => removeObservation(index)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                                        <FormField
                                            control={form.control}
                                            name={`observaciones.${index}.type`}
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Tipo de Observación</FormLabel>
                                                     <Button
                                                        type="button"
                                                        variant="outline"
                                                        className="w-full justify-between text-left font-normal h-10"
                                                        onClick={() => handleObservationDialogOpening(index)}
                                                        >
                                                        <span className="truncate">{field.value || "Seleccionar observación..."}</span>
                                                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                    </Button>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        {isOtherType ? (
                                            <FormField
                                                control={form.control}
                                                name={`observaciones.${index}.customType`}
                                                render={({ field }) => (
                                                    <FormItem className="lg:col-span-3">
                                                        <FormLabel>Descripción</FormLabel>
                                                        <FormControl>
                                                            <Textarea placeholder="Describa la observación" {...field} onChange={(e) => field.onChange(e.target.value.toUpperCase())} />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                        ) : (
                                        <>
                                            <FormField
                                                control={form.control}
                                                name={`observaciones.${index}.quantity`}
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Cantidad ({stdObsData?.quantityType || 'N/A'})</FormLabel>
                                                        <FormControl>
                                                            <Input type="number" placeholder="0" {...field} />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                            {showCrewCheckbox && (
                                                <FormField
                                                    control={form.control}
                                                    name={`observaciones.${index}.executedByGrupoRosales`}
                                                    render={({ field }) => (
                                                        <FormItem className="flex flex-row items-end space-x-2 pb-2">
                                                            <FormControl>
                                                                <Checkbox
                                                                    checked={field.value}
                                                                    onCheckedChange={field.onChange}
                                                                />
                                                            </FormControl>
                                                            <div className="space-y-1 leading-none">
                                                                <Label htmlFor={`obs-check-${index}`} className="font-normal cursor-pointer uppercase">
                                                                    REALIZADO POR CUADRILLA
                                                                </Label>
                                                            </div>
                                                        </FormItem>
                                                    )}
                                                />
                                            )}
                                        </>
                                        )}
                                    </div>
                                </div>
                            )})}
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => appendObservation({ type: '', quantity: 0, executedByGrupoRosales: false, customType: '', quantityType: '' })}
                                className="mt-4"
                            >
                                <PlusCircle className="mr-2 h-4 w-4" />
                                Agregar Observación
                            </Button>
                        </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle>Responsables de la Operación</CardTitle></CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-center">
                        <FormField control={form.control} name="coordinador" render={({ field }) => (
                            <FormItem><FormLabel>Coordinador Responsable <span className="text-destructive">*</span></FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Seleccione un coordinador" /></SelectTrigger></FormControl><SelectContent>{coordinadores.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                        )}/>
                        {submissionId && isAdmin ? (
                             <FormField control={form.control} name="operarioResponsable" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Operario Responsable</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value} defaultValue={originalSubmission?.userId}>
                                        <FormControl><SelectTrigger><SelectValue placeholder="Seleccione un operario" /></SelectTrigger></FormControl>
                                        <SelectContent>
                                            {allUsers.map(u => <SelectItem key={u.uid} value={u.uid}>{u.displayName}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}/>
                        ) : (
                            <FormItem>
                                <FormLabel>Operario Responsable</FormLabel>
                                <FormControl><Input disabled value={submissionId ? originalSubmission?.userDisplayName : displayName || ''} /></FormControl>
                            </FormItem>
                        )}
                        <FormField
                          control={form.control}
                          name="aplicaCuadrilla"
                          render={({ field }) => (
                              <FormItem className="space-y-1">
                                  <FormLabel>Operación Realizada por Cuadrilla <span className="text-destructive">*</span></FormLabel>
                                  <FormControl><RadioGroup onValueChange={field.onChange} value={field.value} className="flex gap-4 pt-2"><FormItem className="flex items-center space-x-2"><RadioGroupItem value="si" id="cuadrilla-si" /><Label htmlFor="cuadrilla-si">Sí</Label></FormItem><FormItem className="flex items-center space-x-2"><RadioGroupItem value="no" id="cuadrilla-no" /><Label htmlFor="cuadrilla-no">No</Label></FormItem></RadioGroup></FormControl><FormMessage /></FormItem>
                          )}
                        />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle>Anexos</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div 
                              className="flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg cursor-pointer hover:bg-gray-100"
                              onClick={() => fileInputRef.current?.click()}
                          >
                              <UploadCloud className="w-10 h-10 text-gray-400 mb-2"/>
                              <p className="text-sm text-gray-600 font-semibold">Subir archivos o arrastre y suelte</p>
                              <p className="text-xs text-gray-500">Max. de 60 imágenes / 10MB Total</p>
                              <Input type="file" ref={fileInputRef} className="hidden" multiple accept="image/*" onChange={handleFileChange} />
                          </div>
                          <div 
                              className="flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg cursor-pointer hover:bg-gray-100"
                              onClick={handleOpenCamera}
                          >
                              <Camera className="w-10 h-10 text-gray-400 mb-2"/>
                              <p className="text-sm text-gray-600 font-semibold">Tomar Foto</p>
                              <p className="text-xs text-gray-500">Usar la cámara del dispositivo</p>
                          </div>
                      </div>
                      {attachments.length > 0 && (
                          <div>
                            <div className="flex justify-between items-center mb-2">
                                <h4 className="text-sm font-medium">Archivos Adjuntos ({attachments.length}/{MAX_ATTACHMENTS}):</h4>
                                <AlertDialog open={isDeleteAllAlertOpen} onOpenChange={setDeleteAllAlertOpen}>
                                    <AlertDialogTrigger asChild>
                                        <Button type="button" variant="outline" size="sm" className="text-destructive hover:text-destructive border-destructive/50 hover:bg-destructive/10">
                                            <Trash2 className="mr-2 h-3 w-3" />
                                            Eliminar Todos
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>¿Está seguro de eliminar todos los anexos?</AlertDialogTitle>
                                            <AlertDialogDesc>
                                                Esta acción no se puede deshacer. Se eliminará toda la información que ha ingresado en el formato.
                                            </AlertDialogDesc>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                            <AlertDialogAction onClick={handleRemoveAllAttachments} className="bg-destructive hover:bg-destructive/90">
                                                Eliminar Todos
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </div>
                              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                                  {attachments.map((src, index) => (
                                      <div key={index} className="relative group aspect-square">
                                          <Image src={src} alt={`Anexo ${index + 1}`} fill className="rounded-md object-cover" />
                                          <Button
                                              type="button"
                                              variant="destructive"
                                              size="icon"
                                              className="absolute top-1 right-1 h-6 w-6"
                                              onClick={() => handleRemoveAttachment(index)}
                                          >
                                              <Trash2 className="h-4 w-4" />
                                              <span className="sr-only">Eliminar imagen</span>
                                          </Button>
                                      </div>
                                  ))}
                              </div>
                          </div>
                      )}
                  </CardContent>
                </Card>
              
                <footer className="flex flex-col sm:flex-row items-center justify-end gap-4 pt-4">
                    <Button type="button" variant="outline" onClick={() => setDiscardAlertOpen(true)} className="w-full sm:w-auto"><RotateCcw className="mr-2 h-4 w-4"/>Limpiar Formato</Button>
                    <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
                        {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4"/>}
                        {isSubmitting ? 'Guardando...' : 'Guardar y Enviar'}
                    </Button>
                </footer>
            </form>
          </Form>
        </div>

        <Dialog open={isCameraOpen} onOpenChange={setIsCameraOpen}>
          <DialogContent className="max-w-3xl">
              <DialogHeader>
                  <DialogTitle>Tomar Foto</DialogTitle>
                  <DialogDescription>Apunte la cámara y capture una imagen para adjuntarla al formulario.</DialogDescription>
              </DialogHeader>
              <div className="relative">
                  <video ref={videoRef} className="w-full aspect-video rounded-md bg-black" autoPlay muted playsInline />
                  <canvas ref={canvasRef} className="hidden"></canvas>
              </div>
              <DialogFooter>
                  <Button variant="outline" onClick={handleCloseCamera}>Cancelar</Button>
                  <Button onClick={handleCapture}>
                      <Camera className="mr-2 h-4 w-4"/>
                      Capturar y Adjuntar
                  </Button>
              </DialogFooter>
          </DialogContent>
        </Dialog>
        
        <AlertDialog open={isDiscardAlertOpen} onOpenChange={setDiscardAlertOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>¿Está seguro que desea limpiar el formato?</AlertDialogTitle>
                    <AlertDialogDesc>
                        Esta acción no se puede deshacer. Se eliminará toda la información que ha ingresado en el formato.
                    </AlertDialogDesc>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDiscard} className="bg-destructive hover:bg-destructive/90">Limpiar Formato</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
         <AlertDialog open={isMixErrorDialogOpen} onOpenChange={setMixErrorDialogOpen}>
            <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Error de Validación</AlertDialogTitle>
                <AlertDialogDesc>
                No se pueden mezclar ítems de resumen (Paleta 0) con ítems de paletas individuales. Por favor, use solo un método.
                </AlertDialogDesc>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogAction onClick={() => setMixErrorDialogOpen(false)}>Entendido</AlertDialogAction>
            </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
      </div>
    </FormProvider>
  );
}

function ObservationSelectorDialog({
    open,
    onOpenChange,
    standardObservations,
    onSelect,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    standardObservations: StandardObservation[];
    onSelect: (observation: { name: string, quantityType?: string }) => void;
}) {
    const [search, setSearch] = useState("");

    const allObservations = useMemo(() => [
        ...standardObservations,
        { id: 'OTRAS', name: 'OTRAS OBSERVACIONES', quantityType: '' }
    ], [standardObservations]);

    const filteredObservations = useMemo(() => {
        if (!search) return allObservations;
        return allObservations.filter(obs => obs.name.toLowerCase().includes(search.toLowerCase()));
    }, [search, allObservations]);

    useEffect(() => {
        if (!open) {
            setSearch("");
        }
    }, [open]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Seleccionar Tipo de Observación</DialogTitle>
                    <DialogDescription>Busque y seleccione un tipo de la lista.</DialogDescription>
                </DialogHeader>
                <Input
                    placeholder="Buscar observación..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="my-4"
                />
                <ScrollArea className="h-72">
                    <div className="space-y-1">
                        {filteredObservations.map((obs) => (
                            <Button
                                key={obs.id}
                                variant="ghost"
                                className="w-full justify-start"
                                onClick={() => {
                                    onSelect({ name: obs.name, quantityType: obs.quantityType });
                                    onOpenChange(false);
                                }}
                            >
                                {obs.name}
                            </Button>
                        ))}
                        {filteredObservations.length === 0 && <p className="text-center text-sm text-muted-foreground">No se encontró la observación.</p>}
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
}

// Component for the product selector dialog
function ProductSelectorDialog({
    open,
    onOpenChange,
    articulos,
    isLoading,
    clientSelected,
    onSelect,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    articulos: ArticuloInfo[];
    isLoading: boolean;
    clientSelected: boolean;
    onSelect: (articulo: ArticuloInfo) => void;
}) {
    const [search, setSearch] = useState("");
    const getSessionName = (sesionCode: string | undefined) => {
        switch (sesionCode) {
            case 'CO': return 'Congelado';
            case 'RE': return 'Refrigerado';
            case 'SE': return 'Seco';
            default: return 'N/A';
        }
    }
    const filteredArticulos = useMemo(() => {
        if (!search) return articulos;
        return articulos.filter(a => a.denominacionArticulo.toLowerCase().includes(search.toLowerCase()) || a.codigoProducto.toLowerCase().includes(search.toLowerCase()));
    }, [search, articulos]);
    
    useEffect(() => {
        if (!open) {
            setSearch("");
        }
    }, [open]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Seleccionar Producto</DialogTitle>
                    <DialogDescription>Busque y seleccione un producto de la lista del cliente.</DialogDescription>
                </DialogHeader>
                {!clientSelected ? (
                    <div className="p-4 text-center text-muted-foreground">Debe escoger primero un cliente.</div>
                ) : (
                    <>
                        <Input
                            placeholder="Buscar producto por código o descripción..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="mb-4"
                        />
                        <ScrollArea className="h-72">
                            <div className="space-y-1">
                                {isLoading && <p className="text-center text-sm text-muted-foreground">Cargando...</p>}
                                {!isLoading && filteredArticulos.length === 0 && <p className="text-center text-sm text-muted-foreground">No se encontraron productos.</p>}
                                {filteredArticulos.map((p, i) => (
                                    <Button
                                        key={`${p.id}-${i}`}
                                        variant="ghost"
                                        className="w-full justify-between h-auto text-wrap"
                                        onClick={() => {
                                            onSelect(p);
                                            onOpenChange(false);
                                        }}
                                    >
                                        <div className="flex flex-col items-start text-left">
                                            <span>{p.denominacionArticulo}</span>
                                            <span className="text-xs text-muted-foreground">{p.codigoProducto}</span>
                                        </div>
                                        <Badge variant={p.sesion === 'CO' ? 'default' : p.sesion === 'RE' ? 'secondary' : 'outline' } className="shrink-0">{getSessionName(p.sesion)}</Badge>
                                    </Button>
                                ))}
                            </div>
                        </ScrollArea>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}

function PedidoTypeSelectorDialog({
    open,
    onOpenChange,
    pedidoTypes,
    onSelect,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    pedidoTypes: PedidoType[];
    onSelect: (pedidoType: PedidoType) => void;
}) {
    const [search, setSearch] = useState("");

    const filteredTypes = useMemo(() => {
        if (!search) return pedidoTypes;
        return pedidoTypes.filter(pt => pt.name.toLowerCase().includes(search.toLowerCase()));
    }, [search, pedidoTypes]);

    useEffect(() => {
        if (!open) setSearch("");
    }, [open]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Seleccionar Tipo de Pedido</DialogTitle>
                </DialogHeader>
                <Input
                    placeholder="Buscar tipo de pedido..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="my-4"
                />
                <ScrollArea className="h-72">
                    <div className="space-y-1">
                        {filteredTypes.length > 0 ? filteredTypes.map((pt) => (
                            <Button
                                key={pt.id}
                                variant="ghost"
                                className="w-full justify-start"
                                onClick={() => onSelect(pt)}
                            >
                                {pt.name}
                            </Button>
                        )) : (
                            <p className="text-center text-sm text-muted-foreground">No se encontraron tipos de pedido.</p>
                        )}
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
}

function ItemsPorDestino({ control, remove, handleProductDialogOpening, destinoIndex }: { control: any; remove: (index: number) => void, handleProductDialogOpening: (context: { itemIndex: number, destinoIndex: number }) => void; destinoIndex: number }) {
    const { getValues } = useFormContext();
    const { fields, append, remove: removeItem } = useFieldArray({
        control,
        name: `destinos.${destinoIndex}.items`,
    });

    const watchedItems = useWatch({ control, name: `destinos.${destinoIndex}.items` }) || [];
    const isSummaryFormat = watchedItems.some((item: any) => Number(item?.paleta) === 0);

    const subtotals = useMemo(() => {
        return watchedItems.reduce((acc: {cantidad: number, paletas: number, peso: number}, item: any) => {
            if (isSummaryFormat) {
                acc.cantidad += Number(item.totalCantidad) || 0;
                acc.paletas += (Number(item.paletasCompletas) || 0) + (Number(item.paletasPicking) || 0);
                acc.peso += Number(item.totalPesoNeto) || 0;
            } else {
                acc.cantidad += Number(item.cantidadPorPaleta) || 0;
                acc.peso += Number(item.pesoNeto) || 0;
            }
            return acc;
        }, { cantidad: 0, paletas: 0, peso: 0 });
    }, [watchedItems, isSummaryFormat]);

    if (!isSummaryFormat) {
        const uniquePallets = new Set();
        let pallets999Count = 0;
        watchedItems.forEach((item: any) => {
            const paletaNum = Number(item.paleta);
            if (!isNaN(paletaNum) && paletaNum > 0) {
                 if (paletaNum === 999) {
                    pallets999Count++;
                } else if (!item.esPicking) {
                    uniquePallets.add(paletaNum);
                }
            }
        });
        subtotals.paletas = uniquePallets.size + pallets999Count;
    }


    const handleAddItem = () => {
        const items = getValues(`destinos.${destinoIndex}.items`);
        const lastItem = items.length > 0 ? items[items.length - 1] : null;

        if (!lastItem) {
            append({
                ...originalDefaultValues.items![0],
                esPicking: false
            });
            return;
        }

        if (lastItem.paleta === 0) {
            append({
                ...originalDefaultValues.items![0],
                codigo: lastItem.codigo,
                paleta: 0,
                descripcion: lastItem.descripcion,
                lote: lastItem.lote,
                presentacion: lastItem.presentacion,
                esPicking: false
            });
        } else {
            append({
                ...originalDefaultValues.items![0],
                codigo: lastItem.codigo,
                descripcion: lastItem.descripcion,
                lote: lastItem.lote,
                presentacion: lastItem.presentacion,
                cantidadPorPaleta: lastItem.cantidadPorPaleta,
                taraCaja: lastItem.taraCaja,
                paleta: null,
                pesoBruto: null,
                taraEstiba: null,
                totalTaraCaja: null,
                pesoNeto: null,
                totalCantidad: null,
                paletasCompletas: 0,
                paletasPicking: 0,
                totalPesoNeto: null,
                esPicking: false,
            });
        }
    };

    return (
        <div className="space-y-4 pl-4 border-l-2 ml-2">
            {fields.map((field, itemIndex) => (
                <ItemFields key={field.id} control={control} itemIndex={itemIndex} handleProductDialogOpening={handleProductDialogOpening} remove={removeItem} destinoIndex={destinoIndex} />
            ))}
            <div className="flex justify-between items-center mt-4 pt-4 border-t">
                <Button type="button" variant="outline" size="sm" onClick={handleAddItem}><PlusCircle className="mr-2 h-4 w-4" />Agregar Ítem a Destino</Button>
                <div className="flex gap-4 text-sm font-medium">
                    <span>Subtotal Cantidad: {subtotals.cantidad}</span>
                     {!isSummaryFormat && <span>Subtotal Paletas: {subtotals.paletas}</span>}
                    <span>Subtotal Peso: {subtotals.peso.toFixed(2)} kg</span>
                </div>
            </div>
        </div>
    );
}

function ItemFields({ control, itemIndex, handleProductDialogOpening, remove, isTunel = false, placaIndex, destinoIndex }: { control: any, itemIndex: number, handleProductDialogOpening: (context: { itemIndex: number, placaIndex?: number, destinoIndex?: number }) => void, remove?: (index: number) => void, isTunel?: boolean, placaIndex?: number, destinoIndex?: number }) {
    const { getValues, setValue, watch } = useFormContext<FormValues>();
    const { toast } = useToast();

    const basePath = destinoIndex !== undefined ? `destinos.${destinoIndex}.items` : 'items';
    const watchedItem = watch(`${basePath}.${itemIndex}`);
    const isSummaryRow = watchedItem?.paleta === 0;

    const showLegacyPalletField = isSummaryRow &&
                                watchedItem.totalPaletas !== undefined &&
                                watchedItem.totalPaletas !== null &&
                                (watchedItem.paletasCompletas === 0 || watchedItem.paletasCompletas === undefined) &&
                                (watchedItem.paletasPicking === 0 || watchedItem.paletasPicking === undefined);
    
    useEffect(() => {
        if (watchedItem && watchedItem.paleta !== 0) {
            const cantidadPorPaleta = Number(watchedItem.cantidadPorPaleta) || 0;
            const taraCaja = Number(watchedItem.taraCaja) || 0;
            const pesoBruto = Number(watchedItem.pesoBruto) || 0;
            const taraEstiba = Number(watchedItem.taraEstiba) || 0;

            const calculatedTotalTaraCaja = cantidadPorPaleta * taraCaja;
            const calculatedPesoNeto = pesoBruto - taraEstiba - calculatedTotalTaraCaja;

            if (watchedItem.totalTaraCaja !== calculatedTotalTaraCaja) {
                setValue(`${basePath}.${itemIndex}.totalTaraCaja`, calculatedTotalTaraCaja, { shouldValidate: false });
            }
            if (watchedItem.pesoNeto !== calculatedPesoNeto) {
                setValue(`${basePath}.${itemIndex}.pesoNeto`, calculatedPesoNeto, { shouldValidate: false });
            }
        }
    }, [watchedItem?.cantidadPorPaleta, watchedItem?.taraCaja, watchedItem?.pesoBruto, watchedItem?.taraEstiba, watchedItem?.paleta, basePath, itemIndex, setValue, watchedItem]);

    const handlePalletLookup = useCallback(async (event: React.FocusEvent<HTMLInputElement>) => {
        const palletCode = event.target.value.trim();
        if (!palletCode || isNaN(Number(palletCode)) || Number(palletCode) <= 0) return;

        const clientName = getValues('cliente');
        if (!clientName) {
            toast({
                variant: 'destructive',
                title: 'Cliente no seleccionado',
                description: 'Por favor, seleccione un cliente antes de buscar una paleta.',
            });
            return;
        }

        try {
            const result = await getPalletInfoByCode(palletCode, clientName);
            if (result.success && result.palletInfo) {
                const { palletInfo } = result;
                setValue(`${basePath}.${itemIndex}.codigo`, palletInfo.codigo, { shouldValidate: true });
                setValue(`${basePath}.${itemIndex}.descripcion`, palletInfo.descripcion, { shouldValidate: true });
                setValue(`${basePath}.${itemIndex}.lote`, palletInfo.lote, { shouldValidate: true });
                setValue(`${basePath}.${itemIndex}.presentacion`, palletInfo.presentacion, { shouldValidate: true });
                setValue(`${basePath}.${itemIndex}.cantidadPorPaleta`, palletInfo.cantidadPorPaleta, { shouldValidate: true });
                setValue(`${basePath}.${itemIndex}.pesoBruto`, palletInfo.pesoBruto, { shouldValidate: true });
                setValue(`${basePath}.${itemIndex}.taraEstiba`, palletInfo.taraEstiba, { shouldValidate: true });
                setValue(`${basePath}.${itemIndex}.taraCaja`, palletInfo.taraCaja, { shouldValidate: true });
                toast({
                    title: 'Paleta Encontrada',
                    description: `Se cargaron los datos de la paleta ${palletCode}.`,
                });
            } else {
                 toast({
                    variant: 'destructive',
                    title: 'Paleta no encontrada',
                    description: result.message,
                });
            }
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Error de Búsqueda',
                description: 'Ocurrió un error al buscar la información de la paleta.',
            });
        }
    }, [getValues, setValue, basePath, itemIndex, toast]);

    const pesoNeto = watchedItem?.pesoNeto;
    
    return (
      <div className="p-4 border rounded-lg relative bg-white space-y-4">
         <div className="flex justify-between items-center">
            <h4 className="text-lg font-semibold md:text-base">Ítem #{itemIndex + 1}</h4>
            {remove && (
                <Button type="button" variant="ghost" size="icon" className="text-destructive" onClick={() => remove(itemIndex)}>
                    <Trash2 className="h-4 w-4" />
                </Button>
            )}
        </div>
        <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField control={control} name={`${basePath}.${itemIndex}.codigo`} render={({ field }) => (
                    <FormItem>
                        <FormLabel>Código <span className="text-destructive">*</span></FormLabel>
                        <Button type="button" variant="outline" className="w-full justify-between h-10 text-left font-normal" onClick={() => handleProductDialogOpening({ itemIndex, placaIndex, destinoIndex })}>
                            <span className="truncate">{field.value || "Seleccionar código..."}</span>
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                        <FormMessage />
                    </FormItem>
                )} />
                <FormField control={control} name={`${basePath}.${itemIndex}.descripcion`} render={({ field }) => (
                    <FormItem className="md:col-span-2">
                        <FormLabel>Descripción del Producto <span className="text-destructive">*</span></FormLabel>
                        <Button type="button" variant="outline" className="w-full justify-between h-10 text-left font-normal" onClick={() => handleProductDialogOpening({ itemIndex, placaIndex, destinoIndex })}>
                            <span className="truncate">{field.value || "Seleccionar producto..."}</span>
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                        <FormMessage />
                    </FormItem>
                )} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <FormField control={control} name={`${basePath}.${itemIndex}.paleta`} render={({ field }) => (
                    <FormItem>
                        <FormLabel>Paleta <span className="text-destructive">*</span></FormLabel>
                        <FormControl>
                            <Input
                                type="text"
                                inputMode="numeric"
                                placeholder="0 para resumen"
                                {...field}
                                onChange={e => field.onChange(e.target.value === '' ? null : Number(e.target.value))}
                                value={field.value ?? ''}
                                onBlur={handlePalletLookup}
                            />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )} />
                <FormField control={control} name={`${basePath}.${itemIndex}.lote`} render={({ field }) => (
                    <FormItem><FormLabel>Lote</FormLabel><FormControl><Input placeholder="Lote (máx. 15)" {...field} value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value.toUpperCase())} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={control} name={`${basePath}.${itemIndex}.presentacion`} render={({ field }) => (
                    <FormItem><FormLabel>Presentación <span className="text-destructive">*</span></FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Seleccione" /></SelectTrigger></FormControl><SelectContent>{presentaciones.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                )} />
            </div>
            {isSummaryRow ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
                    <FormField control={control} name={`${basePath}.${itemIndex}.totalCantidad`} render={({ field }) => (
                        <FormItem><FormLabel>Total Cantidad <span className="text-destructive">*</span></FormLabel><FormControl><Input type="text" inputMode="numeric" pattern="[0-9]*" placeholder="0" {...field} onChange={e => field.onChange(e.target.value === '' ? null : e.target.value)} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                    )} />
                     <div className="grid grid-cols-1 gap-2">
                        {showLegacyPalletField && (
                            <FormField
                                name={`${basePath}.${itemIndex}.totalPaletas`}
                                render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Total Paletas (Dato Anterior)</FormLabel>
                                    <FormControl><Input disabled value={field.value ?? 0} /></FormControl>
                                </FormItem>
                                )}
                            />
                        )}
                        <FormField control={control} name={`${basePath}.${itemIndex}.paletasCompletas`} render={({ field }) => (
                            <FormItem><FormLabel>Pal. Completas</FormLabel><FormControl><Input type="text" inputMode="numeric" min="0" placeholder="0" {...field} onChange={e => field.onChange(e.target.value === '' ? 0 : Number(e.target.value))} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                        )}/>
                    </div>
                     <FormField control={control} name={`${basePath}.${itemIndex}.paletasPicking`} render={({ field }) => (
                        <FormItem><FormLabel>Pal. Picking</FormLabel><FormControl><Input type="text" inputMode="numeric" min="0" placeholder="0" {...field} onChange={e => field.onChange(e.target.value === '' ? 0 : Number(e.target.value))} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                    )}/>

                    <FormField control={control} name={`${basePath}.${itemIndex}.totalPesoNeto`} render={({ field }) => (
                        <FormItem><FormLabel>Total Peso Neto (kg) <span className="text-destructive">*</span></FormLabel><FormControl><Input type="text" inputMode="decimal" placeholder="0.00" {...field} onChange={e => field.onChange(e.target.value === '' ? null : e.target.value)} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                    )} />
                </div>
            ) : (
                <>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
                    <FormField control={control} name={`${basePath}.${itemIndex}.cantidadPorPaleta`} render={({ field }) => (
                        <FormItem><FormLabel>Cant. Por Paleta <span className="text-destructive">*</span></FormLabel><FormControl><Input type="text" inputMode="numeric" min="0" placeholder="0" {...field} onChange={e => field.onChange(e.target.value === '' ? null : e.target.value)} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={control} name={`${basePath}.${itemIndex}.pesoBruto`} render={({ field }) => (
                        <FormItem><FormLabel>P. Bruto (kg) <span className="text-destructive">*</span></FormLabel><FormControl><Input type="text" inputMode="decimal" min="0" step="0.01" placeholder="0.00" {...field} onChange={e => field.onChange(e.target.value === '' ? null : e.target.value)} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={control} name={`${basePath}.${itemIndex}.taraEstiba`} render={({ field }) => (
                        <FormItem><FormLabel>T. Estiba (kg) <span className="text-destructive">*</span></FormLabel><FormControl><Input type="text" inputMode="decimal" min="0" step="0.01" placeholder="0.00" {...field} onChange={e => field.onChange(e.target.value === '' ? null : e.target.value)} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={control} name={`${basePath}.${itemIndex}.taraCaja`} render={({ field }) => (
                        <FormItem><FormLabel>T. Caja (kg) <span className="text-destructive">*</span></FormLabel><FormControl><Input type="text" inputMode="decimal" min="0" step="0.01" placeholder="0.00" {...field} onChange={e => field.onChange(e.target.value === '' ? null : e.target.value)} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormItem><FormLabel>Peso Neto (kg)</FormLabel><FormControl><Input disabled readOnly value={pesoNeto != null && !isNaN(pesoNeto) ? pesoNeto.toFixed(2) : '0.00'} /></FormControl></FormItem>
                </div>
                <FormField
                    control={control}
                    name={`${basePath}.${itemIndex}.esPicking`}
                    render={({ field }) => (
                        <FormItem className="flex flex-row items-center space-x-2 pt-4">
                            <FormControl>
                                <Checkbox
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                                <FormLabel>
                                    ¿Es Picking?
                                </FormLabel>
                                <FormDescription>
                                    Marque si la paleta no sale completa de la bodega.
                                </FormDescription>
                            </div>
                        </FormItem>
                    )}
                />
                </>
            )}
        </>
      </div>
    );
};

```
- src/app/variable-weight-form/page.tsx:
```tsx


import { Suspense } from 'react';
import VariableWeightFormComponent from './form-component';
import { getPedidoTypesForForm } from '@/app/gestion-tipos-pedido/actions';
import { notFound } from 'next/navigation';
import type { PedidoType } from '@/app/gestion-tipos-pedido/actions';

export default async function VariableWeightFormPage({
  searchParams,
}: {
  searchParams: { operation: string };
}) {
  const operation = searchParams.operation;
  if (operation !== 'despacho') {
    notFound();
  }

  const pedidoTypes: PedidoType[] = await getPedidoTypesForForm('variable-weight-despacho');
  
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <VariableWeightFormComponent pedidoTypes={pedidoTypes} />
    </Suspense>
  );
}

```
- src/app/variable-weight-reception-form/page.tsx:
```tsx
import { Suspense } from 'react';
import VariableWeightReceptionFormComponent from './form-component';
import { getPedidoTypesForForm } from '../gestion-tipos-pedido/actions';
import { notFound } from 'next/navigation';
import type { PedidoType } from '@/app/gestion-tipos-pedido/actions';

export default async function VariableWeightReceptionFormPage({
  searchParams,
}: {
  searchParams: { operation: string };
}) {
  const operation = searchParams.operation;
  if (operation !== 'recepcion') {
    notFound();
  }

  const pedidoTypes: PedidoType[] = await getPedidoTypesForForm('variable-weight-reception');
  
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <VariableWeightReceptionFormComponent pedidoTypes={pedidoTypes} />
    </Suspense>
  );
}

```