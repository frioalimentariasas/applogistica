
'use server';

import { firestore } from '@/lib/firebase-admin';
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

export async function uploadArticulos(rows: any[]): Promise<UploadResult> {
  if (!firestore) {
    return { 
      success: false, 
      message: 'Error de configuración del servidor: Firebase Admin no está inicializado.' 
    };
  }

  let processedCount = 0;
  let errorCount = 0;
  const errors: string[] = [];
  const validSessions = ['CO', 'RE', 'SE'];

  for (const row of rows) {
    const razonSocial = row['Razón Social']?.trim();
    const codigoProducto = String(row['Codigo Producto'] || '').trim();
    const denominacionArticulo = row['Denominación articulo']?.trim();
    const sesion = row['Sesion']?.trim().toUpperCase();

    if (!razonSocial || !codigoProducto || !denominacionArticulo || !sesion) {
        errorCount++;
        errors.push(`Fila con código "${codigoProducto}" omitida por tener campos vacíos.`);
        continue;
    }
    
    if (!validSessions.includes(sesion)) {
        errorCount++;
        errors.push(`Fila con código "${codigoProducto}" tiene una sesión inválida: "${sesion}".`);
        continue;
    }

    try {
        const querySnapshot = await firestore.collection('articulos')
            .where('razonSocial', '==', razonSocial)
            .where('codigoProducto', '==', codigoProducto)
            .limit(1)
            .get();

        const dataToSave = {
            razonSocial,
            codigoProducto,
            denominacionArticulo,
            sesion,
        };
        
        if (!querySnapshot.empty) {
            const docRef = querySnapshot.docs[0].ref;
            await docRef.update(dataToSave);
        } else {
            await firestore.collection('articulos').add(dataToSave);
        }
        processedCount++;

    } catch(e) {
        errorCount++;
        const errorMessage = e instanceof Error ? e.message : 'Error desconocido';
        errors.push(`Error al procesar fila con código "${codigoProducto}": ${errorMessage}`);
    }
  }

  if (processedCount > 0) {
      revalidatePath('/gestion-articulos');
  }

  if (errorCount > 0) {
      return {
          success: false,
          message: `Proceso completado con ${errorCount} errores.`,
          processedCount,
          errorCount,
          errors
      };
  }
  
  return { 
      success: true, 
      message: `Se procesaron ${processedCount} artículos correctamente.`,
      processedCount,
      errorCount,
      errors
  };
}
