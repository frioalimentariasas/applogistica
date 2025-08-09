
'use server';

import { firestore } from '@/lib/firebase-admin';

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
 * This function is intended to be called internally by other server actions.
 */
export async function addStandardNoveltyType(name: string): Promise<void> {
  if (!firestore) {
    console.error('Firestore not initialized, cannot add novelty type.');
    return;
  }
  
  const trimmedName = name.trim().toUpperCase();
  if (!trimmedName) return;

  try {
    const noveltyTypesRef = firestore.collection('standard_novelty_types');
    const querySnapshot = await noveltyTypesRef.where('name', '==', trimmedName).limit(1).get();

    // If the novelty type does not exist, add it.
    if (querySnapshot.empty) {
      await noveltyTypesRef.add({ name: trimmedName });
      console.log(`Added new standard novelty type: "${trimmedName}"`);
    }
  } catch (error) {
    console.error(`Error adding standard novelty type "${trimmedName}":`, error);
    // We don't re-throw the error to avoid failing the primary operation (e.g., adding an operation novelty).
  }
}
