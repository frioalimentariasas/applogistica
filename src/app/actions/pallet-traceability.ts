
'use server';

import admin from 'firebase-admin';
import { firestore } from '@/lib/firebase-admin';
import type { FormSubmissionData } from './save-form';

export interface PalletMovement {
  id: string;
  type: 'Recepción' | 'Despacho';
  date: string;
  pedidoSislog: string;
  userDisplayName: string;
  items: any[];
}

export interface PalletTraceabilityResult {
  reception: PalletMovement | null;
  dispatches: PalletMovement[];
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

export async function getPalletMovements(
  palletCode: string,
  clientName: string
): Promise<PalletTraceabilityResult> {
  if (!firestore) {
    throw new Error('El servidor no está configurado correctamente.');
  }
  if (!clientName || !palletCode) {
    return { reception: null, dispatches: [] };
  }

  try {
    let reception: PalletMovement | null = null;
    const dispatches: PalletMovement[] = [];

    // Query all variable weight submissions for the client
    const submissionsSnapshot = await firestore.collection('submissions')
      .where('formData.cliente', '==', clientName)
      .where('formType', 'in', [
          'variable-weight-reception',
          'variable-weight-recepcion',
          'variable-weight-despacho'
      ])
      .orderBy('formData.fecha', 'asc')
      .get();
      
    submissionsSnapshot.forEach(doc => {
      const submission = serializeTimestamps(doc.data()) as FormSubmissionData;
      const { formType, formData } = submission;

      // Unify items from different form structures
      const allItems = (formData.items || [])
          .concat((formData.placas || []).flatMap((p: any) => p?.items || []))
          .concat((formData.destinos || []).flatMap((d: any) => d?.items || []));

      // Check if the pallet code exists in this submission's items
      const relevantItems = allItems.filter((item: any) => item && String(item.paleta) === palletCode);

      if (relevantItems.length > 0) {
        if (formType.includes('reception') || formType.includes('recepcion')) {
            // There should only be one reception for a given pallet code and client
            if (!reception) {
                reception = {
                    id: doc.id,
                    type: 'Recepción',
                    date: formData.fecha,
                    pedidoSislog: formData.pedidoSislog,
                    userDisplayName: submission.userDisplayName,
                    items: relevantItems,
                };
            }
        } else if (formType.includes('despacho')) {
            dispatches.push({
                id: doc.id,
                type: 'Despacho',
                date: formData.fecha,
                pedidoSislog: formData.pedidoSislog,
                userDisplayName: submission.userDisplayName,
                items: relevantItems,
            });
        }
      }
    });

    return { reception, dispatches };

  } catch (error) {
    console.error(`Error fetching movements for pallet ${palletCode}:`, error);
    if (error instanceof Error && error.message.includes('requires an index')) {
      throw new Error(`La base de datos requiere un índice compuesto que no existe. Por favor, revise la consola del servidor para ver el enlace de creación.`);
    }
    throw new Error('No se pudieron buscar los movimientos de la paleta.');
  }
}
