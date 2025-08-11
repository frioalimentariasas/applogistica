
'use server';

import { firestore } from '@/lib/firebase-admin';
import { revalidatePath } from 'next/cache';

interface ProductWeightData {
  codigo: string;
  pesoBrutoKg: number;
  pesoNetoKg: number;
}

export async function legalizeWeights(
  submissionId: string,
  productsToUpdate: ProductWeightData[]
): Promise<{ success: boolean; message: string }> {
  if (!firestore) {
    return { success: false, message: 'El servidor no está configurado correctamente.' };
  }
  if (!submissionId || !productsToUpdate || productsToUpdate.length === 0) {
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

      const updatedProducts = (submissionData.formData.productos || []).map((existingProduct: any) => {
        const updateInfo = productsToUpdate.find(
          (p) => p.codigo === existingProduct.codigo
        );
        if (updateInfo) {
          return {
            ...existingProduct,
            pesoBrutoKg: updateInfo.pesoBrutoKg,
            pesoNetoKg: updateInfo.pesoNetoKg,
          };
        }
        return existingProduct;
      });

      const newFormData = {
        ...submissionData.formData,
        productos: updatedProducts,
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

  