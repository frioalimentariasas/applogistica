
'use server';

import admin from 'firebase-admin';
import { firestore, storage } from '@/lib/firebase-admin';
import type { FormSubmissionData } from './save-form';
import { parseISO } from 'date-fns';
import { utcToZonedTime, zonedTimeToUtc, format } from 'date-fns-tz';

const COLOMBIA_TIMEZONE = 'America/Bogota';


export interface SearchCriteria {
  pedidoSislog?: string;
  nombreCliente?: string;
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

// Helper to get a YYYY-MM-DD string adjusted for a specific timezone (e.g., UTC-5 for Colombia)
const getLocalGroupingDate = (isoString: string): string => {
    if (!isoString) return '';
    try {
        const date = new Date(isoString);
        // Adjust for a fixed timezone offset. UTC-5 for Colombia.
        date.setUTCHours(date.getUTCHours() - 5);
        return date.toISOString().split('T')[0];
    } catch (e) {
        console.error(`Invalid date string for grouping: ${isoString}`);
        return '';
    }
};


export async function searchSubmissions(criteria: SearchCriteria): Promise<SubmissionResult[]> {
    if (!firestore) {
        console.error('Firebase Admin not initialized.');
        throw new Error('El servidor no está configurado correctamente.');
    }

    try {
        let query: admin.firestore.Query = firestore.collection('submissions');
        const isOperario = criteria.requestingUser && operarioEmails.includes(criteria.requestingUser.email);
        
        // User is the most selective filter for operarios
        if (isOperario) {
            query = query.where('userId', '==', criteria.requestingUser!.id);
        }

        // pedidoSislog is also highly selective
        if (criteria.pedidoSislog) {
            query = query.where('formData.pedidoSislog', '==', criteria.pedidoSislog.trim());
        }

        const noDateFilter = !criteria.searchDateStart && !criteria.searchDateEnd;
        const noFilters = !criteria.pedidoSislog && !criteria.nombreCliente && noDateFilter && !criteria.operationType && !criteria.tipoPedido && !criteria.productType;

        // Apply a server-side date filter ONLY if a date range is provided.
        // This is now the most reliable way to handle date range queries.
        if (criteria.searchDateStart && criteria.searchDateEnd) {
             const startDateLocal = parseISO(criteria.searchDateStart); // Date from picker is already local midnight
             const endDateLocal = parseISO(criteria.searchDateEnd);
 
             // Convert the local start of day to UTC
             const startOfDayInColombia = new Date(startDateLocal.getFullYear(), startDateLocal.getMonth(), startDateLocal.getDate(), 0, 0, 0);
             const startUTC = zonedTimeToUtc(startOfDayInColombia, COLOMBIA_TIMEZONE);
             
             // Convert the local end of day to UTC
             const endOfDayInColombia = new Date(endDateLocal.getFullYear(), endDateLocal.getMonth(), endDateLocal.getDate(), 23, 59, 59, 999);
             const endUTC = zonedTimeToUtc(endOfDayInColombia, COLOMBIA_TIMEZONE);

             query = query.where('createdAt', '>=', startUTC.toISOString())
                          .where('createdAt', '<=', endUTC.toISOString());
        } else if (noFilters && !isOperario) {
             // For non-operarios with no filters, we must limit the query to avoid reading the whole collection.
             // We query the last 7 days. This is safe as createdAt will have a single-field index.
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(endDate.getDate() - 7);
            startDate.setUTCHours(0, 0, 0, 0);
            
            query = query.where('createdAt', '>=', startDate.toISOString())
                         .where('createdAt', '<=', endDate.toISOString());
        }
        
        // Execute the query.
        const snapshot = await query.get();

        let results = snapshot.docs.map(doc => {
            const data = doc.data();
            const serializedData = serializeTimestamps(data);
            
            return {
                id: doc.id,
                ...serializedData,
            } as SubmissionResult;
        });

        // Apply the rest of the filters in memory
        if (isOperario && noFilters) {
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(endDate.getDate() - 7);
            
            results = results.filter(sub => {
                const subDate = new Date(sub.createdAt);
                return subDate >= startDate && subDate <= endDate;
            });
        }
        
        // Filter by client name (exact match)
        if (criteria.nombreCliente) {
            results = results.filter(sub => {
                const clientName = sub.formData.nombreCliente || sub.formData.cliente;
                return clientName && clientName === criteria.nombreCliente;
            });
        }
        
        // Filter by operation type
        if (criteria.operationType) {
            results = results.filter(sub => {
                if (criteria.operationType === 'recepcion') {
                    return sub.formType.includes('recepcion') || sub.formType.includes('reception');
                }
                if (criteria.operationType === 'despacho') {
                    return sub.formType.includes('despacho');
                }
                return true;
            });
        }

        // Filter by product type
        if (criteria.productType) {
            if (criteria.productType === 'fijo') {
                results = results.filter(sub => sub.formType.includes('fixed-weight'));
            } else if (criteria.productType === 'variable') {
                results = results.filter(sub => sub.formType.includes('variable-weight'));
            }
        }

        // Filter by Tipo Pedido
        if (criteria.tipoPedido) {
            results = results.filter(sub => {
                return sub.formData.tipoPedido === criteria.tipoPedido;
            });
        }


        // Finally, sort results by date descending in memory
        results.sort((a, b) => new Date(b.formData.fecha).getTime() - new Date(a.formData.fecha).getTime());
        
        return results;
    } catch (error) {
        console.error('Error searching submissions:', error);
        // This catch block is now a fallback for unexpected errors, 
        // as the index requirement should be less frequent.
        if (error instanceof Error && error.message.includes('requires an index')) {
            throw new Error('La consulta requiere un índice compuesto en Firestore que no se encontró. Por favor, revise los registros del servidor para crear el índice necesario.');
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
