

'use server';

import admin from 'firebase-admin';
import { firestore } from '@/lib/firebase-admin';
import type { ArticuloData } from './articulos';

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
  clientName: string;
  startDate: string;
  endDate: string;
  // sesion is now removed from criteria, as we process all sessions at once
  // sesion?: 'CO' | 'RE' | 'SE';
  tipoOperacion?: 'recepcion' | 'despacho';
  tiposPedido?: string[];
  pedidoSislog?: string;
}

export interface DailyReportData {
  date: string; // YYYY-MM-DD
  paletasRecibidasCO: number;
  paletasDespachadasCO: number;
  paletasRecibidasRE: number;
  paletasDespachadasRE: number;
  paletasRecibidasSE: number;
  paletasDespachadasSE: number;
}


export async function getBillingReport(criteria: BillingReportCriteria): Promise<DailyReportData[]> {
    if (!firestore) {
        throw new Error('El servidor no está configurado correctamente.');
    }

    if (!criteria.clientName) {
        throw new Error('El nombre del cliente es requerido para este reporte.');
    }

    try {
        const submissionsSnapshot = await firestore.collection('submissions').get();
        
        // Fetch all articles for the client to create a complete session lookup map
        const articlesSnapshot = await firestore.collection('articulos')
            .where('razonSocial', '==', criteria.clientName)
            .get();

        const articleSessionMap = new Map<string, 'CO' | 'RE' | 'SE'>();
        articlesSnapshot.forEach(doc => {
            const article = doc.data() as ArticuloData;
            // Use description as key as it's more consistently available
            articleSessionMap.set(article.denominacionArticulo.toLowerCase(), article.sesion);
        });

        const dailyDataMap = new Map<string, {
            paletasRecibidasCO: number;
            paletasDespachadasCO: number;
            paletasRecibidasRE: number;
            paletasDespachadasRE: number;
            paletasRecibidasSE: number;
            paletasDespachadasSE: number;
        }>();

        submissionsSnapshot.docs.forEach(doc => {
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

            // Apply new filters
            if (criteria.pedidoSislog && submission.formData.pedidoSislog !== criteria.pedidoSislog) {
                return;
            }
            if (criteria.tiposPedido && criteria.tiposPedido.length > 0 && !criteria.tiposPedido.includes(submission.formData.tipoPedido)) {
                return;
            }
            if (criteria.tipoOperacion) {
                const formType = submission.formType;
                if (criteria.tipoOperacion === 'recepcion' && !(formType.includes('recepcion') || formType.includes('reception'))) {
                    return;
                }
                if (criteria.tipoOperacion === 'despacho' && !formType.includes('despacho')) {
                    return;
                }
            }


            if (!dailyDataMap.has(groupingDate)) {
                dailyDataMap.set(groupingDate, {
                    paletasRecibidasCO: 0,
                    paletasDespachadasCO: 0,
                    paletasRecibidasRE: 0,
                    paletasDespachadasRE: 0,
                    paletasRecibidasSE: 0,
                    paletasDespachadasSE: 0,
                });
            }

            const dailyData = dailyDataMap.get(groupingDate)!;
            const formType = submission.formType;
            const items = submission.formData.items || [];
            const productos = submission.formData.productos || [];
            const destinos = submission.formData.destinos || [];

            // Helper to get the session of a product
            const getSessionForProduct = (descripcion: string): 'CO' | 'RE' | 'SE' | null => {
                if (!descripcion) return null;
                return articleSessionMap.get(descripcion.toLowerCase()) || null;
            };

            const incrementPallets = (session: 'CO' | 'RE' | 'SE' | null, type: 'recibidas' | 'despachadas', count: number) => {
                if (!session || count === 0) return;
                if (type === 'recibidas') {
                    if (session === 'CO') dailyData.paletasRecibidasCO += count;
                    else if (session === 'RE') dailyData.paletasRecibidasRE += count;
                    else if (session === 'SE') dailyData.paletasRecibidasSE += count;
                } else {
                    if (session === 'CO') dailyData.paletasDespachadasCO += count;
                    else if (session === 'RE') dailyData.paletasDespachadasRE += count;
                    else if (session === 'SE') dailyData.paletasDespachadasSE += count;
                }
            };


            if (formType === 'fixed-weight-recepcion') {
                productos.forEach((p: any) => {
                    const session = getSessionForProduct(p.descripcion);
                    incrementPallets(session, 'recibidas', Number(p.totalPaletas ?? p.paletas) || 0);
                });

            } else if (formType === 'fixed-weight-despacho') {
                productos.forEach((p: any) => {
                    const session = getSessionForProduct(p.descripcion);
                    incrementPallets(session, 'despachadas', (Number(p.paletasCompletas) || 0));
                });
            } else if (formType === 'variable-weight-recepcion' || formType === 'variable-weight-reception') {
                const isIngresoSaldosSummary = submission.formData.tipoPedido === 'INGRESO DE SALDOS' && items.some((item: any) => Number(item.paleta) === 0);

                if (isIngresoSaldosSummary) {
                    items.forEach((item: any) => {
                         if (Number(item.paleta) === 0) {
                            const session = getSessionForProduct(item.descripcion);
                            incrementPallets(session, 'recibidas', Number(item.totalPaletas) || 0);
                        }
                    });
                } else {
                    const palletSessionMap = new Map<number, 'CO' | 'RE' | 'SE' | null>();
                    items.forEach((item: any) => {
                        const paletaValue = Number(item.paleta);
                        if (!isNaN(paletaValue) && paletaValue > 0) {
                            if (!palletSessionMap.has(paletaValue)) {
                                palletSessionMap.set(paletaValue, getSessionForProduct(item.descripcion));
                            }
                        }
                    });

                    let countCO = 0, countRE = 0, countSE = 0;
                    for (const session of palletSessionMap.values()) {
                        if (session === 'CO') countCO++;
                        else if (session === 'RE') countRE++;
                        else if (session === 'SE') countSE++;
                    }
                    dailyData.paletasRecibidasCO += countCO;
                    dailyData.paletasRecibidasRE += countRE;
                    dailyData.paletasRecibidasSE += countSE;
                }
                
                if (submission.formData.tipoPedido === 'MAQUILA') {
                    dailyData.paletasDespachadasCO += Number(submission.formData.salidaPaletasMaquilaCO || 0);
                    dailyData.paletasDespachadasRE += Number(submission.formData.salidaPaletasMaquilaRE || 0);
                    dailyData.paletasDespachadasSE += Number(submission.formData.salidaPaletasMaquilaSE || 0);
                }

            } else if (formType === 'variable-weight-despacho') {
                const isByDestination = submission.formData.despachoPorDestino === true;
                const allItems = isByDestination ? destinos.flatMap((d: any) => d.items) : items;
                const isSummaryFormat = allItems.some((item: any) => Number(item.paleta) === 0);

                if (isByDestination && isSummaryFormat) {
                    // Logic to distribute total pallets among sessions if possible, or apply it to one if not.
                    // This case is ambiguous without more rules. For now, assuming it's not mixed.
                    // The most robust way is to iterate items even in summary format.
                     allItems.forEach((item: any) => {
                        if (Number(item.paleta) === 0) {
                            const session = getSessionForProduct(item.descripcion);
                            incrementPallets(session, 'despachadas', (Number(item.paletasCompletas) || 0));
                        }
                    });
                } else if (!isByDestination && isSummaryFormat) {
                     allItems.forEach((item: any) => {
                         if (Number(item.paleta) === 0) {
                            const session = getSessionForProduct(item.descripcion);
                            incrementPallets(session, 'despachadas', (Number(item.paletasCompletas) || 0));
                         }
                    });
                } else {
                    // Detailed variable weight dispatch
                    const palletSessionMap = new Map<number, 'CO' | 'RE' | 'SE' | null>();
                    allItems.forEach((item: any) => {
                        const paletaValue = Number(item.paleta);
                         if(!item.esPicking && !isNaN(paletaValue) && paletaValue > 0 && paletaValue !== 999){
                            if (!palletSessionMap.has(paletaValue)) {
                                palletSessionMap.set(paletaValue, getSessionForProduct(item.descripcion));
                            }
                        }
                    });
                    
                    let countCO = 0, countRE = 0, countSE = 0;
                    for (const session of palletSessionMap.values()) {
                        if (session === 'CO') countCO++;
                        else if (session === 'RE') countRE++;
                        else if (session === 'SE') countSE++;
                    }
                    dailyData.paletasDespachadasCO += countCO;
                    dailyData.paletasDespachadasRE += countRE;
                    dailyData.paletasDespachadasSE += countSE;
                }
            }
        });
        
        const reporteFinal: DailyReportData[] = [];
        for (const [date, movements] of dailyDataMap.entries()) {
            if (Object.values(movements).some(v => v > 0)) {
                reporteFinal.push({ date, ...movements });
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
