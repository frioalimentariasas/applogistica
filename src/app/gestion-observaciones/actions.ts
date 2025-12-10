
'use server';

import { firestore } from '@/lib/firebase-admin';
import { revalidatePath } from 'next/cache';

export interface StandardObservation {
  id: string;
  name: string;
  quantityType: 'KILOS' | 'TONELADA' | 'PALETA' | 'UNIDAD' | 'CAJA' | 'SACO' | 'CANASTILLA';
}

export async function getStandardObservations(): Promise<StandardObservation[]> {
  if (!firestore) return [];
  try {
    const snapshot = await firestore.collection('standard_observations').orderBy('name').get();
    if (snapshot.empty) return [];
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    } as StandardObservation));
  } catch (error) {
    console.error("Error fetching standard observations:", error);
    return [];
  }
}

export async function addStandardObservation(data: Omit<StandardObservation, 'id'>): Promise<{ success: boolean; message: string; newObservation?: StandardObservation }> {
  if (!firestore) return { success: false, message: 'Error de configuración del servidor.' };

  const { name, quantityType } = data;
  if (!name || !quantityType) return { success: false, message: 'Todos los campos son obligatorios.' };

  try {
    const docRef = await firestore.collection('standard_observations').add(data);
    revalidatePath('/gestion-observaciones');
    // Revalidate forms that use these observations
    revalidatePath('/fixed-weight-form');
    revalidatePath('/variable-weight-form');
    revalidatePath('/variable-weight-reception-form');
    return { success: true, message: 'Observación creada con éxito.', newObservation: { id: docRef.id, ...data } };
  } catch (error) {
    console.error('Error al agregar observación:', error);
    return { success: false, message: 'Ocurrió un error en el servidor.' };
  }
}

export async function updateStandardObservation(id: string, data: Omit<StandardObservation, 'id'>): Promise<{ success: boolean; message: string }> {
  if (!firestore) return { success: false, message: 'Error de configuración del servidor.' };
  try {
    await firestore.collection('standard_observations').doc(id).update(data);
    revalidatePath('/gestion-observaciones');
    revalidatePath('/fixed-weight-form');
    revalidatePath('/variable-weight-form');
    revalidatePath('/variable-weight-reception-form');
    return { success: true, message: 'Observación actualizada con éxito.' };
  } catch (error) {
    console.error('Error al actualizar observación:', error);
    return { success: false, message: 'Ocurrió un error en el servidor.' };
  }
}

export async function deleteStandardObservation(id: string): Promise<{ success: boolean; message: string }> {
  if (!firestore) return { success: false, message: 'Error de configuración del servidor.' };
  try {
    await firestore.collection('standard_observations').doc(id).delete();
    revalidatePath('/gestion-observaciones');
    revalidatePath('/fixed-weight-form');
    revalidatePath('/variable-weight-form');
    revalidatePath('/variable-weight-reception-form');
    return { success: true, message: 'Observación eliminada con éxito.' };
  } catch (error) {
    console.error('Error al eliminar observación:', error);
    return { success: false, message: 'Ocurrió un error en el servidor.' };
  }
}
