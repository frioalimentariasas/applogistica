
'use server';

import admin from 'firebase-admin';
import { firestore } from '@/lib/firebase-admin';
import { getLatestStockBeforeDate } from './inventory-report';

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
  clientName: string; // Must be provided for this report
  startDate: string;
  endDate: string;
  sesion: string;
}

export interface DailyReportData {
  date: string; // YYYY-MM-DD
  paletasRecibidas: number;
  paletasDespachadas: number;
  paletasAlmacenadas: number;
}

export async function getBillingReport(criteria: BillingReportCriteria): Promise<DailyReportData[]> {
    if (!firestore) {
        throw new Error('El servidor no está configurado correctamente.');
    }

    if (!criteria.clientName || !criteria.sesion) {
        throw new Error('El nombre del cliente y la sesión son requeridos para este reporte.');
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

        const dailyTotals = new Map<string, Omit<DailyReportData, 'paletasAlmacenadas'>>();

        snapshot.docs.forEach(doc => {
            const submission = serializeTimestamps(doc.data());
            
            // In-memory filter for client
            const clientField = submission.formData.nombreCliente || submission.formData.cliente;
            if (clientField !== criteria.clientName) {
                return; // Skip this doc if it doesn't match the client
            }

            // Grouping must be based on the 'fecha' field from inside the form.
            const formIsoDate = submission.formData.fecha;
            if (!formIsoDate || typeof formIsoDate !== 'string') {
                return; // Skip if date is missing
            }
            
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
                    paletasRecibidas: 0,
                    paletasDespachadas: 0,
                });
            }

            const dailyData = dailyTotals.get(groupingDate)!;
            
            switch (submission.formType) {
                case 'fixed-weight-recepcion':
                    const receivedFixedPallets = (submission.formData.productos || []).reduce((sum: number, p: any) => sum + (Number(p.totalPaletas ?? p.paletas) || 0), 0);
                    dailyData.paletasRecibidas += receivedFixedPallets;
                    break;
                case 'fixed-weight-despacho':
                    const dispatchedFixedPallets = (submission.formData.productos || []).reduce((sum: number, p: any) => sum + (Number(p.totalPaletas ?? p.paletas) || 0), 0);
                    dailyData.paletasDespachadas += dispatchedFixedPallets;
                    break;
                case 'variable-weight-recepcion':
                    const receivedVariablePallets = (submission.formData.items || []).length;
                    dailyData.paletasRecibidas += receivedVariablePallets;
                    break;
                case 'variable-weight-despacho':
                    const items = submission.formData.items || [];
                    const summary = submission.formData.summary || [];
                    
                    const isSummaryMode = items.some((p: any) => Number(p.paleta) === 0);

                    if (isSummaryMode) {
                        const dispatchedVariablePallets = summary.reduce((sum: number, s: any) => sum + (Number(s.totalPaletas) || 0), 0);
                        dailyData.paletasDespachadas += dispatchedVariablePallets;
                    } else {
                        dailyData.paletasDespachadas += items.length;
                    }
                    break;
            }
        });
        
        const resultsWithoutStock: Omit<DailyReportData, 'paletasAlmacenadas'>[] = Array.from(dailyTotals.values());
        
        if (resultsWithoutStock.length === 0) {
            return [];
        }

        resultsWithoutStock.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        
        let lastStock = await getLatestStockBeforeDate(criteria.clientName, criteria.startDate, criteria.sesion);
        
        const resultsWithStock: DailyReportData[] = [];

        for (const day of resultsWithoutStock) {
            const paletasAlmacenadas = lastStock + day.paletasRecibidas - day.paletasDespachadas;
            resultsWithStock.push({
                ...day,
                paletasAlmacenadas,
            });
            lastStock = paletasAlmacenadas;
        }

        resultsWithStock.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        
        return resultsWithStock;

    } catch (error) {
        console.error('Error generating billing report:', error);
        if (error instanceof Error && error.message.includes('requires an index')) {
            throw new Error('La consulta requiere un índice compuesto en Firestore. Por favor, revise los registros del servidor para crear el índice necesario.');
        }
        throw new Error('No se pudo generar el reporte de facturación.');
    }
}
