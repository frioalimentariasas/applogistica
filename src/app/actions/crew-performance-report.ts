
'use server';

import admin from 'firebase-admin';
import { firestore } from '@/lib/firebase-admin';
import { parse, differenceInMinutes, addDays } from 'date-fns';
import { getPerformanceStandards, type PerformanceStandard } from '@/app/gestion-estandares/actions';


// This logic is moved here to prevent circular dependencies.
async function findBestMatchingStandard(criteria: { clientName?: string; operationType?: 'recepcion' | 'despacho'; productType?: 'fijo' | 'variable' | null; tons: number; }): Promise<PerformanceStandard | null> {
    const { clientName, operationType, productType, tons } = criteria;

    if (!clientName || !operationType || !productType) {
        return null;
    }

    const allStandards = await getPerformanceStandards();

    const potentialMatches = allStandards.filter(std => 
        tons >= std.minTons && tons <= std.maxTons
    );
    
    if (potentialMatches.length === 0) return null;
    
    const searchPriorities = [
        // 1. Exact match on client, operation, and product
        (std: PerformanceStandard) => std.clientName === clientName && std.operationType === operationType && std.productType === productType,
        (std: PerformanceStandard) => std.clientName === clientName && std.operationType === operationType && std.productType === 'TODOS',
        (std: PerformanceStandard) => std.clientName === clientName && std.operationType === 'TODAS' && std.productType === productType,
        (std: PerformanceStandard) => std.clientName === clientName && std.operationType === 'TODAS' && std.productType === 'TODOS',
        
        // 2. Partial match on client name (e.g. "ATLANTIC SEDE B..." in "ATLANTIC FS S.A.S. BARRANQUILLA...")
        (std: PerformanceStandard) => clientName.includes(std.clientName) && std.operationType === operationType && std.productType === productType,
        (std: PerformanceStandard) => clientName.includes(std.clientName) && std.operationType === operationType && std.productType === 'TODOS',
        (std: PerformanceStandard) => clientName.includes(std.clientName) && std.operationType === 'TODAS' && std.productType === productType,
        (std: PerformanceStandard) => clientName.includes(std.clientName) && std.operationType === 'TODAS' && std.productType === 'TODOS',

        // 3. Fallback to "TODOS" client
        (std: PerformanceStandard) => std.clientName === 'TODOS' && std.operationType === operationType && std.productType === productType,
        (std: PerformanceStandard) => std.clientName === 'TODOS' && std.operationType === operationType && std.productType === 'TODOS',
        (std: PerformanceStandard) => std.clientName === 'TODOS' && std.operationType === 'TODAS' && std.productType === productType,
        (std: PerformanceStandard) => std.clientName === 'TODOS' && std.operationType === 'TODAS' && std.productType === 'TODOS',
    ];

    for (const check of searchPriorities) {
        const found = potentialMatches.find(check);
        if (found) {
            return found;
        }
    }

    return null;
}


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

const calculateDuration = (horaInicio: string, horaFin: string): number | null => {
    if (!horaInicio || !horaFin) return null;
    try {
        const startTime = parse(horaInicio, 'HH:mm', new Date());
        const endTime = parse(horaFin, 'HH:mm', new Date());

        if (endTime < startTime) {
            endTime.setDate(endTime.getDate() + 1);
        }
        return differenceInMinutes(endTime, startTime);
    } catch (e) {
        console.error("Error calculating duration", e);
        return null;
    }
};

const calculateTotalKilos = (formType: string, formData: any): number => {
    if (formType.startsWith('fixed-weight-')) {
        return (formData.productos || []).reduce((sum: number, p: any) => sum + (Number(p.pesoNetoKg) || 0), 0);
    } 
    
    if (formType.startsWith('variable-weight-')) {
        const items = formData.items || [];
        // Handle summary format in variable weight dispatch
        if (formType.includes('despacho') && items.some((p: any) => Number(p.paleta) === 0)) {
            return items.reduce((sum: number, p: any) => sum + (Number(p.totalPesoNeto) || 0), 0);
        }
        // Handle detailed format for variable weight (reception and dispatch)
        return items.reduce((sum: number, p: any) => sum + (Number(p.pesoNeto) || 0), 0);
    }

    return 0;
};


export interface CrewPerformanceReportCriteria {
    startDate?: string;
    endDate?: string;
    operario?: string;
    operationType?: 'recepcion' | 'despacho';
    productType?: 'fijo' | 'variable';
    clientNames?: string[];
}

export interface CrewPerformanceReportRow {
    id: string;
    formType: string;
    fecha: string;
    operario: string;
    cliente: string;
    tipoOperacion: 'Recepción' | 'Despacho' | 'N/A';
    tipoProducto: 'Fijo' | 'Variable' | 'N/A';
    kilos: number;
    horaInicio: string;
    horaFin: string;
    duracionMinutos: number | null;
    pedidoSislog: string;
    productType: 'fijo' | 'variable' | null;
    standard?: PerformanceStandard | null;
}

export async function getCrewPerformanceReport(criteria: CrewPerformanceReportCriteria): Promise<CrewPerformanceReportRow[]> {
    if (!firestore) {
        throw new Error('El servidor no está configurado correctamente.');
    }

    if (!criteria.startDate || !criteria.endDate) {
        throw new Error('Se requiere un rango de fechas para generar este informe.');
    }
    
    let query: admin.firestore.Query = firestore.collection('submissions');
    
    query = query.where('formData.aplicaCuadrilla', '==', 'si');

    if (criteria.operario) {
        query = query.where('userDisplayName', '==', criteria.operario);
    }
    
    const endDatePlusOne = addDays(new Date(criteria.endDate), 1);
    const endDateString = endDatePlusOne.toISOString().split('T')[0];

    query = query.where('createdAt', '>=', criteria.startDate)
                 .where('createdAt', '<', endDateString);

    try {
        const snapshot = await query.get();
        
        let results = await Promise.all(snapshot.docs.map(async (submissionDoc) => {
            const submission = {
                id: submissionDoc.id,
                ...serializeTimestamps(submissionDoc.data())
            };
            const { id, formType, formData, userDisplayName } = submission;

            let tipoOperacion: 'Recepción' | 'Despacho' | 'N/A' = 'N/A';
            let operationTypeForAction: 'recepcion' | 'despacho' | undefined = undefined;
            if (formType.includes('recepcion') || formType.includes('reception')) {
                tipoOperacion = 'Recepción';
                operationTypeForAction = 'recepcion';
            } else if (formType.includes('despacho')) {
                tipoOperacion = 'Despacho';
                operationTypeForAction = 'despacho';
            }

            let tipoProducto: 'Fijo' | 'Variable' | 'N/A' = 'N/A';
            let productTypeForAction: 'fijo' | 'variable' | null = null;
            if (formType.includes('fixed-weight')) {
                tipoProducto = 'Fijo';
                productTypeForAction = 'fijo';
            } else if (formType.includes('variable-weight')) {
                tipoProducto = 'Variable';
                productTypeForAction = 'variable';
            }
            
            const kilos = calculateTotalKilos(formType, formData);
            const toneladas = kilos / 1000;
            const clientName = formData.nombreCliente || formData.cliente;

            const standard = await findBestMatchingStandard({
              clientName: clientName,
              operationType: operationTypeForAction,
              productType: productTypeForAction,
              tons: toneladas
            });
            
            return {
                id,
                formType,
                fecha: formData.fecha,
                operario: userDisplayName || 'N/A',
                cliente: clientName || 'N/A',
                tipoOperacion,
                tipoProducto,
                kilos: kilos,
                horaInicio: formData.horaInicio || 'N/A',
                horaFin: formData.horaFin || 'N/A',
                duracionMinutos: calculateDuration(formData.horaInicio, formData.horaFin),
                pedidoSislog: formData.pedidoSislog || 'N/A',
                productType: productTypeForAction,
                standard
            };
        }));

        // Apply remaining filters in memory
        if (criteria.clientNames && criteria.clientNames.length > 0) {
            results = results.filter(row => criteria.clientNames!.includes(row.cliente));
        }
        if (criteria.productType) {
            results = results.filter(row => row.productType === criteria.productType);
        }
        if (criteria.operationType) {
             results = results.filter(row => {
                const rowOpType = (row.tipoOperacion === 'Recepción') ? 'recepcion' : (row.tipoOperacion === 'Despacho' ? 'despacho' : null);
                return rowOpType === criteria.operationType;
            });
        }
        
        results.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

        return results;
    } catch (error: any) {
        if (error instanceof Error && error.message.includes('requires an index')) {
            console.error("Firestore composite index required. See the full error log for the creation link.", error);
            throw new Error(error.message);
        }
        console.error('Error fetching crew performance report:', error);
        throw error;
    }
}

    
