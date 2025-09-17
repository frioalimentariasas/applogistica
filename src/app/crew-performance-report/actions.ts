

'use server';

import { firestore } from '@/lib/firebase-admin';
import { revalidatePath } from 'next/cache';
import { differenceInMinutes, parse, format } from 'date-fns';
import admin from 'firebase-admin';

export interface ManualOperationData {
    clientName?: string;
    operationDate: string; // ISO string like '2024-07-23T15:49:01.859Z'
    startTime: string; // HH:mm
    endTime: string; // HH:mm
    plate?: string;
    concept: string;
    quantity: number;
    comentarios?: string; // New optional field
    createdAt?: string; // ISO string for timestamping
    createdBy?: {
        uid: string;
        displayName: string;
    }
}

export async function getAllManualOperations(): Promise<any[]> {
    if (!firestore) {
        return [];
    }
    try {
        const snapshot = await firestore.collection('manual_operations')
            .orderBy('operationDate', 'desc')
            .get();
        
        return snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                ...data,
                id: doc.id,
                operationDate: (data.operationDate as admin.firestore.Timestamp).toDate().toISOString(),
                createdAt: data.createdAt,
            }
        });
    } catch (error) {
        console.error("Error fetching all manual operations:", error);
        return [];
    }
}
