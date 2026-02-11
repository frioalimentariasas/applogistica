

'use server';

import { firestore } from '@/lib/firebase-admin';
import { revalidatePath } from 'next/cache';
import admin from 'firebase-admin';

export interface BillingConcept {
  id: string;
  conceptName: string;
  clientNames: string[]; // "TODOS (Cualquier Cliente)" or specific client names
  operationType: 'recepcion' | 'despacho' | 'TODAS';
  productType: 'fijo' | 'variable' | 'TODAS';
  unitOfMeasure: 'TONELADA' | 'KILOGRAMOS' | 'PALETA' | 'UNIDAD' | 'CAJA' | 'SACO' | 'CANASTILLA' | 'HORA';
  value?: number;
  lunesASabadoTariff?: number;
  domingoFestivoTariff?: number;
  dayTariff?: number;
  nightTariff?: number;
  dayShiftEnd?: string;
}

// Fetches all concepts
export async function getBillingConcepts(): Promise<BillingConcept[]> {
  if (!firestore) return [];
  try {
    const snapshot = await firestore.collection('billing_concepts').orderBy('conceptName').get();
    if (snapshot.empty) return [];
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        conceptName: data.conceptName,
        clientNames: Array.isArray(data.clientNames) ? data.clientNames : [data.clientName], // Backward compatibility
        operationType: data.operationType,
        productType: data.productType,
        unitOfMeasure: data.unitOfMeasure,
        value: data.value,
        lunesASabadoTariff: data.lunesASabadoTariff,
        domingoFestivoTariff: data.domingoFestivoTariff,
        dayTariff: data.dayTariff,
        nightTariff: data.nightTariff,
        dayShiftEnd: data.dayShiftEnd,
      } as BillingConcept;
    });
  } catch (error) {
    console.error("Error fetching billing concepts:", error);
    return [];
  }
}

// Action to add a new concept
export async function addBillingConcept(data: Omit<BillingConcept, 'id'>): Promise<{ success: boolean; message: string; newConcept?: BillingConcept }> {
  if (!firestore) return { success: false, message: 'Error de configuración del servidor.' };
  
  try {
    const dataToSave: any = {
      conceptName: data.conceptName,
      clientNames: data.clientNames,
      operationType: data.operationType,
      productType: data.productType,
      unitOfMeasure: data.unitOfMeasure,
    };

    const upperConceptName = data.conceptName.toUpperCase();
    const cargueDescargueConcepts = ['CARGUE', 'DESCARGUE', 'TONELADAS/CARGADAS', 'TONELADAS/DESCARGADAS'];

    if (upperConceptName === 'JORNAL ORDINARIO') {
      dataToSave.lunesASabadoTariff = Number(data.lunesASabadoTariff);
      dataToSave.domingoFestivoTariff = Number(data.domingoFestivoTariff);
    } else if (cargueDescargueConcepts.includes(upperConceptName)) {
      dataToSave.dayTariff = Number(data.dayTariff);
      dataToSave.nightTariff = Number(data.nightTariff);
      dataToSave.dayShiftEnd = data.dayShiftEnd;
    } else {
      dataToSave.value = Number(data.value);
    }

    const docRef = await firestore.collection('billing_concepts').add(dataToSave);
    revalidatePath('/gestion-conceptos-liquidacion-cuadrilla');
    return { success: true, message: 'Concepto agregado con éxito.', newConcept: { id: docRef.id, ...data } };
  } catch (error) {
    console.error('Error al agregar concepto de liquidación:', error);
    return { success: false, message: 'Ocurrió un error en el servidor.' };
  }
}

// Action to update a concept
export async function updateBillingConcept(id: string, data: Omit<BillingConcept, 'id'>): Promise<{ success: boolean; message: string }> {
  if (!firestore) return { success: false, message: 'Error de configuración del servidor.' };
  
  const dataToUpdate: any = {
    conceptName: data.conceptName,
    clientNames: data.clientNames,
    operationType: data.operationType,
    productType: data.productType,
    unitOfMeasure: data.unitOfMeasure,
  };
  
  const upperConceptName = data.conceptName.toUpperCase();
  const cargueDescargueConcepts = ['CARGUE', 'DESCARGUE', 'TONELADAS/CARGADAS', 'TONELADAS/DESCARGADAS'];

  if (upperConceptName === 'JORNAL ORDINARIO') {
    dataToUpdate.lunesASabadoTariff = Number(data.lunesASabadoTariff);
    dataToUpdate.domingoFestivoTariff = Number(data.domingoFestivoTariff);
    dataToUpdate.value = admin.firestore.FieldValue.delete();
    dataToUpdate.dayTariff = admin.firestore.FieldValue.delete();
    dataToUpdate.nightTariff = admin.firestore.FieldValue.delete();
    dataToUpdate.dayShiftEnd = admin.firestore.FieldValue.delete();
  } else if (cargueDescargueConcepts.includes(upperConceptName)) {
    dataToUpdate.dayTariff = Number(data.dayTariff);
    dataToUpdate.nightTariff = Number(data.nightTariff);
    dataToUpdate.dayShiftEnd = data.dayShiftEnd;
    dataToUpdate.value = admin.firestore.FieldValue.delete();
    dataToUpdate.lunesASabadoTariff = admin.firestore.FieldValue.delete();
    dataToUpdate.domingoFestivoTariff = admin.firestore.FieldValue.delete();
  } else {
    dataToUpdate.value = Number(data.value);
    dataToUpdate.lunesASabadoTariff = admin.firestore.FieldValue.delete();
    dataToUpdate.domingoFestivoTariff = admin.firestore.FieldValue.delete();
    dataToUpdate.dayTariff = admin.firestore.FieldValue.delete();
    dataToUpdate.nightTariff = admin.firestore.FieldValue.delete();
    dataToUpdate.dayShiftEnd = admin.firestore.FieldValue.delete();
  }
  
  try {
    await firestore.collection('billing_concepts').doc(id).update(dataToUpdate);
    revalidatePath('/gestion-conceptos-liquidacion-cuadrilla');
    return { success: true, message: 'Concepto actualizado con éxito.' };
  } catch (error) {
    console.error('Error al actualizar concepto:', error);
    return { success: false, message: 'Ocurrió un error en el servidor.' };
  }
}


// Action to delete one or more concepts
export async function deleteMultipleBillingConcepts(ids: string[]): Promise<{ success: boolean; message: string }> {
  if (!firestore) return { success: false, message: 'Error de configuración del servidor.' };
  if (!ids || ids.length === 0) return { success: false, message: 'No se seleccionaron conceptos para eliminar.' };
  
  try {
    const batch = firestore.batch();
    ids.forEach(id => {
      const docRef = firestore.collection('billing_concepts').doc(id);
      batch.delete(docRef);
    });
    await batch.commit();
    revalidatePath('/gestion-conceptos-liquidacion-cuadrilla');
    return { success: true, message: `${ids.length} concepto(s) eliminado(s) con éxito.` };
  } catch (error) {
    console.error('Error al eliminar conceptos:', error);
    return { success: false, message: 'Ocurrió un error en el servidor.' };
  }
}
