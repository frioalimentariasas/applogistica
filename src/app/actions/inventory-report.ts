
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
        // Disable automatic date parsing by removing `cellDates: true`.
        // We will parse dates manually to ensure correct format interpretation.
        const workbook = xlsx.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        // Use `raw: false` to get formatted strings (like dates) instead of raw values.
        let data = xlsx.utils.sheet_to_json<InventoryRow>(sheet, { raw: false });

        if (data.length === 0) {
            return { success: false, message: 'El archivo está vacío o no tiene el formato correcto.' };
        }

        // Normalize header keys by trimming whitespace from them.
        data = data.map(row => {
            const newRow: any = {};
            for (const key in row) {
                newRow[key.trim()] = (row as any)[key];
            }
            return newRow;
        });

        const firstRow = data[0];
        const requiredColumns = [
            'FECHA', 'FECHAENT', 'FECHASAL', 'PROPIETARIO', 'COD_PROPIE', 'PALETA',
            'SI', 'ARTICUL', 'VAR', 'VA', 'VARLOG', 'DENOMINACION', 'PAS', 'COLUMNA',
            'ALTURA', 'SE', 'CAJAS', 'CANTIDAD', 'LOTE', 'CONTENEDOR', 'FECHACAD'
        ];
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
            // This case might still happen if excel format is a true date type
            reportDate = dateValue;
        } else if (typeof dateValue === 'string') {
            try {
                 // Try to parse 'd/MM/yyyy' first, a common format in LATAM
                 reportDate = parse(dateValue, 'd/MM/yyyy', new Date());
                 if (isNaN(reportDate.getTime())) {
                     // As a fallback, try parsing as an ISO date string
                     reportDate = parse(dateValue, 'yyyy-MM-dd', new Date());
                     if (isNaN(reportDate.getTime())) {
                        throw new Error('Invalid date format');
                     }
                 }
            } catch(e) {
                return { success: false, message: `No se pudo interpretar el formato de la fecha "${dateValue}". Se espera "d/MM/yyyy" o "yyyy-MM-dd".` };
            }
        } else {
             return { success: false, message: `El formato de la columna "FECHA" (${typeof dateValue}) no es reconocido.` };
        }
        
        const reportDateStr = format(reportDate, 'yyyy-MM-dd');

        // Data is already stringified from the CSV, so no complex serialization is needed.
        // We just pass the array of objects as is.
        const serializableData = data.map(row => {
            const newRow: any = {};
            for (const key in row) {
                // Ensure values are not undefined, convert to null if so.
                newRow[key] = (row as any)[key] !== undefined ? (row as any)[key] : null;
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
            try {
                const inventoryDay = doc.data();

                // Defensive check to prevent crashes on malformed documents.
                if (!inventoryDay || !Array.isArray(inventoryDay.data) || typeof inventoryDay.date !== 'string') {
                    console.warn(`Documento de inventario con formato incorrecto o fecha faltante, omitido: ${doc.id}`);
                    return; // Skip this document
                }

                const dailyData = inventoryDay.data as InventoryRow[];
                
                // Filter by client, trimming whitespace for robustness.
                const clientData = dailyData.filter(row => 
                    row && typeof row.PROPIETARIO === 'string' && row.PROPIETARIO.trim() === criteria.clientName
                );
                
                const uniquePallets = new Set(clientData.map(row => row.PALETA));
                
                results.push({
                    date: inventoryDay.date,
                    palletCount: uniquePallets.size,
                });

            } catch (innerError) {
                console.error(`Error procesando el documento de inventario ${doc.id}:`, innerError);
                // Continue to the next document, allowing the report to be partially generated.
            }
        });
        
        results.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        return results;

    } catch (error) {
        console.error('Error generando el reporte de inventario:', error);
        throw new Error('No se pudo generar el reporte de inventario.');
    }
}
