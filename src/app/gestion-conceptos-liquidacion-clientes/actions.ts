
'use server';

import { firestore } from '@/lib/firebase-admin';
import { revalidatePath } from 'next/cache';

export interface TariffRange {
  minTons: number;
  maxTons: number;
  vehicleType: string;
  dayTariff: number;
  nightTariff: number;
}

export interface ClientBillingConcept {
  id: string;
  conceptName: string;
  clientNames: string[];
  unitOfMeasure: 'TONELADA' | 'PALETA' | 'UNIDAD' | 'CAJA' | 'SACO' | 'CANASTILLA' | 'HORA' | 'DIA';
  dayShiftStart: string; 
  dayShiftEnd: string;
  tariffRanges: TariffRange[];
}

// Fetches all concepts
export async function getClientBillingConcepts(): Promise<ClientBillingConcept[]> {
  if (!firestore) return [];
  try {
    const snapshot = await firestore.collection('client_billing_concepts').orderBy('conceptName').get();
    if (snapshot.empty) return [];
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        conceptName: data.conceptName,
        clientNames: Array.isArray(data.clientNames) ? data.clientNames : [data.clientName],
        unitOfMeasure: data.unitOfMeasure,
        dayShiftStart: data.dayShiftStart || '07:00',
        dayShiftEnd: data.dayShiftEnd || '19:00',
        tariffRanges: Array.isArray(data.tariffRanges) ? data.tariffRanges : [],
      } as ClientBillingConcept;
    });
  } catch (error) {
    console.error("Error fetching client billing concepts:", error);
    return [];
  }
}

// Action to add a new concept
export async function addClientBillingConcept(data: Omit<ClientBillingConcept, 'id'>): Promise<{ success: boolean; message: string; newConcept?: ClientBillingConcept }> {
  if (!firestore) return { success: false, message: 'Error de configuración del servidor.' };
  
  try {
    const dataToSave = {
      ...data,
      tariffRanges: data.tariffRanges.map(range => ({
          ...range,
          minTons: Number(range.minTons),
          maxTons: Number(range.maxTons),
          dayTariff: Number(range.dayTariff),
          nightTariff: Number(range.nightTariff),
      }))
    };

    const docRef = await firestore.collection('client_billing_concepts').add(dataToSave);
    revalidatePath('/gestion-conceptos-liquidacion-clientes');
    return { success: true, message: 'Concepto de cliente agregado con éxito.', newConcept: { id: docRef.id, ...dataToSave } };
  } catch (error) {
    console.error('Error al agregar concepto de liquidación de cliente:', error);
    return { success: false, message: 'Ocurrió un error en el servidor.' };
  }
}

// Action to update a concept
export async function updateClientBillingConcept(id: string, data: Omit<ClientBillingConcept, 'id'>): Promise<{ success: boolean; message: string }> {
  if (!firestore) return { success: false, message: 'Error de configuración del servidor.' };
  
  const dataToUpdate = {
    ...data,
    tariffRanges: data.tariffRanges.map(range => ({
        ...range,
        minTons: Number(range.minTons),
        maxTons: Number(range.maxTons),
        dayTariff: Number(range.dayTariff),
        nightTariff: Number(range.nightTariff),
    }))
  };
  
  try {
    await firestore.collection('client_billing_concepts').doc(id).update(dataToUpdate);
    revalidatePath('/gestion-conceptos-liquidacion-clientes');
    return { success: true, message: 'Concepto de cliente actualizado con éxito.' };
  } catch (error) {
    console.error('Error al actualizar concepto de cliente:', error);
    return { success: false, message: 'Ocurrió un error en el servidor.' };
  }
}


// Action to delete one or more concepts
export async function deleteMultipleClientBillingConcepts(ids: string[]): Promise<{ success: boolean; message: string }> {
  if (!firestore) return { success: false, message: 'Error de configuración del servidor.' };
  if (!ids || ids.length === 0) return { success: false, message: 'No se seleccionaron conceptos para eliminar.' };
  
  try {
    const batch = firestore.batch();
    ids.forEach(id => {
      const docRef = firestore.collection('client_billing_concepts').doc(id);
      batch.delete(docRef);
    });
    await batch.commit();
    revalidatePath('/gestion-conceptos-liquidacion-clientes');
    return { success: true, message: `${ids.length} concepto(s) de cliente eliminado(s) con éxito.` };
  } catch (error) {
    console.error('Error al eliminar conceptos de cliente:', error);
    return { success: false, message: 'Ocurrió un error en el servidor.' };
  }
}

    