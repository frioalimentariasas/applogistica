
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
        
        if (criteria.pedidoSislog) {
            query = query.where('formData.pedidoSislog', '==', criteria.pedidoSislog);
        }
        if (criteria.nombreCliente) {
            query = query.where('formData.nombreCliente', '==', criteria.nombreCliente);
        }
        if (criteria.placa) {
            query = query.where('formData.placa', '==', criteria.placa);
        }
        if (criteria.tipoPedido) {
            query = query.where('formData.tipoPedido', '==', criteria.tipoPedido);
        }
        
        let operationTypes: string[] = [];
        if (criteria.operationType) {
            if (criteria.operationType === 'recepcion') operationTypes = ['fixed-weight-recepcion', 'fixed-weight-reception', 'variable-weight-recepcion', 'variable-weight-reception'];
            if (criteria.operationType === 'despacho') operationTypes = ['fixed-weight-despacho', 'variable-weight-despacho'];
        }
        
        let productTypes: string[] = [];
        if (criteria.productType) {
            if (criteria.productType === 'fijo') productTypes = ['fixed-weight-recepcion', 'fixed-weight-reception', 'fixed-weight-despacho'];
            if (criteria.productType === 'variable') productTypes = ['variable-weight-recepcion', 'variable-weight-reception', 'variable-weight-despacho'];
        }

        const formTypes = operationTypes.length > 0 && productTypes.length > 0
            ? operationTypes.filter(type => productTypes.includes(type))
            : (operationTypes.length > 0 ? operationTypes : productTypes);

        if (formTypes.length > 0) {
            query = query.where('formType', 'in', formTypes);
        }

        if (isOperario) {
            query = query.where('userId', '==', criteria.requestingUser!.id);
        }
        
        let serverQueryStartDate: Date;
        let serverQueryEndDate: Date;

        if (criteria.searchDateStart && criteria.searchDateEnd) {
            serverQueryStartDate = startOfDay(parseISO(criteria.searchDateStart));
            serverQueryEndDate = endOfDay(parseISO(criteria.searchDateEnd));
            query = query.where('formData.fecha', '>=', serverQueryStartDate)
                         .where('formData.fecha', '<=', serverQueryEndDate);
        } else if (!criteria.pedidoSislog && !criteria.placa) {
            // Default to last 7 days ONLY if no other unique criteria are provided
            serverQueryEndDate = endOfDay(new Date());
            serverQueryStartDate = startOfDay(subDays(serverQueryEndDate, 6)); // Default to last 7 days (7 days including today)
            query = query.where('formData.fecha', '>=', serverQueryStartDate)
                         .where('formData.fecha', '<=', serverQueryEndDate);
        }
        
        const snapshot = await query.orderBy('formData.fecha', 'desc').get();

        const results = snapshot.docs.map(doc => {
            const data = doc.data();
            const serializedData = serializeTimestamps(data);
            
            return {
                id: doc.id,
                ...serializedData,
            } as SubmissionResult;
        });
        
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
