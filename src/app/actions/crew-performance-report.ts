
'use server';

import admin from 'firebase-admin';
import { firestore } from '@/lib/firebase-admin';
import { parse, differenceInMinutes, addDays } from 'date-fns';
import { findBestMatchingStandard, type PerformanceStandard } from '@/app/actions/standard-actions';
import { getBillingConcepts, type BillingConcept } from '../gestion-conceptos-liquidacion/actions';
import { getNoveltiesForOperation, type NoveltyData } from './novelty-actions';


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
        return (formData.productos || []).reduce((sum: number, p: any) => sum + (Number(p.pesoBrutoKg) || 0), 0);
    }
    
    if (formType.startsWith('variable-weight-')) {
        const allItems = (formData.items || []).concat((formData.destinos || []).flatMap((d: any) => d.items));
        if (allItems.some((p: any) => Number(p.paleta) === 0)) {
             return allItems.reduce((sum: number, p: any) => sum + (Number(p.totalPesoNeto) || 0), 0);
        }
        return allItems.reduce((sum: number, p: any) => sum + (Number(p.pesoNeto) || 0), 0);
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
    filterPending?: boolean;
    cuadrillaFilter?: 'con' | 'sin' | 'todas';
}

export interface CrewPerformanceReportRow {
    id: string; 
    submissionId: string;
    formType: string;
    fecha: string;
    operario: string;
    cliente: string;
    tipoOperacion: 'Recepción' | 'Despacho' | 'N/A';
    tipoProducto: 'Fijo' | 'Variable' | 'N/A';
    kilos: number;
    horaInicio: string;
    horaFin: string;
    totalDurationMinutes: number | null;
    operationalDurationMinutes: number | null;
    novelties: NoveltyData[];
    pedidoSislog: string;
    placa: string;
    contenedor: string;
    productType: 'fijo' | 'variable' | null;
    standard?: PerformanceStandard | null;
    description: string;
    conceptoLiquidado: string;
    valorUnitario: number;
    cantidadConcepto: number;
    unidadMedidaConcepto: string;
    valorTotalConcepto: number;
    aplicaCuadrilla: string | undefined;
}


const getLocalGroupingDate = (isoString: string): string => {
    if (!isoString) return '';
    try {
        const date = new Date(isoString);
        date.setUTCHours(date.getUTCHours() - 5);
        return date.toISOString().split('T')[0];
    } catch (e) {
        console.error(`Invalid date string for grouping: ${isoString}`);
        return '';
    }
};

const calculateSettlements = (submission: any, billingConcepts: BillingConcept[]): { conceptName: string, unitValue: number, quantity: number, unitOfMeasure: string, totalValue: number }[] => {
    const settlements: { conceptName: string, unitValue: number, quantity: number, unitOfMeasure: string, totalValue: number }[] = [];
    const { formData, formType } = submission;
    const observations = formData.observaciones || [];

    // --- Concept: REESTIBADO ---
    const reestibadoObservations = observations.filter(
        (obs: any) => obs.type === 'REESTIBADO' && obs.executedByGrupoRosales === true
    );
    
    if (reestibadoObservations.length > 0) {
        const reestibadoConcept = billingConcepts.find(
            c => c.conceptName === 'REESTIBADO' && c.unitOfMeasure === 'PALETA'
        );
        if (reestibadoConcept) {
            const totalPallets = reestibadoObservations.reduce(
                (sum: number, obs: any) => sum + (Number(obs.quantity) || 0), 0
            );
            if (totalPallets > 0) {
                settlements.push({
                    conceptName: 'REESTIBADO',
                    unitValue: reestibadoConcept.value,
                    quantity: totalPallets,
                    unitOfMeasure: 'PALETA',
                    totalValue: totalPallets * reestibadoConcept.value,
                });
            }
        }
    }
    
    // --- Concept: TRANSBORDO CANASTILLA ---
    const transbordoObservations = observations.filter(
        (obs: any) => obs.type === 'TRANSBORDO CANASTILLA' && obs.executedByGrupoRosales === true
    );

    if (transbordoObservations.length > 0) {
        const transbordoConcept = billingConcepts.find(
            c => c.conceptName === 'TRANSBORDO CANASTILLA' && (c.unitOfMeasure === 'CANASTILLA' || c.unitOfMeasure === 'UNIDAD')
        );
        if (transbordoConcept) {
            const totalUnits = transbordoObservations.reduce(
                (sum: number, obs: any) => sum + (Number(obs.quantity) || 0), 0
            );
            if (totalUnits > 0) {
                settlements.push({
                    conceptName: 'TRANSBORDO CANASTILLA',
                    unitValue: transbordoConcept.value,
                    quantity: totalUnits,
                    unitOfMeasure: transbordoConcept.unitOfMeasure,
                    totalValue: totalUnits * transbordoConcept.value,
                });
            }
        }
    }

    // --- Concept: CARGUE / DESCARGUE (By Ton for specific order types) ---
    const liquidableOrderTypes = ['GENERICO', 'TUNEL DE CONGELACIÓN'];
    
    if (formData.aplicaCuadrilla === 'si' && liquidableOrderTypes.includes(formData.tipoPedido)) {
        const isReception = formType.includes('recepcion') || formType.includes('reception');
        const conceptName = isReception ? 'DESCARGUE' : 'CARGUE';
        const kilos = calculateTotalKilos(formType, formData);
        
        const operationConcept = billingConcepts.find(c => c.conceptName === conceptName && c.unitOfMeasure === 'TONELADA');

        if (operationConcept) {
            if (formType.startsWith('fixed-weight-') && kilos === 0) {
                settlements.push({
                    conceptName: conceptName,
                    unitValue: 0,
                    quantity: -1, // Flag for "Pending"
                    unitOfMeasure: 'TONELADA',
                    totalValue: 0
                });
            } else if (kilos > 0) {
                const toneladas = kilos / 1000;
                 settlements.push({
                    conceptName: conceptName,
                    unitValue: operationConcept.value,
                    quantity: toneladas,
                    unitOfMeasure: 'TONELADA',
                    totalValue: toneladas * operationConcept.value
                });
            }
        }
    }


    // --- Concept: EMPAQUE DE CAJAS / EMPAQUE DE SACOS (Maquila) ---
    if (formData.aplicaCuadrilla === 'si' && formData.tipoPedido === 'MAQUILA' && formData.tipoEmpaqueMaquila) {
        const conceptName = formData.tipoEmpaqueMaquila; // "EMPAQUE DE CAJAS" or "EMPAQUE DE SACOS"
        const unitOfMeasure = conceptName === 'EMPAQUE DE CAJAS' ? 'CAJA' : 'SACO';
        
        const maquilaConcept = billingConcepts.find(c => c.conceptName === conceptName && c.unitOfMeasure === unitOfMeasure);

        if (maquilaConcept) {
            let quantity = 0;
            if (formType.startsWith('fixed-weight-')) {
                quantity = (formData.productos || []).reduce((sum: number, p: any) => sum + (Number(p.cajas) || 0), 0);
            } else if (formType.startsWith('variable-weight-')) {
                quantity = (formData.items || []).reduce((sum: number, p: any) => sum + (Number(p.cantidadPorPaleta) || 0), 0);
            }
            
            if (quantity > 0) {
                settlements.push({
                    conceptName: maquilaConcept.conceptName,
                    unitValue: maquilaConcept.value,
                    quantity: quantity,
                    unitOfMeasure: maquilaConcept.unitOfMeasure,
                    totalValue: quantity * maquilaConcept.value
                });
            }
        }
    }

    // --- Concept: SALIDA PALETAS TUNEL ---
    if (formData.tipoPedido === 'TUNEL A CÁMARA CONGELADOS') {
        const salidaTunelObservation = observations.find(
            (obs: any) => obs.type === 'SALIDA PALETAS TUNEL' && obs.executedByGrupoRosales === true
        );
        if (salidaTunelObservation && salidaTunelObservation.quantity > 0) {
            const salidaTunelConcept = billingConcepts.find(
                c => c.conceptName === 'SALIDA PALETAS TUNEL' && c.unitOfMeasure === 'PALETA'
            );
            if (salidaTunelConcept) {
                const totalPallets = Number(salidaTunelObservation.quantity) || 0;
                settlements.push({
                    conceptName: 'SALIDA PALETAS TUNEL',
                    unitValue: salidaTunelConcept.value,
                    quantity: totalPallets,
                    unitOfMeasure: 'PALETA',
                    totalValue: totalPallets * salidaTunelConcept.value,
                });
            }
        }
    }
    
    return settlements;
};


export async function getCrewPerformanceReport(criteria: CrewPerformanceReportCriteria): Promise<CrewPerformanceReportRow[]> {
    if (!firestore) {
        throw new Error('El servidor no está configurado correctamente.');
    }

    if (!criteria.startDate || !criteria.endDate) {
        throw new Error('Se requiere un rango de fechas para generar este informe.');
    }
    
    // We fetch all submissions in the date range because we might need to show all, only with crew, or only without.
    // Filtering on Firestore would be complex and require multiple queries. This is simpler.
    let query = firestore.collection('submissions');
    
    const serverStartDate = new Date(criteria.startDate);
    const serverEndDate = new Date(criteria.endDate);
    serverEndDate.setDate(serverEndDate.getDate() + 1); // To include the whole end day
    
    query = query.where('createdAt', '>=', serverStartDate.toISOString().split('T')[0])
                 .where('createdAt', '<', serverEndDate.toISOString().split('T')[0]);


    try {
        const [submissionsSnapshot, billingConcepts] = await Promise.all([
            query.get(),
            getBillingConcepts()
        ]);
        
        let allResultsInDateRange = submissionsSnapshot.docs.map(doc => ({ id: doc.id, ...serializeTimestamps(doc.data()) }));
        
        // Filter by the precise local date part first.
        allResultsInDateRange = allResultsInDateRange.filter(submission => {
            const formIsoDate = submission.formData?.fecha;
            if (!formIsoDate || typeof formIsoDate !== 'string') return false;
            const formDatePart = getLocalGroupingDate(formIsoDate);
            return formDatePart >= criteria.startDate! && formDatePart <= criteria.endDate!;
        });

        if (criteria.operario) {
            allResultsInDateRange = allResultsInDateRange.filter(sub => sub.userDisplayName === criteria.operario);
        }

        // Filter by "cuadrillaFilter"
        if (criteria.cuadrillaFilter === 'con') {
            allResultsInDateRange = allResultsInDateRange.filter(sub => sub.formData.aplicaCuadrilla === 'si' || sub.formData.tipoPedido === 'TUNEL A CÁMARA CONGELADOS' || sub.formData.tipoPedido === 'TUNEL DE CONGELACIÓN');
        } else if (criteria.cuadrillaFilter === 'sin') {
            allResultsInDateRange = allResultsInDateRange.filter(sub => sub.formData.aplicaCuadrilla !== 'si' && sub.formData.tipoPedido !== 'TUNEL A CÁMARA CONGELADOS' && sub.formData.tipoPedido !== 'TUNEL DE CONGELACIÓN');
        }

        const finalReportRows: CrewPerformanceReportRow[] = [];

        for (const submission of allResultsInDateRange) {
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
            const toneladas = Number((kilos / 1000).toFixed(2));
            const clientName = formData.nombreCliente || formData.cliente;

            const isCrewOperation = formData.aplicaCuadrilla === 'si' || formData.tipoPedido === 'TUNEL A CÁMARA CONGELADOS' || formData.tipoPedido === 'TUNEL DE CONGELACIÓN';
            
            const standard = isCrewOperation ? await findBestMatchingStandard({
              clientName: clientName,
              operationType: operationTypeForAction,
              productType: productTypeForAction,
              tons: toneladas,
            }) : null;
            
            const settlements = isCrewOperation ? calculateSettlements(submission, billingConcepts) : [];
            const novelties = await getNoveltiesForOperation(id);
            const totalDuration = calculateDuration(formData.horaInicio, formData.horaFin);
            
            const downtimeMinutes = novelties
                .filter(n => n.impactsCrewProductivity === true)
                .reduce((sum, n) => sum + n.downtimeMinutes, 0);
            
            const operationalDuration = totalDuration !== null ? totalDuration - downtimeMinutes : null;

            if (settlements.length > 0) {
                for (const settlement of settlements) {
                    finalReportRows.push({
                        id: `${id}-${settlement.conceptName}`,
                        submissionId: id,
                        formType,
                        fecha: formData.fecha,
                        operario: userDisplayName || 'N/A',
                        cliente: clientName || 'N/A',
                        tipoOperacion,
                        tipoProducto,
                        kilos: kilos,
                        horaInicio: formData.horaInicio || 'N/A',
                        horaFin: formData.horaFin || 'N/A',
                        totalDurationMinutes: totalDuration,
                        operationalDurationMinutes: operationalDuration,
                        novelties: novelties,
                        pedidoSislog: formData.pedidoSislog || 'N/A',
                        placa: formData.placa || 'N/A',
                        contenedor: formData.contenedor || 'N/A',
                        productType: productTypeForAction,
                        standard,
                        description: standard?.description || "Sin descripción",
                        conceptoLiquidado: settlement.conceptName,
                        valorUnitario: settlement.unitValue,
                        cantidadConcepto: settlement.quantity,
                        unidadMedidaConcepto: settlement.unitOfMeasure,
                        valorTotalConcepto: settlement.totalValue,
                        aplicaCuadrilla: formData.aplicaCuadrilla,
                    });
                }
            } else {
                 // Add operations without a settlement concept if filter is 'all' or 'without crew'
                 finalReportRows.push({
                    id: id,
                    submissionId: id,
                    formType,
                    fecha: formData.fecha,
                    operario: userDisplayName || 'N/A',
                    cliente: clientName || 'N/A',
                    tipoOperacion,
                    tipoProducto,
                    kilos: kilos,
                    horaInicio: formData.horaInicio || 'N/A',
                    horaFin: formData.horaFin || 'N/A',
                    totalDurationMinutes: totalDuration,
                    operationalDurationMinutes: operationalDuration,
                    novelties: novelties,
                    pedidoSislog: formData.pedidoSislog || 'N/A',
                    placa: formData.placa || 'N/A',
                    contenedor: formData.contenedor || 'N/A',
                    productType: productTypeForAction,
                    standard: null,
                    description: "No aplica",
                    conceptoLiquidado: 'No Aplica',
                    valorUnitario: 0,
                    cantidadConcepto: 0,
                    unidadMedidaConcepto: 'N/A',
                    valorTotalConcepto: 0,
                    aplicaCuadrilla: formData.aplicaCuadrilla,
                });
            }
        }
        
        let clientFilteredResults = finalReportRows;
        if (criteria.clientNames && criteria.clientNames.length > 0) {
            clientFilteredResults = clientFilteredResults.filter(row => criteria.clientNames!.includes(row.cliente));
        }
        if (criteria.productType) {
            clientFilteredResults = clientFilteredResults.filter(row => row.productType === criteria.productType);
        }
        if (criteria.operationType) {
             clientFilteredResults = clientFilteredResults.filter(row => {
                const rowOpType = (row.tipoOperacion === 'Recepción') ? 'recepcion' : (row.tipoOperacion === 'Despacho' ? 'despacho' : null);
                return rowOpType === criteria.operationType;
            });
        }
        if (criteria.filterPending) {
            clientFilteredResults = clientFilteredResults.filter(row => row.productType === 'fijo' && row.cantidadConcepto === -1);
        }
        
        clientFilteredResults.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

        return clientFilteredResults;
    } catch (error: any) {
        console.error('Error fetching crew performance report:', error);
        throw error;
    }
}
