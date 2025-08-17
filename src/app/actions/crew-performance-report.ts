

'use server';

import admin from 'firebase-admin';
import { firestore } from '@/lib/firebase-admin';
import { parse, differenceInMinutes, parseISO, format, startOfDay, endOfDay, addDays, subDays } from 'date-fns';
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
    // For fixed weight forms, the legalized weight takes precedence.
    if (formType.startsWith('fixed-weight-')) {
        const legalizedWeight = Number(formData.totalPesoBrutoKg);
        if (legalizedWeight > 0) {
            return legalizedWeight;
        }
        // Fallback for non-legalized or older forms
        return (formData.productos || []).reduce((sum: number, p: any) => sum + (Number(p.pesoBrutoKg) || 0), 0);
    }
    
    if (formType.includes('reception') || formType.includes('recepcion')) {
        const allItems = (formData.items || [])
            .concat((formData.placas || []).flatMap((p: any) => p.items));
        return allItems.reduce((sum: number, p: any) => sum + (Number(p.pesoBruto) || 0), 0);
    }
    
    if (formType.startsWith('variable-weight-')) {
        const allItems = (formData.items || [])
            .concat((formData.destinos || []).flatMap((d: any) => d.items));

        if (allItems.some((p: any) => Number(p.paleta) === 0)) {
             return allItems.reduce((sum: number, p: any) => sum + (Number(p.totalPesoNeto) || 0), 0);
        }
        return allItems.reduce((sum: number, p: any) => sum + (Number(p.pesoNeto) || 0), 0);
    }

    return 0;
};


const calculateTotalPallets = (formType: string, formData: any): number => {
    if (formType.startsWith('fixed-weight-')) {
        return (formData.productos || []).reduce((sum: number, p: any) => sum + (Number(p.totalPaletas ?? p.paletas) || 0), 0);
    } 
    
    if (formType.startsWith('variable-weight-')) {
        const allItems = (formData.items || [])
            .concat((formData.destinos || []).flatMap((d: any) => d.items))
            .concat((formData.placas || []).flatMap((p: any) => p.items));
        
        const isSummaryFormat = allItems.some((p: any) => Number(p.paleta) === 0);
        
        if (isSummaryFormat) {
            if ((formType.includes('despacho') && formData.despachoPorDestino) || (formData.tipoPedido === 'TUNEL DE CONGELACIÓN')) {
                return Number(formData.totalPaletasDespacho) || allItems.reduce((sum: number, p: any) => sum + (Number(p.totalPaletas) || 0), 0);
            }
            return allItems.reduce((sum: number, p: any) => sum + (Number(p.totalPaletas) || 0), 0);
        }
        
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



export interface CrewPerformanceReportCriteria {
    startDate?: string;
    endDate?: string;
    operario?: string;
    operationType?: 'recepcion' | 'despacho';
    productType?: 'fijo' | 'variable';
    clientNames?: string[];
    filterPending?: boolean;
    cuadrillaFilter?: 'con' | 'sin' | 'todas';
    conceptos?: string[];
}

export interface CrewPerformanceReportRow {
    id: string; 
    submissionId: string;
    formType: string;
    fecha: string;
    createdAt: string; // Added this
    operario: string;
    cliente: string;
    tipoOperacion: 'Recepción' | 'Despacho' | 'N/A';
    tipoProducto: 'Fijo' | 'Variable' | 'Manual' | 'N/A';
    productos: any[]; // For pending legalization
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
    formData: any; // Include full formData for legalization modal
}


const calculateSettlements = (submission: any, billingConcepts: BillingConcept[]): { conceptName: string, unitValue: number, quantity: number, unitOfMeasure: string, totalValue: number }[] => {
    const settlements: { conceptName: string, unitValue: number, quantity: number, unitOfMeasure: string, totalValue: number }[] = [];
    const { formData, formType } = submission;
    const clientName = formData.nombreCliente || formData.cliente;

    const findMatchingConcepts = (name: string, unit: string) => {
        return billingConcepts.filter(c => 
            c.conceptName.toUpperCase() === name.toUpperCase() &&
            c.unitOfMeasure.toUpperCase() === unit.toUpperCase() &&
            (c.clientNames.includes(clientName) || c.clientNames.includes('TODOS (Cualquier Cliente)'))
        );
    };

    const addSettlement = (conceptType: string, quantity: number, quantityType: string) => {
        const matchingConcepts = findMatchingConcepts(conceptType, quantityType);
        if (matchingConcepts.length === 0) return;
        
        // Prioritize specific client concept over "TODOS"
        const concept = matchingConcepts.find(c => c.clientNames.includes(clientName)) || matchingConcepts[0];
        
        if (concept && !settlements.some(s => s.conceptName === concept.conceptName)) {
             settlements.push({
                conceptName: concept.conceptName,
                unitValue: concept.value,
                quantity: quantity,
                unitOfMeasure: concept.unitOfMeasure,
                totalValue: quantity * concept.value,
            });
        }
    };
    
    // Process observations
    const observaciones = Array.isArray(formData.observaciones) ? formData.observaciones : [];
    const specialHandledConcepts = ['REESTIBADO', 'SALIDA PALETAS TUNEL', 'TRANSBORDO CANASTILLA'];

    observaciones.forEach((obs: any) => {
        if (obs.executedByGrupoRosales === true) {
            const conceptType = obs.type.toUpperCase();
            let quantity = Number(obs.quantity) || 0;
            let quantityType = obs.quantityType;

            const isSpecialConcept = specialHandledConcepts.includes(conceptType);
            
            if (isSpecialConcept && quantity === 0 && quantityType) {
                 if (quantityType.toUpperCase().startsWith('PALETA')) {
                    quantity = calculateTotalPallets(formType, formData);
                } else if (quantityType.toUpperCase() === 'TONELADA') {
                    quantity = calculateTotalKilos(formType, formData) / 1000;
                }
            }
            
            if (quantity > 0 && quantityType) {
                addSettlement(conceptType, quantity, quantityType);
            }
        }
    });

    // Process the main operation concept (CARGUE/DESCARGUE) and Maquila concepts
    if (formData.aplicaCuadrilla === 'si') {
        const isReception = formType.includes('recepcion') || formType.includes('reception');
        const isDispatch = formType.includes('despacho');
        
        if (formData.tipoPedido !== 'MAQUILA') {
            const conceptName = isReception ? 'DESCARGUE' : (isDispatch ? 'CARGUE' : null);
            if (conceptName) {
                const kilos = calculateTotalKilos(formType, formData);
                const isFixedWeightPending = formType.startsWith('fixed-weight-') && kilos === 0;

                 if (isFixedWeightPending) {
                      settlements.push({ 
                          conceptName: conceptName, 
                          unitValue: 0, 
                          quantity: -1, // Use -1 as a flag for pending
                          unitOfMeasure: 'TONELADA', 
                          totalValue: 0
                      });
                 } else if (kilos >= 0) { 
                    const toneladas = kilos / 1000;
                    addSettlement(conceptName, toneladas, 'TONELADA');
                }
            }
        } else { // It is MAQUILA
            // Handle packaging type (SACOS/CAJAS)
            if (formData.tipoEmpaqueMaquila) {
                const conceptName = formData.tipoEmpaqueMaquila;
                const unitOfMeasure = conceptName === 'EMPAQUE DE CAJAS' ? 'CAJA' : 'SACO';
                let quantity = 0;
                if (formType.startsWith('fixed-weight-')) {
                    quantity = (formData.productos || []).reduce((sum: number, p: any) => sum + (Number(p.cajas) || 0), 0);
                } else if (formType.startsWith('variable-weight-')) {
                    quantity = (formData.items || []).reduce((sum: number, p: any) => sum + (Number(p.cantidadPorPaleta) || 0), 0);
                }
                if (quantity > 0) {
                    addSettlement(conceptName, quantity, unitOfMeasure);
                }
            }
            // Handle JORNAL ORDINARIO
            if (formData.numeroOperariosCuadrilla > 0) {
                const quantity = Number(formData.numeroOperariosCuadrilla);
                addSettlement('JORNAL ORDINARIO', quantity, 'UNIDAD');
            }
        }
    }
    
    return settlements;
};

export async function getCrewPerformanceReport(criteria: CrewPerformanceReportCriteria): Promise<CrewPerformanceReportRow[]> {
    if (!firestore) {
        throw new Error('El servidor no está configurado correctamente.');
    }

    try {
        let submissionsQuery: admin.firestore.Query = firestore.collection('submissions');
        let manualOpsQuery: admin.firestore.Query = firestore.collection('manual_operations');

        if (criteria.startDate && criteria.endDate) {
            // Widen the server query by a day on each side to account for timezone differences.
            const serverQueryStartDate = new Date(criteria.startDate);
            serverQueryStartDate.setDate(serverQueryStartDate.getDate() - 1);
            
            const serverQueryEndDate = new Date(criteria.endDate);
            serverQueryEndDate.setDate(serverQueryEndDate.getDate() + 2);

            submissionsQuery = submissionsQuery
                .where('createdAt', '>=', serverQueryStartDate.toISOString().split('T')[0])
                .where('createdAt', '<', serverQueryEndDate.toISOString().split('T')[0]);
                
            manualOpsQuery = manualOpsQuery
                .where('operationDate', '>=', criteria.startDate)
                .where('operationDate', '<=', criteria.endDate);
        } else {
            const defaultEndDate = new Date();
            const defaultStartDate = subDays(defaultEndDate, 7);
            submissionsQuery = submissionsQuery
                .where('createdAt', '>=', defaultStartDate)
                .where('createdAt', '<=', defaultEndDate);

            manualOpsQuery = manualOpsQuery
                .where('createdAt', '>=', defaultStartDate)
                .where('createdAt', '<=', defaultEndDate);
        }
        
        const [submissionsSnapshot, manualOpsSnapshot, billingConcepts] = await Promise.all([
            submissionsQuery.get(),
            manualOpsQuery.get(),
            getBillingConcepts()
        ]);
        
        const allSubmissionDocs = submissionsSnapshot.docs.map(doc => ({ id: doc.id, type: 'submission', ...serializeTimestamps(doc.data()) }));
        
        let dateFilteredSubmissions = allSubmissionDocs;
        if (criteria.startDate && criteria.endDate) {
             dateFilteredSubmissions = allSubmissionDocs.filter(submission => {
                const formIsoDate = submission.formData?.fecha;
                if (!formIsoDate || typeof formIsoDate !== 'string') return false;
                const formDatePart = getLocalGroupingDate(formIsoDate);
                return formDatePart >= criteria.startDate! && formDatePart <= criteria.endDate!;
            });
        }
        
        let manualOpsData = manualOpsSnapshot.docs.map(doc => ({ id: doc.id, type: 'manual', ...serializeTimestamps(doc.data()) }));

        let allResults: any[] = [...dateFilteredSubmissions, ...manualOpsData];

        const finalReportRows: CrewPerformanceReportRow[] = [];

        for (const doc of allResults) {
            if (doc.type === 'submission') {
                const { id, formType, formData, userDisplayName, createdAt } = doc;
                const clientName = formData?.nombreCliente || formData?.cliente;
                
                if (
                    clientName === 'GRUPO FRUTELLI SAS' &&
                    (formType === 'variable-weight-recepcion' || formType === 'variable-weight-reception')
                ) {
                    continue; 
                }
                
                const allPossibleConcepts = calculateSettlements(doc, billingConcepts);
                let indicatorOnlyOperation: { conceptName: string, toneladas: number, isPending: boolean } | null = null;
                
                 if (formData.aplicaCuadrilla === 'no') {
                    const isReception = formType.includes('recepcion') || formType.includes('reception');
                    const isDispatch = formType.includes('despacho');
                    
                    if (isReception || isDispatch) {
                        const concept = isReception ? 'DESCARGUE' : 'CARGUE';
                        const kilos = calculateTotalKilos(formType, formData);
                        const isPending = formType.startsWith('fixed-weight-') && kilos === 0;
                        
                        indicatorOnlyOperation = {
                            conceptName: concept,
                            toneladas: kilos / 1000,
                            isPending: isPending
                        };
                    }
                }
                
                const hasCrewSettlements = allPossibleConcepts.length > 0;
                const hasNonCrewIndicator = indicatorOnlyOperation !== null;
                
                if (criteria.cuadrillaFilter === 'con' && !hasCrewSettlements) continue;
                if (criteria.cuadrillaFilter === 'sin' && !hasNonCrewIndicator) continue;
                
                const buildRow = (settlement?: typeof allPossibleConcepts[0]) => {
                    let tipoOperacion: 'Recepción' | 'Despacho' | 'N/A' = 'N/A';
                    if (formType.includes('recepcion') || formType.includes('reception')) tipoOperacion = 'Recepción';
                    else if (formType.includes('despacho')) tipoOperacion = 'Despacho';

                    let tipoProducto: 'Fijo' | 'Variable' | 'N/A' = 'N/A';
                    if (formType.includes('fixed-weight')) tipoProducto = 'Fijo';
                    else if (formType.includes('variable-weight')) tipoProducto = 'Variable';

                    let quantity = 0;
                    if (settlement) {
                        quantity = settlement.quantity;
                    } else if (indicatorOnlyOperation) {
                        quantity = indicatorOnlyOperation.isPending ? -1 : indicatorOnlyOperation.toneladas;
                    }
                    
                    return {
                        id: settlement ? `${id}-${settlement.conceptName.replace(/\s+/g, '-')}` : id,
                        submissionId: id, formType, fecha: formData.fecha, createdAt: createdAt, operario: userDisplayName || 'N/A', cliente: formData.nombreCliente || formData.cliente || 'N/A',
                        tipoOperacion, tipoProducto, productos: formData.productos || [], kilos: calculateTotalKilos(formType, formData), horaInicio: formData.horaInicio || 'N/A', horaFin: formData.horaFin || 'N/A',
                        totalDurationMinutes: null, operationalDurationMinutes: null, novelties: [], pedidoSislog: formData.pedidoSislog || 'N/A',
                        placa: formData.placa || 'N/A', contenedor: formData.contenedor || 'N/A', productType: tipoProducto === 'Fijo' ? 'fijo' : (tipoProducto === 'Variable' ? 'variable' : null),
                        standard: null, description: "Sin descripción",
                        conceptoLiquidado: settlement?.conceptName || indicatorOnlyOperation?.conceptName || 'N/A',
                        valorUnitario: settlement?.unitValue || 0,
                        cantidadConcepto: quantity,
                        unidadMedidaConcepto: settlement?.unitOfMeasure || (indicatorOnlyOperation ? 'TONELADA' : 'N/A'),
                        valorTotalConcepto: settlement?.totalValue || 0,
                        aplicaCuadrilla: formData.aplicaCuadrilla,
                        formData: formData,
                    };
                };
                
                if (hasCrewSettlements) {
                    for (const settlement of allPossibleConcepts) {
                        finalReportRows.push(buildRow(settlement));
                    }
                } else if (hasNonCrewIndicator) {
                     finalReportRows.push(buildRow());
                }
            } else if (doc.type === 'manual') {
                const { id, clientName, operationDate, startTime, endTime, plate, concept, quantity, createdAt } = doc;
                
                const matchingConcept = billingConcepts.find(c => c.conceptName.toUpperCase() === concept.toUpperCase());
                
                let valorTotalConcepto = 0;
                const valorUnitario = matchingConcept?.value || 0;

                const upperConcept = concept.toUpperCase();

                if (upperConcept === 'CARGUE DE CANASTAS') {
                    valorTotalConcepto = valorUnitario * quantity;
                } else if (upperConcept === 'APOYO DE MONTACARGAS') {
                    const durationMinutes = calculateDuration(startTime, endTime);
                    if (durationMinutes !== null && durationMinutes > 0) {
                        const durationHours = durationMinutes / 60;
                        const hourlyRate = valorUnitario / 8; // Value is for an 8-hour shift
                        valorTotalConcepto = hourlyRate * durationHours * quantity; // quantity is units
                    }
                } else {
                    valorTotalConcepto = valorUnitario * quantity;
                }

                finalReportRows.push({
                    id: id,
                    submissionId: id,
                    formType: 'manual',
                    fecha: operationDate,
                    createdAt: createdAt,
                    operario: 'Manual',
                    cliente: clientName,
                    tipoOperacion: (upperConcept.includes('CARGUE') || upperConcept.includes('SALIDA')) ? 'Despacho' : 'Recepción',
                    tipoProducto: 'Manual',
                    productos: [],
                    kilos: matchingConcept?.unitOfMeasure === 'TONELADA' ? quantity * 1000 : 0,
                    horaInicio: startTime,
                    horaFin: endTime,
                    totalDurationMinutes: null,
                    operationalDurationMinutes: null,
                    novelties: [],
                    pedidoSislog: 'Manual',
                    placa: plate || 'N/A',
                    contenedor: 'Manual',
                    productType: null,
                    standard: null,
                    description: 'Operación Manual',
                    conceptoLiquidado: concept,
                    valorUnitario: valorUnitario,
                    cantidadConcepto: quantity,
                    unidadMedidaConcepto: matchingConcept?.unitOfMeasure || 'N/A',
                    valorTotalConcepto: valorTotalConcepto,
                    aplicaCuadrilla: 'si',
                    formData: doc,
                });
            }
        }
            
        const enrichedRows = [];
        for (const row of finalReportRows) {
            // Apply secondary filters
            if (criteria.clientNames && criteria.clientNames.length > 0 && !criteria.clientNames.includes(row.cliente)) continue;
            if (criteria.productType && row.productType !== criteria.productType) continue;
            if (criteria.operationType) {
                const rowOpType = (row.tipoOperacion === 'Recepción') ? 'recepcion' : (row.tipoOperacion === 'Despacho' ? 'despacho' : null);
                if(rowOpType !== criteria.operationType) continue;
            }
            if (criteria.conceptos && criteria.conceptos.length > 0 && !criteria.conceptos.includes(row.conceptoLiquidado)) continue;
            if (criteria.operario && row.operario !== criteria.operario && row.operario !== 'Manual') continue;
             if (criteria.filterPending && row.cantidadConcepto !== -1) continue;

            // Enrich with novelty and performance data
            const novelties = await getNoveltiesForOperation(row.submissionId);
            const totalDuration = calculateDuration(row.horaInicio, row.horaFin);
            
            let downtimeMinutes = 0;
            if (row.aplicaCuadrilla === 'si') {
                 downtimeMinutes = novelties
                    .filter(n => n.purpose === 'justification')
                    .reduce((sum, n) => sum + n.downtimeMinutes, 0);
            }
            
            row.novelties = novelties;
            row.totalDurationMinutes = totalDuration;
            row.operationalDurationMinutes = totalDuration !== null ? totalDuration - downtimeMinutes : null;

            if (row.tipoOperacion === 'Recepción' || row.tipoOperacion === 'Despacho') {
                 row.standard = await findBestMatchingStandard({
                    clientName: row.cliente,
                    operationType: row.tipoOperacion === 'Recepción' ? 'recepcion' : 'despacho',
                    productType: row.tipoProducto === 'Fijo' ? 'fijo' : 'variable',
                    tons: row.kilos / 1000
                });
                row.description = row.standard?.description || "Sin descripción";
            }

            enrichedRows.push(row);
        }

        enrichedRows.sort((a, b) => {
            const dateA = new Date(a.fecha).getTime();
            const dateB = new Date(b.fecha).getTime();
            if (dateA !== dateB) {
                return dateA - dateB;
            }
            const timeA = a.horaInicio.replace(':', '');
            const timeB = b.horaInicio.replace(':', '');
            return timeA.localeCompare(timeB);
        });

        return enrichedRows;
    } catch(error) {
        console.error('Error generating crew performance report:', error);
        if (error instanceof Error && (error.message.includes('requires an index') || error.message.includes('needs an index'))) {
            console.error("Firestore composite index required. See the full error log for the creation link.", error);
            // Re-throw the original error to pass the link to the client for debugging
            throw new Error(error.message);
        }
        throw new Error('No se pudo generar el reporte de productividad.');
    }
}
