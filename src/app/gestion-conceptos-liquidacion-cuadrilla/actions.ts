

'use server';

import { firestore } from '@/lib/firebase-admin';
import { revalidatePath } from 'next/cache';

export interface BillingConcept {
  id: string;
  conceptName: string;
  clientNames: string[]; // "TODOS (Cualquier Cliente)" or specific client names
  operationType: 'recepcion' | 'despacho' | 'TODAS';
  productType: 'fijo' | 'variable' | 'TODOS';
  unitOfMeasure: 'TONELADA' | 'PALETA' | 'UNIDAD' | 'CAJA' | 'SACO' | 'CANASTILLA';
  value: number;
}

// Fetches all concepts
export async function getBillingConcepts(): Promise<BillingConcept[]> {
  if (!firestore) return [];
  try {
    const snapshot = await firestore.collection('billing_concepts').orderBy('conceptName').get();
    if (snapshot.empty) return [];
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        conceptName: data.conceptName,
        clientNames: Array.isArray(data.clientNames) ? data.clientNames : [data.clientName], // Backward compatibility
        operationType: data.operationType,
        productType: data.productType,
        unitOfMeasure: data.unitOfMeasure,
        value: Number(data.value),
      } as BillingConcept;
    });
  } catch (error) {
    console.error("Error fetching billing concepts:", error);
    return [];
  }
}

// Action to add a new concept
export async function addBillingConcept(data: Omit<BillingConcept, 'id'>): Promise<{ success: boolean; message: string; newConcept?: BillingConcept }> {
  if (!firestore) return { success: false, message: 'Error de configuración del servidor.' };
  
  try {
    const docRef = await firestore.collection('billing_concepts').add({
      ...data,
      value: Number(data.value)
    });
    revalidatePath('/gestion-conceptos-liquidacion-cuadrilla');
    return { success: true, message: 'Concepto agregado con éxito.', newConcept: { id: docRef.id, ...data } };
  } catch (error) {
    console.error('Error al agregar concepto de liquidación:', error);
    return { success: false, message: 'Ocurrió un error en el servidor.' };
  }
}

// Action to update a concept
export async function updateBillingConcept(id: string, data: Omit<BillingConcept, 'id'>): Promise<{ success: boolean; message: string }> {
  if (!firestore) return { success: false, message: 'Error de configuración del servidor.' };
  
  const dataToUpdate = {
    ...data,
    value: Number(data.value),
  };
  
  try {
    await firestore.collection('billing_concepts').doc(id).update(dataToUpdate);
    revalidatePath('/gestion-conceptos-liquidacion-cuadrilla');
    return { success: true, message: 'Concepto actualizado con éxito.' };
  } catch (error) {
    console.error('Error al actualizar concepto:', error);
    return { success: false, message: 'Ocurrió un error en el servidor.' };
  }
}


// Action to delete one or more concepts
export async function deleteMultipleBillingConcepts(ids: string[]): Promise<{ success: boolean; message: string }> {
  if (!firestore) return { success: false, message: 'Error de configuración del servidor.' };
  if (!ids || ids.length === 0) return { success: false, message: 'No se seleccionaron conceptos para eliminar.' };
  
  try {
    const batch = firestore.batch();
    ids.forEach(id => {
      const docRef = firestore.collection('billing_concepts').doc(id);
      batch.delete(docRef);
    });
    await batch.commit();
    revalidatePath('/gestion-conceptos-liquidacion-cuadrilla');
    return { success: true, message: `${ids.length} concepto(s) eliminado(s) con éxito.` };
  } catch (error) {
    console.error('Error al eliminar conceptos:', error);
    return { success: false, message: 'Ocurrió un error en el servidor.' };
  }
}
