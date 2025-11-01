'use server';

import admin from 'firebase-admin';
import { firestore } from '@/lib/firebase-admin';
import type { FormSubmissionData } from '@/app/actions/save-form';

export interface ContainerMovement {
  id: string;
  type: 'Recepción' | 'Despacho' | 'N/A';
  date: string;
  pedidoSislog: string;
  userDisplayName: string;
  cliente: string;
  placa: string;
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

const getOperationTypeName = (formType: string): 'Recepción' | 'Despacho' | 'N/A' => {
    if (formType.includes('recepcion') || formType.includes('reception')) return 'Recepción';
    if (formType.includes('despacho')) return 'Despacho';
    return 'N/A';
};

export async function getContainerMovements(
  containerNumber: string
): Promise<ContainerMovement[]> {
  if (!firestore) {
    throw new Error('El servidor no está configurado correctamente.');
  }
  if (!containerNumber) {
    return [];
  }

  try {
    const submissionsSnapshot = await firestore.collection('submissions')
      .where('formData.contenedor', '==', containerNumber)
      .orderBy('formData.fecha', 'asc')
      .get();
      
    if (submissionsSnapshot.empty) {
        return [];
    }

    const movements = submissionsSnapshot.docs.map(doc => {
      const submission = serializeTimestamps(doc.data()) as FormSubmissionData;
      const { formType, formData } = submission;
      
      return {
        id: doc.id,
        type: getOperationTypeName(formType),
        date: formData.fecha,
        pedidoSislog: formData.pedidoSislog,
        userDisplayName: submission.userDisplayName,
        cliente: formData.nombreCliente || formData.cliente,
        placa: formData.placa,
      };
    });

    return movements;

  } catch (error) {
    console.error(`Error fetching movements for container ${containerNumber}:`, error);
    if (error instanceof Error && error.message.includes('requires an index')) {
      throw new Error(`La base de datos requiere un índice compuesto que no existe. Por favor, revise la consola del servidor para ver el enlace de creación.`);
    }
    throw new Error('No se pudieron buscar los movimientos del contenedor.');
  }
}