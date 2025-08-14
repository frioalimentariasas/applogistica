

'use server';

import { firestore } from '@/lib/firebase-admin';
import { revalidatePath } from 'next/cache';
import type { Timestamp } from 'firebase-admin/firestore';
import { addStandardNoveltyType } from '@/app/gestion-novedades/actions';

export interface NoveltyData {
  id?: string;
  operationId: string;
  type: string;
  downtimeMinutes: number;
  purpose: 'justification' | 'settlement'; // 'justification' affects productivity time, 'settlement' is informational for billing.
  createdAt: string;
  createdBy: {
    uid: string;
    displayName: string;
  };
}

export async function addNoveltyToOperation(data: Omit<NoveltyData, 'id' | 'createdAt' | 'createdBy' | 'purpose'> & { operationId: string; createdBy: { uid: string; displayName: string; } }): Promise<{ success: boolean; message: string; novelty?: NoveltyData }> {
  if (!firestore) return { success: false, message: 'Error de configuración del servidor.' };

  const noveltyWithTimestamp = {
      ...data,
      createdAt: new Date().toISOString(),
      purpose: 'justification' as const // Default to justification, logic is handled in report
  };

  try {
    // Check if the novelty type is a new one and add it to the standard list if so.
    await addStandardNoveltyType(data.type);
    
    const docRef = await firestore.collection('operation_novelties').add(noveltyWithTimestamp);
    revalidatePath('/crew-performance-report');
    return { success: true, message: 'Novedad agregada con éxito.', novelty: { ...noveltyWithTimestamp, id: docRef.id } };
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

export async function deleteNovelty(noveltyId: string): Promise<{ success: boolean; message: string }> {
  if (!firestore) return { success: false, message: 'Error de configuración del servidor.' };
  
  if (!noveltyId) return { success: false, message: 'ID de novedad no proporcionado.' };

  try {
    await firestore.collection('operation_novelties').doc(noveltyId).delete();
    revalidatePath('/crew-performance-report');
    return { success: true, message: 'Novedad eliminada con éxito.' };
  } catch (error) {
    console.error(`Error al eliminar novedad ${noveltyId}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Ocurrió un error desconocido.';
    return { success: false, message: `Error del servidor: ${errorMessage}` };
  }
}
