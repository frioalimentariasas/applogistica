
'use server';

import admin from 'firebase-admin';
import { firestore } from '@/lib/firebase-admin';

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
    totalPaletas: number;
    tipoPedido: string;
    pedidoSislog: string;
    operacionLogistica: string;
}

const calculateTotalPallets = (formType: string, formData: any): number => {
    if (formType.startsWith('fixed-weight-')) {
        return (formData.productos || []).reduce((sum: number, p: any) => sum + (Number(p.totalPaletas ?? p.paletas) || 0), 0);
    } 
    
    if (formType.startsWith('variable-weight-')) {
        const items = formData.items || [];
        
        // Despacho con filas de resumen (paleta === 0)
        if (formType.includes('despacho') && items.some((p: any) => Number(p.paleta) === 0)) {
            return items.reduce((sum: number, p: any) => sum + (Number(p.totalPaletas) || 0), 0);
        }
        
        // Para recepción y despacho detallado (por paleta), contamos las paletas únicas.
        const uniquePallets = new Set<number>();
        items.forEach((item: any) => {
            const paletaNum = Number(item.paleta);
            if (!isNaN(paletaNum) && paletaNum > 0) {
                uniquePallets.add(paletaNum);
            }
        });
        return uniquePallets.size;
    }

    return 0;
};


export async function getDetailedReport(criteria: DetailedReportCriteria): Promise<DetailedReportRow[]> {
    if (!firestore) {
        throw new Error('El servidor no está configurado correctamente.');
    }
    
    let query: admin.firestore.Query = firestore.collection('submissions');

    // To avoid full collection scans, we require a date range.
    if (criteria.startDate && criteria.endDate) {
        // Widen the server query by a day on each side to account for timezone differences.
        const serverQueryStartDate = new Date(criteria.startDate);
        serverQueryStartDate.setDate(serverQueryStartDate.getDate() - 1);
        
        const serverQueryEndDate = new Date(criteria.endDate);
        serverQueryEndDate.setDate(serverQueryEndDate.getDate() + 2);
        
        query = query.where('createdAt', '>=', serverQueryStartDate.toISOString().split('T')[0])
                     .where('createdAt', '<', serverQueryEndDate.toISOString().split('T')[0]);
    } else {
        throw new Error('Se requiere un rango de fechas para generar este informe.');
    }

    const snapshot = await query.get();
    
    // First, serialize all documents from Firestore
    const allSubmissions = snapshot.docs.map(doc => {
        return {
            id: doc.id,
            ...serializeTimestamps(doc.data())
        };
    });

    // Then, filter the serialized documents by the correct local date
    const dateFilteredSubmissions = allSubmissions.filter(submission => {
        const formIsoDate = submission.formData?.fecha;
        if (!formIsoDate || typeof formIsoDate !== 'string') {
            return false;
        }
        const formDatePart = getLocalGroupingDate(formIsoDate);
        return formDatePart >= criteria.startDate! && formDatePart <= criteria.endDate!;
    });

    // Now, map the correctly filtered documents to the report row structure
    let results = dateFilteredSubmissions.map(submission => {
        const { id, formType, formData } = submission;

        const totalPaletas = calculateTotalPallets(formType, formData);
        
        let tipoPedido = 'N/A';
        if (formType.includes('recepcion') || formType.includes('reception')) {
            tipoPedido = 'Recepción';
        } else if (formType.includes('despacho')) {
            tipoPedido = 'Despacho';
        }

        const operacionLogistica = getOperationLogisticsType(formData.fecha, formData.horaInicio, formData.horaFin);
        
        return {
            id,
            fecha: formData.fecha,
            horaInicio: formData.horaInicio || 'N/A',
            horaFin: formData.horaFin || 'N/A',
            placa: formData.placa || 'N/A',
            contenedor: formData.contenedor || 'N/A',
            cliente: formData.nombreCliente || formData.cliente || 'N/A',
            observaciones: formData.observaciones || '',
            totalPaletas,
            tipoPedido,
            pedidoSislog: formData.pedidoSislog || 'N/A',
            operacionLogistica,
        };
    });

    // Apply remaining filters in memory
    if (criteria.clientName) {
        results = results.filter(row => row.cliente.toLowerCase().trim() === criteria.clientName!.toLowerCase().trim());
    }
    if (criteria.operationType) {
        results = results.filter(row => row.tipoPedido.toLowerCase() === criteria.operationType);
    }
    if (criteria.containerNumber && criteria.containerNumber.trim()) {
        results = results.filter(row => row.contenedor.toLowerCase().includes(criteria.containerNumber!.trim().toLowerCase()));
    }

    results.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

    return results;
}
