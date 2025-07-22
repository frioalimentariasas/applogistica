
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
    operationType: OperationType | 'TODAS'; // This is now less relevant for the new logic but kept for structure
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

    const { clientNames, ranges, description } = data;
    
    // Basic validation
    if (!clientNames || clientNames.length === 0) return { success: false, message: 'Debe seleccionar al menos un cliente.' };
    if (!ranges || ranges.length === 0) return { success: false, message: 'Debe definir al menos un rango de toneladas.' };
    if (!description) return { success: false, message: 'La descripción es obligatoria.' };

    try {
        const batch = firestore.batch();
        
        for (const client of clientNames) {
            for (const range of ranges) {
                 const newStandardData = {
                    description,
                    clientName: client,
                    operationType: 'TODAS', // Simplified as per new logic
                    minTons: range.minTons,
                    maxTons: range.maxTons,
                    baseMinutes: range.baseMinutes,
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
    
    const { minTons, maxTons, baseMinutes, clientName, description } = data;
    const errors: string[] = [];
    if (typeof minTons !== 'number' || minTons < 0) errors.push('Las toneladas mínimas deben ser un número no negativo.');
    if (typeof maxTons !== 'number' || maxTons <= 0) errors.push('Las toneladas máximas deben ser un número positivo.');
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
            operationType: 'TODAS',
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

// Function to find the best matching standard for a given operation
export async function findBestMatchingStandard(
    clientName: string, 
    tons: number
): Promise<PerformanceStandard | null> {
    if (!firestore) return null;
    
    // Define special client names and their aliases
    const clientAliases: Record<string, string> = {
        "ATLANTIC FS S.A.S.": "Atlantic",
        "AVICOLA EL MADROÑO S.A.": "Avicola",
    };

    const alias = clientAliases[clientName] || null;
    const searchNames = alias ? [clientName, alias] : [clientName];

    // First, try to find a specific rule for the client or their alias.
    const clientSpecificSnapshot = await firestore.collection('performance_standards')
        .where('clientName', 'in', searchNames)
        .where('minTons', '<=', tons)
        .get();

    let matches = clientSpecificSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as PerformanceStandard))
        .filter(doc => doc.maxTons >= tons);

    if (matches.length > 0) {
        // In case of overlapping ranges (bad data), return the one with the smallest range for more specificity
        matches.sort((a,b) => (a.maxTons - a.minTons) - (b.maxTons - b.minTons));
        return matches[0];
    }
    
    // If no specific rule, find a general rule ('TODOS' client).
    const generalSnapshot = await firestore.collection('performance_standards')
        .where('clientName', '==', 'TODOS')
        .where('minTons', '<=', tons)
        .get();

    matches = generalSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as PerformanceStandard))
        .filter(doc => doc.maxTons >= tons);

    if (matches.length > 0) {
        matches.sort((a,b) => (a.maxTons - a.minTons) - (b.maxTons - b.minTons));
        return matches[0];
    }

    // No standard found.
    return null;
}
