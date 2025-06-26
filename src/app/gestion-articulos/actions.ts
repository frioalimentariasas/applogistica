
'use server';

import { firestore } from '@/lib/firebase-admin';
import { revalidatePath } from 'next/cache';

interface ArticleData {
  razonSocial: string;
  codigoProducto: string;
  denominacionArticulo: string;
}

export async function addArticle(data: ArticleData): Promise<{ success: boolean; message: string }> {
  if (!firestore) {
    return { success: false, message: 'Error de configuración del servidor.' };
  }

  const { razonSocial, codigoProducto, denominacionArticulo } = data;

  if (!razonSocial || !codigoProducto || !denominacionArticulo) {
    return { success: false, message: 'Todos los campos son obligatorios.' };
  }
  
  const trimmedCode = codigoProducto.trim();
  const trimmedName = denominacionArticulo.trim();

  try {
    const articulosRef = firestore.collection('articulos');
    
    // Check for duplicate product code for the same client
    const existingArticle = await articulosRef
      .where('razonSocial', '==', razonSocial)
      .where('codigoProducto', '==', trimmedCode)
      .limit(1)
      .get();

    if (!existingArticle.empty) {
      return { success: false, message: `El código de producto "${trimmedCode}" ya existe para el cliente "${razonSocial}".` };
    }

    await articulosRef.add({
      razonSocial,
      codigoProducto: trimmedCode,
      denominacionArticulo: trimmedName,
    });
    
    revalidatePath(`/gestion-articulos`);

    return { success: true, message: 'Artículo agregado con éxito.' };
  } catch (error) {
    console.error('Error al agregar el artículo:', error);
    const errorMessage = error instanceof Error ? error.message : 'Ocurrió un error desconocido.';
    return { success: false, message: `Error del servidor: ${errorMessage}` };
  }
}
