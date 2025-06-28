
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
        
        // Query a slightly wider date range on 'createdAt' to catch records on the boundaries of timezones.
        // The accurate filtering based on `formData.fecha` will happen in memory.
        const queryStartDate = new Date(`${criteria.startDate}T00:00:00.000Z`);
        queryStartDate.setDate(queryStartDate.getDate() - 1);
        
        const queryEndDate = new Date(`${criteria.endDate}T23:59:59.999Z`);
        queryEndDate.setDate(queryEndDate.getDate() + 1);
        
        query = query
            .where('createdAt', '>=', queryStartDate.toISOString())
            .where('createdAt', '<=', queryEndDate.toISOString());

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

            // Grouping must be based on the 'fecha' field from inside the form.
            const formIsoDate = submission.formData.fecha;
            if (!formIsoDate || typeof formIsoDate !== 'string') {
                return; // Skip if date is missing
            }
            
            // Create a date object from the UTC ISO string.
            // Manually adjust the date to the user's local timezone (Colombia, UTC-5)
            // This ensures that a form from 10 PM on June 27th is counted for June 27th, not June 28th.
            const date = new Date(formIsoDate);
            date.setHours(date.getHours() - 5);
            const groupingDate = date.toISOString().split('T')[0]; // YYYY-MM-DD

            // Perform the final, accurate date filtering in memory based on the user's request.
            if (groupingDate < criteria.startDate || groupingDate > criteria.endDate) {
                return;
            }

            if (!dailyTotals.has(groupingDate)) {
                dailyTotals.set(groupingDate, {
                    date: groupingDate,
                    fixedWeightIn: 0,
                    fixedWeightOut: 0,
                    variableWeightIn: 0,
                    variableWeightOut: 0,
                });
            }

            const dailyData = dailyTotals.get(groupingDate)!;
            
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
                    // User wants to count the number of line items, not sum the quantities.
                    const itemsIn = (submission.formData.items || []).length;
                    dailyData.variableWeightIn += itemsIn;
                    break;
                case 'variable-weight-despacho':
                    // Per user request, this is also the count of items for consistency.
                    const itemsOut = (submission.formData.items || []).length;
                    dailyData.variableWeightOut += itemsOut;
                    break;
            }
        });
        
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
