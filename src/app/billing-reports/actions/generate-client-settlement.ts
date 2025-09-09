

'use server';

import { firestore } from '@/lib/firebase-admin';
import type { ClientBillingConcept, TariffRange } from '@/app/gestion-conceptos-liquidacion-clientes/actions';
import { DetailedReportRow, getDetailedReport } from '@/app/actions/detailed-report';
import admin from 'firebase-admin';
import { endOfDay } from 'date-fns';


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


export async function generateClientSettlement(criteria: ClientSettlementCriteria): Promise<ClientSettlementResult> {
  if (!firestore) {
    return { success: false, error: 'El servidor no está configurado correctamente.' };
  }

  const { clientName, startDate, endDate, conceptIds, containerNumber } = criteria;
  if (!clientName || !startDate || !endDate || conceptIds.length === 0) {
    return { success: false, error: 'Faltan criterios para la liquidación.' };
  }

  try {
    const conceptsSnapshot = await firestore.collection('client_billing_concepts').get();
    const allConcepts = conceptsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as (ClientBillingConcept & {id: string})[];
    const selectedConcepts = allConcepts.filter(c => conceptIds.includes(c.id));

    const allOperations = await getDetailedReport({ clientName, startDate, endDate, containerNumber });
    
    const settlementRows: ClientSettlementRow[] = [];

    // Group form operations by day and container
    const operationsByDayAndContainer = allOperations.reduce((acc, op) => {
        const date = new Date(op.fecha).toISOString().split('T')[0];
        const container = op.contenedor || 'No aplica';
        const key = `${date}|${container}`;
        if (!acc[key]) {
            acc[key] = [];
        }
        acc[key].push(op);
        return acc;
    }, {} as Record<string, DetailedReportRow[]>);

    // Process regular form operations
    for (const key in operationsByDayAndContainer) {
        const [date, container] = key.split('|');
        const dailyOperations = operationsByDayAndContainer[key];
        const camara = dailyOperations[0]?.sesion || 'N/A';
        const totalPaletas = dailyOperations.reduce((sum, op) => sum + (op.totalPaletas || 0), 0);
        const pedidoSislog = [...new Set(dailyOperations.map(op => op.pedidoSislog))].join(', ');

        for (const concept of selectedConcepts) {
            // Skip manual and observation concepts for now, they are handled separately
            if (concept.calculationType !== 'REGLAS') continue;
            
            let quantity = 0;
            let unitValue = 0;
            let operacionLogistica: string = 'N/A';
            let conceptHandled = false;
            
            const applicableOperations = dailyOperations.filter(op => {
                let opTypeMatch = false;
                if (concept.filterOperationType === 'ambos') opTypeMatch = true;
                else if (concept.filterOperationType === 'recepcion' && op.tipoOperacion === 'Recepción') opTypeMatch = true;
                else if (concept.filterOperationType === 'despacho' && op.tipoOperacion === 'Despacho') opTypeMatch = true;
                
                const prodTypeMatch = concept.filterProductType === 'ambos' || op.tipoProducto.toLowerCase().includes(concept.filterProductType);
                return opTypeMatch && prodTypeMatch;
            });

            if (applicableOperations.length > 0) {
                switch (concept.calculationBase) {
                    case 'TONELADAS': quantity = applicableOperations.reduce((sum, op) => sum + (op.totalPesoKg || 0), 0) / 1000; break;
                    case 'KILOGRAMOS': quantity = applicableOperations.reduce((sum, op) => sum + (op.totalPesoKg || 0), 0); break;
                    case 'CANTIDAD_PALETAS': quantity = applicableOperations.reduce((sum, op) => sum + (op.totalPaletas || 0), 0); break;
                    case 'CANTIDAD_CAJAS': quantity = applicableOperations.reduce((sum, op) => sum + (op.totalCantidad || 0), 0); break;
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
                        const totalTons = applicableOperations.reduce((sum, op) => sum + (op.totalPesoKg || 0), 0) / 1000;
                        const vehicleType = container !== 'No aplica' ? 'CONTENEDOR' : 'TURBO';
                        
                        const matchingTariff = findMatchingTariff(totalTons, vehicleType, concept);
                        
                        if (matchingTariff) {
                            const firstOp = applicableOperations[0];
                            const opLogisticType = getOperationLogisticsType(firstOp.fecha, firstOp.horaInicio, firstOp.horaFin, concept);
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
                    quantity,
                    unitOfMeasure: concept.unitOfMeasure,
                    unitValue: unitValue,
                    totalValue: quantity * unitValue,
                });
            }
        }
    }
    
    // Process concepts based on Observations
    const observationConcepts = selectedConcepts.filter(c => c.calculationType === 'OBSERVACION');
    if (observationConcepts.length > 0) {
        const opsWithObservations = allOperations.filter(op => Array.isArray(op.observaciones) && op.observaciones.length > 0);
        
        for (const concept of observationConcepts) {
            const relevantOps = opsWithObservations.filter(op =>
                (op.observaciones as any[]).some(obs => obs.type === concept.associatedObservation)
            );
            
            if (relevantOps.length > 0) {
                const totalQuantity = relevantOps.reduce((sum, op) => {
                    const obs = (op.observaciones as any[]).find(o => o.type === concept.associatedObservation);
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
                        quantity: totalQuantity,
                        unitOfMeasure: concept.unitOfMeasure,
                        unitValue: concept.value || 0,
                        totalValue: totalQuantity * (concept.value || 0),
                    });
                }
            }
        }
    }


    // Process manual operations separately
    const manualConcepts = selectedConcepts.filter(c => c.calculationType === 'MANUAL');
    if (manualConcepts.length > 0) {
        const finalEndDate = endOfDay(new Date(endDate)); // Ensure we get the full end day

        const manualOpsSnapshot = await firestore.collection('manual_client_operations')
            .where('clientName', '==', clientName)
            .where('operationDate', '>=', new Date(startDate))
            .where('operationDate', '<=', finalEndDate) // Use end of day
            .get();

        manualOpsSnapshot.forEach(doc => {
            const op = doc.data() as any;
            const concept = manualConcepts.find(c => c.conceptName === op.concept);
            if (concept) {
                const date = new Date(op.operationDate.toDate()).toISOString().split('T')[0];
                const quantity = Number(op.quantity) || 0;
                let unitValue = 0;
                let operacionLogistica: string = 'N/A';
                
                if (concept.tariffType === 'UNICA') {
                    unitValue = concept.value || 0;
                } else if (concept.tariffType === 'RANGOS' && op.details?.startTime && op.details?.endTime) {
                    const opLogisticType = getOperationLogisticsType(op.operationDate.toDate().toISOString(), op.details.startTime, op.details.endTime, concept);
                    const matchingTariff = concept.tariffRanges?.[0]; // Assuming one generic range for manual ops
                    if (matchingTariff) {
                        unitValue = opLogisticType === 'Diurno' ? matchingTariff.dayTariff : matchingTariff.nightTariff;
                    }
                    operacionLogistica = opLogisticType;
                }

                settlementRows.push({
                    date,
                    container: op.details?.container || 'Manual',
                    totalPaletas: op.details?.totalPallets || 0,
                    camara: 'N/A',
                    operacionLogistica,
                    pedidoSislog: 'Manual',
                    conceptName: concept.conceptName,
                    quantity,
                    unitOfMeasure: concept.unitOfMeasure,
                    unitValue: unitValue,
                    totalValue: quantity * unitValue,
                });
            }
        });
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
