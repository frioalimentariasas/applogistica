

'use server';

import admin from 'firebase-admin';
import { firestore } from '@/lib/firebase-admin';
import * as xlsx from 'xlsx-js-style';
import { format, parse } from 'date-fns';

interface InventoryRow {
  PROPIETARIO: string;
  PALETA: string | number;
  FECHA: string | Date | number;
  SE?: string | number;
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


export interface InventoryPivotRow {
  date: string;
  clientData: Record<string, number>; // e.g., { "CLIENT_A": 123, "CLIENT_B": 456 }
}

export interface InventoryPivotReport {
  clientHeaders: string[]; // All unique client names found, for table headers
  rows: InventoryPivotRow[];
}


export async function getInventoryReport(
    criteria: { clientNames?: string[]; startDate: string; endDate: string; sesion?: string }
): Promise<InventoryPivotReport> {
    if (!firestore) {
        throw new Error('Error de configuración del servidor.');
    }
    if (!criteria.startDate || !criteria.endDate) {
        return { clientHeaders: [], rows: [] };
    }

    try {
        const snapshot = await firestore.collection('dailyInventories')
            .where(admin.firestore.FieldPath.documentId(), '>=', criteria.startDate)
            .where(admin.firestore.FieldPath.documentId(), '<=', criteria.endDate)
            .get();

        if (snapshot.empty) {
            return { clientHeaders: [], rows: [] };
        }

        // Use a Map to store client pallet sets for each date
        const resultsByDate = new Map<string, Map<string, Set<string>>>();
        const allClientsFound = new Set<string>();

        snapshot.docs.forEach(doc => {
            try {
                const inventoryDay = doc.data();
                if (!inventoryDay || !Array.isArray(inventoryDay.data) || typeof inventoryDay.date !== 'string') {
                    console.warn(`Documento de inventario con formato incorrecto o fecha faltante, omitido: ${doc.id}`);
                    return;
                }

                let dailyData = inventoryDay.data as InventoryRow[];
                
                // Filter by session if provided
                if (criteria.sesion && criteria.sesion.trim()) {
                    dailyData = dailyData.filter(row => 
                        row && row.SE !== undefined && row.SE !== null &&
                        String(row.SE).trim().toLowerCase() === criteria.sesion!.trim().toLowerCase()
                    );
                }
                
                dailyData.forEach(row => {
                    const clientName = row?.PROPIETARIO?.trim();
                    if (!clientName) return;

                    // Filter by client names if provided and not empty
                    if (criteria.clientNames && criteria.clientNames.length > 0 && !criteria.clientNames.includes(clientName)) {
                        return;
                    }
                    
                    allClientsFound.add(clientName);

                    if (!resultsByDate.has(inventoryDay.date)) {
                        resultsByDate.set(inventoryDay.date, new Map<string, Set<string>>());
                    }
                    const dateData = resultsByDate.get(inventoryDay.date)!;

                    if (!dateData.has(clientName)) {
                        dateData.set(clientName, new Set<string>());
                    }
                    const clientPallets = dateData.get(clientName)!;
                    
                    if (row.PALETA !== undefined && row.PALETA !== null) {
                        clientPallets.add(String(row.PALETA).trim());
                    }
                });

            } catch (innerError) {
                console.error(`Error procesando el documento de inventario ${doc.id}:`, innerError);
            }
        });
        
        const sortedClientHeaders = Array.from(allClientsFound).sort((a, b) => a.localeCompare(b));
        
        const pivotRows: InventoryPivotRow[] = [];
        const sortedDates = Array.from(resultsByDate.keys()).sort((a, b) => a.localeCompare(b));

        for (const date of sortedDates) {
            const clientPalletSets = resultsByDate.get(date)!;
            const clientData: Record<string, number> = {};

            for (const clientName of sortedClientHeaders) {
                clientData[clientName] = clientPalletSets.get(clientName)?.size || 0;
            }
            
            pivotRows.push({ date, clientData });
        }
        
        return {
            clientHeaders: sortedClientHeaders,
            rows: pivotRows,
        };

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


export async function getLatestStockBeforeDate(clientName: string, date: string, sesion?: string): Promise<number> {
    if (!firestore) {
        throw new Error('Error de configuración del servidor.');
    }

    if (!clientName || !date) {
        return 0;
    }

    try {
        const snapshot = await firestore.collection('dailyInventories')
            .where(admin.firestore.FieldPath.documentId(), '<', date)
            .orderBy(admin.firestore.FieldPath.documentId(), 'desc')
            .limit(1)
            .get();

        if (snapshot.empty) {
            return 0; // No inventory records before the given date
        }
        
        const latestInventoryDoc = snapshot.docs[0];
        const inventoryDay = latestInventoryDoc.data();
        
        if (!inventoryDay || !Array.isArray(inventoryDay.data)) {
            return 0;
        }

        let inventoryData = inventoryDay.data as InventoryRow[];

        // Filter by session if provided
        if (sesion && sesion.trim()) {
            inventoryData = inventoryData.filter(row => 
                row && row.SE !== undefined && row.SE !== null &&
                String(row.SE).trim().toLowerCase() === sesion.trim().toLowerCase()
            );
        }

        const pallets = new Set<string>();
        inventoryData.forEach((row: any) => {
            if (row && row.PROPIETARIO?.trim() === clientName) {
                if (row.PALETA !== undefined && row.PALETA !== null) {
                    pallets.add(String(row.PALETA).trim());
                }
            }
        });

        return pallets.size;
    } catch (error) {
        console.error(`Error fetching latest stock for ${clientName} before ${date} for session ${sesion}:`, error);
        // Do not throw, just return 0 as a fallback
        return 0;
    }
}

export async function getClientsWithInventory(startDate: string, endDate: string): Promise<string[]> {
    if (!firestore) {
        throw new Error('Error de configuración del servidor.');
    }
    if (!startDate || !endDate) {
        return [];
    }

    try {
        const snapshot = await firestore.collection('dailyInventories')
            .where(admin.firestore.FieldPath.documentId(), '>=', startDate)
            .where(admin.firestore.FieldPath.documentId(), '<=', endDate)
            .get();

        if (snapshot.empty) {
            return [];
        }

        const clients = new Set<string>();

        snapshot.docs.forEach(doc => {
            const inventoryDay = doc.data();
            if (inventoryDay && Array.isArray(inventoryDay.data)) {
                inventoryDay.data.forEach((row: any) => {
                    if (row && row.PROPIETARIO && typeof row.PROPIETARIO === 'string') {
                        clients.add(row.PROPIETARIO.trim());
                    }
                });
            }
        });

        return Array.from(clients).sort((a, b) => a.localeCompare(b));

    } catch (error) {
        console.error('Error fetching clients with inventory:', error);
        throw new Error('No se pudo obtener la lista de clientes con inventario.');
    }
}

export async function getInventoryIdsByDateRange(startDate: string, endDate: string): Promise<{ success: boolean; ids?: string[]; message: string }> {
    if (!firestore) {
        return { success: false, message: 'Error de configuración del servidor.' };
    }
    if (!startDate || !endDate) {
        return { success: false, message: 'Se requieren fechas de inicio y fin.' };
    }

    try {
        const snapshot = await firestore.collection('dailyInventories')
            .where(admin.firestore.FieldPath.documentId(), '>=', startDate)
            .where(admin.firestore.FieldPath.documentId(), '<=', endDate)
            .select() // Select no fields, just get the document references
            .get();

        if (snapshot.empty) {
            return { success: false, message: 'No se encontraron registros de inventario en el rango de fechas seleccionado.' };
        }

        const ids = snapshot.docs.map(doc => doc.id);
        return { success: true, ids, message: `${ids.length} IDs found.` };

    } catch (error) {
        console.error('Error fetching inventory IDs:', error);
        const errorMessage = error instanceof Error ? error.message : 'Ocurrió un error desconocido.';
        return { success: false, message: `Error del servidor: ${errorMessage}` };
    }
}

export async function deleteSingleInventoryDoc(id: string): Promise<{ success: boolean; message: string }> {
    if (!firestore) {
        return { success: false, message: 'Error de configuración del servidor.' };
    }
    try {
        await firestore.collection('dailyInventories').doc(id).delete();
        return { success: true, message: `Documento ${id} eliminado.` };
    } catch (error) {
        console.error(`Error deleting inventory doc ${id}:`, error);
        const errorMessage = error instanceof Error ? error.message : 'Ocurrió un error desconocido.';
        return { success: false, message: `Error al eliminar ${id}: ${errorMessage}` };
    }
}


export async function getDetailedInventoryForExport(
    criteria: { clientNames: string[]; startDate: string; endDate: string; }
): Promise<InventoryRow[]> {
    if (!firestore) {
        throw new Error('Error de configuración del servidor.');
    }
    if (!criteria.startDate || !criteria.endDate || !criteria.clientNames || criteria.clientNames.length === 0) {
        throw new Error('Cliente(s) y rango de fechas son requeridos.');
    }

    try {
        const snapshot = await firestore.collection('dailyInventories')
            .where(admin.firestore.FieldPath.documentId(), '>=', criteria.startDate)
            .where(admin.firestore.FieldPath.documentId(), '<=', criteria.endDate)
            .orderBy(admin.firestore.FieldPath.documentId(), 'asc')
            .get();

        if (snapshot.empty) {
            return [];
        }

        const allRows: InventoryRow[] = [];
        snapshot.docs.forEach(doc => {
            const inventoryDay = doc.data();
            if (!inventoryDay || !Array.isArray(inventoryDay.data)) {
                return;
            }
            
            const clientRows = inventoryDay.data.filter((row: InventoryRow) => 
                row && row.PROPIETARIO && criteria.clientNames.includes(row.PROPIETARIO.trim())
            );

            // Serialize date objects for the client
            const serializedRows = clientRows.map((row: any) => {
                const newRow: any = {};
                for (const key in row) {
                    if (row[key] instanceof Date) {
                        newRow[key] = format(row[key], 'dd/MM/yyyy');
                    } else {
                        newRow[key] = row[key];
                    }
                }
                return newRow;
            });

            allRows.push(...serializedRows);
        });
        
        return allRows;

    } catch (error) {
        console.error('Error generando el reporte de inventario detallado:', error);
        throw new Error('No se pudo generar el reporte de inventario detallado.');
    }
}
