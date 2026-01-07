
'use server';

import { firestore } from '@/lib/firebase-admin';
import { revalidatePath } from 'next/cache';
import type { SettlementVersion } from '@/app/billing-reports/actions/settlement-versions';
import { startOfDay, endOfDay, parseISO } from 'date-fns';

export interface VersionSearchResult extends Omit<SettlementVersion, 'settlementData'> {}

export async function searchVersions(criteria: { clientName?: string, dateRange?: { from: Date, to: Date } }): Promise<VersionSearchResult[]> {
  if (!firestore) {
    throw new Error('El servidor no está configurado correctamente.');
  }

  let query: FirebaseFirestore.Query = firestore.collection('saved_liquidations');
  
  if (criteria.clientName) {
    query = query.where('clientName', '==', criteria.clientName);
  }
  
  if (criteria.dateRange?.from) {
    query = query.where('startDate', '>=', format(criteria.dateRange.from, 'yyyy-MM-dd'));
  }
  if (criteria.dateRange?.to) {
    query = query.where('endDate', '<=', format(criteria.dateRange.to, 'yyyy-MM-dd'));
  }

  try {
    const snapshot = await query.orderBy('savedAt', 'desc').get();
    
    if (snapshot.empty) {
      return [];
    }

    return snapshot.docs.map(doc => {
      const data = doc.data();
      const { settlementData, ...rest } = data; // Exclude settlementData
      return {
        id: doc.id,
        ...rest,
      } as VersionSearchResult;
    });

  } catch (error: any) {
    if (error.message?.includes('requires an index')) {
      throw new Error(error.message); // Re-throw to be caught by the client
    }
    console.error('Error searching versions:', error);
    throw new Error('No se pudieron buscar las versiones guardadas.');
  }
}

export async function updateVersionNote(versionId: string, newNote: string): Promise<{ success: boolean; message: string }> {
  if (!firestore) {
    return { success: false, message: 'El servidor no está configurado.' };
  }
  try {
    await firestore.collection('saved_liquidations').doc(versionId).update({ note: newNote });
    revalidatePath('/control-versiones-liquidacion');
    return { success: true, message: 'Nota actualizada con éxito.' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido.';
    return { success: false, message: `Error al actualizar: ${message}` };
  }
}

export async function deleteVersions(versionIds: string[]): Promise<{ success: boolean; message: string }> {
  if (!firestore) {
    return { success: false, message: 'El servidor no está configurado.' };
  }
  if (!versionIds || versionIds.length === 0) {
    return { success: false, message: 'No se seleccionaron versiones para eliminar.' };
  }

  try {
    const batch = firestore.batch();
    versionIds.forEach(id => {
      batch.delete(firestore.collection('saved_liquidations').doc(id));
    });
    await batch.commit();
    revalidatePath('/control-versiones-liquidacion');
    return { success: true, message: `${versionIds.length} versión(es) eliminada(s) con éxito.` };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido.';
    return { success: false, message: `Error al eliminar: ${message}` };
  }
}
