
'use server';

import admin from 'firebase-admin';
import { firestore } from '@/lib/firebase-admin';
import * as xlsx from 'xlsx';
import { format, parse } from 'date-fns';

interface InventoryRow {
  PROPIETARIO: string;
  PALETA: string | number;
  FECHA: string | Date | number;
  [key: string]: any; // Allow other columns
}

export async function uploadInventoryCsv(formData: FormData): Promise<{ success: boolean; message: string; processedCount: number, errorCount: number }> {
    const files = formData.getAll('file') as File[];
    
    if (!files || files.length === 0 || files.every(f => f.size === 0)) {
        return { success: false, message: 'No se encontraron archivos válidos para cargar.', processedCount: 0, errorCount: 0 };
    }

    if (!firestore) {
        return { success: false, message: 'Error de configuración del servidor: La base de datos no está disponible.', processedCount: 0, errorCount: 0 };
    }
    
    let processedCount = 0;
    let errorCount = 0;
    
    for (const file of files) {
      try {
        if (file.size === 0) continue;

        const buffer = await file.arrayBuffer();
        const workbook = xlsx.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        let data = xlsx.utils.sheet_to_json<InventoryRow>(sheet, { raw: false });

        if (data.length === 0) {
            throw new Error(`El archivo ${file.name} está vacío o no tiene el formato correcto.`);
        }

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
            'ALTURA', 'SE', 'CAJAS', '(', 'CANTIDAD', 'LOTE', 'CONTENEDOR', 'FECHACAD'
        ];
        const actualColumns = Object.keys(firstRow);
        
        const missingColumns = requiredColumns.filter(col => !actualColumns.includes(col));

        if (missingColumns.length > 0) {
             throw new Error(`Al archivo ${file.name} le faltan las siguientes columnas: ${missingColumns.join(', ')}.`);
        }
        
        const dateValue = firstRow.FECHA;
        if (!dateValue) {
             throw new Error(`La columna "FECHA" está vacía en la primera fila del archivo ${file.name}.`);
        }
        
        let reportDate: Date;
        if (dateValue instanceof Date) {
            reportDate = dateValue;
        } else if (typeof dateValue === 'string') {
            const dateFormats = ['d/M/yy', 'd/MM/yy', 'd/MM/yyyy', 'd/M/yyyy', 'yyyy-MM-dd'];
            let parsedDate: Date | null = null;
            
            for (const fmt of dateFormats) {
                const d = parse(dateValue, fmt, new Date());
                if (!isNaN(d.getTime())) {
                    if (fmt.includes('yy') && !fmt.includes('yyyy') && d.getFullYear() < 2000) {
                        d.setFullYear(d.getFullYear() + 100);
                    }
                    parsedDate = d;
                    break;
                }
            }

            if (parsedDate) {
                reportDate = parsedDate;
            } else {
                 throw new Error(`No se pudo interpretar el formato de la fecha "${dateValue}" en el archivo ${file.name}.`);
            }
        } else {
             throw new Error(`El formato de la columna "FECHA" (${typeof dateValue}) en ${file.name} no es reconocido.`);
        }
        
        const reportDateStr = format(reportDate, 'yyyy-MM-dd');

        const serializableData = data.map(row => {
            const newRow: any = {};
            for (const key in row) {
                newRow[key] = (row as any)[key] !== undefined ? (row as any)[key] : null;
            }
            return newRow;
        });

        const docRef = firestore.collection('dailyInventories').doc(reportDateStr);
        await docRef.set({
            date: reportDateStr,
            data: serializableData,
            uploadedAt: new Date().toISOString(),
        }, { merge: true });
        
        processedCount++;
      } catch (error) {
          errorCount++;
          console.error(`Error al procesar el archivo ${file.name}:`, error);
      }
    }

    let message = '';
    if (processedCount > 0) {
        message += `Se procesaron exitosamente ${processedCount} archivo(s).`;
    }
    if (errorCount > 0) {
        message += ` ${errorCount > 0 && processedCount > 0 ? "Sin embargo," : ""} Fallaron ${errorCount} archivo(s). Revise la consola del servidor para más detalles.`;
    }
    if (message === '') {
        message = 'No se procesó ningún archivo. Verifique que los archivos no estén vacíos y tengan el formato correcto.';
    }
    
    return { success: errorCount === 0 && processedCount > 0, message, processedCount, errorCount };
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
            .where(admin.firestore.FieldPath.documentId(), '>=', criteria.startDate)
            .where(admin.firestore.FieldPath.documentId(), '<=', criteria.endDate)
            .get();

        if (snapshot.empty) {
            return [];
        }

        const results: { date: string; palletCount: number; }[] = [];

        snapshot.docs.forEach(doc => {
            try {
                const inventoryDay = doc.data();

                if (!inventoryDay || !Array.isArray(inventoryDay.data) || typeof inventoryDay.date !== 'string') {
                    console.warn(`Documento de inventario con formato incorrecto o fecha faltante, omitido: ${doc.id}`);
                    return;
                }

                const dailyData = inventoryDay.data as InventoryRow[];
                
                const clientData = dailyData.filter(row => 
                    row && typeof row.PROPIETARIO === 'string' && 
                    row.PROPIETARIO.trim().toLowerCase() === criteria.clientName.toLowerCase()
                );
                
                const uniquePallets = new Set<string>();
                clientData.forEach(row => {
                    if (row && row.PALETA !== undefined && row.PALETA !== null) {
                        uniquePallets.add(String(row.PALETA));
                    }
                });
                
                results.push({
                    date: inventoryDay.date,
                    palletCount: uniquePallets.size,
                });

            } catch (innerError) {
                console.error(`Error procesando el documento de inventario ${doc.id}:`, innerError);
            }
        });
        
        results.sort((a, b) => {
            if (typeof a?.date !== 'string' || typeof b?.date !== 'string') {
                return 0;
            }
            return a.date.localeCompare(b.date);
        });
        
        return results;

    } catch (error) {
        console.error('Error generando el reporte de inventario:', error);
        if (error instanceof Error) {
            throw new Error(error.message);
        }
        throw new Error('No se pudo generar el reporte de inventario.');
    }
}
