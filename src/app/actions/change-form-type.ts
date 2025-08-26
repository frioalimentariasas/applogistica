
'use server';

import { firestore } from '@/lib/firebase-admin';
import { revalidatePath } from 'next/cache';

export async function changeFormType(
  submissionId: string
): Promise<{ success: boolean; message: string }> {
  if (!firestore) {
    return { success: false, message: 'El servidor no está configurado correctamente.' };
  }
  if (!submissionId) {
    return { success: false, message: 'ID de formato no proporcionado.' };
  }

  const docRef = firestore.collection('submissions').doc(submissionId);

  try {
    const doc = await docRef.get();
    if (!doc.exists) {
      throw new Error('No se encontró el formato para actualizar.');
    }

    const submissionData = doc.data();
    if (!submissionData) {
        throw new Error('No se encontraron datos en el formato.');
    }

    const currentFormType = submissionData.formType as string;
    let newFormType = currentFormType;

    if (currentFormType.includes('recepcion')) {
        newFormType = currentFormType.replace('recepcion', 'despacho');
    } else if (currentFormType.includes('reception')) {
        newFormType = currentFormType.replace('reception', 'despacho');
    } else if (currentFormType.includes('despacho')) {
        newFormType = currentFormType.replace('despacho', 'recepcion');
    } else {
        return { success: false, message: 'El tipo de formato actual no es válido para el cambio.' };
    }
    
    await docRef.update({ formType: newFormType });

    revalidatePath('/consultar-formatos');
    return { success: true, message: 'El tipo de formato ha sido cambiado con éxito.' };

  } catch (error) {
    console.error(`Error changing form type for submission ${submissionId}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Ocurrió un error desconocido.';
    return { success: false, message: `Error del servidor: ${errorMessage}` };
  }
}
