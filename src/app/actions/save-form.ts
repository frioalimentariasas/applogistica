
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
}

export interface SaveFormPayload {
    formData: any;
    formType: string;
    attachmentUrls: string[];
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
        const updateData = {
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
        
        const docRef = firestore.collection('submissions').doc(formIdToUpdate);
        await docRef.update(updateData);
        return { success: true, message: 'Formulario actualizado con éxito.', formId: formIdToUpdate };

    } else {
        // This is a new submission. We save all the initial data.
        const submissionData: FormSubmissionData = {
            userId: payload.responsibleUser.id,
            userDisplayName: payload.responsibleUser.displayName,
            formData: payload.formData,
            formType: payload.formType,
            attachmentUrls: payload.attachmentUrls,
            createdAt: new Date().toISOString(),
        };
        const docRef = await firestore.collection('submissions').add(submissionData);
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
