

'use server';

import { firestore } from '@/lib/firebase-admin';
import type { ClientBillingConcept, TariffRange, SpecificTariff } from '@/app/gestion-conceptos-liquidacion-clientes/actions';
import { getClientBillingConcepts } from '@/app/gestion-conceptos-liquidacion-clientes/actions';
import admin from 'firebase-admin';
import { startOfDay, endOfDay, parseISO, differenceInHours } from 'date-fns';
import type { ArticuloData } from '@/app/actions/articulos';


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


export interface ClientSettlementCriteria {
  clientName: string;
  startDate: string;
  endDate: string;
  conceptIds: string[];
  containerNumber?: string;
}

export interface ClientSettlementRow {
  date: string;
  totalPaletas: number;
  container: string;
  camara: string;
  operacionLogistica: string;
  pedidoSislog: string; 
  conceptName: string;
  tipoVehiculo: string;
  quantity: number;
  unitOfMeasure: string;
  unitValue: number;
  totalValue: number;
}

export interface ClientSettlementResult {
    success: boolean;
    data?: ClientSettlementRow[];
    error?: string;
    errorLink?: string;
}

const findMatchingTariff = (tons: number, vehicleType: 'CONTENEDOR' | 'TURBO', concept: ClientBillingConcept): TariffRange | undefined => {
    if (!concept.tariffRanges || concept.tariffRanges.length === 0) {
        return undefined;
    }
    
    return concept.tariffRanges.find(range => 
        tons >= range.minTons && 
        tons <= range.maxTons &&
        range.vehicleType.toUpperCase() === vehicleType
    );
};

const getOperationLogisticsType = (isoDateString: string, horaInicio: string, horaFin: string, concept: ClientBillingConcept): "Diurno" | "Nocturno" | "Extra" | "N/A" => {
    if (concept.calculationType === 'OBSERVACION' || concept.calculationType === 'MANUAL') {
        return "N/A";
    }

    const specialConcepts = ["FMM DE INGRESO", "ARIN DE INGRESO", "FMM DE SALIDA", "ARIN DE SALIDA", "REESTIBADO"];
    if (specialConcepts.includes(concept.conceptName.toUpperCase())) {
      return "N/A";
    }
    
    if (!isoDateString || !horaInicio || !horaFin || concept.tariffType !== 'RANGOS' || !concept.dayShiftStart || !concept.dayShiftEnd) {
      return "N/A";
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
        return 'N/A';
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

    const manualOpsSnapshot = await firestore.collection('manual_client_operations')
        .where('clientName', '==', clientName)
        .where('operationDate', '>=', serverQueryStartDate)
        .where('operationDate', '<=', serverQueryEndDate)
        .get();

    const clientSubmissions = submissionsSnapshot.docs.filter(doc => {
        const docClientName = doc.data().formData?.cliente || doc.data().formData?.nombreCliente;
        return docClientName === clientName;
    });
    
    // Process form-based concepts
    clientSubmissions.forEach(doc => {
        const submission = serializeTimestamps(doc.data());
        const formData = submission.formData;
        const conceptsForClient = allConcepts.filter(c => c.clientNames.includes(clientName) || c.clientNames.includes('TODOS (Cualquier Cliente)'));

        conceptsForClient.forEach(concept => {
            if (concept.calculationType === 'REGLAS') {
                let opTypeMatch = false;
                if (concept.filterOperationType === 'ambos') opTypeMatch = true;
                else if (concept.filterOperationType === 'recepcion' && (submission.formType.includes('recepcion') || submission.formType.includes('reception'))) opTypeMatch = true;
                else if (concept.filterOperationType === 'despacho' && submission.formType.includes('despacho')) opTypeMatch = true;
                
                const prodTypeMatch = concept.filterProductType === 'ambos' || submission.formType.includes(concept.filterProductType);
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
        const conceptsForClient = allConcepts.filter(c => c.clientNames.includes(clientName) || c.clientNames.includes('TODOS (Cualquier Cliente)'));
        conceptsForClient.forEach(concept => {
            if (concept.calculationType === 'MANUAL' && concept.conceptName === opData.concept) {
                if (!applicableConcepts.has(concept.id)) {
                    applicableConcepts.set(concept.id, concept);
                }
            }
        });
    });
    
    const sortedConcepts = Array.from(applicableConcepts.values());
    sortedConcepts.sort((a, b) => a.conceptName.localeCompare(b.conceptName));
    return sortedConcepts;
}


export async function generateClientSettlement(criteria: ClientSettlementCriteria): Promise<ClientSettlementResult> {
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
        if (docClientName === clientName) {
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
    
    const operationsByDayAndContainer = allOperations
        .filter(op => op.type === 'form')
        .reduce((acc, op) => {
            const date = new Date(op.data.formData.fecha).toISOString().split('T')[0];
            const container = op.data.formData.contenedor || 'No aplica';
            const key = `${date}|${container}`;
            if (!acc[key]) {
                acc[key] = [];
            }
            acc[key].push(op.data);
            return acc;
        }, {} as Record<string, any[]>);

    for (const key in operationsByDayAndContainer) {
        const [date, container] = key.split('|');
        const dailyOperations = operationsByDayAndContainer[key];
        
        const allFormItems = dailyOperations.flatMap(op => {
          if(op.formType.startsWith('fixed')) return op.formData.productos || [];
          if(op.formData.placas?.length > 0) return op.formData.placas.flatMap((p: any) => p.items || []);
          if(op.formData.destinos?.length > 0) return op.formData.destinos.flatMap((d: any) => d.items || []);
          return op.formData.items || [];
        });
        
        let totalPaletas = 0;
        const uniquePallets = new Set<number>();
        allFormItems.forEach((item: any) => {
            if (Number(item.paleta) > 0) {
                uniquePallets.add(Number(item.paleta));
            } else if (Number(item.totalPaletas) > 0) {
                 totalPaletas += Number(item.totalPaletas);
            } else if (Number(item.paletas) > 0) { // Fallback for older fixed weight forms
                totalPaletas += Number(item.paletas);
            }
        });
        totalPaletas += uniquePallets.size;

        const firstProductCode = allFormItems[0]?.codigo;
        const camara = firstProductCode ? articleSessionMap.get(firstProductCode) || 'N/A' : 'N/A';
        const pedidoSislog = [...new Set(dailyOperations.map(op => op.formData.pedidoSislog))].join(', ');

        for (const concept of selectedConcepts) {
            if (concept.calculationType !== 'REGLAS') continue;
            
            let quantity = 0;
            let unitValue = 0;
            let operacionLogistica: string = 'N/A';
            let vehicleTypeForReport = 'N/A';
            let conceptHandled = false;
            
            const applicableOperations = dailyOperations.filter(op => {
                let opTypeMatch = false;
                if (concept.filterOperationType === 'ambos') opTypeMatch = true;
                else if (concept.filterOperationType === 'recepcion' && (op.formType.includes('recepcion') || op.formType.includes('reception'))) opTypeMatch = true;
                else if (concept.filterOperationType === 'despacho' && op.formType.includes('despacho')) opTypeMatch = true;
                
                const prodTypeMatch = concept.filterProductType === 'ambos' || op.formType.includes(concept.filterProductType);
                return opTypeMatch && prodTypeMatch;
            });

            if (applicableOperations.length > 0) {
                 switch (concept.calculationBase) {
                    case 'TONELADAS': quantity = applicableOperations.reduce((sum, op) => sum + ((op.formData.totalPesoKg ?? op.formData.totalPesoBrutoKg) || 0), 0) / 1000; break;
                    case 'KILOGRAMOS': quantity = applicableOperations.reduce((sum, op) => sum + ((op.formData.totalPesoKg ?? op.formData.totalPesoBrutoKg) || 0), 0); break;
                    case 'CANTIDAD_PALETAS': quantity = totalPaletas; break;
                    case 'CANTIDAD_CAJAS': quantity = applicableOperations.reduce((sum, op) => sum + (op.formData.productos?.reduce((pSum: number, p: any) => pSum + (Number(p.cajas) || 0), 0) || 0), 0); break;
                    case 'NUMERO_OPERACIONES': quantity = applicableOperations.length; break;
                    case 'NUMERO_CONTENEDORES': quantity = 1; break;
                    default: quantity = 0;
                }

                if (quantity > 0) {
                    conceptHandled = true;
                    if (concept.tariffType === 'UNICA') {
                        unitValue = concept.value || 0;
                        operacionLogistica = 'N/A';
                    } else if (concept.tariffType === 'RANGOS') {
                        const totalTons = applicableOperations.reduce((sum, op) => sum + ((op.formData.totalPesoKg ?? op.formData.totalPesoBrutoKg) || 0), 0) / 1000;
                        const vehicleType = container !== 'No aplica' ? 'CONTENEDOR' : 'TURBO';
                        vehicleTypeForReport = vehicleType;
                        
                        const matchingTariff = findMatchingTariff(totalTons, vehicleType, concept);
                        
                        if (matchingTariff) {
                            const firstOp = applicableOperations[0];
                            const opLogisticType = getOperationLogisticsType(firstOp.formData.fecha, firstOp.formData.horaInicio, firstOp.formData.horaFin, concept);
                            unitValue = opLogisticType === 'Diurno' ? matchingTariff.dayTariff : matchingTariff.nightTariff;
                            operacionLogistica = opLogisticType;
                        } else {
                            unitValue = concept.value || 0;
                            operacionLogistica = 'N/A';
                        }
                    }
                }
            }

            if (conceptHandled && quantity > 0) {
                settlementRows.push({
                    date,
                    container,
                    camara,
                    totalPaletas,
                    operacionLogistica,
                    pedidoSislog,
                    conceptName: concept.conceptName,
                    tipoVehiculo: (concept.conceptName === 'OPERACIÓN CARGUE' || concept.conceptName === 'OPERACIÓN DESCARGUE') ? vehicleTypeForReport : 'N/A',
                    quantity,
                    unitOfMeasure: concept.unitOfMeasure,
                    unitValue: unitValue,
                    totalValue: quantity * unitValue,
                });
            }
        }
    }
    
    const observationConcepts = selectedConcepts.filter(c => c.calculationType === 'OBSERVACION');
    if (observationConcepts.length > 0) {
        const opsWithObservations = allOperations.filter(op => op.type === 'form' && Array.isArray(op.data.formData.observaciones) && op.data.formData.observaciones.length > 0);
        
        for (const concept of observationConcepts) {
            const relevantOps = opsWithObservations.filter(op =>
                (op.data.formData.observaciones as any[]).some(obs => obs.type === concept.associatedObservation)
            );
            
            if (relevantOps.length > 0) {
                const totalQuantity = relevantOps.reduce((sum, op) => {
                    const obs = (op.data.formData.observaciones as any[]).find(o => o.type === concept.associatedObservation);
                    return sum + (Number(obs?.quantity) || 0);
                }, 0);
                
                if (totalQuantity > 0) {
                    settlementRows.push({
                        date: startDate,
                        container: 'N/A',
                        camara: 'N/A',
                        totalPaletas: 0,
                        operacionLogistica: 'N/A',
                        pedidoSislog: 'Por Observación',
                        conceptName: concept.conceptName,
                        tipoVehiculo: 'N/A',
                        quantity: totalQuantity,
                        unitOfMeasure: concept.unitOfMeasure,
                        unitValue: concept.value || 0,
                        totalValue: totalQuantity * (concept.value || 0),
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
                    const date = new Date(opData.operationDate).toISOString().split('T')[0];
                    const numPersonas = Number(opData.numeroPersonas) || 1;

                    if (concept.tariffType === 'ESPECIFICA' && Array.isArray(opData.specificTariffs) && opData.specificTariffs.length > 0) {
                        opData.specificTariffs.forEach((appliedTariff: { tariffId: string, quantity: number }) => {
                            const specificTariff = concept.specificTariffs?.find(t => t.id === appliedTariff.tariffId);
                            if (specificTariff) {
                                let totalValue = 0;
                                let quantityForReport = appliedTariff.quantity;

                                if (specificTariff.unit === 'HORA') {
                                    totalValue = (appliedTariff.quantity || 0) * (specificTariff.value || 0) * numPersonas;
                                } else {
                                    totalValue = (specificTariff.value || 0) * numPersonas;
                                    quantityForReport = numPersonas; // For per-unit tariffs, quantity is the number of people
                                }

                                settlementRows.push({
                                    date,
                                    container: opData.details?.container || 'Manual',
                                    totalPaletas: opData.details?.totalPallets || 0,
                                    camara: 'N/A',
                                    operacionLogistica: 'N/A',
                                    pedidoSislog: `Manual (${specificTariff.name})`,
                                    conceptName: concept.conceptName,
                                    tipoVehiculo: 'N/A',
                                    quantity: quantityForReport,
                                    unitOfMeasure: specificTariff.unit,
                                    unitValue: specificTariff.value || 0,
                                    totalValue: totalValue,
                                });
                            }
                        });
                    } else if (concept.tariffType === 'UNICA') {
                         settlementRows.push({
                            date,
                            container: opData.details?.container || 'Manual',
                            totalPaletas: opData.details?.totalPallets || 0,
                            camara: 'N/A',
                            operacionLogistica: 'N/A',
                            pedidoSislog: 'Manual',
                            conceptName: concept.conceptName,
                            tipoVehiculo: 'N/A',
                            quantity: opData.quantity || 0,
                            unitOfMeasure: concept.unitOfMeasure,
                            unitValue: concept.value || 0,
                            totalValue: (opData.quantity || 0) * (concept.value || 0),
                        });
                    }
                }
            });
        }
    }

    settlementRows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || a.conceptName.localeCompare(b.conceptName));
    
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
