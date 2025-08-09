'use server';

import { firestore } from '@/lib/firebase-admin';
import { revalidatePath } from 'next/cache';
import type { Timestamp } from 'firebase-admin/firestore';

export interface NoveltyData {
  id?: string;
  operationId: string;
  type: string;
  downtimeMinutes: number;
  impactsCrewProductivity: boolean; // if true, it does NOT affect (reduce) the operational time
  createdAt: string;
  createdBy: {
    uid: string;
    displayName: string;
  };
}

export async function addNoveltyToOperation(data: NoveltyData): Promise<{ success: boolean; message: string; novelty?: NoveltyData }> {
  if (!firestore) return { success: false, message: 'Error de configuración del servidor.' };

  try {
    const docRef = await firestore.collection('operation_novelties').add(data);
    revalidatePath('/crew-performance-report');
    return { success: true, message: 'Novedad agregada con éxito.', novelty: { ...data, id: docRef.id } };
  } catch (error) {
    console.error('Error al agregar novedad:', error);
    const errorMessage = error instanceof Error ? error.message : 'Ocurrió un error desconocido.';
    return { success: false, message: `Error del servidor: ${errorMessage}` };
  }
}

export async function getNoveltiesForOperation(operationId: string): Promise<NoveltyData[]> {
  if (!firestore) return [];

  try {
    const snapshot = await firestore.collection('operation_novelties')
      .where('operationId', '==', operationId)
      .get();
      
    if (snapshot.empty) return [];

    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: (data.createdAt as Timestamp).toDate().toISOString(),
      } as NoveltyData;
    });
  } catch (error) {
    console.error(`Error fetching novelties for operation ${operationId}:`, error);
    return [];
  }
}
