
'use server';

import admin from 'firebase-admin';
import { firestore } from '@/lib/firebase-admin';

export interface SpecialReportResult {
    pedidoSislog: string;
    fecha: string;
    cliente: string;
}

type CriterionType = 
    | 'REESTIBADO' 
    | 'SALIDA PALETAS TUNEL' 
    | 'TRANSBORDO CANASTILLA'
    | 'CARGUE'
    | 'DESCARGUE'
    | 'EMPAQUE DE CAJAS'
    | 'EMPAQUE DE SACOS';


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

export async function getPedidosByCriteria(criteria: CriterionType[]): Promise<Record<CriterionType, SpecialReportResult[]>> {
    if (!firestore) {
        throw new Error('El servidor no está configurado correctamente.');
    }

    // Initialize results object
    const results: Record<CriterionType, SpecialReportResult[]> = {} as any;
    criteria.forEach(c => results[c] = []);

    try {
        const submissionsSnapshot = await firestore.collection('submissions').get();
        
        submissionsSnapshot.docs.forEach(doc => {
            const submission = serializeTimestamps(doc.data());
            const formData = submission.formData;
            const formType = submission.formType;

            if (!formData) return;

            const resultItem: SpecialReportResult = {
                pedidoSislog: formData.pedidoSislog || 'N/A',
                fecha: formData.fecha || 'N/A',
                cliente: formData.nombreCliente || formData.cliente || 'N/A',
            };

            // 1. Check for Observation-based criteria
            if (Array.isArray(formData.observaciones)) {
                formData.observaciones.forEach((obs: any) => {
                    if (obs.executedByGrupoRosales === true) {
                        if (criteria.includes(obs.type) && results[obs.type as CriterionType]) {
                           results[obs.type as CriterionType].push(resultItem);
                        }
                    }
                });
            }

            // 2. Check for form-based criteria
            if (formData.aplicaCuadrilla === 'si') {
                // CARGUE
                if (criteria.includes('CARGUE') && formType.includes('despacho')) {
                    results.CARGUE.push(resultItem);
                }
                // DESCARGUE
                if (criteria.includes('DESCARGUE') && (formType.includes('recepcion') || formType.includes('reception'))) {
                    results.DESCARGUE.push(resultItem);
                }
                // MAQUILA
                if (formData.tipoPedido === 'MAQUILA') {
                    if (criteria.includes('EMPAQUE DE CAJAS') && formData.tipoEmpaqueMaquila === 'EMPAQUE DE CAJAS') {
                        results['EMPAQUE DE CAJAS'].push(resultItem);
                    }
                    if (criteria.includes('EMPAQUE DE SACOS') && formData.tipoEmpaqueMaquila === 'EMPAQUE DE SACOS') {
                        results['EMPAQUE DE SACOS'].push(resultItem);
                    }
                }
            }
        });

        // Sort all results by date descending
        for (const key in results) {
            results[key as CriterionType].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
        }

        return results;
    } catch (error) {
        console.error(`Error fetching special reports:`, error);
        throw new Error('No se pudo generar el reporte especial.');
    }
}
