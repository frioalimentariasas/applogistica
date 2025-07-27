
'use server';

import { firestore } from '@/lib/firebase-admin';
import { revalidatePath } from 'next/cache';

export interface PedidoType {
  id: string;
  name: string;
  appliesTo: ('fixed-weight-reception' | 'fixed-weight-despacho' | 'variable-weight-reception' | 'variable-weight-despacho')[];
}

export async function getPedidoTypes(): Promise<PedidoType[]> {
  if (!firestore) return [];
  try {
    const snapshot = await firestore.collection('pedido_types').orderBy('name').get();
    if (snapshot.empty) {
        // If empty, create the default ones
        const defaults = [
            { name: 'GENERICO', appliesTo: ['fixed-weight-reception', 'fixed-weight-despacho', 'variable-weight-reception', 'variable-weight-despacho'] },
            { name: 'MAQUILA', appliesTo: ['fixed-weight-reception', 'variable-weight-reception'] },
            { name: 'TUNEL', appliesTo: ['fixed-weight-reception', 'fixed-weight-despacho', 'variable-weight-reception', 'variable-weight-despacho'] },
            { name: 'INGRESO DE SALDO', appliesTo: ['fixed-weight-reception', 'variable-weight-reception'] },
        ];
        const batch = firestore.batch();
        const results: PedidoType[] = [];
        defaults.forEach(item => {
            const docRef = firestore.collection('pedido_types').doc();
            batch.set(docRef, item);
            results.push({ id: docRef.id, ...item } as PedidoType);
        });
        await batch.commit();
        return results;
    }
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    } as PedidoType));
  } catch (error) {
    console.error("Error fetching 'Tipos de Pedido':", error);
    return [];
  }
}

export async function addPedidoType(data: Omit<PedidoType, 'id'>): Promise<{ success: boolean; message: string; newType?: PedidoType }> {
  if (!firestore) return { success: false, message: 'Error de configuración del servidor.' };

  const { name, appliesTo } = data;
  if (!name || !appliesTo) return { success: false, message: 'El nombre y las aplicaciones son obligatorios.' };
  
  const trimmedName = name.trim().toUpperCase();

  try {
    const existing = await firestore.collection('pedido_types').where('name', '==', trimmedName).limit(1).get();
    if (!existing.empty) {
        return { success: false, message: `El tipo de pedido "${trimmedName}" ya existe.` };
    }

    const docRef = await firestore.collection('pedido_types').add({ name: trimmedName, appliesTo });
    revalidatePath('/gestion-tipos-pedido');
    return { success: true, message: 'Tipo de pedido creado con éxito.', newType: { id: docRef.id, name: trimmedName, appliesTo } };
  } catch (error) {
    console.error('Error al agregar tipo de pedido:', error);
    return { success: false, message: 'Ocurrió un error en el servidor.' };
  }
}

export async function updatePedidoType(id: string, data: Omit<PedidoType, 'id'>): Promise<{ success: boolean; message: string }> {
  if (!firestore) return { success: false, message: 'Error de configuración del servidor.' };
  
  const { name, appliesTo } = data;
  const trimmedName = name.trim().toUpperCase();

  try {
    const existing = await firestore.collection('pedido_types').where('name', '==', trimmedName).limit(1).get();
    if (!existing.empty && existing.docs[0].id !== id) {
        return { success: false, message: `El tipo de pedido "${trimmedName}" ya existe.` };
    }
    await firestore.collection('pedido_types').doc(id).update({ name: trimmedName, appliesTo });
    revalidatePath('/gestion-tipos-pedido');
    return { success: true, message: 'Tipo de pedido actualizado con éxito.' };
  } catch (error) {
    console.error('Error al actualizar tipo de pedido:', error);
    return { success: false, message: 'Ocurrió un error en el servidor.' };
  }
}

export async function deletePedidoType(id: string): Promise<{ success: boolean; message: string }> {
  if (!firestore) return { success: false, message: 'Error de configuración del servidor.' };
  try {
    await firestore.collection('pedido_types').doc(id).delete();
    revalidatePath('/gestion-tipos-pedido');
    return { success: true, message: 'Tipo de pedido eliminado con éxito.' };
  } catch (error) {
    console.error('Error al eliminar tipo de pedido:', error);
    return { success: false, message: 'Ocurrió un error en el servidor.' };
  }
}

export async function getPedidoTypesForForm(
  formName: 'fixed-weight-reception' | 'fixed-weight-despacho' | 'variable-weight-reception' | 'variable-weight-despacho'
): Promise<PedidoType[]> {
    if (!firestore) return [];
    try {
        const snapshot = await firestore.collection('pedido_types')
            .where('appliesTo', 'array-contains', formName)
            .orderBy('name')
            .get();
            
        if (snapshot.empty) return [];
        
        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
        } as PedidoType));
    } catch(error) {
        console.error(`Error fetching order types for form ${formName}:`, error);
        return [];
    }
}
