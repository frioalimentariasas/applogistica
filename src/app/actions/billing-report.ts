
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
        // Step 1: Query all submissions. We will filter by client and date in-memory for accuracy.
        // This is more robust than relying on createdAt for date filtering.
        const snapshot = await firestore.collection('submissions').get();

        // Step 2: Process submissions into a map of daily movements, filtered by client and date.
        const dailyMovements = new Map<string, { paletasRecibidas: number; paletasDespachadas: number }>();

        snapshot.docs.forEach(doc => {
            const submission = serializeTimestamps(doc.data());
            
            const clientField = submission.formData.nombreCliente || submission.formData.cliente;
            
            // In-memory filter for client name (case-insensitive and trimmed)
            if (!clientField || clientField.trim().toLowerCase() !== criteria.clientName.trim().toLowerCase()) {
                return;
            }

            const formIsoDate = submission.formData.fecha;
            if (!formIsoDate || typeof formIsoDate !== 'string') return;
            
            const groupingDate = formIsoDate.split('T')[0];

            // Precise in-memory filter for the date range on the operational date (formData.fecha)
            if (groupingDate < criteria.startDate || groupingDate > criteria.endDate) return;

            if (!dailyMovements.has(groupingDate)) {
                dailyMovements.set(groupingDate, { paletasRecibidas: 0, paletasDespachadas: 0 });
            }

            const dailyData = dailyMovements.get(groupingDate)!;
            const formType = submission.formType;

            // Logic to calculate pallets based on form type
            if (formType === 'fixed-weight-recepcion') {
                const receivedFixedPallets = (submission.formData.productos || []).reduce((sum: number, p: any) => {
                    return sum + (Number(p.totalPaletas ?? p.paletas) || 0);
                }, 0);
                dailyData.paletasRecibidas += receivedFixedPallets;

            } else if (formType === 'fixed-weight-despacho') {
                const dispatchedFixedPallets = (submission.formData.productos || []).reduce((sum: number, p: any) => {
                    return sum + (Number(p.totalPaletas ?? p.paletas) || 0);
                }, 0);
                dailyData.paletasDespachadas += dispatchedFixedPallets;

            } else if (formType === 'variable-weight-recepcion' || formType === 'variable-weight-reception') {
                const items = submission.formData.items || [];
                // The business rule is to count each item as one pallet for this report.
                dailyData.paletasRecibidas += items.length;

            } else if (formType === 'variable-weight-despacho') {
                const items = submission.formData.items || [];
                const isSummaryMode = items.some((p: any) => Number(p.paleta) === 0);
                let dispatchedVariablePallets = 0;
                
                if (isSummaryMode) {
                     dispatchedVariablePallets = items.reduce((sum: number, item: any) => {
                        if (Number(item.paleta) === 0) {
                            return sum + (Number(item.totalPaletas) || 0);
                        }
                        return sum;
                    }, 0);
                } else {
                     // Count unique pallet numbers from the items list for non-summary dispatches.
                     const palletNumbers = new Set<number>();
                     (items || []).forEach((item: any) => {
                        const paletaValue = Number(item.paleta);
                        if (!isNaN(paletaValue) && paletaValue > 0) {
                           palletNumbers.add(paletaValue);
                        }
                     });
                     dispatchedVariablePallets = palletNumbers.size;
                }
                dailyData.paletasDespachadas += dispatchedVariablePallets;
            }
        });
        
        // Step 3: Convert map to an array, filtering for days with movement.
        const reporteFinal: DailyReportData[] = [];
        for (const [date, movements] of dailyMovements.entries()) {
            if (movements.paletasRecibidas > 0 || movements.paletasDespachadas > 0) {
                reporteFinal.push({
                    date,
                    paletasRecibidas: movements.paletasRecibidas,
                    paletasDespachadas: movements.paletasDespachadas,
                });
            }
        }
        
        // Step 4: Sort the final report in descending date order for the UI
        reporteFinal.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        return reporteFinal;

    } catch (error) {
        console.error('Error generating billing report:', error);
        if (error instanceof Error && error.message.includes('requires an index')) {
            throw new Error('La consulta requiere un índice compuesto en Firestore. Por favor, revise los registros del servidor para crear el índice necesario.');
        }
        throw new Error('No se pudo generar el reporte de facturación.');
    }
}
