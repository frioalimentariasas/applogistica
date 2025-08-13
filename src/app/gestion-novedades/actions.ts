
'use server';

import { firestore } from '@/lib/firebase-admin';
import { revalidatePath } from 'next/cache';

export interface StandardNoveltyType {
  id: string;
  name: string;
}

/**
 * Fetches all standard novelty types from Firestore.
 */
export async function getStandardNoveltyTypes(): Promise<StandardNoveltyType[]> {
  if (!firestore) return [];
  try {
    const snapshot = await firestore.collection('standard_novelty_types').orderBy('name').get();
    if (snapshot.empty) return [];
    return snapshot.docs.map(doc => ({
      id: doc.id,
      name: doc.data().name,
    } as StandardNoveltyType));
  } catch (error) {
    console.error("Error fetching standard novelty types:", error);
    return [];
  }
}

/**
 * Adds a new standard novelty type if it doesn't already exist (case-insensitive).
 */
export async function addStandardNoveltyType(name: string): Promise<{ success: boolean; message: string; newNovelty?: StandardNoveltyType }> {
  if (!firestore) {
    return { success: false, message: 'Error de configuración del servidor.' };
  }
  
  const trimmedName = name.trim().toUpperCase();
  if (!trimmedName) {
      return { success: false, message: 'El nombre de la novedad no puede estar vacío.' };
  }

  try {
    const noveltyTypesRef = firestore.collection('standard_novelty_types');
    const querySnapshot = await noveltyTypesRef.where('name', '==', trimmedName).limit(1).get();

    if (!querySnapshot.empty) {
        return { success: false, message: `La novedad "${trimmedName}" ya existe.` };
    }
    
    const docRef = await noveltyTypesRef.add({ name: trimmedName });
    revalidatePath('/gestion-novedades');
    return { success: true, message: 'Novedad agregada con éxito.', newNovelty: { id: docRef.id, name: trimmedName } };

  } catch (error) {
    console.error(`Error adding standard novelty type "${trimmedName}":`, error);
    const errorMessage = error instanceof Error ? error.message : 'Ocurrió un error desconocido.';
    return { success: false, message: `Error del servidor: ${errorMessage}` };
  }
}

/**
 * Deletes a standard novelty type from Firestore.
 */
export async function deleteStandardNoveltyType(id: string): Promise<{ success: boolean; message: string }> {
  if (!firestore) {
    return { success: false, message: 'Error de configuración del servidor.' };
  }

  try {
    await firestore.collection('standard_novelty_types').doc(id).delete();
    revalidatePath('/gestion-novedades');
    return { success: true, message: 'Novedad eliminada con éxito.' };
  } catch (error) {
    console.error(`Error deleting novelty type ${id}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Ocurrió un error desconocido.';
    return { success: false, message: `Error del servidor: ${errorMessage}` };
  }
}
