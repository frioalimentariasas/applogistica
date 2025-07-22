
'use server';

import { firestore } from '@/lib/firebase-admin';
import { revalidatePath } from 'next/cache';

export interface PerformanceStandard {
  id: string;
  clientName: string; // "TODOS" or a specific client name
  operationType: 'recepcion' | 'despacho' | 'TODAS';
  productType: 'fijo' | 'variable' | 'TODOS';
  minTons: number;
  maxTons: number;
  baseMinutes: number;
}

// Fetches all standards and ensures numeric types
export async function getPerformanceStandards(): Promise<PerformanceStandard[]> {
  if (!firestore) return [];
  try {
    const snapshot = await firestore.collection('performance_standards').get();
    if (snapshot.empty) return [];
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        clientName: data.clientName,
        operationType: data.operationType,
        productType: data.productType,
        minTons: Number(data.minTons),
        maxTons: Number(data.maxTons),
        baseMinutes: Number(data.baseMinutes),
      } as PerformanceStandard;
    });
  } catch (error) {
    console.error("Error fetching performance standards:", error);
    return [];
  }
}

// Action to add a new standard
export async function addPerformanceStandard(data: Omit<PerformanceStandard, 'id'>): Promise<{ success: boolean; message: string; newStandard?: PerformanceStandard }> {
  if (!firestore) return { success: false, message: 'Error de configuración del servidor.' };
  
  const dataToSave = {
    ...data,
    minTons: Number(data.minTons),
    maxTons: Number(data.maxTons),
    baseMinutes: Number(data.baseMinutes),
  };

  try {
    const docRef = await firestore.collection('performance_standards').add(dataToSave);
    revalidatePath('/gestion-estandares');
    return { success: true, message: 'Estándar creado con éxito.', newStandard: { id: docRef.id, ...dataToSave } };
  } catch (error) {
    console.error('Error al agregar estándar:', error);
    return { success: false, message: 'Ocurrió un error en el servidor.' };
  }
}

// Action to update a standard
export async function updatePerformanceStandard(id: string, data: Omit<PerformanceStandard, 'id'>): Promise<{ success: boolean; message: string }> {
  if (!firestore) return { success: false, message: 'Error de configuración del servidor.' };
  
  const dataToUpdate = {
    ...data,
    minTons: Number(data.minTons),
    maxTons: Number(data.maxTons),
    baseMinutes: Number(data.baseMinutes),
  };
  
  try {
    await firestore.collection('performance_standards').doc(id).update(dataToUpdate);
    revalidatePath('/gestion-estandares');
    return { success: true, message: 'Estándar actualizado con éxito.' };
  } catch (error) {
    console.error('Error al actualizar estándar:', error);
    return { success: false, message: 'Ocurrió un error en el servidor.' };
  }
}

// Action to delete one or more standards
export async function deleteMultipleStandards(ids: string[]): Promise<{ success: boolean; message: string }> {
  if (!firestore) return { success: false, message: 'Error de configuración del servidor.' };
  if (!ids || ids.length === 0) return { success: false, message: 'No se seleccionaron estándares para eliminar.' };
  
  try {
    const batch = firestore.batch();
    ids.forEach(id => {
      const docRef = firestore.collection('performance_standards').doc(id);
      batch.delete(docRef);
    });
    await batch.commit();
    revalidatePath('/gestion-estandares');
    return { success: true, message: `${ids.length} estándar(es) eliminado(s) con éxito.` };
  } catch (error) {
    console.error('Error al eliminar estándares:', error);
    return { success: false, message: 'Ocurrió un error en el servidor.' };
  }
}


// --- Standard Matching Logic ---

interface FindStandardCriteria {
    clientName?: string;
    operationType?: 'recepcion' | 'despacho';
    productType?: 'fijo' | 'variable' | null;
    tons: number;
}

export function findBestMatchingStandard(criteria: FindStandardCriteria, allStandards: PerformanceStandard[]): PerformanceStandard | null {
    const { clientName, operationType, productType, tons } = criteria;

    if (!clientName || !operationType || !productType) {
        return null;
    }

    const potentialMatches = allStandards.filter(std => 
        tons >= std.minTons && tons <= std.maxTons
    );
    
    if (potentialMatches.length === 0) return null;

    // Define the order of specificity for matching
    const searchPriorities = [
        // 1. Most specific: Exact match for client, operation, and product type
        (std: PerformanceStandard) => std.clientName === clientName && std.operationType === operationType && std.productType === productType,
        // 2. Match client and operation, any product type
        (std: PerformanceStandard) => std.clientName === clientName && std.operationType === operationType && std.productType === 'TODOS',
        // 3. Match client and product type, any operation
        (std: PerformanceStandard) => std.clientName === clientName && std.operationType === 'TODAS' && std.productType === productType,
        // 4. Match client, any operation or product type
        (std: PerformanceStandard) => std.clientName === clientName && std.operationType === 'TODAS' && std.productType === 'TODOS',
        // 5. Match operation and product type, any client
        (std: PerformanceStandard) => std.clientName === 'TODOS' && std.operationType === operationType && std.productType === productType,
        // 6. Match operation, any client or product type
        (std: PerformanceStandard) => std.clientName === 'TODOS' && std.operationType === operationType && std.productType === 'TODOS',
        // 7. Match product type, any client or operation
        (std: PerformanceStandard) => std.clientName === 'TODOS' && std.operationType === 'TODAS' && std.productType === productType,
        // 8. Least specific: Universal fallback
        (std: PerformanceStandard) => std.clientName === 'TODOS' && std.operationType === 'TODAS' && std.productType === 'TODOS',
    ];

    for (const check of searchPriorities) {
        const found = potentialMatches.find(check);
        if (found) {
            return found;
        }
    }

    // Fallback for partial client name match
    const partialMatch = potentialMatches.find(std => 
        clientName.includes(std.clientName) && 
        (std.operationType === operationType || std.operationType === 'TODAS') &&
        (std.productType === productType || std.productType === 'TODOS')
    );

    if(partialMatch) return partialMatch;


    return null; // No matching standard found
}
