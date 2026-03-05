'use server';

import { firestore } from '@/lib/firebase-admin';
import { revalidatePath } from 'next/cache';

export interface ManualAsset {
  url: string;
  type: 'image' | 'pdf';
  updatedAt: string;
}

/**
 * Guarda o actualiza la referencia de un recurso multimedia para el manual.
 */
export async function saveManualAsset(key: string, url: string, type: 'image' | 'pdf'): Promise<{ success: boolean; message: string }> {
  if (!firestore) {
    return { success: false, message: 'Error de configuración del servidor.' };
  }

  try {
    await firestore.collection('manual_assets').doc(key).set({
      url,
      type,
      updatedAt: new Date().toISOString(),
    });
    
    revalidatePath('/manual-usuario');
    return { success: true, message: 'Recurso guardado correctamente.' };
  } catch (error) {
    console.error(`Error saving manual asset ${key}:`, error);
    return { success: false, message: 'No se pudo guardar el recurso.' };
  }
}

/**
 * Obtiene todos los recursos multimedia personalizados del manual.
 */
export async function getManualAssets(): Promise<Record<string, ManualAsset>> {
  if (!firestore) return {};

  try {
    const snapshot = await firestore.collection('manual_assets').get();
    const assets: Record<string, ManualAsset> = {};
    snapshot.forEach(doc => {
      assets[doc.id] = doc.data() as ManualAsset;
    });
    return assets;
  } catch (error) {
    console.error("Error fetching manual assets:", error);
    return {};
  }
}
