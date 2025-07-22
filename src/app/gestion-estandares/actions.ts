
'use server';

import { firestore } from '@/lib/firebase-admin';
import { revalidatePath } from 'next/cache';

export interface PerformanceStandard {
  id: string;
  clientName: string; // "TODOS" or a specific client name
  operationType: 'recepcion' | 'despacho' | 'TODAS';
  productType: 'fijo' | 'variable' | 'TODOS';
  minTons: number;
  maxTons: number;
  baseMinutes: number;
}

// Fetches all standards and ensures numeric types
export async function getPerformanceStandards(): Promise<PerformanceStandard[]> {
  if (!firestore) return [];
  try {
    const snapshot = await firestore.collection('performance_standards').get();
    if (snapshot.empty) return [];
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        clientName: data.clientName,
        operationType: data.operationType,
        productType: data.productType,
        minTons: Number(data.minTons),
        maxTons: Number(data.maxTons),
        baseMinutes: Number(data.baseMinutes),
      } as PerformanceStandard;
    });
  } catch (error) {
    console.error("Error fetching performance standards:", error);
    return [];
  }
}

// Action to add a new standard
export async function addPerformanceStandard(data: Omit<PerformanceStandard, 'id'>): Promise<{ success: boolean; message: string; newStandard?: PerformanceStandard }> {
  if (!firestore) return { success: false, message: 'Error de configuración del servidor.' };
  
  const dataToSave = {
    ...data,
    minTons: Number(data.minTons),
    maxTons: Number(data.maxTons),
    baseMinutes: Number(data.baseMinutes),
  };

  try {
    const docRef = await firestore.collection('performance_standards').add(dataToSave);
    revalidatePath('/gestion-estandares');
    return { success: true, message: 'Estándar creado con éxito.', newStandard: { id: docRef.id, ...dataToSave } };
  } catch (error) {
    console.error('Error al agregar estándar:', error);
    return { success: false, message: 'Ocurrió un error en el servidor.' };
  }
}

// Action to update a standard
export async function updatePerformanceStandard(id: string, data: Omit<PerformanceStandard, 'id'>): Promise<{ success: boolean; message: string }> {
  if (!firestore) return { success: false, message: 'Error de configuración del servidor.' };
  
  const dataToUpdate = {
    ...data,
    minTons: Number(data.minTons),
    maxTons: Number(data.maxTons),
    baseMinutes: Number(data.baseMinutes),
  };
  
  try {
    await firestore.collection('performance_standards').doc(id).update(dataToUpdate);
    revalidatePath('/gestion-estandares');
    return { success: true, message: 'Estándar actualizado con éxito.' };
  } catch (error) {
    console.error('Error al actualizar estándar:', error);
    return { success: false, message: 'Ocurrió un error en el servidor.' };
  }
}

// Action to delete one or more standards
export async function deleteMultipleStandards(ids: string[]): Promise<{ success: boolean; message: string }> {
  if (!firestore) return { success: false, message: 'Error de configuración del servidor.' };
  if (!ids || ids.length === 0) return { success: false, message: 'No se seleccionaron estándares para eliminar.' };
  
  try {
    const batch = firestore.batch();
    ids.forEach(id => {
      const docRef = firestore.collection('performance_standards').doc(id);
      batch.delete(docRef);
    });
    await batch.commit();
    revalidatePath('/gestion-estandares');
    return { success: true, message: `${ids.length} estándar(es) eliminado(s) con éxito.` };
  } catch (error) {
    console.error('Error al eliminar estándares:', error);
    return { success: false, message: 'Ocurrió un error en el servidor.' };
  }
}
