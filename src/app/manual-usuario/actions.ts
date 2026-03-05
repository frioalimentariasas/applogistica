'use server';

import { firestore } from '@/lib/firebase-admin';
import { revalidatePath } from 'next/cache';

export interface ManualAssetItem {
  url: string;
  type: 'image' | 'pdf';
  caption?: string;
}

export interface ManualAsset {
  items: ManualAssetItem[];
  updatedAt: string;
}

/**
 * Guarda o actualiza la lista de recursos multimedia para una sección del manual.
 */
export async function saveManualAsset(key: string, items: ManualAssetItem[]): Promise<{ success: boolean; message: string }> {
  if (!firestore) {
    return { success: false, message: 'Error de configuración del servidor.' };
  }

  try {
    await firestore.collection('manual_assets').doc(key).set({
      items,
      updatedAt: new Date().toISOString(),
    });
    
    revalidatePath('/manual-usuario');
    return { success: true, message: 'Sección del manual actualizada correctamente.' };
  } catch (error) {
    console.error(`Error saving manual assets for ${key}:`, error);
    return { success: false, message: 'No se pudo guardar la información.' };
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
      const data = doc.data();
      // Soporte para migración de formato antiguo (un solo item) a nuevo (lista de items)
      if (data.url) {
        assets[doc.id] = {
          items: [{ url: data.url, type: data.type }],
          updatedAt: data.updatedAt
        };
      } else {
        assets[doc.id] = data as ManualAsset;
      }
    });
    return assets;
  } catch (error) {
    console.error("Error fetching manual assets:", error);
    return {};
  }
}
