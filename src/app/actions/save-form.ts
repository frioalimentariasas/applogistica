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
    // The `data` object contains the CURRENT user's info
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
        // This is an update. We must not change the original creator (userId, userDisplayName) or createdAt.
        // We will update the form data, attachments, and add an 'updatedAt' timestamp.
        const { userId, userDisplayName, createdAt, ...restOfData } = data;

        const updatePayload = {
            ...restOfData,
            updatedAt: new Date().toISOString(),
            lastUpdatedBy: {
                userId: userId, // This is the current user making the edit
                userDisplayName: userDisplayName
            }
        };
        
        const docRef = firestore.collection('submissions').doc(formIdToUpdate);
        // Using `update` ensures we only modify the fields in the payload,
        // leaving the original `userId`, `userDisplayName`, and `createdAt` untouched.
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
