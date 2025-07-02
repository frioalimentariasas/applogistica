
'use server';

import admin from 'firebase-admin';
import { firestore } from '@/lib/firebase-admin';
import { getLatestStockBeforeDate } from './inventory-report';
import { format } from 'date-fns';
import type { InventoryRow } from './inventory-report';

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

const productMatchesSession = (temperatura: any, session: string): boolean => {
    const temp = Number(temperatura);
    // If temp is not a number or undefined, it cannot match any session reliably.
    if (isNaN(temp)) {
        return false;
    }

    switch (session) {
        case 'CO': // Congelado
            return temp <= 0;
        case 'RE': // Refrigerado
            return temp > 0 && temp <= 10;
        case 'SE': // Seco
            return temp > 10;
        default:
            return false;
    }
};

export async function getBillingReport(criteria: BillingReportCriteria): Promise<DailyReportData[]> {
    if (!firestore) {
        throw new Error('El servidor no está configurado correctamente.');
    }

    if (!criteria.clientName || !criteria.sesion) {
        throw new Error('El nombre del cliente y la sesión son requeridos para este reporte.');
    }

    try {
        // Step 1: Query all submissions within the date range.
        // This is a broad query to avoid needing a composite index. Filtering by client happens in memory.
        let query: admin.firestore.Query = firestore.collection('submissions');
        
        const queryStartDate = new Date(`${criteria.startDate}T00:00:00.000Z`);
        const queryEndDate = new Date(`${criteria.endDate}T23:59:59.999Z`);
        
        query = query
            .where('createdAt', '>=', queryStartDate.toISOString())
            .where('createdAt', '<=', queryEndDate.toISOString());

        const snapshot = await query.get();

        // Step 2: Process submissions into a map of daily movements, filtered by client and session.
        const dailyTotals = new Map<string, { date: string; paletasRecibidas: number; paletasDespachadas: number }>();

        snapshot.docs.forEach(doc => {
            const submission = serializeTimestamps(doc.data());
            
            // In-memory filter for client name
            const clientField = submission.formData.nombreCliente || submission.formData.cliente;
            if (clientField !== criteria.clientName) {
                return;
            }

            // Ensure date is valid
            const formIsoDate = submission.formData.fecha;
            if (!formIsoDate || typeof formIsoDate !== 'string') {
                return;
            }
            
            const groupingDate = formIsoDate.split('T')[0];

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
            
            const summaryTempMap = (submission.formData.summary || []).reduce((acc: any, s: any) => {
                if (s.descripcion) {
                    acc[s.descripcion] = s.temperatura;
                }
                return acc;
            }, {});

            switch (submission.formType) {
                case 'fixed-weight-recepcion': {
                    const receivedFixedPallets = (submission.formData.productos || []).reduce((sum: number, p: any) => {
                        if (productMatchesSession(p.temperatura, criteria.sesion)) {
                            return sum + (Number(p.totalPaletas ?? p.paletas) || 0);
                        }
                        return sum;
                    }, 0);
                    dailyData.paletasRecibidas += receivedFixedPallets;
                    break;
                }
                case 'fixed-weight-despacho': {
                    const dispatchedFixedPallets = (submission.formData.productos || []).reduce((sum: number, p: any) => {
                         if (productMatchesSession(p.temperatura, criteria.sesion)) {
                            return sum + (Number(p.totalPaletas ?? p.paletas) || 0);
                        }
                        return sum;
                    }, 0);
                    dailyData.paletasDespachadas += dispatchedFixedPallets;
                    break;
                }
                case 'variable-weight-recepcion': {
                    const receivedVariablePallets = (submission.formData.items || []).reduce((sum: number, item: any) => {
                        const temp = summaryTempMap[item.descripcion];
                        if (productMatchesSession(temp, criteria.sesion)) {
                            return sum + 1; // Each item is a pallet in reception
                        }
                        return sum;
                    }, 0);
                    dailyData.paletasRecibidas += receivedVariablePallets;
                    break;
                }
                case 'variable-weight-despacho': {
                    const items = submission.formData.items || [];
                    const isSummaryMode = items.some((p: any) => Number(p.paleta) === 0);
                    let dispatchedVariablePallets = 0;
                    
                    if (isSummaryMode) {
                         dispatchedVariablePallets = items.reduce((sum: number, item: any) => {
                            if (Number(item.paleta) === 0) {
                                const temp = summaryTempMap[item.descripcion];
                                if (productMatchesSession(temp, criteria.sesion)) {
                                    return sum + (Number(item.totalPaletas) || 0);
                                }
                            }
                            return sum;
                        }, 0);
                    } else {
                         const uniquePallets = new Set<string>();
                         items.forEach((item: any) => {
                             const temp = summaryTempMap[item.descripcion];
                             if (productMatchesSession(temp, criteria.sesion)) {
                                 uniquePallets.add(String(item.paleta));
                             }
                         });
                         dispatchedVariablePallets = uniquePallets.size;
                    }
                    dailyData.paletasDespachadas += dispatchedVariablePallets;
                    break;
                }
            }
        });
        
        // Step 3: Get the starting stock from the last inventory report before the start date
        const stockAnterior = await getLatestStockBeforeDate(criteria.clientName, criteria.startDate, criteria.sesion);
        
        // Step 4: Iterate day-by-day to calculate the running total of stored pallets
        let stockAcumulado = stockAnterior;
        const reporteCompleto: DailyReportData[] = [];
        
        const fechaInicio = new Date(`${criteria.startDate}T12:00:00.000Z`);
        const fechaFin = new Date(`${criteria.endDate}T12:00:00.000Z`);

        let currentDate = new Date(fechaInicio);
        while (currentDate <= fechaFin) {
            const dateKey = currentDate.toISOString().split('T')[0];
            const movements = dailyTotals.get(dateKey) || { paletasRecibidas: 0, paletasDespachadas: 0 };
            
            const stockFinalDelDia = stockAcumulado + movements.paletasRecibidas - movements.paletasDespachadas;
            
            reporteCompleto.push({
                date: dateKey,
                paletasRecibidas: movements.paletasRecibidas,
                paletasDespachadas: movements.paletasDespachadas,
                paletasAlmacenadas: stockFinalDelDia,
            });
            
            stockAcumulado = stockFinalDelDia;

            // Move to the next day
            currentDate.setUTCDate(currentDate.getUTCDate() + 1);
        }

        // Step 5: Filter the full report to only show days that had movements
        const reporteFinal = reporteCompleto.filter(
            (day) => day.paletasRecibidas > 0 || day.paletasDespachadas > 0
        );
        
        if (reporteFinal.length === 0) {
            return [];
        }
        
        // Step 6: Sort the final report in descending date order for the UI
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
