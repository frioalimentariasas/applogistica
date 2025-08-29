
'use server';

import admin from 'firebase-admin';
import { firestore } from '@/lib/firebase-admin';

export interface PalletInfo {
  codigo: string;
  descripcion: string;
  lote: string;
  presentacion: string;
  cantidadPorPaleta: number;
  pesoBruto: number;
  taraEstiba: number;
  taraCaja: number;
  totalTaraCaja: number;
  pesoNeto: number;
}

export interface PalletLookupResult {
  success: boolean;
  message: string;
  palletInfo?: PalletInfo;
  alreadyDispatched?: boolean;
}

const serializeTimestamps = (data: any): any => {
    if (data === null || data === undefined || typeof data !== 'object') {
      return data;
    }
    if (data instanceof admin.firestore.Timestamp) {
      return data.toDate().toISOString();
    }
    if (Array.isArray(data)) {
      return data.map(item => serializeTimestamps(item));
    }
    const newObj: { [key: string]: any } = {};
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        newObj[key] = serializeTimestamps(data[key]);
      }
    }
    return newObj;
};

export async function getPalletInfoByCode(palletCode: string): Promise<PalletLookupResult> {
  if (!firestore) {
    return { success: false, message: 'El servidor no está configurado correctamente.' };
  }

  try {
    const submissionsSnapshot = await firestore.collection('submissions').get();
    
    let receptionItem: any = null;
    let isDispatched = false;

    for (const doc of submissionsSnapshot.docs) {
      const submission = serializeTimestamps(doc.data());
      
      if (!submission.formData) {
          continue; 
      }

      const itemsFromItems = Array.isArray(submission.formData.items) ? submission.formData.items : [];
      const itemsFromPlacas = Array.isArray(submission.formData.placas) 
          ? submission.formData.placas.flatMap((p: any) => (p && Array.isArray(p.items) ? p.items : []))
          : [];
      const itemsFromDestinos = Array.isArray(submission.formData.destinos)
          ? submission.formData.destinos.flatMap((d: any) => (d && Array.isArray(d.items) ? d.items : []))
          : [];

      const allItems = [...itemsFromItems, ...itemsFromPlacas, ...itemsFromDestinos];
        
      for (const item of allItems) {
        if (item && item.paleta && String(item.paleta) === palletCode) {
            if (submission.formType.includes('reception') || submission.formType.includes('recepcion')) {
                receptionItem = item;
            } else if (submission.formType.includes('despacho')) {
                isDispatched = true;
                break;
            }
        }
      }
      if(isDispatched) break;
    }

    if (isDispatched) {
        return { success: false, message: `La paleta ${palletCode} ya ha sido despachada.`, alreadyDispatched: true };
    }
    
    if (receptionItem) {
        return {
            success: true,
            message: 'Información de la paleta encontrada.',
            palletInfo: {
                codigo: receptionItem.codigo || '',
                descripcion: receptionItem.descripcion || '',
                lote: receptionItem.lote || '',
                presentacion: receptionItem.presentacion || '',
                cantidadPorPaleta: Number(receptionItem.cantidadPorPaleta) || 0,
                pesoBruto: Number(receptionItem.pesoBruto) || 0,
                taraEstiba: Number(receptionItem.taraEstiba) || 0,
                taraCaja: Number(receptionItem.taraCaja) || 0,
                totalTaraCaja: Number(receptionItem.totalTaraCaja) || 0,
                pesoNeto: Number(receptionItem.pesoNeto) || 0,
            }
        };
    }

    return { success: false, message: `No se encontró información para la paleta con código ${palletCode}.` };
    
  } catch (error) {
    console.error(`Error buscando información de la paleta ${palletCode}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Ocurrió un error desconocido.';
    return { success: false, message: `Error del servidor: ${errorMessage}` };
  }
}
