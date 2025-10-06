
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

export interface TemperatureTariffRange {
  minTemp: number;
  maxTemp: number;
  ratePerKg: number;
}

export interface SpecificTariff {
  id: string; // e.g., 'hora-extra-diurna'
  name: string; // e.g., 'HORA EXTRA DIURNA'
  value: number;
  baseQuantity?: number; // New field for base positions
  unit: 'HORA' | 'UNIDAD' | 'DIA' | 'VIAJE' | 'ALIMENTACION' | 'TRANSPORTE' | 'HORA EXTRA DIURNA' | 'HORA EXTRA NOCTURNA' | 'HORA EXTRA DIURNA DOMINGO Y FESTIVO' | 'HORA EXTRA NOCTURNA DOMINGO Y FESTIVO' | 'TRANSPORTE EXTRAORDINARIO' | 'TRANSPORTE DOMINICAL Y FESTIVO' | 'POSICION/DIA' | 'POSICIONES/MES';
}

export interface FixedTimeConfig {
    weekdayStartTime?: string;
    weekdayEndTime?: string;
    saturdayStartTime?: string;
    saturdayEndTime?: string;
    dayShiftEndTime?: string;
}

export interface ClientBillingConcept {
  id: string;
  conceptName: string;
  clientNames: string[];
  unitOfMeasure: 'KILOGRAMOS' | 'TONELADA' | 'PALETA' | 'ESTIBA' | 'UNIDAD' | 'CAJA' | 'SACO' | 'CANASTILLA' | 'HORA' | 'DIA' | 'VIAJE' | 'MES' | 'CONTENEDOR' | 'HORA EXTRA DIURNA' | 'HORA EXTRA NOCTURNA' | 'HORA EXTRA DIURNA DOMINGO Y FESTIVO' | 'HORA EXTRA NOCTURNA DOMINGO Y FESTIVO' | 'POSICION/DIA' | 'POSICIONES' | 'TIPO VEHÍCULO' | 'TRACTOMULA' | 'QUINCENA';
  
  calculationType: 'REGLAS' | 'OBSERVACION' | 'MANUAL' | 'SALDO_INVENTARIO';

  // For 'REGLAS'
  calculationBase?: 'TONELADAS' | 'KILOGRAMOS' | 'CANTIDAD_PALETAS' | 'CANTIDAD_CAJAS' | 'NUMERO_OPERACIONES' | 'NUMERO_CONTENEDORES' | 'PALETAS_SALIDA_MAQUILA_CONGELADOS' | 'PALETAS_SALIDA_MAQUILA_SECO' | 'CANTIDAD_SACOS_MAQUILA';
  filterOperationType?: 'recepcion' | 'despacho' | 'ambos';
  filterProductType?: 'fijo' | 'variable' | 'ambos';
  filterSesion?: 'CO' | 'RE' | 'SE' | 'AMBOS';
  filterPedidoTypes?: string[];
  
  // For 'OBSERVACION'
  associatedObservation?: string;

  // For 'SALDO_INVENTARIO'
  inventorySource?: 'POSICIONES_ALMACENADAS';
  inventorySesion?: 'CO' | 'RE' | 'SE';

  // Tariff Rules
  tariffType: 'UNICA' | 'RANGOS' | 'ESPECIFICA' | 'POR_TEMPERATURA';
  value?: number; // For 'UNICA' tariffType
  billingPeriod?: 'DIARIO' | 'QUINCENAL' | 'MENSUAL'; // New field
  dayShiftStart?: string; 
  dayShiftEnd?: string;
  tariffRanges?: TariffRange[];
  tariffRangesTemperature?: TemperatureTariffRange[];
  specificTariffs?: SpecificTariff[];
  fixedTimeConfig?: FixedTimeConfig; // New field for TIEMPO EXTRA FRIOAL (FIJO)
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
        filterSesion: data.filterSesion,
        filterPedidoTypes: data.filterPedidoTypes || [],
        associatedObservation: data.associatedObservation,
        inventorySource: data.inventorySource,
        inventorySesion: data.inventorySesion,

        tariffType: data.tariffType || 'UNICA',
        value: data.value,
        billingPeriod: data.billingPeriod,
        dayShiftStart: data.dayShiftStart,
        dayShiftEnd: data.dayShiftEnd,
        tariffRanges: Array.isArray(data.tariffRanges) ? data.tariffRanges : [],
        tariffRangesTemperature: Array.isArray(data.tariffRangesTemperature) ? data.tariffRangesTemperature : [],
        specificTariffs: Array.isArray(data.specificTariffs) ? data.specificTariffs : [],
        fixedTimeConfig: data.fixedTimeConfig,
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
    const conceptsRef = firestore.collection('client_billing_concepts');
    const querySnapshot = await conceptsRef
      .where('conceptName', '==', data.conceptName)
      .where('clientNames', 'array-contains-any', data.clientNames)
      .get();
      
    if (!querySnapshot.empty) {
      const conflictingClient = querySnapshot.docs[0].data().clientNames.find((c: string) => data.clientNames.includes(c));
      return { success: false, message: `El concepto "${data.conceptName}" ya tiene una configuración para el cliente "${conflictingClient}". Edite el concepto existente en lugar de crear uno nuevo.` };
    }

    const docRef = await conceptsRef.add(data);
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
     const conceptsRef = firestore.collection('client_billing_concepts');
    const querySnapshot = await conceptsRef
      .where('conceptName', '==', data.conceptName)
      .where('clientNames', 'array-contains-any', data.clientNames)
      .get();

    // Find if there's a conflicting document that is not the one we are editing
    const conflictingDoc = querySnapshot.docs.find(doc => doc.id !== id);

    if (conflictingDoc) {
      const conflictingClient = conflictingDoc.data().clientNames.find((c: string) => data.clientNames.includes(c));
      return { success: false, message: `El concepto "${data.conceptName}" ya tiene una configuración para el cliente "${conflictingClient}". No se puede duplicar.` };
    }

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
