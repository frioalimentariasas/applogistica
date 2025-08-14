
'use server';

import { firestore } from '@/lib/firebase-admin';
import { revalidatePath } from 'next/cache';

export async function legalizeWeights(
  submissionId: string,
  totalPesoBrutoKg: number
): Promise<{ success: boolean; message: string }> {
  if (!firestore) {
    return { success: false, message: 'El servidor no está configurado correctamente.' };
  }
  if (!submissionId || totalPesoBrutoKg === undefined || totalPesoBrutoKg === null) {
    return { success: false, message: 'Datos insuficientes para legalizar el peso.' };
  }

  const docRef = firestore.collection('submissions').doc(submissionId);

  try {
    await firestore.runTransaction(async (transaction) => {
      const doc = await transaction.get(docRef);
      if (!doc.exists) {
        throw new Error('No se encontró el formato para actualizar.');
      }

      const submissionData = doc.data();
      if (!submissionData) {
        throw new Error('No se encontraron datos en el formato.');
      }

      const newFormData = {
        ...submissionData.formData,
        totalPesoBrutoKg: Number(totalPesoBrutoKg), // Ensure it's stored as a number
      };

      transaction.update(docRef, { formData: newFormData });
    });

    revalidatePath('/crew-performance-report');
    return { success: true, message: 'Pesos legalizados y formato actualizado con éxito.' };
  } catch (error) {
    console.error(`Error legalizing weights for submission ${submissionId}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Ocurrió un error desconocido.';
    return { success: false, message: `Error del servidor: ${errorMessage}` };
  }
}
