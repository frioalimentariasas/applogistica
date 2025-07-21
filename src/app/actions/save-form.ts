
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
    userId: string;
    userDisplayName: string;
  };
}

export async function saveForm(
    // The `data` object contains the CURRENT user's info for new forms,
    // or the EDITOR's info for updates.
    data: Omit<FormSubmissionData, 'createdAt' | 'updatedAt' | 'lastUpdatedBy'> & { createdAt?: string },
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
        // The `data.userId` and `data.userDisplayName` will now be the NEW responsible user
        // selected by the admin, or the original user if not changed.
        const { userId: editorUserId, userDisplayName: editorDisplayName, createdAt, ...restOfData } = data;

        const updatePayload = {
            ...restOfData,
            updatedAt: new Date().toISOString(),
            lastUpdatedBy: {
                userId: editorUserId, // This is the user who clicked the "save" button.
                userDisplayName: editorDisplayName
            }
        };
        
        const docRef = firestore.collection('submissions').doc(formIdToUpdate);
        await docRef.update(updatePayload);
        return { success: true, message: 'Formulario actualizado con éxito.', formId: formIdToUpdate };

    } else {
        // This is a new submission. We save all the initial data.
        const submissionData = {
            ...data,
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
