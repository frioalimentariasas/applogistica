
'use server';

import { firestore } from '@/lib/firebase-admin';
import { revalidatePath } from 'next/cache';

export async function addClient(razonSocial: string): Promise<{ success: boolean; message: string }> {
  if (!firestore) {
    return { success: false, message: 'Error de configuración del servidor.' };
  }
  if (!razonSocial || razonSocial.trim().length === 0) {
    return { success: false, message: 'El nombre del cliente no puede estar vacío.' };
  }

  const trimmedName = razonSocial.trim();

  try {
    const clientesRef = firestore.collection('clientes');
    const existingClient = await clientesRef.where('razonSocial', '==', trimmedName).limit(1).get();

    if (!existingClient.empty) {
      return { success: false, message: `El cliente "${trimmedName}" ya existe.` };
    }

    await clientesRef.add({ razonSocial: trimmedName });
    
    revalidatePath('/gestion-clientes');
    revalidatePath('/fixed-weight-form');
    revalidatePath('/variable-weight-form');
    revalidatePath('/variable-weight-reception-form');
    revalidatePath('/gestion-articulos');

    return { success: true, message: `Cliente "${trimmedName}" agregado con éxito.` };
  } catch (error) {
    console.error('Error al agregar el cliente:', error);
    const errorMessage = error instanceof Error ? error.message : 'Ocurrió un error desconocido.';
    return { success: false, message: `Error del servidor: ${errorMessage}` };
  }
}
