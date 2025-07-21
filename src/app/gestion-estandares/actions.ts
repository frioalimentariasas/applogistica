
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
    productType: ProductType | 'TODAS';
    unitOfMeasure: UnitOfMeasure | 'TODAS';
    minutesPerTon: number;
}

// Function to get all standards
export async function getPerformanceStandards(): Promise<PerformanceStandard[]> {
    if (!firestore) {
        console.error('Firestore is not initialized.');
        return [];
    }
    try {
        const snapshot = await firestore.collection('performance_standards').orderBy('clientName').orderBy('operationType').get();
        if (snapshot.empty) {
            return [];
        }
        const standards = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        } as PerformanceStandard));
        
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
export async function addPerformanceStandard(data: Omit<PerformanceStandard, 'id'>): Promise<{ success: boolean; message: string; }> {
    if (!firestore) return { success: false, message: 'Error de configuración del servidor.' };

    const { clientName, minutesPerTon } = data;
    if (typeof minutesPerTon !== 'number' || minutesPerTon <= 0) {
        return { success: false, message: 'Los minutos por tonelada deben ser un número positivo.' };
    }
    if (!clientName || clientName.trim() === '') {
        return { success: false, message: 'El campo de cliente(s) es obligatorio.' };
    }

    try {
        const batch = firestore.batch();
        const clients = clientName.split(',').map(name => name.trim()).filter(Boolean);

        for (const client of clients) {
            const newStandardData = {
                ...data,
                clientName: client
            };
            const docRef = firestore.collection('performance_standards').doc();
            batch.set(docRef, newStandardData);
        }

        await batch.commit();

        revalidatePath('/gestion-estandares');
        revalidatePath('/crew-performance-report');
        
        const successMessage = clients.length > 1 ? `Se crearon ${clients.length} estándares con éxito.` : 'Estándar creado con éxito.';
        return { success: true, message: successMessage };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Ocurrió un error desconocido.";
        return { success: false, message: `Error del servidor: ${errorMessage}` };
    }
}

// Function to update a standard
export async function updatePerformanceStandard(id: string, data: Omit<PerformanceStandard, 'id'>): Promise<{ success: boolean; message: string }> {
    if (!firestore) return { success: false, message: 'Error de configuración del servidor.' };
    const { minutesPerTon } = data;
    if (typeof minutesPerTon !== 'number' || minutesPerTon <= 0) {
        return { success: false, message: 'Los minutos por tonelada deben ser un número positivo.' };
    }

    try {
        await firestore.collection('performance_standards').doc(id).update(data);
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

// This function will be called from the report to find the most specific standard.
export async function findBestMatchingStandard(
    clientName: string, 
    operationType: OperationType, 
    productType: ProductType, 
    unitOfMeasure: UnitOfMeasure
): Promise<PerformanceStandard | null> {
    const standards = await getPerformanceStandards();
    if (!standards || standards.length === 0) return null;

    const potentialMatches = standards.filter(s => 
        (s.clientName === clientName || s.clientName === 'TODOS') &&
        (s.operationType === operationType || s.operationType === 'TODAS') &&
        (s.productType === productType || s.productType === 'TODAS') &&
        (s.unitOfMeasure === unitOfMeasure || s.unitOfMeasure === 'TODAS')
    );

    if (potentialMatches.length === 0) return null;

    // Score matches based on specificity. A specific match gets a higher score.
    const scoredMatches = potentialMatches.map(s => {
        let score = 0;
        if (s.clientName === clientName) score += 8;
        if (s.operationType === operationType) score += 4;
        if (s.productType === productType) score += 2;
        if (s.unitOfMeasure === unitOfMeasure) score += 1;
        return { standard: s, score };
    });

    // Sort by score descending to find the best match
    scoredMatches.sort((a, b) => b.score - a.score);

    return scoredMatches[0].standard;
}
