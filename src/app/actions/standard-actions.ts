

'use server';

import { firestore } from '@/lib/firebase-admin';
import { revalidatePath } from 'next/cache';

export interface PerformanceStandard {
  id: string;
  clientName: string; // "TODOS" or a specific client name
  operationType: 'recepcion' | 'despacho' | 'TODAS';
  productType: 'fijo' | 'variable' | 'TODOS';
  description: string;
  minTons: number;
  maxTons: number;
  baseMinutes: number;
}

// Fetches all standards and ensures numeric types
export async function getPerformanceStandards(): Promise<PerformanceStandard[]> {
  if (!firestore) return [];
  try {
    const snapshot = await firestore.collection('performance_standards').orderBy('clientName').orderBy('minTons').get();
    if (snapshot.empty) return [];
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        clientName: data.clientName,
        operationType: data.operationType,
        productType: data.productType,
        description: data.description || '',
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

interface StandardData {
    clientNames: string[];
    operationType: 'recepcion' | 'despacho' | 'TODAS';
    productType: 'fijo' | 'variable' | 'TODOS';
    description: string;
    ranges: {
        minTons: number;
        maxTons: number;
        baseMinutes: number;
    }[];
}

// Action to add a new standard with multiple ranges and for multiple clients
export async function addPerformanceStandard(data: StandardData): Promise<{ success: boolean; message: string; newStandards?: PerformanceStandard[] }> {
  if (!firestore) return { success: false, message: 'Error de configuración del servidor.' };
  
  const { clientNames, operationType, productType, description, ranges } = data;
  
  try {
    const batch = firestore.batch();
    const newStandards: PerformanceStandard[] = [];
    
    for (const clientName of clientNames) {
        for (const range of ranges) {
            const docRef = firestore.collection('performance_standards').doc();
            const standardData = {
                clientName,
                operationType,
                productType,
                description,
                minTons: Number(range.minTons),
                maxTons: Number(range.maxTons),
                baseMinutes: Number(range.baseMinutes),
            };
            batch.set(docRef, standardData);
            newStandards.push({ id: docRef.id, ...standardData });
        }
    }

    await batch.commit();
    revalidatePath('/gestion-estandares');
    return { success: true, message: `Se crearon ${newStandards.length} nuevo(s) estándar(es) con éxito.`, newStandards };
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


export interface BulkUpdateData {
    clientName?: string;
    operationType?: 'recepcion' | 'despacho' | 'TODAS';
    productType?: 'fijo' | 'variable' | 'TODOS';
    description?: string;
    baseMinutes?: number;
}

export async function updateMultipleStandards(ids: string[], data: BulkUpdateData): Promise<{ success: boolean; message: string }> {
    if (!firestore) return { success: false, message: 'Error de configuración del servidor.' };
    if (!ids || ids.length === 0) return { success: false, message: 'No se seleccionaron estándares para actualizar.' };
    
    // Construct the update object, only including fields that are actually being changed.
    const updateData: { [key: string]: any } = {};
    if (data.clientName) updateData.clientName = data.clientName;
    if (data.operationType) updateData.operationType = data.operationType;
    if (data.productType) updateData.productType = data.productType;
    if (data.description) updateData.description = data.description;
    if (data.baseMinutes !== undefined && !isNaN(data.baseMinutes)) {
        updateData.baseMinutes = Number(data.baseMinutes);
    }
    
    if (Object.keys(updateData).length === 0) {
        return { success: false, message: 'No se especificaron cambios para aplicar.' };
    }

    try {
        const batch = firestore.batch();
        ids.forEach(id => {
            const docRef = firestore.collection('performance_standards').doc(id);
            batch.update(docRef, updateData);
        });
        await batch.commit();
        revalidatePath('/gestion-estandares');
        return { success: true, message: `${ids.length} estándar(es) actualizado(s) con éxito.` };
    } catch (error) {
        console.error('Error al actualizar estándares en lote:', error);
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

export interface FindStandardCriteria {
    clientName?: string;
    operationType?: 'recepcion' | 'despacho';
    productType?: 'fijo' | 'variable';
    tons: number;
    isCrewOperation: boolean;
}

export async function findBestMatchingStandard(criteria: FindStandardCriteria): Promise<PerformanceStandard | null> {
    const { clientName, operationType, productType, isCrewOperation } = criteria;
    const tons = Number(criteria.tons.toFixed(2));
    
    const allStandards = await getPerformanceStandards();

    if (!clientName || !operationType || !productType || allStandards.length === 0) {
        return null;
    }

    const potentialMatches = allStandards.filter(std => {
        const minTons = Number(std.minTons.toFixed(2));
        const maxTons = Number(std.maxTons.toFixed(2));
        return tons >= minTons && tons <= maxTons;
    });
    
    if (potentialMatches.length === 0) return null;

    let searchPriorities: ((std: PerformanceStandard) => boolean)[] = [];

    if (isCrewOperation) {
        // Stricter search for crew operations: NO fallback to "TODOS" clients.
        searchPriorities = [
            (std) => std.clientName === clientName && std.operationType === operationType && std.productType === productType,
            (std) => std.clientName === clientName && std.operationType === operationType && std.productType === 'TODOS',
            (std) => std.clientName === clientName && std.operationType === 'TODAS' && std.productType === productType,
            (std) => std.clientName === clientName && std.operationType === 'TODAS' && std.productType === 'TODOS',
        ];
    } else {
        // More flexible search for non-crew operations: includes fallback to "TODOS" clients.
        searchPriorities = [
            (std) => std.clientName === clientName && std.operationType === operationType && std.productType === productType,
            (std) => std.clientName === clientName && std.operationType === operationType && std.productType === 'TODOS',
            (std) => std.clientName === clientName && std.operationType === 'TODAS' && std.productType === productType,
            (std) => std.clientName === clientName && std.operationType === 'TODAS' && std.productType === 'TODOS',
            // Fallback to "TODOS" client
            (std) => std.clientName === 'TODOS' && std.operationType === operationType && std.productType === productType,
            (std) => std.clientName === 'TODOS' && std.operationType === operationType && std.productType === 'TODOS',
            (std) => std.clientName === 'TODOS' && std.operationType === 'TODAS' && std.productType === productType,
            (std) => std.clientName === 'TODOS' && std.operationType === 'TODAS' && std.productType === 'TODOS',
        ];
    }
    
    for (const check of searchPriorities) {
        const found = potentialMatches.find(check);
        if (found) {
            return found;
        }
    }
    
    return null;
}

