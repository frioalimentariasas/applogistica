
'use server';

import { firestore } from '@/lib/firebase-admin';
import * as xlsx from 'xlsx';
import { revalidatePath } from 'next/cache';

// Define the structure of an article based on the Excel columns
interface Articulo {
  'Razón Social': string;
  'Codigo Producto': string;
  'Denominación articulo': string;
  'Sesion': 'CO' | 'RE' | 'SE';
}

export interface UploadResult {
    success: boolean;
    message: string;
    processedCount?: number;
    errorCount?: number;
    errors?: string[];
}

export async function uploadArticulos(formData: FormData): Promise<UploadResult> {
  if (!firestore) {
    return { 
      success: false, 
      message: 'Error de configuración del servidor: Firebase Admin no está inicializado.' 
    };
  }

  const file = formData.get('file') as File;
  if (!file) {
    return { success: false, message: 'No se encontró el archivo.' };
  }

  let processedCount = 0;
  let errorCount = 0;
  const errors: string[] = [];
  const validSessions = ['CO', 'RE', 'SE'];
  
  try {
    const buffer = await file.arrayBuffer();
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json<any>(sheet);

    if (rows.length === 0) {
      return { success: false, message: 'El archivo está vacío o no tiene el formato correcto.' };
    }

    const dataToProcess: Articulo[] = [];
    // First, validate all rows and build a clean list to process
    for (const [index, row] of rows.entries()) {
      const razonSocial = row['Razón Social']?.trim();
      const codigoProducto = String(row['Codigo Producto'] || '').trim();
      const denominacionArticulo = row['Denominación articulo']?.trim();
      const sesion = String(row['Sesion'] || '').trim().toUpperCase();
      const rowIndex = index + 2; // For user-friendly error messages (1-based index + header)

      if (!razonSocial || !codigoProducto || !denominacionArticulo || !sesion) {
          errorCount++;
          errors.push(`Fila ${rowIndex} omitida por tener campos vacíos.`);
          continue;
      }
      
      if (!validSessions.includes(sesion)) {
          errorCount++;
          errors.push(`Fila ${rowIndex} (código "${codigoProducto}") tiene una sesión inválida: "${sesion}".`);
          continue;
      }

      dataToProcess.push({
        'Razón Social': razonSocial,
        'Codigo Producto': codigoProducto,
        'Denominación articulo': denominacionArticulo,
        'Sesion': sesion as 'CO' | 'RE' | 'SE',
      });
    }

    // Now, process the clean data in batches
    const chunkSize = 500; // Firestore batch writes can handle up to 500 operations
    for (let i = 0; i < dataToProcess.length; i += chunkSize) {
        const chunk = dataToProcess.slice(i, i + chunkSize);
        const batch = firestore.batch();

        for (const item of chunk) {
            const querySnapshot = await firestore.collection('articulos')
                .where('razonSocial', '==', item['Razón Social'])
                .where('codigoProducto', '==', item['Codigo Producto'])
                .limit(1)
                .get();

            const dataToSave = {
                razonSocial: item['Razón Social'],
                codigoProducto: item['Codigo Producto'],
                denominacionArticulo: item['Denominación articulo'],
                sesion: item['Sesion'],
            };
            
            if (!querySnapshot.empty) {
                const docRef = querySnapshot.docs[0].ref;
                batch.update(docRef, dataToSave);
            } else {
                const docRef = firestore.collection('articulos').doc();
                batch.set(docRef, dataToSave);
            }
        }
        await batch.commit();
        processedCount += chunk.length;
    }

  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Error desconocido';
    errors.push(`Error al procesar el archivo: ${errorMessage}`);
    errorCount++;
  }


  if (processedCount > 0) {
      revalidatePath('/gestion-articulos');
  }

  if (errorCount > 0) {
      return {
          success: false,
          message: `Proceso completado con ${errorCount} errores. Se procesaron ${processedCount} artículos.`,
          processedCount,
          errorCount,
          errors
      };
  }
  
  return { 
      success: true, 
      message: `Se procesaron (agregaron o actualizaron) ${processedCount} artículos correctamente.`,
      processedCount,
      errorCount: 0,
      errors: []
  };
}

