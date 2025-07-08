'use server';

import admin from 'firebase-admin';
import { firestore } from '@/lib/firebase-admin';

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
        // Add 1 day to endDate to make the range inclusive of the end date
        const inclusiveEndDate = new Date(criteria.endDate);
        inclusiveEndDate.setDate(inclusiveEndDate.getDate() + 1);
        
        query = query.where('createdAt', '>=', criteria.startDate).where('createdAt', '<', inclusiveEndDate.toISOString().split('T')[0]);
    } else {
        throw new Error('Se requiere un rango de fechas para generar este informe.');
    }

    const snapshot = await query.get();

    let results = snapshot.docs.map(doc => {
        const submission = serializeTimestamps(doc.data());
        const { formType, formData } = submission;

        const totalPaletas = calculateTotalPallets(formType, formData);
        
        let tipoPedido = 'N/A';
        if (formType.includes('recepcion') || formType.includes('reception')) {
            tipoPedido = 'Recepción';
        } else if (formType.includes('despacho')) {
            tipoPedido = 'Despacho';
        }
        
        return {
            id: doc.id,
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
