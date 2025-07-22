
'use server';

import { firestore } from '@/lib/firebase-admin';
import { revalidatePath } from 'next/cache';

export type OperationType = 'recepcion' | 'despacho';
export type ProductType = 'fijo' | 'variable';
export type UnitOfMeasure = 'PALETA' | 'CAJA' | 'SACO' | 'CANASTILLA';

export interface PerformanceStandard {
    id: string;
    description: string;
    clientName: string; // 'TODOS' for a general standard, or a specific client name
    operationType: OperationType | 'TODAS'; 
    minTons: number;
    maxTons: number;
    baseMinutes: number; // Replaces minutesPerTon
}

export interface TonRange {
    minTons: number;
    maxTons: number;
    baseMinutes: number;
}
  
export interface PerformanceStandardFormValues {
    description: string;
    clientNames: string[];
    operationType: OperationType | 'TODAS';
    ranges: TonRange[];
}


// Function to get all standards
export async function getPerformanceStandards(): Promise<PerformanceStandard[]> {
    if (!firestore) {
        console.error('Firestore is not initialized.');
        return [];
    }
    try {
        const snapshot = await firestore.collection('performance_standards').get();
        if (snapshot.empty) {
            return [];
        }
        const standards = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            // Ensure numeric types for older data that might be stored as strings
            minTons: Number(doc.data().minTons || 0),
            maxTons: Number(doc.data().maxTons || 0),
            baseMinutes: Number(doc.data().baseMinutes || doc.data().minutesPerTon || 0),
        } as PerformanceStandard));
        
        standards.sort((a, b) => {
            const clientCompare = a.clientName.localeCompare(b.clientName);
            if (clientCompare !== 0) return clientCompare;
            return a.minTons - b.minTons;
        });

        return standards;
    } catch (error) {
        console.error("Error fetching performance standards:", error);
        if (error instanceof Error && error.message.includes('requires an index')) {
            throw error;
        }
        return [];
    }
}

// Function to add a new standard or multiple standards
export async function addPerformanceStandard(data: PerformanceStandardFormValues): Promise<{ success: boolean; message: string; }> {
    if (!firestore) return { success: false, message: 'Error de configuración del servidor.' };

    const { clientNames, ranges, description, operationType } = data;
    
    // Basic validation
    if (!clientNames || clientNames.length === 0) return { success: false, message: 'Debe seleccionar al menos un cliente.' };
    if (!operationType) return { success: false, message: 'Debe seleccionar un tipo de operación.'};
    if (!ranges || ranges.length === 0) return { success: false, message: 'Debe definir al menos un rango de toneladas.' };
    if (!description) return { success: false, message: 'La descripción es obligatoria.' };

    try {
        const batch = firestore.batch();
        
        for (const client of clientNames) {
            for (const range of ranges) {
                 const newStandardData = {
                    description,
                    clientName: client,
                    operationType: operationType,
                    minTons: Number(range.minTons),
                    maxTons: Number(range.maxTons),
                    baseMinutes: Number(range.baseMinutes),
                };
                const docRef = firestore.collection('performance_standards').doc();
                batch.set(docRef, newStandardData);
            }
        }

        await batch.commit();

        revalidatePath('/gestion-estandares');
        revalidatePath('/crew-performance-report');
        
        return { success: true, message: 'Estándar(es) creado(s) con éxito.' };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Ocurrió un error desconocido.";
        return { success: false, message: `Error del servidor: ${errorMessage}` };
    }
}

// Function to update a standard
export async function updatePerformanceStandard(id: string, data: Omit<PerformanceStandard, 'id'>): Promise<{ success: boolean; message: string }> {
    if (!firestore) return { success: false, message: 'Error de configuración del servidor.' };
    
    const { clientName, description, operationType } = data;
    const minTons = Number(data.minTons);
    const maxTons = Number(data.maxTons);
    const baseMinutes = Number(data.baseMinutes);

    const errors: string[] = [];
    if (typeof minTons !== 'number' || minTons < 0) errors.push('Las toneladas mínimas deben ser un número no negativo.');
    if (typeof maxTons !== 'number' || maxTons <= 0) errors.push('Las toneladas máximas deben ser mayores que las mínimas.');
    if (maxTons <= minTons) errors.push('Las toneladas máximas deben ser mayores que las mínimas.');
    if (typeof baseMinutes !== 'number' || baseMinutes <= 0) errors.push('Los minutos base deben ser un número positivo.');
    if (!clientName) errors.push('El nombre del cliente es obligatorio.');
    if (!description) errors.push('La descripción es obligatoria.');

    if (errors.length > 0) {
        return { success: false, message: errors.join(' ') };
    }

    try {
        const updateData = {
            description,
            clientName,
            operationType,
            minTons,
            maxTons,
            baseMinutes,
        };
        await firestore.collection('performance_standards').doc(id).update(updateData);
        revalidatePath('/gestion-estandares');
        revalidatePath('/crew-performance-report');
        return { success: true, message: 'Estándar actualizado con éxito.' };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Ocurrió un error desconocido.";
        return { success: false, message: `Error del servidor: ${errorMessage}` };
    }
}


// Function to delete a standard
export async function deletePerformanceStandard(id: string): Promise<{ success: boolean; message: string }> {
    if (!firestore) return { success: false, message: 'Error de configuración del servidor.' };
    try {
        await firestore.collection('performance_standards').doc(id).delete();
        revalidatePath('/gestion-estandares');
        revalidatePath('/crew-performance-report');
        return { success: true, message: 'Estándar eliminado con éxito.' };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Ocurrió un error desconocido.";
        return { success: false, message: `Error del servidor: ${errorMessage}` };
    }
}

export async function deleteMultipleStandards(ids: string[]): Promise<{ success: boolean; message: string }> {
    if (!firestore) {
        return { success: false, message: 'Error de configuración del servidor.' };
    }
    if (!ids || ids.length === 0) {
        return { success: false, message: 'No se proporcionaron estándares para eliminar.' };
    }

    try {
        const batchSize = 500;
        for (let i = 0; i < ids.length; i += batchSize) {
            const batch = firestore.batch();
            const chunk = ids.slice(i, i + batchSize);
            chunk.forEach(id => {
                const docRef = firestore.collection('performance_standards').doc(id);
                batch.delete(docRef);
            });
            await batch.commit();
        }
        
        revalidatePath('/gestion-estandares');
        return { success: true, message: `${ids.length} estándar(es) eliminado(s) con éxito.` };

    } catch (error) {
        console.error('Error al eliminar estándares en lote:', error);
        const errorMessage = error instanceof Error ? error.message : 'Ocurrió un error desconocido.';
        return { success: false, message: `Error del servidor: ${errorMessage}` };
    }
}


// Function to find the best matching standard for a given operation
export async function findBestMatchingStandard(
    clientName: string, 
    tons: number,
    operationType: 'recepcion' | 'despacho'
): Promise<PerformanceStandard | null> {
    if (!firestore) return null;

    // Get all standards once to filter in memory, ensuring types are correct
    const allStandards = await getPerformanceStandards();

    const check = (standard: PerformanceStandard) => {
      return tons >= standard.minTons && tons <= standard.maxTons;
    };

    // Priority 1: Specific client, specific operation type
    let matches = allStandards.filter(s => s.clientName === clientName && s.operationType === operationType && check(s));
    if (matches.length > 0) {
        matches.sort((a,b) => (a.maxTons - a.minTons) - (b.maxTons - b.minTons));
        return matches[0];
    }
    
    // Priority 2: General client, specific operation type
    matches = allStandards.filter(s => s.clientName === 'TODOS' && s.operationType === operationType && check(s));
    if (matches.length > 0) {
        matches.sort((a,b) => (a.maxTons - a.minTons) - (b.maxTons - b.minTons));
        return matches[0];
    }

    // Priority 3: Specific client, general operation type
    matches = allStandards.filter(s => s.clientName === clientName && s.operationType === 'TODAS' && check(s));
     if (matches.length > 0) {
        matches.sort((a,b) => (a.maxTons - a.minTons) - (b.maxTons - b.minTons));
        return matches[0];
    }

    // Priority 4: General client, general operation type
    matches = allStandards.filter(s => s.clientName === 'TODOS' && s.operationType === 'TODAS' && check(s));
    if (matches.length > 0) {
        matches.sort((a,b) => (a.maxTons - a.minTons) - (b.maxTons - b.minTons));
        return matches[0];
    }
    
    return null;
}
