
'use server';

import { firestore } from '@/lib/firebase-admin';
import { revalidatePath } from 'next/cache';

export type OperationType = 'recepcion' | 'despacho';
export type ProductType = 'fijo' | 'variable';
export type UnitOfMeasure = 'PALETA' | 'CAJA' | 'SACO' | 'CANASTILLA';

export interface PerformanceStandard {
    id: string;
    description: string;
    clientName: string; 
    operationType: OperationType | 'TODAS'; 
    productType: ProductType | 'TODAS';
    minTons: number;
    maxTons: number;
    baseMinutes: number;
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
    productType: ProductType | 'TODAS';
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
            minTons: Number(doc.data().minTons || 0),
            maxTons: Number(doc.data().maxTons || 0),
            baseMinutes: Number(doc.data().baseMinutes || 0),
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

    const { clientNames, ranges, description, operationType, productType } = data;
    
    // Basic validation
    if (!clientNames || clientNames.length === 0) return { success: false, message: 'Debe seleccionar al menos un cliente.' };
    if (!operationType) return { success: false, message: 'Debe seleccionar un tipo de operación.'};
    if (!productType) return { success: false, message: 'Debe seleccionar un tipo de producto.'};
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
                    productType: productType,
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
    
    const { clientName, description, operationType, productType } = data;
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
            productType,
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


export async function findBestMatchingStandard(
    clientName: string, 
    tons: number,
    operationType: 'recepcion' | 'despacho' | null,
    productType: 'fijo' | 'variable' | null
): Promise<PerformanceStandard | null> {
    if (!firestore || !operationType || !productType) return null;

    const allStandards = await getPerformanceStandards();

    const filters = [
      // 1. Most specific: Client, Operation, Product
      (s: PerformanceStandard) => s.clientName === clientName && s.operationType === operationType && s.productType === productType,
      // 2. Client, Operation, All Products
      (s: PerformanceStandard) => s.clientName === clientName && s.operationType === operationType && s.productType === 'TODAS',
      // 3. Client, All Operations, Product
      (s: PerformanceStandard) => s.clientName === clientName && s.operationType === 'TODAS' && s.productType === productType,
      // 4. Client, All Operations, All Products
      (s: PerformanceStandard) => s.clientName === clientName && s.operationType === 'TODAS' && s.productType === 'TODAS',
      // 5. All Clients, Operation, Product
      (s: PerformanceStandard) => s.clientName === 'TODOS' && s.operationType === operationType && s.productType === productType,
      // 6. All Clients, Operation, All Products
      (s: PerformanceStandard) => s.clientName === 'TODOS' && s.operationType === operationType && s.productType === 'TODAS',
      // 7. All Clients, All Operations, Product
      (s: PerformanceStandard) => s.clientName === 'TODOS' && s.operationType === 'TODAS' && s.productType === productType,
      // 8. Most generic: All Clients, All Operations, All Products
      (s: PerformanceStandard) => s.clientName === 'TODOS' && s.operationType === 'TODAS' && s.productType === 'TODAS',
    ];
    
    for (const filter of filters) {
        const matches = allStandards.filter(s => 
            filter(s) && tons >= s.minTons && tons <= s.maxTons
        );
        
        if (matches.length > 0) {
            // If multiple standards match at the same priority level, pick the one with the smallest range
            matches.sort((a,b) => (a.maxTons - a.minTons) - (b.maxTons - b.minTons));
            return matches[0];
        }
    }
    
    return null;
}
