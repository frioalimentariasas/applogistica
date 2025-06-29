
'use server';

import { firestore } from '@/lib/firebase-admin';
import * as xlsx from 'xlsx';
import { format, parse } from 'date-fns';

interface InventoryRow {
  PROPIETARIO: string;
  PALETA: string | number;
  FECHA: string | Date | number;
  [key: string]: any; // Allow other columns
}

export async function uploadInventoryCsv(formData: FormData): Promise<{ success: boolean; message:string; }> {
    const file = formData.get('file') as File;
    if (!file || file.size === 0) {
        return { success: false, message: 'No se encontró ningún archivo para cargar.' };
    }

    if (!firestore) {
        return { success: false, message: 'Error de configuración del servidor: La base de datos no está disponible.' };
    }

    try {
        const buffer = await file.arrayBuffer();
        const workbook = xlsx.read(buffer, { type: 'buffer', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json<InventoryRow>(sheet);

        if (data.length === 0) {
            return { success: false, message: 'El archivo está vacío o no tiene el formato correcto.' };
        }

        const firstRow = data[0];
        const requiredColumns = ['FECHA', 'PROPIETARIO', 'PALETA', 'DENOMINACION'];
        const actualColumns = Object.keys(firstRow);
        
        const missingColumns = requiredColumns.filter(col => !actualColumns.includes(col));

        if (missingColumns.length > 0) {
             return { success: false, message: `El archivo CSV no tiene el formato correcto. Faltan las siguientes columnas requeridas: ${missingColumns.join(', ')}.` };
        }
        
        const dateValue = firstRow.FECHA;
        if (!dateValue) {
             return { success: false, message: 'La columna "FECHA" está vacía en la primera fila del archivo y es obligatoria.' };
        }
        
        let reportDate: Date;
        if (dateValue instanceof Date) {
            reportDate = dateValue;
        } else if (typeof dateValue === 'string') {
            try {
                 // Try to parse 'dd/MM/yyyy' first, a common format in LATAM
                 reportDate = parse(dateValue, 'dd/MM/yyyy', new Date());
                 if (isNaN(reportDate.getTime())) {
                     // As a fallback, try parsing as an ISO date string
                     reportDate = parse(dateValue, 'yyyy-MM-dd', new Date());
                     if (isNaN(reportDate.getTime())) {
                        throw new Error('Invalid date format');
                     }
                 }
            } catch(e) {
                return { success: false, message: `No se pudo interpretar el formato de la fecha "${dateValue}". Se espera "dd/MM/yyyy" o "yyyy-MM-dd".` };
            }
        } else {
             return { success: false, message: `El formato de la columna "FECHA" (${typeof dateValue}) no es reconocido.` };
        }
        
        const reportDateStr = format(reportDate, 'yyyy-MM-dd');

        const serializableData = data.map(row => {
            const newRow: any = {};
            for (const key in row) {
                if (row[key] instanceof Date) {
                    newRow[key] = row[key].toISOString();
                } else {
                    newRow[key] = row[key];
                }
            }
            return newRow;
        });

        const docRef = firestore.collection('dailyInventories').doc(reportDateStr);
        const docSnapshot = await docRef.get();
        const isUpdate = docSnapshot.exists;

        await docRef.set({
            date: reportDateStr,
            data: serializableData,
            uploadedAt: new Date().toISOString(),
        }, { merge: true }); // Use merge to upsert the data
        
        const message = isUpdate
            ? `El inventario para la fecha ${reportDateStr} ha sido actualizado correctamente.`
            : `Inventario del ${reportDateStr} cargado y guardado correctamente.`;
        
        return { success: true, message };

    } catch (error) {
        console.error('Error procesando el archivo de inventario:', error);
        return { success: false, message: 'No se pudo procesar el archivo. Verifique el formato.' };
    }
}

export async function getInventoryReport(
    criteria: { clientName: string; startDate: string; endDate: string }
): Promise<{ date: string; palletCount: number; }[]> {
    if (!firestore) {
        throw new Error('Error de configuración del servidor.');
    }
    if (!criteria.clientName || !criteria.startDate || !criteria.endDate) {
        return [];
    }

    try {
        const snapshot = await firestore.collection('dailyInventories')
            .where(firestore.FieldPath.documentId(), '>=', criteria.startDate)
            .where(firestore.FieldPath.documentId(), '<=', criteria.endDate)
            .get();

        if (snapshot.empty) {
            return [];
        }

        const results: { date: string; palletCount: number; }[] = [];

        snapshot.docs.forEach(doc => {
            const inventoryDay = doc.data();
            const dailyData = inventoryDay.data as InventoryRow[];
            
            const clientData = dailyData.filter(row => row.PROPIETARIO === criteria.clientName);
            const uniquePallets = new Set(clientData.map(row => row.PALETA));
            
            results.push({
                date: inventoryDay.date,
                palletCount: uniquePallets.size,
            });
        });
        
        results.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        return results;

    } catch (error) {
        console.error('Error generando el reporte de inventario:', error);
        throw new Error('No se pudo generar el reporte de inventario.');
    }
}
