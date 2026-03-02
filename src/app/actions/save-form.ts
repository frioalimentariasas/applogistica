
'use server';

import { firestore } from '@/lib/firebase-admin';

// This is a generic type, can be expanded if needed
export interface FormSubmissionData {
  userId: string;
  userDisplayName: string;
  formType: string;
  formData: any; // The whole form data object
  attachmentUrls: string[];
  createdAt: string;
  updatedAt?: string; // Tracks when the form was last updated
  lastUpdatedBy?: { // Tracks who made the last update
    editorId: string;
    editorDisplayName: string;
  };
  crewProvider?: string;
}

export interface SaveFormPayload {
    formData: any;
    formType: string;
    attachmentUrls: string[];
    crewProvider?: string;
    // For new forms, this is the creator.
    // For updates, this is the NEWLY ASSIGNED responsible user.
    responsibleUser: {
        id: string;
        displayName: string;
    },
    // For updates, this is the user who clicked "Save".
    // For new forms, this is the same as the responsibleUser.
    editor: {
        id: string;
        displayName: string;
    }
    createdAt?: string; // Only used for updates to preserve original creation date
}

/**
 * Recursively removes any keys with 'undefined' values from an object.
 * Firestore Admin SDK does not allow 'undefined' as a value.
 * Updated to preserve Date objects and Firestore Timestamps.
 */
function sanitizeFirestoreData(data: any): any {
  if (data === null || typeof data !== 'object') {
    return data;
  }

  // Preserve Date objects
  if (data instanceof Date) {
    return data;
  }

  // Preserve Firestore Timestamps (duck typing check)
  if (typeof data.toDate === 'function') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(sanitizeFirestoreData);
  }

  const sanitized: { [key: string]: any } = {};
  for (const key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      const value = data[key];
      if (value !== undefined) {
        sanitized[key] = sanitizeFirestoreData(value);
      }
    }
  }
  return sanitized;
}


export async function saveForm(
    payload: SaveFormPayload,
    formIdToUpdate?: string
): Promise<{ success: boolean; message: string; formId?: string }> {
  if (!firestore) {
    return { 
      success: false, 
      message: 'Error de configuración del servidor: Firebase Admin no está inicializado.' 
    };
  }

  try {
    if (formIdToUpdate) {
        // This is an update.
        const updateData: Partial<FormSubmissionData> = {
            userId: payload.responsibleUser.id,
            userDisplayName: payload.responsibleUser.displayName,
            formData: payload.formData,
            formType: payload.formType,
            attachmentUrls: payload.attachmentUrls,
            updatedAt: new Date().toISOString(),
            lastUpdatedBy: {
                editorId: payload.editor.id, 
                editorDisplayName: payload.editor.displayName
            }
        };

        if (payload.crewProvider) {
            updateData.crewProvider = payload.crewProvider;
        }
        
        const docRef = firestore.collection('submissions').doc(formIdToUpdate);
        // Sanitize the entire object to remove any 'undefined' from formData or other fields
        await docRef.update(sanitizeFirestoreData(updateData));
        return { success: true, message: 'Formulario actualizado con éxito.', formId: formIdToUpdate };

    } else {
        // --- DEDUPLICATION LOGIC ---
        // We check if a submission with the same Sislog and formType already exists 
        // within a short timeframe (e.g., 60 seconds) to prevent double clicks or retry issues.
        const pedidoSislog = payload.formData.pedidoSislog;
        if (pedidoSislog) {
            const existingQuery = await firestore.collection('submissions')
                .where('formType', '==', payload.formType)
                .where('formData.pedidoSislog', '==', pedidoSislog)
                .get();
            
            if (!existingQuery.empty) {
                const now = Date.now();
                const duplicate = existingQuery.docs.find(doc => {
                    const data = doc.data();
                    const createdAt = new Date(data.createdAt).getTime();
                    return (now - createdAt < 60000); // 60 seconds window
                });

                if (duplicate) {
                    console.log(`[Deduplication] Duplicate detected for ${pedidoSislog}. Returning existing ID: ${duplicate.id}`);
                    return { success: true, message: 'Formulario ya guardado.', formId: duplicate.id };
                }
            }
        }

        // This is a new submission. We save all the initial data.
        const submissionData: FormSubmissionData = {
            userId: payload.responsibleUser.id,
            userDisplayName: payload.responsibleUser.displayName,
            formData: payload.formData,
            formType: payload.formType,
            attachmentUrls: payload.attachmentUrls,
            createdAt: new Date().toISOString(),
        };

        // Only add crewProvider if it has a value
        if (payload.crewProvider) {
            submissionData.crewProvider = payload.crewProvider;
        }

        // Sanitize the entire object to remove any 'undefined' from formData or other fields
        const cleanedData = sanitizeFirestoreData(submissionData);
        const docRef = await firestore.collection('submissions').add(cleanedData);
        return { success: true, message: 'Formulario guardado con éxito.', formId: docRef.id };
    }

  } catch (error) {
    console.error('Error al guardar el formulario en Firestore:', error);
    if (error instanceof Error) {
        return { success: false, message: `Error del servidor: ${error.message}` };
    }
    return { success: false, message: 'Ocurrió un error desconocido al guardar el formulario.' };
  }
}
