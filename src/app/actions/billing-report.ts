
'use server';

import admin from 'firebase-admin';
import { firestore } from '@/lib/firebase-admin';
import { getLatestStockBeforeDate } from './inventory-report';
import { format, addDays, parseISO } from 'date-fns';

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
    // Treat null, undefined, or empty strings as 0. This is crucial for 'CO' session.
    const tempValue = temperatura === null || temperatura === undefined || String(temperatura).trim() === '' ? 0 : temperatura;
    const temp = Number(tempValue);

    // If after conversion it's still not a number, it can't match.
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
        const queryStartDate = new Date(`${criteria.startDate}T00:00:00.000Z`);
        const queryEndDate = new Date(`${criteria.endDate}T23:59:59.999Z`);
        const snapshot = await firestore.collection('submissions')
            .where('createdAt', '>=', queryStartDate.toISOString())
            .where('createdAt', '<=', queryEndDate.toISOString())
            .get();

        // Step 2: Process submissions into a map of daily movements, filtered by client and session.
        const dailyMovements = new Map<string, { paletasRecibidas: number; paletasDespachadas: number }>();

        snapshot.docs.forEach(doc => {
            const submission = serializeTimestamps(doc.data());
            
            const clientField = submission.formData.nombreCliente || submission.formData.cliente;
            if (clientField !== criteria.clientName) {
                return;
            }

            const formIsoDate = submission.formData.fecha;
            if (!formIsoDate || typeof formIsoDate !== 'string') return;
            
            const groupingDate = formIsoDate.split('T')[0];

            if (groupingDate < criteria.startDate || groupingDate > criteria.endDate) return;

            if (!dailyMovements.has(groupingDate)) {
                dailyMovements.set(groupingDate, { paletasRecibidas: 0, paletasDespachadas: 0 });
            }

            const dailyData = dailyMovements.get(groupingDate)!;
            
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
                            return sum + 1;
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
        const stockInicial = await getLatestStockBeforeDate(criteria.clientName, criteria.startDate, criteria.sesion);
        
        // Step 4: Iterate day-by-day to calculate the running total and build the final report
        const reporteFinal: DailyReportData[] = [];
        let stockAcumulado = stockInicial;
        
        let currentDate = parseISO(criteria.startDate);
        const fechaFin = parseISO(criteria.endDate);

        while (currentDate <= fechaFin) {
            const dateKey = format(currentDate, 'yyyy-MM-dd');
            const movements = dailyMovements.get(dateKey) || { paletasRecibidas: 0, paletasDespachadas: 0 };
            
            const tieneMovimiento = movements.paletasRecibidas > 0 || movements.paletasDespachadas > 0;
            
            const stockAlmacenadoHoy = stockAcumulado + movements.paletasRecibidas - movements.paletasDespachadas;

            if (tieneMovimiento) {
                reporteFinal.push({
                    date: dateKey,
                    paletasRecibidas: movements.paletasRecibidas,
                    paletasDespachadas: movements.paletasDespachadas,
                    paletasAlmacenadas: stockAlmacenadoHoy,
                });
            }
            
            stockAcumulado = stockAlmacenadoHoy;
            
            currentDate = addDays(currentDate, 1);
        }
        
        // Step 5: Sort the final report in descending date order for the UI
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
