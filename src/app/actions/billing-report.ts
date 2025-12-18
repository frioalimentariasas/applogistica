

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
  clientName?: string; // Allow fetching for all clients
  startDate: string;
  endDate: string;
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

    try {
        // Fetch all submissions for the client in the date range
        let submissionsQuery: admin.firestore.Query = firestore.collection('submissions')
            .where('formData.fecha', '>=', new Date(criteria.startDate + 'T00:00:00-05:00'))
            .where('formData.fecha', '<=', new Date(criteria.endDate + 'T23:59:59.999-05:00'));
        
        if (criteria.clientName) {
            // This is less efficient, but necessary because we might need all articles for a client later
            // and can't do two separate queries easily with the logic.
        }

        const submissionsSnapshot = await submissionsQuery.get();

        const clientDocs = criteria.clientName 
            ? submissionsSnapshot.docs.filter(doc => {
                const clientField = doc.data().formData.nombreCliente || doc.data().formData.cliente;
                return clientField && clientField.trim().toLowerCase() === criteria.clientName!.trim().toLowerCase();
            })
            : submissionsSnapshot.docs;
        
        // Fetch all articles to create a complete session lookup map
        const articlesSnapshot = await firestore.collection('articulos').get();
        const articleSessionMap = new Map<string, 'CO' | 'RE' | 'SE'>();
        articlesSnapshot.forEach(doc => {
            const article = doc.data() as ArticuloData;
            const key = `${article.razonSocial}|${article.codigoProducto}|${article.denominacionArticulo}`.toLowerCase();
            articleSessionMap.set(key, article.sesion);
        });

        const dailyDataMap = new Map<string, {
            paletasRecibidasCO: number;
            paletasDespachadasCO: number;
            paletasRecibidasRE: number;
            paletasDespachadasRE: number;
            paletasRecibidasSE: number;
            paletasDespachadasSE: number;
        }>();

        clientDocs.forEach(doc => {
            const submission = serializeTimestamps(doc.data());
             const clientName = submission.formData.nombreCliente || submission.formData.cliente;

            if (!clientName) return; // Skip if no client name
            
            const formIsoDate = submission.formData.fecha;
            if (!formIsoDate || typeof formIsoDate !== 'string') return;
            
            const groupingDate = getLocalGroupingDate(formIsoDate);
            if (!groupingDate) return;

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
                    paletasRecibidasCO: 0, paletasDespachadasCO: 0,
                    paletasRecibidasRE: 0, paletasDespachadasRE: 0,
                    paletasRecibidasSE: 0, paletasDespachadasSE: 0,
                });
            }

            const dailyData = dailyDataMap.get(groupingDate)!;
            const formType = submission.formType;
            const items = submission.formData.items || [];
            const productos = submission.formData.productos || [];
            const destinos = submission.formData.destinos || [];

            const getSessionForProduct = (codigo: string, descripcion: string): 'CO' | 'RE' | 'SE' | null => {
                if (!codigo || !descripcion) return null;
                const key = `${clientName}|${codigo}|${descripcion}`.toLowerCase();
                return articleSessionMap.get(key) || null;
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

            if (formType === 'fixed-weight-recepcion' || formType === 'fixed-weight-reception') {
                if (submission.formData.tipoPedido !== 'TUNEL DE CONGELACIÓN') {
                productos.forEach((p: any) => {
                    const session = getSessionForProduct(p.codigo, p.descripcion);
                    const paletas = Number(p.totalPaletas ?? p.paletas ?? 0);
                    incrementPallets(session, 'recibidas', paletas);
                });
                }
            } else if (formType === 'fixed-weight-despacho') {
                productos.forEach((p: any) => {
                    const session = getSessionForProduct(p.codigo, p.descripcion);
                    const paletas = (Number(p.paletasCompletas) || 0);
                    incrementPallets(session, 'despachadas', paletas);
                });

            } else if ((formType === 'variable-weight-recepcion' || formType === 'variable-weight-reception') && clientName !== 'GRUPO FRUTELLI SAS') {
                const isSummaryFormat = items.some((item: any) => Number(item.paleta) === 0);

                if (isSummaryFormat) {
                     items.forEach((item: any) => {
                         if (Number(item.paleta) === 0) {
                            const session = getSessionForProduct(item.codigo, item.descripcion);
                            incrementPallets(session, 'recibidas', Number(item.totalPaletas) || 0);
                        }
                    });
                } else {
                    const palletSessionMap = new Map<string, 'CO' | 'RE' | 'SE' | 'MIXTA'>();
                    
                    items.forEach((item: any) => {
                        const paletaValue = String(item.paleta);
                        if (item.paleta !== undefined && Number(paletaValue) > 0) {
                            const itemSession = getSessionForProduct(item.codigo, item.descripcion);
                            if (palletSessionMap.has(paletaValue)) {
                                const existingSession = palletSessionMap.get(paletaValue);
                                if (existingSession !== itemSession && itemSession !== null) {
                                    palletSessionMap.set(paletaValue, 'MIXTA');
                                }
                            } else if (itemSession) {
                                palletSessionMap.set(paletaValue, itemSession);
                            }
                        }
                    });

                    let countCO = 0, countRE = 0, countSE = 0;
                    for (const session of palletSessionMap.values()) {
                        if (session === 'CO') countCO++;
                        else if (session === 'RE') countRE++;
                        else if (session === 'SE') countSE++;
                        // Paletas MIXTAS no se cuentan para ninguna sesion individual
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
                const isSummaryFormat = allItems.some((item: any) => item && Number(item.paleta) === 0);

                if (isSummaryFormat) {
                     allItems.forEach((item: any) => {
                         if (item && Number(item.paleta) === 0) {
                            const session = getSessionForProduct(item.codigo, item.descripcion);
                            const paletas = (Number(item.paletasCompletas) || 0);
                            incrementPallets(session, 'despachadas', paletas);
                         }
                    });
                } else {
                    const palletSessionMap = new Map<string, 'CO' | 'RE' | 'SE' | 'MIXTA'>();
                    allItems.forEach((item: any) => {
                        const paletaValue = String(item.paleta);
                        // Despacho cuenta todas las paletas
                        if (item.paleta !== undefined && Number(paletaValue) > 0 && Number(paletaValue) !== 999 && !item.esPicking){
                            const itemSession = getSessionForProduct(item.codigo, item.descripcion);
                            if (palletSessionMap.has(paletaValue)) {
                                if (palletSessionMap.get(paletaValue) !== itemSession && itemSession) {
                                    palletSessionMap.set(paletaValue, 'MIXTA');
                                }
                            } else if (itemSession) {
                                palletSessionMap.set(paletaValue, itemSession);
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
