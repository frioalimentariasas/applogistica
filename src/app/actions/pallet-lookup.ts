
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

export async function getPalletInfoByCode(palletCode: string, clientName: string): Promise<PalletLookupResult> {
  if (!firestore) {
    return { success: false, message: 'El servidor no está configurado correctamente.' };
  }
  if (!clientName) {
    return { success: false, message: 'Se debe proporcionar un cliente para la búsqueda.' };
  }

  try {
    // 1. Check if the pallet has already been dispatched FOR THIS CLIENT.
    const dispatchSnapshot = await firestore.collection('submissions')
      .where('formType', '==', 'variable-weight-despacho')
      .where('formData.cliente', '==', clientName)
      .get();
      
    for (const doc of dispatchSnapshot.docs) {
      const submission = serializeTimestamps(doc.data());
      if (!submission.formData) continue;
      
      const allDispatchedItems = (submission.formData.items || [])
        .concat((submission.formData.destinos || []).flatMap((d: any) => d?.items || []));

      if (allDispatchedItems.some((item: any) => item && String(item.paleta) === palletCode)) {
        return { success: false, message: `La paleta ${palletCode} ya ha sido despachada para este cliente.`, alreadyDispatched: true };
      }
    }

    // 2. Find the reception information for the pallet, only in variable weight receptions with an order type FOR THIS CLIENT.
    const receptionSnapshot = await firestore.collection('submissions')
      .where('formType', 'in', ['variable-weight-reception', 'variable-weight-recepcion'])
      .where('formData.cliente', '==', clientName)
      .get();

    let receptionItem: any = null;

    for (const doc of receptionSnapshot.docs) {
        const submission = serializeTimestamps(doc.data());
        if (!submission.formData || !submission.formData.tipoPedido) {
            continue; 
        }

        const allReceptionItems = (submission.formData.items || [])
          .concat((submission.formData.placas || []).flatMap((p: any) => p?.items || []));

        const foundItem = allReceptionItems.find((item: any) => item && String(item.paleta) === palletCode);

        if (foundItem) {
            receptionItem = foundItem;
            break; 
        }
    }
    
    if (receptionItem) {
        const pesoBruto = Number(receptionItem.pesoBruto) || 0;
        const taraEstiba = Number(receptionItem.taraEstiba) || 0;
        const taraCaja = Number(receptionItem.taraCaja) || 0;
        const cantidadPorPaleta = Number(receptionItem.cantidadPorPaleta) || 0;
        const totalTaraCaja = taraCaja * cantidadPorPaleta;

        return {
            success: true,
            message: 'Información de la paleta encontrada.',
            palletInfo: {
                codigo: receptionItem.codigo || '',
                descripcion: receptionItem.descripcion || '',
                lote: receptionItem.lote || '',
                presentacion: receptionItem.presentacion || '',
                cantidadPorPaleta: cantidadPorPaleta,
                pesoBruto: pesoBruto,
                taraEstiba: taraEstiba,
                taraCaja: taraCaja,
                totalTaraCaja: totalTaraCaja,
                pesoNeto: pesoBruto - taraEstiba - totalTaraCaja,
            }
        };
    }

    return { success: false, message: `No se encontró información de recepción para la paleta ${palletCode} del cliente ${clientName}.` };
    
  } catch (error) {
    console.error(`Error buscando información de la paleta ${palletCode}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Ocurrió un error desconocido.';
    return { success: false, message: `Error del servidor: ${errorMessage}` };
  }
}
