

'use server';

import { firestore } from '@/lib/firebase-admin';
import { revalidatePath } from 'next/cache';

export interface PerformanceStandard {
  id: string;
  clientName: string; // "TODOS" or a specific client name
  operationType: 'recepcion' | 'despacho' | 'TODAS';
  productType: 'fijo' | 'variable' | 'TODAS';
  description: string;
  minTons: number;
  maxTons: number;
  baseMinutes: number;
  provider: string;
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
        provider: data.provider || 'GRUPO ROSALES LOGISTICA 24/7 SAS',
      } as PerformanceStandard;
    });
  } catch (error) {
    console.error("Error fetching performance standards:", error);
    return [];
  }
}

interface StandardData {
    clientName: string;
    provider: string;
    operationType: 'recepcion' | 'despacho' | 'TODAS';
    productType: 'fijo' | 'variable' | 'TODAS';
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
  
  const { clientName, provider, operationType, productType, description, ranges } = data;
  
  try {
    const batch = firestore.batch();
    const newStandards: PerformanceStandard[] = [];
    
    const standardsRef = firestore.collection('performance_standards');
    for (const range of ranges) {
            const query = standardsRef
            .where('clientName', '==', clientName)
            .where('provider', '==', provider)
            .where('operationType', '==', operationType)
            .where('productType', '==', productType)
            .where('minTons', '==', Number(range.minTons))
            .where('maxTons', '==', Number(range.maxTons));

        const existingSnapshot = await query.get();
        if (!existingSnapshot.empty) {
            return { 
                success: false, 
                message: `Ya existe un estándar para "${clientName}" con el proveedor "${provider}" y el rango de ${range.minTons}-${range.maxTons} Toneladas.`
            };
        }
    }


    for (const range of ranges) {
        const docRef = firestore.collection('performance_standards').doc();
        const standardData = {
            clientName,
            provider,
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

    await batch.commit();
    revalidatePath('/gestion-estandares-cuadrilla');
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
    revalidatePath('/gestion-estandares-cuadrilla');
    return { success: true, message: 'Estándar actualizado con éxito.' };
  } catch (error) {
    console.error('Error al actualizar estándar:', error);
    return { success: false, message: 'Ocurrió un error en el servidor.' };
  }
}


export interface BulkUpdateData {
    clientName?: string;
    provider?: string;
    operationType?: 'recepcion' | 'despacho' | 'TODAS';
    productType?: 'fijo' | 'variable' | 'TODAS';
    description?: string;
    baseMinutes?: number;
}

export async function updateMultipleStandards(ids: string[], data: BulkUpdateData): Promise<{ success: boolean; message: string }> {
    if (!firestore) return { success: false, message: 'Error de configuración del servidor.' };
    if (!ids || ids.length === 0) return { success: false, message: 'No se seleccionaron estándares para actualizar.' };
    
    // Construct the update object, only including fields that are actually being changed.
    const updateData: { [key: string]: any } = {};
    if (data.clientName) updateData.clientName = data.clientName;
    if (data.provider) updateData.provider = data.provider;
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
        revalidatePath('/gestion-estandares-cuadrilla');
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
    revalidatePath('/gestion-estandares-cuadrilla');
    return { success: true, message: `${ids.length} estándar(es) eliminado(s) con éxito.` };
  } catch (error) {
    console.error('Error al eliminar estándares:', error);
    return { success: false, message: 'Ocurrió un error en el servidor.' };
  }
}


// --- Standard Matching Logic ---

export interface FindStandardCriteria {
    clientName?: string;
    provider?: string;
    operationType?: 'recepcion' | 'despacho';
    productType?: 'fijo' | 'variable' | null;
    tons: number;
}

export async function findBestMatchingStandard(criteria: FindStandardCriteria): Promise<PerformanceStandard | null> {
    const { clientName, provider, operationType, productType } = criteria;
    // Round tons to handle floating point inaccuracies before comparison
    const tons = Number(criteria.tons.toFixed(2));
    
    // Always fetch the fresh list of standards from the database.
    const allStandards = await getPerformanceStandards();

    if (!clientName || !operationType || !productType || allStandards.length === 0) {
        return null;
    }

    const potentialMatches = allStandards.filter(std => {
        // The comparison is inclusive for both min and max
        const minTons = Number(std.minTons.toFixed(2));
        const maxTons = Number(std.maxTons.toFixed(2));
        return tons >= minTons && tons <= maxTons;
    });
    
    if (potentialMatches.length === 0) return null;

    // Define the order of specificity for matching
    const searchPriorities = [
        // 1. Most specific: Exact match for client, provider, operation, and product type
        (std: PerformanceStandard) => std.clientName === clientName && std.provider === provider && std.operationType === operationType && std.productType === productType,
        // 2. Match client, provider, and operation, any product type
        (std: PerformanceStandard) => std.clientName === clientName && std.provider === provider && std.operationType === operationType && std.productType === 'TODAS',
        // 3. Match client, provider, and product type, any operation
        (std: PerformanceStandard) => std.clientName === clientName && std.provider === provider && std.operationType === 'TODAS' && std.productType === productType,
        // 4. Match client and provider, any operation or product type
        (std: PerformanceStandard) => std.clientName === clientName && std.provider === provider && std.operationType === 'TODAS' && std.productType === 'TODOS',
        
        // Fallback to "TODOS (Cualquier Cliente)"
        (std: PerformanceStandard) => std.clientName === 'TODOS (Cualquier Cliente)' && std.provider === provider && std.operationType === operationType && std.productType === productType,
        (std: PerformanceStandard) => std.clientName === 'TODOS (Cualquier Cliente)' && std.provider === provider && std.operationType === operationType && std.productType === 'TODAS',
        (std: PerformanceStandard) => std.clientName === 'TODOS (Cualquier Cliente)' && std.provider === provider && std.operationType === 'TODAS' && std.productType === productType,
        (std: PerformanceStandard) => std.clientName === 'TODOS (Cualquier Cliente)' && std.provider === provider && std.operationType === 'TODAS' && std.productType === 'TODOS',
    ];

    for (const check of searchPriorities) {
        const found = potentialMatches.find(check);
        if (found) {
            return found;
        }
    }
    
    return null; // No matching standard found
}
