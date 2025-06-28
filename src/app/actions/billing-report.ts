
'use server';

import admin from 'firebase-admin';
import { firestore } from '@/lib/firebase-admin';

// This helper will recursively convert any Firestore Timestamps in an object to ISO strings.
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

export interface BillingReportCriteria {
  clientName?: string;
  startDate: string;
  endDate: string;
}

export interface DailyReportData {
  date: string; // YYYY-MM-DD
  fixedWeightIn: number;
  fixedWeightOut: number;
  variableWeightIn: number;
  variableWeightOut: number;
}

export async function getBillingReport(criteria: BillingReportCriteria): Promise<DailyReportData[]> {
    if (!firestore) {
        throw new Error('El servidor no está configurado correctamente.');
    }

    try {
        let query: admin.firestore.Query = firestore.collection('submissions');
        
        // Use explicit UTC dates to avoid any timezone ambiguity during query.
        const startDate = new Date(`${criteria.startDate}T00:00:00.000Z`);
        const endDate = new Date(`${criteria.endDate}T23:59:59.999Z`);
        
        query = query
            .where('createdAt', '>=', startDate.toISOString())
            .where('createdAt', '<=', endDate.toISOString());

        const snapshot = await query.get();

        if (snapshot.empty) {
            return [];
        }

        const dailyTotals = new Map<string, DailyReportData>();

        snapshot.docs.forEach(doc => {
            const submission = serializeTimestamps(doc.data());
            
            // In-memory filter for client if provided
            const clientField = submission.formData.nombreCliente || submission.formData.cliente;
            if (criteria.clientName && clientField !== criteria.clientName) {
                return; // Skip this doc if it doesn't match the client
            }

            // Grouping is done strictly by the 'createdAt' field, which marks the creation date of the form.
            const date = submission.createdAt.split('T')[0]; // YYYY-MM-DD

            if (!dailyTotals.has(date)) {
                dailyTotals.set(date, {
                    date,
                    fixedWeightIn: 0,
                    fixedWeightOut: 0,
                    variableWeightIn: 0,
                    variableWeightOut: 0,
                });
            }

            const dailyData = dailyTotals.get(date)!;
            
            switch (submission.formType) {
                case 'fixed-weight-recepcion':
                    const paletasIn = (submission.formData.productos || []).reduce((sum: number, p: any) => sum + (Number(p.paletas) || 0), 0);
                    dailyData.fixedWeightIn += paletasIn;
                    break;
                case 'fixed-weight-despacho':
                    const paletasOut = (submission.formData.productos || []).reduce((sum: number, p: any) => sum + (Number(p.paletas) || 0), 0);
                    dailyData.fixedWeightOut += paletasOut;
                    break;
                case 'variable-weight-recepcion':
                    const itemsIn = (submission.formData.summary || []).reduce((sum: number, s: any) => sum + (Number(s.totalCantidad) || 0), 0);
                    dailyData.variableWeightIn += itemsIn;
                    break;
                case 'variable-weight-despacho':
                    const itemsOut = (submission.formData.summary || []).reduce((sum: number, s: any) => sum + (Number(s.totalCantidad) || 0), 0);
                    dailyData.variableWeightOut += itemsOut;
                    break;
            }
        });
        
        // Convert map to array and sort by date descending
        const results = Array.from(dailyTotals.values());
        results.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        
        return results;

    } catch (error) {
        console.error('Error generating billing report:', error);
        if (error instanceof Error && error.message.includes('requires an index')) {
            throw new Error('La consulta requiere un índice compuesto en Firestore. Por favor, revise los registros del servidor para crear el índice necesario.');
        }
        throw new Error('No se pudo generar el reporte de facturación.');
    }
}
