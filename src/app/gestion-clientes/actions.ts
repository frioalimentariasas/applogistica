
'use server';

import { firestore } from '@/lib/firebase-admin';
import { revalidatePath } from 'next/cache';

// Update the type to allow string for "Contado"
export async function addClient(razonSocial: string, paymentTerm?: number | string): Promise<{ success: boolean; message: string; newClient?: { id: string, razonSocial: string, paymentTermDays?: number | string } }> {
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
    
    // Prepare data to be saved, converting empty strings to null
    const paymentTermToSave = paymentTerm === '' ? null : paymentTerm;

    const newClientData = {
      razonSocial: trimmedName,
      paymentTermDays: paymentTermToSave,
    };
    const docRef = await clientesRef.add(newClientData);
    
    revalidatePath('/gestion-clientes');
    revalidatePath('/gestion-conceptos-liquidacion-clientes');
    revalidatePath('/fixed-weight-form');
    revalidatePath('/variable-weight-form');
    revalidatePath('/variable-weight-reception-form');
    revalidatePath('/gestion-articulos');

    return { success: true, message: `Cliente "${trimmedName}" agregado con éxito.`, newClient: { id: docRef.id, razonSocial: trimmedName, paymentTermDays: paymentTerm } };
  } catch (error) {
    console.error('Error al agregar el cliente:', error);
    const errorMessage = error instanceof Error ? error.message : 'Ocurrió un error desconocido.';
    return { success: false, message: `Error del servidor: ${errorMessage}` };
  }
}

export async function updateClient(id: string, newRazonSocial: string, paymentTerm?: number | string): Promise<{ success: boolean; message: string }> {
  if (!firestore) {
    return { success: false, message: 'Error de configuración del servidor.' };
  }
  const trimmedName = newRazonSocial.trim();
  if (!trimmedName) {
    return { success: false, message: 'El nombre del cliente no puede estar vacío.' };
  }

  try {
    const clientRef = firestore.collection('clientes').doc(id);
    const clientDoc = await clientRef.get();

    if (!clientDoc.exists) {
      return { success: false, message: 'El cliente no fue encontrado.' };
    }

    const oldRazonSocial = clientDoc.data()?.razonSocial;

    // Check if new name already exists (and it's not the same doc)
    const existingClientQuery = await firestore.collection('clientes').where('razonSocial', '==', trimmedName).limit(1).get();
    if (!existingClientQuery.empty && existingClientQuery.docs[0].id !== id) {
      return { success: false, message: `El cliente "${trimmedName}" ya existe.` };
    }

    const batch = firestore.batch();
    
    // Prepare data for update, converting empty strings to null
    const paymentTermToSave = paymentTerm === '' ? null : paymentTerm;

    // Update client document
    batch.update(clientRef, {
      razonSocial: trimmedName,
      paymentTermDays: paymentTermToSave,
    });

    // Update associated articles
    if (oldRazonSocial && oldRazonSocial !== trimmedName) {
      const articlesQuery = await firestore.collection('articulos').where('razonSocial', '==', oldRazonSocial).get();
      articlesQuery.forEach(doc => {
        batch.update(doc.ref, { razonSocial: trimmedName });
      });
    }

    await batch.commit();

    revalidatePath('/gestion-clientes');
    revalidatePath('/gestion-conceptos-liquidacion-clientes');
    revalidatePath('/gestion-articulos');
    revalidatePath('/fixed-weight-form');
    revalidatePath('/variable-weight-form');
    revalidatePath('/variable-weight-reception-form');

    return { success: true, message: 'Cliente y artículos asociados actualizados con éxito.' };
  } catch (error) {
    console.error('Error al actualizar el cliente:', error);
    const errorMessage = error instanceof Error ? error.message : 'Ocurrió un error desconocido.';
    return { success: false, message: `Error del servidor: ${errorMessage}` };
  }
}

export async function deleteClient(id: string): Promise<{ success: boolean; message: string }> {
  if (!firestore) {
    return { success: false, message: 'Error de configuración del servidor.' };
  }
  try {
    const clientRef = firestore.collection('clientes').doc(id);
    const clientDoc = await clientRef.get();
    if (!clientDoc.exists) {
        return { success: false, message: 'El cliente no fue encontrado.' };
    }
    const { razonSocial } = clientDoc.data() as { razonSocial: string };

    // Check for associated articles
    const articlesQuery = await firestore.collection('articulos').where('razonSocial', '==', razonSocial).limit(1).get();
    if (!articlesQuery.empty) {
      return { success: false, message: 'No se puede eliminar un cliente con artículos asociados. Por favor, elimine o reasigne los artículos primero.' };
    }

    await clientRef.delete();
    
    revalidatePath('/gestion-clientes');
    revalidatePath('/gestion-conceptos-liquidacion-clientes');
    revalidatePath('/fixed-weight-form');
    revalidatePath('/variable-weight-form');
    revalidatePath('/variable-weight-reception-form');
    revalidatePath('/gestion-articulos');

    return { success: true, message: 'Cliente eliminado con éxito.' };
  } catch (error) {
    console.error('Error al eliminar el cliente:', error);
    const errorMessage = error instanceof Error ? error.message : 'Ocurrió un error desconocido.';
    return { success: false, message: `Error del servidor: ${errorMessage}` };
  }
}
