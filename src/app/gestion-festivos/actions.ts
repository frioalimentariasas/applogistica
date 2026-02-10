
'use server';

import { firestore } from '@/lib/firebase-admin';
import { revalidatePath } from 'next/cache';

export interface Holiday {
  id: string;
  date: string; // YYYY-MM-DD
}

export async function getHolidays(): Promise<Holiday[]> {
  if (!firestore) return [];
  try {
    const snapshot = await firestore.collection('holidays').orderBy('date').get();
    if (snapshot.empty) return [];
    return snapshot.docs.map(doc => ({
      id: doc.id,
      date: doc.data().date,
    }));
  } catch (error) {
    console.error("Error fetching holidays:", error);
    return [];
  }
}

export async function getHolidaysInRange(startDate: string, endDate: string): Promise<Holiday[]> {
    if (!firestore) return [];
    try {
        const snapshot = await firestore.collection('holidays')
            .where('date', '>=', startDate)
            .where('date', '<=', endDate)
            .get();
        if (snapshot.empty) return [];
        return snapshot.docs.map(doc => ({
            id: doc.id,
            date: doc.data().date,
        }));
    } catch (error) {
        console.error("Error fetching holidays in range:", error);
        return [];
    }
}


export async function addHoliday(dateString: string): Promise<{ success: boolean; message: string; newHoliday?: Holiday }> {
  if (!firestore) return { success: false, message: 'Error de configuración del servidor.' };

  try {
    const existing = await firestore.collection('holidays').where('date', '==', dateString).limit(1).get();
    if (!existing.empty) {
      return { success: false, message: `El festivo para ${dateString} ya existe.` };
    }

    const docRef = await firestore.collection('holidays').add({ date: dateString });
    revalidatePath('/gestion-festivos');
    revalidatePath('/calendario-facturacion');
    revalidatePath('/crew-performance-report');
    return { success: true, message: 'Festivo agregado.', newHoliday: { id: docRef.id, date: dateString } };
  } catch (error) {
    console.error('Error al agregar festivo:', error);
    return { success: false, message: 'Ocurrió un error en el servidor.' };
  }
}

export async function deleteHoliday(id: string): Promise<{ success: boolean; message: string }> {
  if (!firestore) return { success: false, message: 'Error de configuración del servidor.' };
  try {
    await firestore.collection('holidays').doc(id).delete();
    revalidatePath('/gestion-festivos');
    revalidatePath('/calendario-facturacion');
    revalidatePath('/crew-performance-report');
    return { success: true, message: 'Festivo eliminado con éxito.' };
  } catch (error) {
    console.error('Error al eliminar festivo:', error);
    return { success: false, message: 'Ocurrió un error en el servidor.' };
  }
}
