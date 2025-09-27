
'use server';

import admin from 'firebase-admin';
import { firestore, storage } from '@/lib/firebase-admin';
import type { FormSubmissionData } from './save-form';
import { parseISO, format, startOfDay, endOfDay, subDays } from 'date-fns';

const COLOMBIA_TIMEZONE = 'America/Bogota';


export interface SearchCriteria {
  pedidoSislog?: string;
  nombreCliente?: string;
  placa?: string;
  searchDateStart?: string; // ISO String
  searchDateEnd?: string; // ISO String
  operationType?: 'recepcion' | 'despacho';
  productType?: 'fijo' | 'variable';
  tipoPedido?: string; // Added this line
  requestingUser?: {
    id: string;
    email: string;
  }
}

export interface SubmissionResult extends FormSubmissionData {
  id: string;
}

const operarioEmails = [
    'frioal.operario1@gmail.com',
    'frioal.operario2@gmail.com',
    'frioal.operario3@gmail.com',
    'frioal.operario4@gmail.com'
];

// This helper will recursively convert any Firestore Timestamps in an object to ISO strings.
const serializeTimestamps = (data: any): any => {
    if (data === null || data === undefined || typeof data !== 'object') {
        return data;
    }

    // Handle Firestore Timestamp
    if (data instanceof admin.firestore.Timestamp) {
        return data.toDate().toISOString();
    }

    // Handle array
    if (Array.isArray(data)) {
        return data.map(item => serializeTimestamps(item));
    }
    
    // Handle object
    const newObj: { [key: string]: any } = {};
    for (const key in data) {
        if (Object.prototype.hasOwnProperty.call(data, key)) {
            newObj[key] = serializeTimestamps(data[key]);
        }
    }
    return newObj;
};

export async function searchSubmissions(criteria: SearchCriteria): Promise<SubmissionResult[]> {
    if (!firestore) {
        console.error('Firebase Admin not initialized.');
        throw new Error('El servidor no está configurado correctamente.');
    }

    try {
        let query: admin.firestore.Query = firestore.collection('submissions');
        const isOperario = criteria.requestingUser && operarioEmails.includes(criteria.requestingUser.email);
        
        // --- START: Refactored Query Logic ---
        // We will base the main query on dates to use a single index, then filter in memory.
        
        let serverQueryStartDate: Date;
        let serverQueryEndDate: Date;

        const isSearchByUniqueId = !!criteria.pedidoSislog || !!criteria.placa;

        if (isSearchByUniqueId) {
            // If searching by a unique ID, we don't apply a date filter at the query level
            // to ensure we search across all time.
            query = query.orderBy('createdAt', 'desc');
        } else if (criteria.searchDateStart && criteria.searchDateEnd) {
            serverQueryStartDate = new Date(criteria.searchDateStart + 'T00:00:00-05:00');
            serverQueryEndDate = new Date(criteria.searchDateEnd + 'T23:59:59.999-05:00');
            query = query.where('formData.fecha', '>=', serverQueryStartDate)
                         .where('formData.fecha', '<=', serverQueryEndDate)
                         .orderBy('formData.fecha', 'desc');
        } else {
            // Default to the last 7 days if no specific criteria are provided
            serverQueryEndDate = new Date();
            serverQueryStartDate = subDays(serverQueryEndDate, 7);
            query = query.where('createdAt', '>=', serverQueryStartDate)
                         .where('createdAt', '<=', serverQueryEndDate)
                         .orderBy('createdAt', 'desc');
        }

        const snapshot = await query.get();

        let results = snapshot.docs.map(doc => {
            const data = doc.data();
            const serializedData = serializeTimestamps(data);
            
            return {
                id: doc.id,
                ...serializedData,
            } as SubmissionResult;
        });

        // --- IN-MEMORY FILTERING ---
        results = results.filter(sub => {
            if (criteria.pedidoSislog && sub.formData.pedidoSislog !== criteria.pedidoSislog) return false;
            if (criteria.nombreCliente && sub.formData.nombreCliente !== criteria.nombreCliente) return false;
            if (criteria.placa && sub.formData.placa !== criteria.placa) return false;
            if (criteria.tipoPedido && sub.formData.tipoPedido !== criteria.tipoPedido) return false;

            if (criteria.operationType) {
                if (criteria.operationType === 'recepcion' && !(sub.formType.includes('recepcion') || sub.formType.includes('reception'))) return false;
                if (criteria.operationType === 'despacho' && !sub.formType.includes('despacho')) return false;
            }

            if (criteria.productType) {
                if (criteria.productType === 'fijo' && !sub.formType.includes('fixed-weight')) return false;
                if (criteria.productType === 'variable' && !sub.formType.includes('variable-weight')) return false;
            }
            
            if (isOperario && sub.userId !== criteria.requestingUser!.id) return false;

            return true;
        });

        // The final sort order should still be by date descending.
        // If we didn't query by date initially (e.g., unique ID search), we sort it now.
        if (isSearchByUniqueId) {
            results.sort((a, b) => new Date(b.formData.fecha).getTime() - new Date(a.formData.fecha).getTime());
        }
        
        return results;

    } catch (error) {
        console.error('Error searching submissions:', error);
        if (error instanceof Error && (error.message.includes('requires an index') || error.message.includes('needs an index'))) {
            console.error("Firestore composite index required. See the full error log for the creation link.", error);
            throw new Error(error.message);
        }
        throw new Error('No se pudieron buscar los formularios.');
    }
}

export async function getSubmissionById(id: string): Promise<SubmissionResult | null> {
    if (!firestore) {
        console.error('Firebase Admin not initialized.');
        return null;
    }

    try {
        const doc = await firestore.collection('submissions').doc(id).get();

        if (!doc.exists) {
            return null;
        }

        const data = doc.data();
        if (!data) return null;

        const serializedData = serializeTimestamps(data);

        return {
            id: doc.id,
            ...serializedData,
        } as SubmissionResult;
    } catch (error) {
        console.error(`Error fetching submission with ID ${id}:`, error);
        return null;
    }
}

export async function deleteSubmission(submissionId: string): Promise<{ success: boolean; message: string }> {
    if (!firestore || !storage) {
        console.error('Firebase Admin not initialized.');
        return { success: false, message: 'El servidor no está configurado correctamente.' };
    }

    try {
        const docRef = firestore.collection('submissions').doc(submissionId);
        const doc = await docRef.get();

        if (!doc.exists) {
            // If document is already gone, consider it a success.
            return { success: true, message: 'El formulario ya ha sido eliminado.' };
        }

        const submissionData = doc.data();
        const attachmentUrls: string[] = submissionData?.attachmentUrls || [];

        // Delete attachments from Storage
        if (attachmentUrls.length > 0) {
            const deletePromises = attachmentUrls.map(url => {
                try {
                    // Extract file path from the download URL
                    // Example: https://firebasestorage.googleapis.com/v0/b/your-bucket.appspot.com/o/attachments%2F...
                    // The path is the part after /o/ and before ?alt=media
                    const decodedUrl = decodeURIComponent(url);
                    const pathStartIndex = decodedUrl.indexOf('/o/') + 3;
                    if (pathStartIndex === 2) { // URL format is not as expected
                        console.warn(`Invalid storage URL format, cannot delete: ${url}`);
                        return Promise.resolve();
                    }
                    
                    const pathEndIndex = decodedUrl.indexOf('?');
                    const filePath = pathEndIndex === -1 
                        ? decodedUrl.substring(pathStartIndex)
                        : decodedUrl.substring(pathStartIndex, pathEndIndex);

                    if (filePath) {
                        return storage.bucket().file(filePath).delete().catch(err => {
                            // Log error if a single file fails but don't stop the process
                            // This can happen if the file was already deleted manually (e.g. error code 404)
                            if (err.code !== 404) {
                                console.error(`Failed to delete file ${filePath}:`, err.message);
                            }
                        });
                    }
                } catch(e) {
                    console.error(`Could not process URL ${url} for deletion:`, e);
                }
                return Promise.resolve(); // Return resolved promise for invalid URLs
            });
    
            await Promise.all(deletePromises);
        }

        // Delete submission from Firestore
        await docRef.delete();

        return { success: true, message: 'Formulario eliminado correctamente.' };
    } catch (error) {
        console.error(`Error deleting submission ${submissionId}:`, error);
        if (error instanceof Error) {
            return { success: false, message: `Error del servidor: ${error.message}` };
        }
        return { success: false, message: 'No se pudo eliminar el formulario.' };
    }
}
