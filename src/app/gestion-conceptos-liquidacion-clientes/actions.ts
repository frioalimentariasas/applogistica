

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

export interface SpecificTariff {
  id: string; // e.g., 'hora-extra-diurna'
  name: string; // e.g., 'HORA EXTRA DIURNA'
  value: number;
  unit: 'HORA' | 'UNIDAD' | 'DIA' | 'VIAJE' | 'ALIMENTACION' | 'TRANSPORTE' | 'HORA EXTRA DIURNA' | 'HORA EXTRA NOCTURNA' | 'HORA EXTRA DIURNA DOMINGO Y FESTIVO' | 'HORA EXTRA NOCTURNA DOMINGO Y FESTIVO' | 'TRANSPORTE EXTRAORDINARIO' | 'TRANSPORTE DOMINICAL Y FESTIVO';
}

export interface ClientBillingConcept {
  id: string;
  conceptName: string;
  clientNames: string[];
  unitOfMeasure: 'TONELADA' | 'PALETA' | 'ESTIBA' | 'UNIDAD' | 'CAJA' | 'SACO' | 'CANASTILLA' | 'HORA' | 'DIA' | 'VIAJE' | 'MES' | 'CONTENEDOR' | 'HORA EXTRA DIURNA' | 'HORA EXTRA NOCTURNA' | 'HORA EXTRA DIURNA DOMINGO Y FESTIVO' | 'HORA EXTRA NOCTURNA DOMINGO Y FESTIVO';
  
  calculationType: 'REGLAS' | 'OBSERVACION' | 'MANUAL';

  // For 'REGLAS'
  calculationBase?: 'TONELADAS' | 'KILOGRAMOS' | 'CANTIDAD_PALETAS' | 'CANTIDAD_CAJAS' | 'NUMERO_OPERACIONES' | 'NUMERO_CONTENEDORES';
  filterOperationType?: 'recepcion' | 'despacho' | 'ambos';
  filterProductType?: 'fijo' | 'variable' | 'ambos';

  // For 'OBSERVACION'
  associatedObservation?: string;

  // Tariff Rules
  tariffType: 'UNICA' | 'RANGOS' | 'ESPECIFICA';
  value?: number; // For 'UNICA' tariffType
  dayShiftStart?: string; 
  dayShiftEnd?: string;
  tariffRanges?: TariffRange[];
  specificTariffs?: SpecificTariff[];
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
        
        calculationType: data.calculationType || 'REGLAS',
        calculationBase: data.calculationBase,
        filterOperationType: data.filterOperationType,
        filterProductType: data.filterProductType,
        associatedObservation: data.associatedObservation,

        tariffType: data.tariffType || 'UNICA',
        value: data.value,
        dayShiftStart: data.dayShiftStart,
        dayShiftEnd: data.dayShiftEnd,
        tariffRanges: Array.isArray(data.tariffRanges) ? data.tariffRanges : [],
        specificTariffs: Array.isArray(data.specificTariffs) ? data.specificTariffs : [],
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
    const docRef = await firestore.collection('client_billing_concepts').add(data);
    revalidatePath('/gestion-conceptos-liquidacion-clientes');
    return { success: true, message: 'Concepto de cliente agregado con éxito.', newConcept: { id: docRef.id, ...data } };
  } catch (error) {
    console.error('Error al agregar concepto de liquidación de cliente:', error);
    return { success: false, message: 'Ocurrió un error en el servidor.' };
  }
}

// Action to update a concept
export async function updateClientBillingConcept(id: string, data: Omit<ClientBillingConcept, 'id'>): Promise<{ success: boolean; message: string }> {
  if (!firestore) return { success: false, message: 'Error de configuración del servidor.' };
  
  try {
    await firestore.collection('client_billing_concepts').doc(id).update(data);
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
