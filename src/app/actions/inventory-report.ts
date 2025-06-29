
'use server';

import { firestore } from '@/lib/firebase-admin';
import * as xlsx from 'xlsx';
import { format, parse } from 'date-fns';

interface InventoryRow {
  FECHA: any; // Can be string or Excel date number
  PROPIETARIO: string;
  PALETA: string | number;
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
            return { success: false, message: 'El archivo Excel está vacío o no tiene el formato correcto.' };
        }

        const firstRow = data[0];
        if (!('FECHA' in firstRow && 'PROPIETARIO' in firstRow && 'PALETA' in firstRow)) {
            return { success: false, message: 'Las columnas del archivo Excel no coinciden. Se esperan "FECHA", "PROPIETARIO", y "PALETA".' };
        }
        
        let reportDate: Date;
        if (firstRow.FECHA instanceof Date) {
            reportDate = firstRow.FECHA;
        } else if (typeof firstRow.FECHA === 'number') {
            // Handle Excel serial date number
            const excelEpoch = new Date(Date.UTC(1899, 11, 30));
            reportDate = new Date(excelEpoch.getTime() + firstRow.FECHA * 24 * 60 * 60 * 1000);
        } else {
             return { success: false, message: 'El formato de la columna "FECHA" es inválido. No se pudo determinar la fecha del reporte.'};
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
