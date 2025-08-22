
'use server';

import { firestore } from '@/lib/firebase-admin';
import * as ExcelJS from 'exceljs';
import { revalidatePath } from 'next/cache';

// Define the structure of a client based on the Excel columns
interface Cliente {
  'Razón Social': string;
}

export async function uploadClientes(formData: FormData): Promise<{ success: boolean; message: string; count?: number }> {
  const file = formData.get('file') as File;
  if (!file) {
    return { success: false, message: 'No se encontró el archivo.' };
  }

  if (!firestore) {
    return { 
      success: false, 
      message: 'Error de configuración del servidor: Firebase Admin no está inicializado. Verifique la variable de entorno FIREBASE_SERVICE_ACCOUNT_KEY.' 
    };
  }

  try {
    const buffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const worksheet = workbook.worksheets[0];
    
    const data: Cliente[] = [];
    const headers: string[] = [];
    worksheet.getRow(1).eachCell((cell) => {
        headers.push(cell.value as string);
    });

    worksheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1) {
            const rowData: any = {};
            row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                rowData[headers[colNumber - 1]] = cell.value;
            });
            data.push(rowData);
        }
    });

    if (!data.length) {
        return { success: false, message: 'El archivo Excel está vacío o no tiene el formato correcto.' };
    }
    
    // Validate first row to ensure correct columns
    const firstRow = data[0];
    if (!('Razón Social' in firstRow)) {
        return { success: false, message: 'La columna del archivo Excel debe ser "Razón Social".' };
    }

    const clientesCollection = firestore.collection('clientes');

    // Create a new batch for writing
    const writeBatch = firestore.batch();
    const addedClients: string[] = [];

    data.forEach((row) => {
      // Basic validation to skip empty rows
      if (row['Razón Social'] && String(row['Razón Social']).trim()) {
        const razonSocial = String(row['Razón Social']).trim();
        const docRef = clientesCollection.doc(); // Firestore will auto-generate an ID
        writeBatch.set(docRef, {
          razonSocial: razonSocial,
        });
        addedClients.push(razonSocial);
      }
    });

    if (addedClients.length === 0) {
      return { success: false, message: 'No se encontraron clientes válidos para agregar en el archivo.' };
    }

    await writeBatch.commit();
    
    revalidatePath('/gestion-clientes');

    return { success: true, message: `Se agregaron ${addedClients.length} nuevos clientes correctamente.`, count: addedClients.length };
  } catch (error) {
    console.error('Error al procesar el archivo:', error);
    if (error instanceof Error) {
        return { success: false, message: `Error del servidor: ${error.message}` };
    }
    return { success: false, message: 'Ocurrió un error desconocido al procesar el archivo.' };
  }
}
