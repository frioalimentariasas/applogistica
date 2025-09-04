

'use server';

import admin from 'firebase-admin';
import { firestore } from '@/lib/firebase-admin';
import { parse, differenceInMinutes, addDays } from 'date-fns';
import type { ArticuloData } from './articulos';

// Helper function to determine the logistic operation type
const getOperationLogisticsType = (isoDateString: string, horaInicio: string, horaFin: string): string => {
    if (!isoDateString || !horaInicio || !horaFin) return 'N/A';

    try {
        const date = new Date(isoDateString);
        // Correct for Colombia Timezone (UTC-5)
        date.setUTCHours(date.getUTCHours() - 5);

        const dayOfWeek = date.getUTCDay(); // 0 = Sunday, 6 = Saturday

        if (dayOfWeek === 0) { // Sunday
            return 'Extra';
        }
        
        const [startHours, startMinutes] = horaInicio.split(':').map(Number);
        const startTime = new Date(date);
        startTime.setUTCHours(startHours, startMinutes, 0, 0);
        
        const [endHours, endMinutes] = horaFin.split(':').map(Number);
        const endTime = new Date(date);
        endTime.setUTCHours(endHours, endMinutes, 0, 0);

        // Handle overnight operations for end time
        if (endTime <= startTime) {
            endTime.setUTCDate(endTime.getUTCDate() + 1);
        }

        let diurnoStart: Date;
        let diurnoEnd: Date;
        let shiftType: { diurno: string; other: string };

        if (dayOfWeek >= 1 && dayOfWeek <= 5) { // Monday to Friday
            diurnoStart = new Date(date);
            diurnoStart.setUTCHours(7, 0, 0, 0); // 7:00 AM

            diurnoEnd = new Date(date);
            diurnoEnd.setUTCHours(17, 0, 0, 0); // 5:00 PM

            shiftType = { diurno: 'Diurno', other: 'Nocturno' };
        } else { // Saturday (dayOfWeek === 6)
            diurnoStart = new Date(date);
            diurnoStart.setUTCHours(7, 0, 0, 0); // 7:00 AM
            
            diurnoEnd = new Date(date);
            diurnoEnd.setUTCHours(12, 0, 0, 0); // 12:00 PM
            
            shiftType = { diurno: 'Diurno', other: 'Extra' };
        }

        // Check if the entire operation falls within the diurno window
        if (startTime >= diurnoStart && endTime <= diurnoEnd) {
            return shiftType.diurno;
        } else {
            return shiftType.other;
        }

    } catch (e) {
        console.error(`Error calculating logistics type:`, e);
        return 'Error';
    }
};

const calculateDuration = (horaInicio: string, horaFin: string): number | null => {
    if (!horaInicio || !horaFin) return null;
    try {
        const startTime = parse(horaInicio, 'HH:mm', new Date());
        const endTime = parse(horaFin, 'HH:mm', new Date());

        if (endTime < startTime) {
            endTime.setDate(endTime.getDate() + 1); // Handle overnight operations
        }
        
        return differenceInMinutes(endTime, startTime);
    } catch (e) {
        console.error("Error calculating duration", e);
        return null;
    }
};


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

// Helper to serialize Firestore Timestamps
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


export interface DetailedReportCriteria {
    clientName?: string;
    startDate?: string;
    endDate?: string;
    operationType?: 'recepcion' | 'despacho';
    containerNumber?: string;
    sesion?: string;
    tipoPedido?: string[];
}

export interface DetailedReportRow {
    id: string;
    fecha: string;
    horaInicio: string;
    horaFin: string;
    placa: string;
    contenedor: string;
    cliente: string;
    observaciones: string;
    totalCantidad: number;
    totalPaletas: number;
    totalPesoKg: number;
    tipoOperacion: string;
    pedidoSislog: string;
    operacionLogistica: string;
    sesion: string;
    tipoPedido: string;
    tipoEmpaqueMaquila: string;
    numeroOperariosCuadrilla: string;
    operacionPorCuadrilla: string;
    duracionMinutos: number | null;
}

const calculateTotalPallets = (formType: string, formData: any): number => {
    if (formType.startsWith('fixed-weight-')) {
        return (formData.productos || []).reduce((sum: number, p: any) => sum + (Number(p.totalPaletas ?? p.paletas) || 0), 0);
    } 
    
    if (formType.startsWith('variable-weight-')) {
        const allItems = (formData.items || [])
            .concat((formData.destinos || []).flatMap((d: any) => d?.items || []))
            .concat((formData.placas || []).flatMap((p: any) => p?.items || []));
        
        const isSummaryFormat = allItems.some((p: any) => Number(p.paleta) === 0);
        
        if (isSummaryFormat) {
            return allItems.reduce((sum: number, p: any) => sum + (Number(p.totalPaletas) || 0), 0);
        }
        
        // For detailed reception and dispatch (by pallet), count unique pallets.
        const uniquePallets = new Set<number>();
        allItems.forEach((item: any) => {
            const paletaNum = Number(item.paleta);
            if (!isNaN(paletaNum) && paletaNum > 0) {
                uniquePallets.add(paletaNum);
            }
        });
        return uniquePallets.size;
    }

    return 0;
};

const calculateTotalCantidad = (formType: string, formData: any): number => {
    if (formType.startsWith('fixed-weight-')) {
        return (formData.productos || []).reduce((sum: number, p: any) => sum + (Number(p.cajas) || 0), 0);
    }
    
    if (formType.startsWith('variable-weight-')) {
        const allItems = (formData.items || [])
            .concat((formData.destinos || []).flatMap((d: any) => d?.items || []))
            .concat((formData.placas || []).flatMap((p: any) => p?.items || []));

        const isSummaryFormat = allItems.some((p: any) => Number(p.paleta) === 0);

        if (isSummaryFormat) {
            return allItems.reduce((sum: number, p: any) => sum + (Number(p.totalCantidad) || 0), 0);
        }
        
        return allItems.reduce((sum: number, p: any) => sum + (Number(p.cantidadPorPaleta) || 0), 0);
    }

    return 0;
};

const calculateTotalPesoKg = (formType: string, formData: any): number => {
    if (formType.startsWith('fixed-weight-')) {
        return Number(formData.totalPesoBrutoKg) || 0;
    }

    if (formType.startsWith('variable-weight-')) {
        const allItems = (formData.items || [])
            .concat((formData.destinos || []).flatMap((d: any) => d?.items || []))
            .concat((formData.placas || []).flatMap((p: any) => p?.items || []));

        const isSummaryFormat = allItems.some((p: any) => Number(p.paleta) === 0);

        if (formType.includes('recepcion') || formType.includes('reception')) {
            // Recepción Peso Variable
            if (isSummaryFormat) {
                return allItems.reduce((sum: number, p: any) => sum + (Number(p.totalPesoNeto) || 0), 0);
            } else {
                // For itemized (non-summary) variable weight reception, calculate net from gross
                const totalPesoBruto = allItems.reduce((sum: number, p: any) => sum + (Number(p.pesoBruto) || 0), 0);
                const totalTaraEstiba = allItems.reduce((sum: number, p: any) => sum + (Number(p.taraEstiba) || 0), 0);
                return totalPesoBruto - totalTaraEstiba;
            }
        } else if (formType.includes('despacho')) {
            // Despacho Peso Variable
            if (isSummaryFormat) {
                return allItems.reduce((sum: number, p: any) => sum + (Number(p.totalPesoNeto) || 0), 0);
            } else {
                return allItems.reduce((sum: number, p: any) => sum + (Number(p.pesoNeto) || 0), 0);
            }
        }
    }
    
    return 0;
}


export async function getDetailedReport(criteria: DetailedReportCriteria): Promise<DetailedReportRow[]> {
    if (!firestore) {
        throw new Error('El servidor no está configurado correctamente.');
    }
    
    let query: admin.firestore.Query = firestore.collection('submissions');

    // To avoid full collection scans, we require a date range.
    if (criteria.startDate && criteria.endDate) {
        const serverQueryStartDate = new Date(criteria.startDate);
        serverQueryStartDate.setDate(serverQueryStartDate.getDate());
        
        const serverQueryEndDate = new Date(criteria.endDate);
        serverQueryEndDate.setDate(serverQueryEndDate.getDate() + 1);
        
        query = query.where('createdAt', '>=', serverQueryStartDate.toISOString().split('T')[0])
                     .where('createdAt', '<', serverQueryEndDate.toISOString().split('T')[0]);
    } else {
        throw new Error('Se requiere un rango de fechas para generar este informe.');
    }
    
    try {
        const [submissionsSnapshot, articlesSnapshot] = await Promise.all([
            query.get(),
            firestore.collection('articulos').get()
        ]);
        
        // Create a lookup map for article sessions for efficiency
        const articleSessionMap = new Map<string, string>(); // Key: 'clientName|codigoProducto', Value: 'sesion'
        articlesSnapshot.forEach(doc => {
            const article = doc.data() as ArticuloData;
            const key = `${article.razonSocial}|${article.codigoProducto}`;
            articleSessionMap.set(key, article.sesion);
        });

        const allSubmissions = submissionsSnapshot.docs.map(doc => {
            return {
                id: doc.id,
                ...serializeTimestamps(doc.data())
            };
        });

        const dateFilteredSubmissions = allSubmissions.filter(submission => {
            const formIsoDate = submission.formData?.fecha;
            if (!formIsoDate || typeof formIsoDate !== 'string') {
                return false;
            }
            const formDatePart = getLocalGroupingDate(formIsoDate);
            return formDatePart >= criteria.startDate! && formDatePart <= criteria.endDate!;
        });

        let results = dateFilteredSubmissions.map(submission => {
            const { id, formType, formData } = submission;

            const totalPaletas = calculateTotalPallets(formType, formData);
            const totalCantidad = calculateTotalCantidad(formType, formData);
            const totalPesoKg = calculateTotalPesoKg(formType, formData);
            
            let tipoOperacion = 'N/A';
            if (formType.includes('recepcion') || formType.includes('reception')) {
                tipoOperacion = 'Recepción';
            } else if (formType.includes('despacho')) {
                tipoOperacion = 'Despacho';
            }

            const operacionLogistica = getOperationLogisticsType(formData.fecha, formData.horaInicio, formData.horaFin);
            const duracionMinutos = calculateDuration(formData.horaInicio, formData.horaFin);
            
            let operacionPorCuadrilla = 'N/A';
            if (formData.aplicaCuadrilla) {
                operacionPorCuadrilla = formData.aplicaCuadrilla.charAt(0).toUpperCase() + formData.aplicaCuadrilla.slice(1);
            }

            let tipoPedido = formData.tipoPedido || 'N/A';
            if (tipoPedido === 'DESPACHO GENERICO') {
                tipoPedido = 'GENERICO';
            }

            let numeroOperarios = 'N/A';
            if (formData.aplicaCuadrilla === 'si' && formData.tipoPedido === 'MAQUILA' && formData.numeroOperariosCuadrilla) {
                numeroOperarios = String(formData.numeroOperariosCuadrilla);
            }

            // Logic to get the session from the first product
            const allItems = (formData.productos || [])
                .concat((formData.items || []))
                .concat((formData.destinos || []).flatMap((d: any) => d?.items || []))
                .concat((formData.placas || []).flatMap((p: any) => p?.items || []));
            
            let sesion = 'N/A';
            if(allItems.length > 0) {
                const firstItem = allItems[0];
                const clientName = formData.nombreCliente || formData.cliente;
                const productCode = firstItem.codigo;
                if (clientName && productCode) {
                    const key = `${clientName}|${productCode}`;
                    sesion = articleSessionMap.get(key) || 'N/A';
                }
            }
            
            return {
                id,
                fecha: formData.fecha,
                horaInicio: formData.horaInicio || 'N/A',
                horaFin: formData.horaFin || 'N/A',
                placa: formData.placa || 'N/A',
                contenedor: formData.contenedor || 'N/A',
                cliente: formData.nombreCliente || formData.cliente || 'N/A',
                observaciones: formData.observaciones || '',
                totalCantidad,
                totalPaletas,
                totalPesoKg,
                tipoOperacion,
                pedidoSislog: formData.pedidoSislog || 'N/A',
                operacionLogistica,
                sesion: sesion, // Use the determined session
                tipoPedido: tipoPedido,
                tipoEmpaqueMaquila: formData.tipoEmpaqueMaquila || 'N/A',
                numeroOperariosCuadrilla: numeroOperarios,
                operacionPorCuadrilla: operacionPorCuadrilla,
                duracionMinutos: duracionMinutos,
            };
        });

        if (criteria.clientName) {
            results = results.filter(row => row.cliente.toLowerCase().trim() === criteria.clientName!.toLowerCase().trim());
        }
        if (criteria.operationType) {
            results = results.filter(row => 
                row.tipoOperacion.localeCompare(criteria.operationType!, 'es', { sensitivity: 'base' }) === 0
            );
        }
        if (criteria.containerNumber && criteria.containerNumber.trim()) {
            results = results.filter(row => row.contenedor.toLowerCase().includes(criteria.containerNumber!.trim().toLowerCase()));
        }
        if (criteria.sesion) {
            results = results.filter(row => row.sesion === criteria.sesion);
        }
        if (criteria.tipoPedido && criteria.tipoPedido.length > 0) {
            results = results.filter(row => criteria.tipoPedido!.includes(row.tipoPedido));
        }


        results.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

        return results;

    } catch (error) {
        console.error("Error in getDetailedReport:", error);
        if (error instanceof Error && (error.message.includes('requires an index') || error.message.includes('needs an index'))) {
             // Re-throw the original error to pass the link to the client for debugging
            throw error;
        }
        throw new Error('No se pudo generar el informe detallado.');
    }
}
