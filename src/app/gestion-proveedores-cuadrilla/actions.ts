
'use server';

import { firestore } from '@/lib/firebase-admin';
import { revalidatePath } from 'next/cache';

export interface CrewProvider {
  id: string;
  name: string;
}

export async function getCrewProviders(): Promise<CrewProvider[]> {
  if (!firestore) return [];
  try {
    const snapshot = await firestore.collection('crew_providers').orderBy('name').get();
    if (snapshot.empty) return [];
    return snapshot.docs.map(doc => ({
      id: doc.id,
      name: doc.data().name,
    }));
  } catch (error) {
    console.error("Error fetching crew providers:", error);
    return [];
  }
}

export async function addCrewProvider(name: string): Promise<{ success: boolean; message: string; newProvider?: CrewProvider }> {
  if (!firestore) return { success: false, message: 'Error de configuración del servidor.' };
  
  const trimmedName = name.trim().toUpperCase();
  if (!trimmedName) return { success: false, message: 'El nombre del proveedor no puede estar vacío.' };

  try {
    const existing = await firestore.collection('crew_providers').where('name', '==', trimmedName).limit(1).get();
    if (!existing.empty) {
      return { success: false, message: `El proveedor "${trimmedName}" ya existe.` };
    }
    const docRef = await firestore.collection('crew_providers').add({ name: trimmedName });
    revalidatePath('/gestion-proveedores-cuadrilla');
    // Revalidate all pages that might use this new provider
    revalidatePath('/fixed-weight-form');
    revalidatePath('/variable-weight-reception-form');
    revalidatePath('/variable-weight-form');
    revalidatePath('/gestion-conceptos-liquidacion-cuadrilla');
    revalidatePath('/gestion-estandares-cuadrilla');
    revalidatePath('/operaciones-manuales-cuadrilla');
    revalidatePath('/crew-performance-report');
    
    return { success: true, message: 'Proveedor agregado.', newProvider: { id: docRef.id, name: trimmedName } };
  } catch (error) {
    console.error('Error al agregar proveedor:', error);
    return { success: false, message: 'Ocurrió un error en el servidor.' };
  }
}

export async function updateCrewProvider(id: string, name: string): Promise<{ success: boolean; message: string }> {
  if (!firestore) return { success: false, message: 'Error de configuración del servidor.' };
  
  const trimmedName = name.trim().toUpperCase();
  if (!trimmedName) return { success: false, message: 'El nombre no puede estar vacío.' };

  try {
     const existing = await firestore.collection('crew_providers').where('name', '==', trimmedName).limit(1).get();
    if (!existing.empty && existing.docs[0].id !== id) {
      return { success: false, message: `El proveedor "${trimmedName}" ya existe.` };
    }
    await firestore.collection('crew_providers').doc(id).update({ name: trimmedName });
    revalidatePath('/gestion-proveedores-cuadrilla');
    return { success: true, message: 'Proveedor actualizado.' };
  } catch (error) {
    console.error('Error al actualizar proveedor:', error);
    return { success: false, message: 'Ocurrió un error en el servidor.' };
  }
}

export async function deleteCrewProvider(id: string): Promise<{ success: boolean; message: string }> {
  if (!firestore) return { success: false, message: 'Error de configuración del servidor.' };
  try {
    // Here you might want to add checks to see if the provider is in use before deleting
    await firestore.collection('crew_providers').doc(id).delete();
    revalidatePath('/gestion-proveedores-cuadrilla');
    return { success: true, message: 'Proveedor eliminado.' };
  } catch (error) {
    console.error('Error al eliminar proveedor:', error);
    return { success: false, message: 'Ocurrió un error en el servidor.' };
  }
}
