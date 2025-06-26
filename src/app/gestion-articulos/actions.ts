
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

export async function updateArticle(
  id: string,
  data: { codigoProducto: string; denominacionArticulo: string }
): Promise<{ success: boolean; message: string }> {
  if (!firestore) {
    return { success: false, message: 'Error de configuración del servidor.' };
  }

  const { codigoProducto, denominacionArticulo } = data;

  if (!codigoProducto || !denominacionArticulo) {
    return { success: false, message: 'El código y la descripción son obligatorios.' };
  }
  
  const trimmedCode = codigoProducto.trim();
  const trimmedName = denominacionArticulo.trim();

  try {
    const articleRef = firestore.collection('articulos').doc(id);
    const articleDoc = await articleRef.get();
    if (!articleDoc.exists) {
        return { success: false, message: 'El artículo que intenta actualizar no existe.' };
    }
    const articleData = articleDoc.data() as ArticleData;

    // Check if another article with the new code already exists for the same client
    const duplicateCheck = await firestore.collection('articulos')
      .where('razonSocial', '==', articleData.razonSocial)
      .where('codigoProducto', '==', trimmedCode)
      .get();

    // Ensure the found duplicate is not the document we are currently editing
    if (!duplicateCheck.empty && duplicateCheck.docs.some(doc => doc.id !== id)) {
        return { success: false, message: `El código de producto "${trimmedCode}" ya existe para este cliente.` };
    }

    await articleRef.update({
      codigoProducto: trimmedCode,
      denominacionArticulo: trimmedName,
    });

    revalidatePath('/gestion-articulos');
    return { success: true, message: 'Artículo actualizado con éxito.' };

  } catch (error) {
    console.error('Error al actualizar el artículo:', error);
    const errorMessage = error instanceof Error ? error.message : 'Ocurrió un error desconocido.';
    return { success: false, message: `Error del servidor: ${errorMessage}` };
  }
}


export async function deleteArticle(id: string): Promise<{ success: boolean; message: string }> {
  if (!firestore) {
    return { success: false, message: 'Error de configuración del servidor.' };
  }

  try {
    await firestore.collection('articulos').doc(id).delete();
    revalidatePath('/gestion-articulos');
    return { success: true, message: 'Artículo eliminado con éxito.' };
  } catch (error) {
    console.error('Error al eliminar el artículo:', error);
    const errorMessage = error instanceof Error ? error.message : 'Ocurrió un error desconocido.';
    return { success: false, message: `Error del servidor: ${errorMessage}` };
  }
}
