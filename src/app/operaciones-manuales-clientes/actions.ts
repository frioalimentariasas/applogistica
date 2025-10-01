

'use server';

import { firestore } from '@/lib/firebase-admin';
import { revalidatePath } from 'next/cache';
import admin from 'firebase-admin';
import { getDaysInMonth, startOfDay, addDays, format, isBefore, isEqual, parseISO, getDay, eachDayOfInterval, isSunday } from 'date-fns';
import { getClientBillingConcepts, type ClientBillingConcept } from '@/app/gestion-conceptos-liquidacion-clientes/actions';
import { differenceInMinutes, parse } from 'date-fns';
import * as ExcelJS from 'exceljs';

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


export async function addManualClientOperation(data: ManualClientOperationData): Promise<{ success: boolean; message: string }> {
    if (!firestore) {
        return { success: false, message: 'El servidor no está configurado correctamente.' };
    }

    try {
        const { details, operationDate, startDate, endDate, numeroPersonas, ...restOfData } = data;
        
        const operationDateToSave = admin.firestore.Timestamp.fromDate(new Date(operationDate!));
        
        const operationWithTimestamp: any = {
            ...restOfData,
            details: details || {},
            operationDate: operationDateToSave,
            createdAt: new Date().toISOString(),
        };

        if (numeroPersonas !== undefined) {
            operationWithTimestamp.numeroPersonas = numeroPersonas;
        }

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
            
            const operationData = {
                ...restOfData,
                operationDate: admin.firestore.Timestamp.fromDate(localDate),
                createdAt: new Date().toISOString(),
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


export async function updateManualClientOperation(id: string, data: Omit<ManualClientOperationData, 'createdAt' | 'createdBy'>): Promise<{ success: boolean; message: string }> {
    if (!firestore) {
        return { success: false, message: 'El servidor no está configurado correctamente.' };
    }

    try {
        const { details, operationDate, startDate, endDate, createdBy, ...restOfData } = data;
        let finalSpecificTariffs: { tariffId: string; quantity: number, role?: string, numPersonas?: number }[] = [];

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


export async function deleteMultipleManualClientOperations(ids: string[]): Promise<{ success: boolean; message: string }> {
    if (!firestore) {
        return { success: false, message: 'Error de configuración del servidor.' };
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
  Fecha: Date | string;
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
): Promise<{ success: boolean; message: string; createdCount: number, duplicateCount: number }> {
    if (!firestore) {
        return { success: false, message: 'El servidor no está configurado.', createdCount: 0, duplicateCount: 0 };
    }

    const file = formData.get('file') as File;
    if (!file) {
        return { success: false, message: 'No se encontró el archivo.', createdCount: 0, duplicateCount: 0 };
    }

    try {
        const buffer = await file.arrayBuffer();
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);
        const worksheet = workbook.worksheets[0];

        const rows: FmmRow[] = [];
        const headers = worksheet.getRow(1).values as string[];
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber > 1) {
                const rowData: any = {};
                row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                    rowData[headers[colNumber]] = cell.value;
                });
                rows.push(rowData);
            }
        });

        if (rows.length === 0) throw new Error("El archivo está vacío.");

        const fmmNumbersFromFile = rows.map(r => r['# FMM']).filter(Boolean);
        const existingFmms = new Set<string>();
        if (fmmNumbersFromFile.length > 0) {
            const querySnapshot = await firestore.collection('manual_client_operations').where('details.fmmNumber', 'in', fmmNumbersFromFile).get();
            querySnapshot.forEach(doc => {
                existingFmms.add(doc.data().details.fmmNumber);
            });
        }
        
        const createdBy = {
            uid: formData.get('userId') as string,
            displayName: formData.get('userDisplayName') as string,
        };

        const batch = firestore.batch();
        let createdCount = 0;
        let duplicateCount = 0;

        for (const row of rows) {
            const fmmNumber = row['# FMM'];
            if (!fmmNumber || existingFmms.has(fmmNumber)) {
                if (fmmNumber) duplicateCount++;
                continue;
            }

            const docRef = firestore.collection('manual_client_operations').doc();
            batch.set(docRef, {
                clientName: row.Cliente,
                concept: row.Concepto,
                operationDate: admin.firestore.Timestamp.fromDate(new Date(row.Fecha)),
                quantity: row.Cantidad,
                details: {
                    container: row.Contenedor,
                    opLogistica: row['Op. Logística'],
                    fmmNumber: row['# FMM'],
                    plate: row.Placa
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

        return {
            success: true,
            message: `Se crearon ${createdCount} registros. Se omitieron ${duplicateCount} por ser duplicados.`,
            createdCount,
            duplicateCount,
        };
    } catch (error) {
        console.error('Error al cargar operaciones FMM:', error);
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido.';
        return { success: false, message: errorMessage, createdCount: 0, duplicateCount: 0 };
    }
}
