
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

export async function uploadInventoryCsv(formData: FormData): Promise<{ success: boolean; message: string; errors: string[] }> {
    const file = formData.get('file') as File;

    if (!file || file.size === 0) {
        return { success: false, message: 'No se encontró un archivo válido para cargar.', errors: ['Archivo no encontrado o vacío.'] };
    }

    if (!firestore) {
        return { success: false, message: 'Error de configuración del servidor.', errors: ['La base de datos no está disponible.'] };
    }

    try {
        const buffer = await file.arrayBuffer();
        const workbook = xlsx.read(buffer, { type: 'buffer', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        let data = xlsx.utils.sheet_to_json<InventoryRow>(sheet, { raw: false, defval: null });

        if (data.length === 0) {
            throw new Error(`El archivo está vacío o no tiene el formato correcto.`);
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
            throw new Error(`Faltan las siguientes columnas: ${missingColumns.join(', ')}.`);
        }
        
        const dateValue = firstRow.FECHA;
        if (!dateValue) {
            throw new Error(`La columna "FECHA" está vacía en la primera fila.`);
        }
        
        let reportDate: Date;
        if (dateValue instanceof Date) {
            reportDate = dateValue;
        } else if (typeof dateValue === 'string') {
            const dateFormats = ['d/M/yy', 'd/MM/yy', 'd/M/yyyy', 'd/MM/yyyy', 'yyyy-MM-dd'];
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
                throw new Error(`No se pudo interpretar el formato de la fecha "${dateValue}".`);
            }
        } else if (typeof dateValue === 'number') {
            const jsDate = new Date(Math.round((dateValue - 25569) * 86400 * 1000));
            jsDate.setMinutes(jsDate.getMinutes() + jsDate.getTimezoneOffset());
            reportDate = jsDate;

            if (isNaN(reportDate.getTime())) {
                throw new Error(`El número de fecha de Excel "${dateValue}" no es válido.`);
            }
        } else {
            throw new Error(`El formato de la columna "FECHA" (${typeof dateValue}) no es reconocido.`);
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
        
        return { success: true, message: `Archivo "${file.name}" procesado con éxito.`, errors: [] };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`Error al procesar el archivo ${file.name}:`, errorMessage);
        return { success: false, message: errorMessage, errors: [errorMessage] };
    }
}


export async function getInventoryReport(
    criteria: { clientName: string; startDate: string; endDate: string; sesion?: string }
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

                let dailyData = inventoryDay.data as InventoryRow[];
                
                // Filter by client
                dailyData = dailyData.filter(row => 
                    row && typeof row.PROPIETARIO === 'string' && 
                    row.PROPIETARIO.trim().toLowerCase() === criteria.clientName.toLowerCase()
                );

                // NEW: Filter by session (SE column) if provided and not empty
                if (criteria.sesion && criteria.sesion.trim()) {
                    dailyData = dailyData.filter(row => 
                        row && row.SE !== undefined && row.SE !== null &&
                        String(row.SE).trim().toLowerCase() === criteria.sesion!.trim().toLowerCase()
                    );
                }
                
                const uniquePallets = new Set<string>();
                dailyData.forEach(row => {
                    if (row && row.PALETA !== undefined && row.PALETA !== null) {
                        uniquePallets.add(String(row.PALETA).trim());
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
            // Robust date sorting to prevent crashes
            if (!a.date || !b.date) return 0;
            try {
                // Using localeCompare on 'YYYY-MM-DD' strings is safe and simple
                return a.date.localeCompare(b.date);
            } catch (e) {
                return 0; // Fallback for any unexpected error
            }
        });
        
        return results;

    } catch (error) {
        console.error('Error generando el reporte de inventario:', error);
        if (error instanceof Error) {
            if (error.message.includes('needs an index') || error.message.includes('requires an index')) {
                 throw new Error('La consulta requiere un índice en Firestore que no existe. Revise la consola del servidor para ver el enlace para crearlo.');
            }
            throw new Error(`Error del servidor: ${error.message}`);
        }
        throw new Error('No se pudo generar el reporte de inventario.');
    }
}
