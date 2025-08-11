
'use server';

import admin from 'firebase-admin';
import { firestore } from '@/lib/firebase-admin';

export interface SpecialReportResult {
    pedidoSislog: string;
    fecha: string;
    cliente: string;
}

const serializeTimestamps = (data: any): any => {
    if (data === null || data === undefined || typeof data !== 'object') {
        return data;
    }
    if (data instanceof admin.firestore.Timestamp) {
        return data.toDate().toISOString();
    }
    if (Array.isArray(data)) {
        return data.map(item => serializeTimestamps(item));
    }
    const newObj: { [key: string]: any } = {};
    for (const key in data) {
        if (Object.prototype.hasOwnProperty.call(data, key)) {
            newObj[key] = serializeTimestamps(data[key]);
        }
    }
    return newObj;
};

export async function getPedidosByObservation(observationType: 'REESTIBADO' | 'SALIDA PALETAS TUNEL'): Promise<SpecialReportResult[]> {
    if (!firestore) {
        throw new Error('El servidor no está configurado correctamente.');
    }

    try {
        const submissionsSnapshot = await firestore.collection('submissions').get();
        
        const results: SpecialReportResult[] = [];

        submissionsSnapshot.docs.forEach(doc => {
            const submission = serializeTimestamps(doc.data());
            const formData = submission.formData;
            
            if (formData && Array.isArray(formData.observaciones)) {
                const hasMatchingObservation = formData.observaciones.some((obs: any) => 
                    obs.type === observationType && obs.executedByGrupoRosales === true
                );

                if (hasMatchingObservation) {
                    results.push({
                        pedidoSislog: formData.pedidoSislog || 'N/A',
                        fecha: formData.fecha || 'N/A',
                        cliente: formData.nombreCliente || formData.cliente || 'N/A',
                    });
                }
            }
        });

        results.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

        return results;
    } catch (error) {
        console.error(`Error fetching pedidos for observation "${observationType}":`, error);
        throw new Error('No se pudo generar el reporte especial.');
    }
}
