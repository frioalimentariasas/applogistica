'use server';

import { firestore } from '@/lib/firebase-admin';
import admin from 'firebase-admin';
import type { ClientSettlementRow } from './generate-client-settlement';

export interface SettlementVersion {
  id: string;
  clientName: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  note: string;
  savedAt: string; // ISO
  savedBy: {
    uid: string;
    displayName: string;
  };
  settlementData: ClientSettlementRow[];
}

export async function saveSettlementVersion(
  data: Omit<SettlementVersion, 'id' | 'savedAt'>
): Promise<{ success: boolean; message: string; versionId?: string }> {
  if (!firestore) {
    return { success: false, message: 'El servidor no está configurado.' };
  }

  try {
    const versionData = {
      ...data,
      savedAt: new Date().toISOString(),
    };
    const docRef = await firestore.collection('saved_liquidations').add(versionData);
    return { success: true, message: 'Versión guardada con éxito.', versionId: docRef.id };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido.';
    return { success: false, message: `Error al guardar la versión: ${errorMessage}` };
  }
}

export async function getSettlementVersions(
  clientName: string,
  startDate: string,
  endDate: string
): Promise<SettlementVersion[]> {
  if (!firestore) {
    console.error('Firestore not available');
    return [];
  }

  try {
    const start = new Date(startDate + 'T00:00:00.000-05:00');
    const end = new Date(endDate + 'T23:59:59.999-05:00');

    const snapshot = await firestore.collection('saved_liquidations')
      .where('clientName', '==', clientName)
      .where('startDate', '==', startDate)
      .where('endDate', '==', endDate)
      .orderBy('savedAt', 'desc')
      .get();
      
    if (snapshot.empty) {
      return [];
    }
    
    return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
            id: doc.id,
            ...data
        } as SettlementVersion;
    });

  } catch (error) {
    console.error('Error fetching settlement versions:', error);
    return [];
  }
}