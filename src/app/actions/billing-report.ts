
'use server';

import admin from 'firebase-admin';
import { firestore } from '@/lib/firebase-admin';

// Helper to get a YYYY-MM-DD string adjusted for a specific timezone (e.g., UTC-5 for Colombia)
const getLocalGroupingDate = (isoString: string): string => {
    if (!isoString) return '';
    try {
        const date = new Date(isoString);
        // Adjust for a fixed timezone offset. UTC-5 for Colombia.
        date.setUTCHours(date.getUTCHours() - 5);
        return date.toISOString().split('T')[0];
    } catch (e) {
        console.error(`Invalid date string for grouping: ${isoString}`);
        return '';
    }
};

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
}

export interface DailyReportData {
  date: string; // YYYY-MM-DD
  paletasRecibidas: number;
  paletasDespachadas: number;
}

export async function getBillingReport(criteria: BillingReportCriteria): Promise<DailyReportData[]> {
    if (!firestore) {
        throw new Error('El servidor no está configurado correctamente.');
    }

    if (!criteria.clientName) {
        throw new Error('El nombre del cliente es requerido para este reporte.');
    }

    try {
        const snapshot = await firestore.collection('submissions').get();

        const dailyDataMap = new Map<string, {
            fixedRecibidas: number;
            fixedDespachadas: number;
            varRecibidasItemized: Set<number>;
            varDespachadasItemized: Set<number>;
            varRecibidasSummary: number;
            varDespachadasSummary: number;
        }>();

        snapshot.docs.forEach(doc => {
            const submission = serializeTimestamps(doc.data());
            
            const clientField = submission.formData.nombreCliente || submission.formData.cliente;
            
            if (!clientField || clientField.trim().toLowerCase() !== criteria.clientName.trim().toLowerCase()) {
                return;
            }

            const formIsoDate = submission.formData.fecha;
            if (!formIsoDate || typeof formIsoDate !== 'string') return;
            
            const groupingDate = getLocalGroupingDate(formIsoDate);
            if (!groupingDate) return;

            if (groupingDate < criteria.startDate || groupingDate > criteria.endDate) return;

            if (!dailyDataMap.has(groupingDate)) {
                dailyDataMap.set(groupingDate, {
                    fixedRecibidas: 0,
                    fixedDespachadas: 0,
                    varRecibidasItemized: new Set(),
                    varDespachadasItemized: new Set(),
                    varRecibidasSummary: 0,
                    varDespachadasSummary: 0,
                });
            }

            const dailyData = dailyDataMap.get(groupingDate)!;
            const formType = submission.formType;
            const items = submission.formData.items || [];

            if (formType === 'fixed-weight-recepcion') {
                const receivedFixedPallets = (submission.formData.productos || []).reduce((sum: number, p: any) => {
                    return sum + (Number(p.totalPaletas ?? p.paletas) || 0);
                }, 0);
                dailyData.fixedRecibidas += receivedFixedPallets;

            } else if (formType === 'fixed-weight-despacho') {
                const dispatchedFixedPallets = (submission.formData.productos || []).reduce((sum: number, p: any) => {
                    return sum + (Number(p.totalPaletas ?? p.paletas) || 0);
                }, 0);
                dailyData.fixedDespachadas += dispatchedFixedPallets;

            } else if (formType === 'variable-weight-recepcion' || formType === 'variable-weight-reception') {
                items.forEach((item: any) => {
                    const paletaValue = Number(item.paleta);
                    if (!isNaN(paletaValue) && paletaValue > 0) {
                        dailyData.varRecibidasItemized.add(paletaValue);
                    }
                });
            } else if (formType === 'variable-weight-despacho') {
                 items.forEach((item: any) => {
                    const paletaValue = Number(item.paleta);
                    if (paletaValue === 0) {
                        dailyData.varDespachadasSummary += (Number(item.totalPaletas) || 0);
                    } else if (!isNaN(paletaValue) && paletaValue > 0) {
                        dailyData.varDespachadasItemized.add(paletaValue);
                    }
                });
            }
        });
        
        const reporteFinal: DailyReportData[] = [];
        for (const [date, movements] of dailyDataMap.entries()) {
            const totalRecibidas = movements.fixedRecibidas + movements.varRecibidasItemized.size;
            const totalDespachadas = movements.fixedDespachadas + movements.varDespachadasItemized.size + movements.varDespachadasSummary;
            
            if (totalRecibidas > 0 || totalDespachadas > 0) {
                reporteFinal.push({
                    date,
                    paletasRecibidas: totalRecibidas,
                    paletasDespachadas: totalDespachadas,
                });
            }
        }
        
        reporteFinal.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        return reporteFinal;

    } catch (error) {
        console.error('Error generating billing report:', error);
        if (error instanceof Error && error.message.includes('requires an index')) {
            throw new Error('La consulta requiere un índice compuesto en Firestore. Por favor, revise los registros del servidor para crear el índice necesario.');
        }
        throw new Error('No se pudo generar el reporte de facturación.');
    }
}
