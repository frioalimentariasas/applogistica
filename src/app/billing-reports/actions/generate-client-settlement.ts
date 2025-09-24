

'use server';

import { firestore } from '@/lib/firebase-admin';
import type { ClientBillingConcept, TariffRange, SpecificTariff } from '@/app/gestion-conceptos-liquidacion-clientes/actions';
import { getClientBillingConcepts } from '@/app/gestion-conceptos-liquidacion-clientes/actions';
import admin from 'firebase-admin';
import { startOfDay, endOfDay, parseISO, differenceInHours, getDaysInMonth, getDay, format, addMinutes, addHours } from 'date-fns';
import type { ArticuloData } from '@/app/actions/articulos';
import { getConsolidatedMovementReport } from '@/app/actions/consolidated-movement-report';


export async function getAllManualClientOperations(): Promise<any[]> {
    if (!firestore) {
        return [];
    }
    try {
        const snapshot = await firestore.collection('manual_client_operations')
            .orderBy('operationDate', 'desc')
            .get();
        
        return snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                ...data,
                id: doc.id,
                operationDate: (data.operationDate as admin.firestore.Timestamp).toDate().toISOString(),
                createdAt: data.createdAt,
            }
        });
    } catch (error) {
        console.error("Error fetching all manual client operations:", error);
        return [];
    }
}


export interface ClientSettlementRow {
  date: string;
  totalPaletas: number;
  container: string;
  camara: string;
  operacionLogistica: string;
  pedidoSislog: string; 
  conceptName: string;
  subConceptName?: string; // New field for child concept
  tipoVehiculo: string;
  quantity: number;
  unitOfMeasure: string;
  unitValue: number;
  totalValue: number;
  horaInicio?: string;
  horaFin?: string;
  numeroPersonas?: number;
  uniqueId?: string;
  isEdited?: boolean;
}

export interface ClientSettlementResult {
    success: boolean;
    data?: ClientSettlementRow[];
    error?: string;
    errorLink?: string;
}

const findMatchingTariff = (tons: number, concept: ClientBillingConcept): TariffRange | undefined => {
    if (!concept.tariffRanges || concept.tariffRanges.length === 0) {
        return undefined;
    }
    // Prioritize finding the correct weight range first.
    const matchingRange = concept.tariffRanges.find(range => 
        tons >= range.minTons && 
        tons <= range.maxTons
    );
    return matchingRange;
};

const getOperationLogisticsType = (isoDateString: string, horaInicio: string, horaFin: string, concept: ClientBillingConcept): "Diurno" | "Nocturno" | "Extra" | "No Aplica" => {
    const specialConcepts = ["FMM DE INGRESO", "ARIN DE INGRESO", "FMM DE SALIDA", "ARIN DE SALIDA", "REESTIBADO", "ALISTAMIENTO POR UNIDAD", "FMM DE INGRESO ZFPC", "FMM DE SALIDA ZFPC", "FMM ZFPC"];
    if (specialConcepts.includes(concept.conceptName.toUpperCase())) {
      return "No Aplica";
    }

    if (concept.calculationType !== 'REGLAS' || concept.tariffType !== 'RANGOS' || !isoDateString || !horaInicio || !horaFin || !concept.dayShiftStart || !concept.dayShiftEnd) {
        return "No Aplica";
    }

    try {
        const date = new Date(isoDateString);
        date.setUTCHours(date.getUTCHours() - 5);

        const dayOfWeek = date.getUTCDay();

        const [startHours, startMinutes] = horaInicio.split(':').map(Number);
        const startTime = new Date(date);
        startTime.setUTCHours(startHours, startMinutes, 0, 0);

        const [endHours, endMinutes] = horaFin.split(':').map(Number);
        const endTime = new Date(date);
        endTime.setUTCHours(endHours, endMinutes, 0, 0);

        if (endTime <= startTime) {
            endTime.setUTCDate(endTime.getUTCDate() + 1);
        }

        const [diurnoStartHours, diurnoStartMinutes] = concept.dayShiftStart.split(':').map(Number);
        const diurnoStart = new Date(date);
        diurnoStart.setUTCHours(diurnoStartHours, diurnoStartMinutes, 0, 0);

        const [diurnoEndHours, diurnoEndMinutes] = concept.dayShiftEnd.split(':').map(Number);
        const diurnoEnd = new Date(date);
        diurnoEnd.setUTCHours(diurnoEndHours, diurnoEndMinutes, 0, 0);

        if (startTime >= diurnoStart && endTime <= diurnoEnd) {
            return 'Diurno';
        } else {
            if (dayOfWeek === 6 && (startTime < diurnoStart || endTime > diurnoEnd)) {
                return 'Extra';
            }
            return 'Nocturno';
        }

    } catch (e) {
        console.error(`Error calculating logistics type:`, e);
        return 'No Aplica';
    }
};

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

// Simplified operation structure for processing
interface BasicOperation {
    type: 'form' | 'manual';
    data: any; // formData for forms, document data for manual
}

export async function findApplicableConcepts(clientName: string, startDate: string, endDate: string): Promise<ClientBillingConcept[]> {
    if (!firestore) return [];

    const allConcepts = await getClientBillingConcepts();
    const applicableConcepts = new Map<string, ClientBillingConcept>();

    const serverQueryStartDate = startOfDay(parseISO(startDate));
    const serverQueryEndDate = endOfDay(parseISO(endDate));
    
    // Fetch all submissions in the date range
    const submissionsSnapshot = await firestore.collection('submissions')
        .where('formData.fecha', '>=', serverQueryStartDate)
        .where('formData.fecha', '<=', serverQueryEndDate)
        .get();

    // Fetch all manual operations in the date range. Client will be filtered later.
    const manualOpsSnapshot = await firestore.collection('manual_client_operations')
        .where('operationDate', '>=', serverQueryStartDate)
        .where('operationDate', '<=', serverQueryEndDate)
        .get();

    const clientSubmissions = submissionsSnapshot.docs.filter(doc => {
        const docData = doc.data();
        const docClientName = docData.formData?.cliente || docData.formData?.nombreCliente;
        const pedidoSislog = docData.formData?.pedidoSislog;
        return docClientName === clientName && pedidoSislog !== '1';
    });
    
    // Process form-based concepts
    clientSubmissions.forEach(doc => {
        const submission = serializeTimestamps(doc.data());
        const formData = submission.formData;
        const conceptsForClient = allConcepts.filter(c => c.clientNames.includes(clientName) || c.clientNames.includes('TODOS (Cualquier Cliente)'));

        conceptsForClient.forEach(concept => {
            if (concept.calculationType === 'REGLAS') {
                let opTypeMatch = false;
                if (concept.filterOperationType === 'ambos') {
                    opTypeMatch = true;
                } else if (concept.filterOperationType === 'recepcion' && (submission.formType.includes('recepcion') || submission.formType.includes('reception'))) {
                    opTypeMatch = true;
                } else if (concept.filterOperationType === 'despacho' && submission.formType.includes('despacho')) {
                    opTypeMatch = true;
                }

                let prodTypeMatch = false;
                if (concept.filterProductType === 'ambos') {
                    prodTypeMatch = true;
                } else if (concept.filterProductType === 'fijo' && submission.formType.includes('fixed-weight')) {
                    prodTypeMatch = true;
                } else if (concept.filterProductType === 'variable' && submission.formType.includes('variable-weight')) {
                    prodTypeMatch = true;
                }

                if (opTypeMatch && prodTypeMatch) {
                    if (!applicableConcepts.has(concept.id)) {
                        applicableConcepts.set(concept.id, concept);
                    }
                }
            } else if (concept.calculationType === 'OBSERVACION') {
                 if (Array.isArray(formData.observaciones) && formData.observaciones.some((obs: any) => obs.type === concept.associatedObservation)) {
                     if (!applicableConcepts.has(concept.id)) {
                        applicableConcepts.set(concept.id, concept);
                    }
                 }
            }
        });
    });

    // Process manual-based concepts
    manualOpsSnapshot.docs.forEach(doc => {
        const opData = doc.data();
        if (opData.clientName === clientName) { // Filter by client here
            const conceptsForClient = allConcepts.filter(c => c.clientNames.includes(clientName) || c.clientNames.includes('TODOS (Cualquier Cliente)'));
            conceptsForClient.forEach(concept => {
                if (concept.calculationType === 'MANUAL' && concept.conceptName === opData.concept) {
                    if (!applicableConcepts.has(concept.id)) {
                        applicableConcepts.set(concept.id, concept);
                    }
                }
            });
        }
    });

    // Process inventory-based concepts
    const inventoryConcepts = allConcepts.filter(c => 
        (c.clientNames.includes(clientName) || c.clientNames.includes('TODOS (Cualquier Cliente)')) &&
        c.calculationType === 'SALDO_INVENTARIO'
    );
    
    if (inventoryConcepts.length > 0) {
        // Fetch necessary data once
        const [inventorySnapshot, clientArticlesSnapshot] = await Promise.all([
            firestore.collection('dailyInventories')
                .where(admin.firestore.FieldPath.documentId(), '>=', startDate)
                .where(admin.firestore.FieldPath.documentId(), '<=', endDate)
                .get(),
            firestore.collection('articulos').where('razonSocial', '==', clientName).get()
        ]);
        
        const articleSessionMap = new Map<string, string>();
        clientArticlesSnapshot.forEach(doc => {
            const article = doc.data() as ArticuloData;
            articleSessionMap.set(article.codigoProducto, article.sesion);
        });

        for (const concept of inventoryConcepts) {
            if (!concept.inventorySesion) continue;
            
            const targetSesion = concept.inventorySesion;

            // Check for movements in the target session
            const hasMovementsInSession = clientSubmissions.some(doc => {
                const items = doc.data().formData?.items || doc.data().formData?.productos || [];
                return items.some((item: any) => {
                    const itemSesion = articleSessionMap.get(item.codigo);
                    return itemSesion === targetSesion;
                });
            });
            
            // Check for inventory in the target session
            const hasInventoryInSession = inventorySnapshot.docs.some(doc => {
                const data = doc.data().data;
                return Array.isArray(data) && data.some(row => 
                    row.PROPIETARIO === clientName && 
                    String(row.SE).trim().toUpperCase() === targetSesion
                );
            });

            if (hasInventoryInSession || hasMovementsInSession) {
                 if (!applicableConcepts.has(concept.id)) {
                    applicableConcepts.set(concept.id, concept);
                }
            }
        }
    }
    
    const sortedConcepts = Array.from(applicableConcepts.values());
    sortedConcepts.sort((a, b) => a.conceptName.localeCompare(b.conceptName));
    return sortedConcepts;
}

const calculateWeightForOperation = (op: any): number => {
    const { formType, formData } = op;

    if (formType === 'fixed-weight-despacho' || formType === 'fixed-weight-recepcion' || formType === 'fixed-weight-reception') {
        const grossWeight = Number(formData.totalPesoBrutoKg);
        if (grossWeight > 0) {
            return grossWeight;
        }
        // Fallback for older forms or missing gross weight
        return (formData.productos || []).reduce((sum: number, p: any) => sum + (Number(p.pesoNetoKg) || 0), 0);
    }
    
    if (formType === 'variable-weight-despacho') {
        const allItems = (formData.destinos?.flatMap((d: any) => d.items) || formData.items) || [];
        return allItems.reduce((sum: number, item: any) => sum + (Number(item.pesoNeto) || 0), 0);
    }
    
    if (formType === 'variable-weight-recepcion' || formType === 'variable-weight-reception') {
        const allItems = (formData.placas?.flatMap((p: any) => p.items) || formData.items) || [];
        const isSummaryFormat = allItems.some((p: any) => Number(p.paleta) === 0);
        if (isSummaryFormat) {
            return allItems.reduce((sum: number, item: any) => sum + (Number(item.totalPesoNeto) || 0), 0);
        }
        return allItems.reduce((sum: number, item: any) => sum + (Number(item.pesoNeto) || 0), 0);
    }

    return 0;
};

const calculatePalletsForOperation = (op: any): number => {
    const { formType, formData } = op;
    const items = formData.productos || formData.items || formData.destinos?.flatMap((d: any) => d.items) || [];

    if (formType?.startsWith('fixed-weight')) {
        return (formData.productos || []).reduce((sum: number, p: any) => sum + (Number(p.totalPaletas) || Number(p.paletasCompletas) || 0), 0);
    }

    if (formType?.startsWith('variable-weight')) {
        const isSummary = items.some((i: any) => Number(i.paleta) === 0);
        if (isSummary) {
            return items.reduce((sum: number, i: any) => sum + (Number(i.totalPaletas) || Number(i.paletasCompletas) || 0), 0);
        }
        const uniquePallets = new Set(items.map((i: any) => i.paleta).filter(Boolean));
        return uniquePallets.size;
    }
    
    return 0;
};

const calculateUnitsForOperation = (op: any): number => {
  const { formType, formData } = op;
  
  if (formType?.startsWith('fixed-weight')) {
      return (formData.productos || []).reduce((sum: number, p: any) => sum + (Number(p.cajas) || 0), 0);
  }

  if (formType?.startsWith('variable-weight')) {
      const items = formData.items || formData.destinos?.flatMap((d: any) => d.items) || [];
      const isSummary = items.some((i: any) => Number(i.paleta) === 0);
      if (isSummary) {
          return items.reduce((sum: number, i: any) => sum + (Number(i.totalCantidad) || 0), 0);
      }
      return items.reduce((sum: number, i: any) => sum + (Number(i.cantidadPorPaleta) || 0), 0);
  }

  return 0;
};

const formatTime12Hour = (timeStr: string | undefined): string => {
    if (!timeStr) return 'No Aplica';

    // Check if it's already a formatted date-time string
    // e.g., "13/09/2025 06:50 PM"
    const dateTimeParts = timeStr.split(' ');
    if (dateTimeParts.length > 2 && (dateTimeParts[2] === 'AM' || dateTimeParts[2] === 'PM')) {
        return timeStr;
    }
    
    // Handle HH:mm format
    if (!timeStr.includes(':')) return 'No Aplica';

    const [hours, minutes] = timeStr.split(':');
    let h = parseInt(hours, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    h = h ? h : 12; // the hour '0' should be '12'
    return `${h.toString().padStart(2, '0')}:${minutes} ${ampm}`;
};


export async function generateClientSettlement(criteria: {
  clientName: string;
  startDate: string;
  endDate: string;
  conceptIds: string[];
  containerNumber?: string;
}): Promise<ClientSettlementResult> {
  if (!firestore) {
    return { success: false, error: 'El servidor no está configurado correctamente.' };
  }

  const { clientName, startDate, endDate, conceptIds, containerNumber } = criteria;
  if (!clientName || !startDate || !endDate || conceptIds.length === 0) {
    return { success: false, error: 'Faltan criterios para la liquidación.' };
  }

  try {
    const serverQueryStartDate = startOfDay(parseISO(startDate));
    const serverQueryEndDate = endOfDay(parseISO(endDate));

    const [allConcepts, articlesSnapshot, submissionsSnapshot, manualOpsSnapshot] = await Promise.all([
        getClientBillingConcepts(),
        firestore.collection('articulos').where('razonSocial', '==', clientName).get(),
        firestore.collection('submissions').where('formData.fecha', '>=', serverQueryStartDate).where('formData.fecha', '<=', serverQueryEndDate).get(),
        firestore.collection('manual_client_operations').where('operationDate', '>=', serverQueryStartDate).where('operationDate', '<=', serverQueryEndDate).get()
    ]);
    
    const articleSessionMap = new Map<string, string>();
    articlesSnapshot.forEach(doc => {
        const article = doc.data() as ArticuloData;
        articleSessionMap.set(article.codigoProducto, article.sesion);
    });

    const selectedConcepts = allConcepts.filter(c => conceptIds.includes(c.id));
    const allOperations: BasicOperation[] = [];

    submissionsSnapshot.docs.forEach(doc => {
        const data = serializeTimestamps(doc.data());
        const docClientName = data.formData?.cliente || data.formData?.nombreCliente;
        const pedidoSislog = data.formData?.pedidoSislog;
        
        if (docClientName === clientName && pedidoSislog !== '1') {
            if (containerNumber && data.formData.contenedor !== containerNumber) {
                return;
            }
            allOperations.push({ type: 'form', data });
        }
    });
    
    manualOpsSnapshot.docs.forEach(doc => {
        const data = serializeTimestamps(doc.data());
        if (data.clientName === clientName) {
             if (containerNumber && data.details?.container !== containerNumber) {
                return;
            }
            allOperations.push({ type: 'manual', data });
        }
    });
    
    const settlementRows: ClientSettlementRow[] = [];
    
    const ruleConcepts = selectedConcepts.filter(c => c.calculationType === 'REGLAS');

    for (const concept of ruleConcepts) {
        const applicableOperations = allOperations
            .filter(op => op.type === 'form')
            .map(op => op.data)
            .filter(op => {
                let opTypeMatch = false;
                if (concept.filterOperationType === 'ambos') opTypeMatch = true;
                else if (concept.filterOperationType === 'recepcion' && (op.formType.includes('recepcion') || op.formType.includes('reception'))) opTypeMatch = true;
                else if (concept.filterOperationType === 'despacho' && op.formType.includes('despacho')) opTypeMatch = true;

                let prodTypeMatch = false;
                if (concept.filterProductType === 'ambos') {
                    prodTypeMatch = true;
                } else if (concept.filterProductType === 'fijo' && op.formType.includes('fixed-weight')) {
                    prodTypeMatch = true;
                } else if (concept.filterProductType === 'variable' && op.formType.includes('variable-weight')) {
                    prodTypeMatch = true;
                }
                
                return opTypeMatch && prodTypeMatch;
            });
            
        for (const op of applicableOperations) {
            // Apply GRUPO FRUTELLI SAS exclusion here, before adding to the settlement rows.
            if (
                clientName === 'GRUPO FRUTELLI SAS' && 
                (op.formType === 'variable-weight-recepcion' || op.formType === 'variable-weight-reception')
            ) {
                continue; 
            }

            let quantity = 0;
            const weightKg = calculateWeightForOperation(op);
            
            let totalPallets = 0;
            if (concept.conceptName === 'OPERACIÓN CARGUE' || concept.conceptName === 'OPERACIÓN DESCARGUE' || concept.calculationBase === 'CANTIDAD_PALETAS') {
                totalPallets = calculatePalletsForOperation(op);
            }

            switch (concept.calculationBase) {
                case 'TONELADAS': quantity = weightKg / 1000; break;
                case 'KILOGRAMOS': quantity = weightKg; break;
                case 'CANTIDAD_PALETAS': quantity = totalPallets; break;
                case 'CANTIDAD_CAJAS': quantity = calculateUnitsForOperation(op); break;
                case 'NUMERO_OPERACIONES': quantity = 1; break;
                case 'NUMERO_CONTENEDORES': quantity = op.formData.contenedor ? 1 : 0; break;
            }

            if (quantity <= 0) continue;

            let unitValue = 0;
            let operacionLogistica: string = 'No Aplica';
            let vehicleTypeForReport = 'No Aplica';
            let unitOfMeasureForReport = concept.unitOfMeasure;

            if (concept.tariffType === 'UNICA') {
                unitValue = concept.value || 0;
            } else if (concept.tariffType === 'RANGOS') {
                const totalTons = weightKg / 1000;
                operacionLogistica = getOperationLogisticsType(op.formData.fecha, op.formData.horaInicio, op.formData.horaFin, concept);
                
                if (clientName === 'ATLANTIC FS S.A.S.' && concept.conceptName === 'OPERACIÓN DESCARGUE') {
                    const matchingTariff = concept.tariffRanges?.find(r => r.vehicleType === 'CONTENEDOR');
                     if (matchingTariff) {
                        vehicleTypeForReport = matchingTariff.vehicleType;
                        unitOfMeasureForReport = 'CONTENEDOR' as any; // Override unit of measure
                        unitValue = operacionLogistica === 'Diurno' ? matchingTariff.dayTariff : matchingTariff.nightTariff;
                    }
                } else {
                    const matchingTariff = findMatchingTariff(totalTons, concept);
                    if (matchingTariff) {
                        vehicleTypeForReport = matchingTariff.vehicleType;
                        if (concept.conceptName === 'OPERACIÓN CARGUE' || concept.conceptName === 'OPERACIÓN DESCARGUE') {
                            unitOfMeasureForReport = vehicleTypeForReport as any;
                        }
                        unitValue = operacionLogistica === 'Diurno' ? matchingTariff.dayTariff : matchingTariff.nightTariff;
                    }
                }
            }
            
            const allItems = op.formData.productos || op.formData.items || op.formData.placas?.flatMap((p: any) => p.items) || op.formData.destinos?.flatMap((d: any) => d.items) || [];
            const firstProductCode = allItems[0]?.codigo;
            const camara = firstProductCode ? articleSessionMap.get(firstProductCode) || 'N/A' : 'N/A';

            settlementRows.push({
                date: op.formData.fecha,
                container: op.formData.contenedor || 'N/A',
                camara,
                totalPaletas: totalPallets,
                operacionLogistica,
                pedidoSislog: op.formData.pedidoSislog,
                conceptName: concept.conceptName,
                tipoVehiculo: (concept.conceptName === 'OPERACIÓN CARGUE' || concept.conceptName === 'OPERACIÓN DESCARGUE') ? vehicleTypeForReport : 'No Aplica',
                quantity,
                unitOfMeasure: unitOfMeasureForReport,
                unitValue: unitValue,
                totalValue: quantity * unitValue,
                horaInicio: op.formData.horaInicio,
                horaFin: op.formData.horaFin,
            });
        }
    }
    
    const observationConcepts = selectedConcepts.filter(c => c.calculationType === 'OBSERVACION');
    if (observationConcepts.length > 0) {
        const opsWithObservations = allOperations.filter(op => op.type === 'form' && Array.isArray(op.data.formData.observaciones) && op.data.formData.observaciones.length > 0);
        
        for (const concept of observationConcepts) {
            const relevantOps = opsWithObservations.filter(op =>
                (op.data.formData.observaciones as any[]).some(obs => obs.type === concept.associatedObservation)
            );
            
            for (const op of relevantOps) {
                const obs = (op.data.formData.observaciones as any[]).find(o => o.type === concept.associatedObservation);
                const quantity = Number(obs?.quantity) || 0;
                 const totalPallets = calculatePalletsForOperation(op.data);

                if (quantity > 0) {
                    settlementRows.push({
                        date: op.data.formData.fecha,
                        container: op.data.formData.contenedor || 'N/A',
                        camara: 'N/A',
                        totalPaletas: 0, // Pallets not counted for observations
                        operacionLogistica: 'No Aplica',
                        pedidoSislog: op.data.formData.pedidoSislog,
                        conceptName: concept.conceptName,
                        tipoVehiculo: 'No Aplica',
                        quantity,
                        unitOfMeasure: concept.unitOfMeasure,
                        unitValue: concept.value || 0,
                        totalValue: quantity * (concept.value || 0),
                        horaInicio: op.data.formData.horaInicio,
                        horaFin: op.data.formData.horaFin,
                    });
                }
            }
        }
    }

    const manualOpsFiltered = allOperations.filter(op => op.type === 'manual');
    if (manualOpsFiltered.length > 0) {
        const manualConcepts = selectedConcepts.filter(c => c.calculationType === 'MANUAL');
        if (manualConcepts.length > 0) {
            manualOpsFiltered.forEach(op => {
                const opData = op.data;
                const concept = manualConcepts.find(c => c.conceptName === opData.concept);
                if (concept) {
                    const date = opData.operationDate ? new Date(opData.operationDate).toISOString().split('T')[0] : startDate;
                    
                    let horaInicio = opData.details?.startTime || 'N/A';
                    let horaFin = opData.details?.endTime || 'N/A';

                    if (concept.conceptName === 'CONEXIÓN ELÉCTRICA CONTENEDOR') {
                        const { fechaArribo, horaArribo, fechaSalida, horaSalida } = opData.details || {};
                        if (fechaArribo && horaArribo) {
                            horaInicio = `${format(parseISO(fechaArribo), 'dd/MM/yyyy')} ${formatTime12Hour(horaArribo)}`;
                        }
                        if (fechaSalida && horaSalida) {
                             horaFin = `${format(parseISO(fechaSalida), 'dd/MM/yyyy')} ${formatTime12Hour(horaSalida)}`;
                        }
                    }

                    if (concept.conceptName === 'TIEMPO EXTRA FRIOAL (FIJO)' && Array.isArray(opData.bulkRoles)) {
                         const excedentesMap = new Map((opData.excedentes || []).map((e: any) => [e.date, e.hours]));

                         opData.bulkRoles.forEach((role: any) => {
                            if (role.numPersonas > 0) {
                                
                                const diurnaTariff = concept.specificTariffs?.find(t => t.id === role.diurnaId);
                                if (diurnaTariff) {
                                    const isSaturday = getDay(parseISO(date)) === 6;
                                    const baseDiurnaHours = isSaturday ? 5 : 4;
                                    const excedentDiurno = isSaturday ? (excedentesMap.get(date) || 0) : 0;
                                    const totalDiurnaHours = baseDiurnaHours + excedentDiurno;

                                    if (totalDiurnaHours > 0) {
                                        const finalEndTimeDate = addHours(addMinutes(new Date(`${date}T00:00:00`), timeToMinutes(opData.details.startTime)), totalDiurnaHours);

                                        settlementRows.push({
                                            date, 
                                            conceptName: concept.conceptName,
                                            subConceptName: diurnaTariff.name,
                                            container: opData.details?.container || 'No Aplica',
                                            totalPaletas: opData.details?.totalPallets || 0,
                                            camara: 'No Aplica', operacionLogistica: 'No Aplica', pedidoSislog: 'Fijo Mensual', tipoVehiculo: 'No Aplica',
                                            quantity: totalDiurnaHours, 
                                            numeroPersonas: role.numPersonas, unitOfMeasure: diurnaTariff.unit,
                                            unitValue: diurnaTariff.value || 0, totalValue: totalDiurnaHours * role.numPersonas * (diurnaTariff.value || 0),
                                            horaInicio: opData.details?.startTime || 'N/A',
                                            horaFin: format(finalEndTimeDate, 'HH:mm'),
                                        });
                                    }
                                }

                                const nocturnaTariff = concept.specificTariffs?.find(t => t.id === role.nocturnaId);
                                if (nocturnaTariff) {
                                    const dayOfWeek = getDay(parseISO(date));
                                    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
                                    const baseNocturnaHours = isWeekday ? 1 : 0;
                                    const excedentNocturno = isWeekday ? (excedentesMap.get(date) || 0) : 0;
                                    const totalNocturnaHours = baseNocturnaHours + excedentNocturno;

                                    if (totalNocturnaHours > 0) {
                                        const finalEndTimeDate = addHours(addMinutes(new Date(`${date}T00:00:00`), timeToMinutes('22:00')), excedentNocturno);
                                        settlementRows.push({
                                            date, 
                                            conceptName: concept.conceptName,
                                            subConceptName: nocturnaTariff.name,
                                            container: opData.details?.container || 'No Aplica',
                                            totalPaletas: opData.details?.totalPallets || 0,
                                            camara: 'No Aplica', operacionLogistica: 'No Aplica', pedidoSislog: 'Fijo Mensual', tipoVehiculo: 'No Aplica',
                                            quantity: totalNocturnaHours, 
                                            numeroPersonas: role.numPersonas, unitOfMeasure: nocturnaTariff.unit,
                                            unitValue: nocturnaTariff.value || 0, totalValue: totalNocturnaHours * role.numPersonas * (nocturnaTariff.value || 0),
                                            horaInicio: '21:00', 
                                            horaFin: format(finalEndTimeDate, 'HH:mm'),
                                        });
                                    }
                                }
                            }
                        });
                    } else if (concept.conceptName === 'POSICIONES FIJAS CÁMARA CONGELADOS' && Array.isArray(opData.specificTariffs)) {
                        const operationDate = parseISO(opData.operationDate);
                        const numDias = getDaysInMonth(operationDate);

                        opData.specificTariffs.forEach((appliedTariff: { tariffId: string, quantity: number }) => {
                            const specificTariff = concept.specificTariffs?.find(t => t.id === appliedTariff.tariffId);
                            if (specificTariff) {
                                const isExcess = specificTariff.name.includes('EXCESO');
                                const quantityForCalc = isExcess ? appliedTariff.quantity : (specificTariff.name.includes('600') ? 600 : (specificTariff.name.includes('200') ? 200 : 0));

                                if (quantityForCalc > 0) {
                                    settlementRows.push({
                                        date,
                                        container: opData.details?.container || 'No Aplica',
                                        totalPaletas: opData.details?.totalPallets || 0,
                                        camara: 'Congelados',
                                        operacionLogistica: 'No Aplica',
                                        pedidoSislog: 'Fijo Mensual',
                                        conceptName: concept.conceptName,
                                        subConceptName: specificTariff.name,
                                        tipoVehiculo: 'No Aplica',
                                        quantity: quantityForCalc,
                                        unitOfMeasure: specificTariff.unit,
                                        unitValue: specificTariff.value || 0,
                                        totalValue: quantityForCalc * (specificTariff.value || 0) * numDias,
                                        horaInicio: 'No Aplica',
                                        horaFin: 'No Aplica',
                                        numeroPersonas: undefined,
                                    });
                                }
                            }
                        });
                    } else if (concept.tariffType === 'ESPECIFICA' && Array.isArray(opData.specificTariffs) && opData.specificTariffs.length > 0) {
                        opData.specificTariffs.forEach((appliedTariff: { tariffId: string, quantity: number }) => {
                            const specificTariff = concept.specificTariffs?.find(t => t.id === appliedTariff.tariffId);
                            if (specificTariff) {
                                let totalValue: number;
                                const isHourly = specificTariff.unit.includes('HORA');
                                
                                if (isHourly) {
                                    totalValue = (opData.quantity || 0) * (specificTariff.value || 0);
                                } else {
                                    totalValue = (specificTariff.value || 0) * (opData.numeroPersonas || 1);
                                }

                                if (totalValue > 0) {
                                    settlementRows.push({
                                        date,
                                        container: opData.details?.container || 'No Aplica',
                                        totalPaletas: opData.details?.totalPallets || 0,
                                        camara: 'No Aplica',
                                        operacionLogistica: 'No Aplica',
                                        pedidoSislog: 'No Aplica',
                                        conceptName: concept.conceptName,
                                        subConceptName: specificTariff.name,
                                        tipoVehiculo: 'No Aplica',
                                        quantity: opData.quantity,
                                        unitOfMeasure: specificTariff.unit,
                                        unitValue: specificTariff.value || 0,
                                        totalValue: totalValue,
                                        horaInicio: horaInicio,
                                        horaFin: horaFin,
                                        numeroPersonas: opData.numeroPersonas || undefined,
                                    });
                                }
                            }
                        });
                    } else if (concept.tariffType === 'UNICA') {
                         let quantityForCalc = opData.quantity || 0;
                         let totalValue = quantityForCalc * (concept.value || 0);
                         
                         if(concept.conceptName === 'IN-HOUSE INSPECTOR ZFPC' || concept.conceptName === 'ALQUILER IMPRESORA ETIQUETADO') {
                            const operationDate = parseISO(opData.operationDate);
                            const numDias = getDaysInMonth(operationDate);
                            quantityForCalc = numDias; // The quantity is the number of days in the month
                            totalValue = numDias * (concept.value || 0);
                         }

                         let operacionLogistica = 'No Aplica';
                         if (opData.details?.opLogistica && opData.details?.fmmNumber) {
                            operacionLogistica = `${opData.details.opLogistica} - #${opData.details.fmmNumber}`;
                         }

                         settlementRows.push({
                            date,
                            container: opData.details?.container || 'No Aplica',
                            totalPaletas: opData.details?.totalPallets || 0,
                            camara: 'No Aplica',
                            operacionLogistica,
                            pedidoSislog: 'No Aplica',
                            conceptName: concept.conceptName,
                            tipoVehiculo: opData.details?.plate || 'No Aplica',
                            quantity: quantityForCalc,
                            unitOfMeasure: concept.unitOfMeasure,
                            unitValue: concept.value || 0,
                            totalValue: totalValue,
                            horaInicio: horaInicio,
                            horaFin: horaFin,
                        });
                    }
                }
            });
        }
    }
    
    const inventoryConcepts = selectedConcepts.filter(c => c.calculationType === 'SALDO_INVENTARIO');

    for (const concept of inventoryConcepts) {
        if (!concept.inventorySource || !concept.inventorySesion || !concept.value) continue;

        if (concept.inventorySource === 'POSICIONES_ALMACENADAS') {
            const consolidatedReport = await getConsolidatedMovementReport({
                clientName: clientName,
                startDate: startDate,
                endDate: endDate,
                sesion: concept.inventorySesion,
            });

            for (const dayData of consolidatedReport) {
                if (dayData.posicionesAlmacenadas > 0) {
                    settlementRows.push({
                        date: dayData.date,
                        container: 'N/A',
                        camara: concept.inventorySesion,
                        totalPaletas: dayData.posicionesAlmacenadas,
                        operacionLogistica: 'ALMACENAMIENTO',
                        pedidoSislog: 'N/A',
                        conceptName: concept.conceptName,
                        tipoVehiculo: 'No Aplica',
                        quantity: dayData.posicionesAlmacenadas,
                        unitOfMeasure: concept.unitOfMeasure,
                        unitValue: concept.value,
                        totalValue: dayData.posicionesAlmacenadas * concept.value,
                    });
                }
            }
        }
    }

    const conceptOrder = [
        'OPERACIÓN DESCARGUE', 'OPERACIÓN CARGUE', 'ALISTAMIENTO POR UNIDAD', 'FMM DE INGRESO ZFPC', 'ARIN DE INGRESO ZFPC', 'FMM DE SALIDA ZFPC', 'FMM ZFPC',
        'ARIN DE SALIDA ZFPC', 'REESTIBADO', 'TOMA DE PESOS POR ETIQUETA HRS', 'MOVIMIENTO ENTRADA PRODUCTOS PALLET',
        'MOVIMIENTO SALIDA PRODUCTOS PALLET', 'CONEXIÓN ELÉCTRICA CONTENEDOR', 'ESTIBA MADERA RECICLADA',
        'POSICIONES FIJAS CÁMARA CONGELADOS', 'INSPECCIÓN ZFPC', 'TIEMPO EXTRA FRIOAL (FIJO)', 'TIEMPO EXTRA ZFPC', 'TIEMPO EXTRA FRIOAL',
        'IN-HOUSE INSPECTOR ZFPC', 'ALQUILER IMPRESORA ETIQUETADO', 'ALMACENAMIENTO PRODUCTOS CONGELADOS -PALLET/DIA (-18°C A -25°C)', 'ALMACENAMIENTO PRODUCTOS REFRIGERADOS -PALLET/DIA (0°C A 4ºC'
    ];
    
    settlementRows.sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        if (dateA !== dateB) return dateA - dateB;

        const indexA = conceptOrder.indexOf(a.conceptName);
        const indexB = conceptOrder.indexOf(b.conceptName);
        const orderA = indexA === -1 ? Infinity : indexA;
        const orderB = indexB === -1 ? Infinity : indexB;

        if (orderA !== orderB) return orderA - orderB;

        return (a.subConceptName || '').localeCompare(b.subConceptName || '');
    });
    
    return { success: true, data: settlementRows };

  } catch (error: any) {
    console.error('Error in generateClientSettlement:', error);

     if (error.message && typeof error.message === 'string' && error.message.includes('requires an index')) {
      const linkMatch = error.message.match(/(https?:\/\/[^\s]+)/);
      const link = linkMatch ? linkMatch[0] : 'No se pudo extraer el enlace.';
      return {
          success: false,
          error: 'Se requiere un índice compuesto en Firestore.',
          errorLink: link
      };
    }
    
    return { success: false, error: error.message || 'Ocurrió un error desconocido en el servidor.' };
  }
}

const timeToMinutes = (timeStr: string): number => {
    if (!timeStr || !timeStr.includes(':')) return 0;
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
};






    