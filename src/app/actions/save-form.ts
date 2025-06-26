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
}

export async function saveForm(data: FormSubmissionData): Promise<{ success: boolean; message: string; formId?: string }> {
  if (!firestore) {
    return { 
      success: false, 
      message: 'Error de configuración del servidor: Firebase Admin no está inicializado.' 
    };
  }

  try {
    const submissionData = {
        ...data,
        createdAt: new Date().toISOString(),
    };

    const docRef = await firestore.collection('submissions').add(submissionData);

    return { success: true, message: 'Formulario guardado con éxito.', formId: docRef.id };
  } catch (error) {
    console.error('Error al guardar el formulario en Firestore:', error);
    if (error instanceof Error) {
        return { success: false, message: `Error del servidor: ${error.message}` };
    }
    return { success: false, message: 'Ocurrió un error desconocido al guardar el formulario.' };
  }
}
