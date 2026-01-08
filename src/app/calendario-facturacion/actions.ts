
'use server';

import { firestore } from '@/lib/firebase-admin';
import admin from 'firebase-admin';
import { revalidatePath } from 'next/cache';

export interface BillingEvent {
  id: string;
  date: string; // YYYY-MM-DD
  clients: string[]; // List of client names
  note: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export interface BillingEventData extends Omit<BillingEvent, 'id' | 'date'> {
    date: admin.firestore.Timestamp;
}

export async function getBillingEvents(
  startDate: string,
  endDate: string
): Promise<BillingEvent[]> {
  if (!firestore) {
    throw new Error('El servidor no está configurado correctamente.');
  }

  try {
    const snapshot = await firestore
      .collection('billing_schedule')
      .where('date', '>=', admin.firestore.Timestamp.fromDate(new Date(startDate)))
      .where('date', '<=', admin.firestore.Timestamp.fromDate(new Date(endDate)))
      .get();
      
    if (snapshot.empty) {
      return [];
    }
    
    return snapshot.docs.map(doc => {
      const data = doc.data() as BillingEventData;
      return {
        id: doc.id,
        ...data,
        date: data.date.toDate().toISOString().split('T')[0], // Convert to YYYY-MM-DD string
      } as BillingEvent;
    });
  } catch (error) {
    console.error('Error fetching billing events:', error);
    if (error instanceof Error && error.message.includes('requires an index')) {
        throw error; // Re-throw to be caught by the client
    }
    throw new Error('No se pudieron obtener los eventos del calendario.');
  }
}

export async function saveBillingEvent(
  event: Omit<BillingEvent, 'id'>,
  eventId?: string
): Promise<{ success: boolean; message: string; eventId?: string }> {
  if (!firestore) {
    return { success: false, message: 'El servidor no está configurado.' };
  }

  try {
    const eventData = {
      ...event,
      date: admin.firestore.Timestamp.fromDate(new Date(event.date)), // Store as Timestamp
    };

    if (eventId) {
      // Update
      await firestore.collection('billing_schedule').doc(eventId).set(eventData, { merge: true });
      revalidatePath('/calendario-facturacion');
      return { success: true, message: 'Evento actualizado con éxito.', eventId: eventId };
    } else {
      // Create
      const docRef = await firestore.collection('billing_schedule').add(eventData);
      revalidatePath('/calendario-facturacion');
      return { success: true, message: 'Evento guardado con éxito.', eventId: docRef.id };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido.';
    console.error('Error saving billing event:', error);
    return { success: false, message: `Error del servidor: ${errorMessage}` };
  }
}

export async function deleteBillingEvent(
  eventId: string
): Promise<{ success: boolean; message: string }> {
  if (!firestore) {
    return { success: false, message: 'El servidor no está configurado.' };
  }

  try {
    await firestore.collection('billing_schedule').doc(eventId).delete();
    revalidatePath('/calendario-facturacion');
    return { success: true, message: 'Evento eliminado con éxito.' };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido.';
    console.error('Error deleting billing event:', error);
    return { success: false, message: `Error del servidor: ${errorMessage}` };
  }
}
