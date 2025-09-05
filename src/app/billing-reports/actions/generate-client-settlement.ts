

'use server';

import { firestore } from '@/lib/firebase-admin';
import type { ClientBillingConcept, TariffRange } from '@/app/gestion-conceptos-liquidacion-clientes/actions';
import { DetailedReportRow, getDetailedReport } from '@/app/actions/detailed-report';
import admin from 'firebase-admin';


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

    const manualOpsSnapshot = await firestore.collection('manual_client_operations')
        .where('clientName', '==', clientName)
        .where('operationDate', '>=', new Date(startDate))
        .where('operationDate', '<=', new Date(endDate))
        .get();
    
    const resultsByDay = new Map<string, ClientSettlementRow[]>();

    const getLocalGroupingDate = (isoString: string): string => {
        if (!isoString) return '';
        const date = new Date(isoString);
        date.setUTCHours(date.getUTCHours() - 5);
        return date.toISOString().split('T')[0];
    };
    
    // Group automatic operations by day AND container
    const operationsByDayAndContainer = allOperations.reduce((acc, op) => {
        const date = getLocalGroupingDate(op.fecha);
        const container = op.contenedor || 'No aplica';
        const key = `${date}|${container}`;
        if (!acc[key]) {
            acc[key] = [];
        }
        acc[key].push(op);
        return acc;
    }, {} as Record<string, DetailedReportRow[]>);

    // Group manual operations by day
     const manualOpsByDay = manualOpsSnapshot.docs.reduce((acc, doc) => {
        const op = doc.data();
        const date = getLocalGroupingDate((op.operationDate as admin.firestore.Timestamp).toDate().toISOString());
        if (!acc[date]) {
            acc[date] = [];
        }
        acc[date].push(op);
        return acc;
    }, {} as Record<string, any[]>);


    // Iterate over each day/container group in the grouped operations
    for (const key in operationsByDayAndContainer) {
      const [date, container] = key.split('|');
      
      if (!resultsByDay.has(date)) {
        resultsByDay.set(date, []);
      }
      const dailyResults = resultsByDay.get(date)!;
      const dailyOperations = operationsByDayAndContainer[key];

      for (const concept of selectedConcepts) {
        let quantity = 0;
        let totalPallets = 0;
        
        const applicableOperations = dailyOperations.filter(op => {
          let opTypeMatch = false;
          if (concept.filterOperationType === 'ambos') opTypeMatch = true;
          else if (concept.filterOperationType === 'recepcion' && op.tipoOperacion === 'Recepción') opTypeMatch = true;
          else if (concept.filterOperationType === 'despacho' && op.tipoOperacion === 'Despacho') opTypeMatch = true;
          
          const prodTypeMatch = concept.filterProductType === 'ambos' || op.tipoProducto.toLowerCase().includes(concept.filterProductType);
          return opTypeMatch && prodTypeMatch;
        });
        
        if (applicableOperations.length === 0) continue;

        switch (concept.calculationBase) {
            case 'TONELADAS':
                quantity = applicableOperations.reduce((sum, op) => sum + (op.totalPesoKg || 0), 0) / 1000;
                break;
            case 'KILOGRAMOS':
                quantity = applicableOperations.reduce((sum, op) => sum + (op.totalPesoKg || 0), 0);
                break;
            case 'CANTIDAD_PALETAS':
                quantity = applicableOperations.reduce((sum, op) => sum + (op.totalPaletas || 0), 0);
                break;
            case 'CANTIDAD_CAJAS':
                quantity = applicableOperations.reduce((sum, op) => sum + (op.totalCantidad || 0), 0);
                break;
            case 'NUMERO_OPERACIONES':
                quantity = applicableOperations.length;
                break;
            case 'NUMERO_CONTENEDORES':
                // This logic is now per-container, so it will always be 1 if applicable
                quantity = 1;
                break;
            default:
                quantity = 0;
        }

        totalPallets = applicableOperations.reduce((sum, op) => sum + (op.totalPaletas || 0), 0);

        if (quantity > 0) {
            let unitValue = 0;
            if (concept.tariffType === 'UNICA') {
              unitValue = concept.value || 0;
            } else if (concept.tariffType === 'RANGOS') {
                const totalTons = applicableOperations.reduce((sum, op) => sum + (op.totalPesoKg || 0), 0) / 1000;
                const vehicleType = container !== 'No aplica' ? 'CONTENEDOR' : 'TURBO';
                
                const matchingTariff = findMatchingTariff(totalTons, vehicleType, concept);
                
                if (matchingTariff) {
                    // Placeholder for day/night logic. Defaulting to day tariff for now.
                    unitValue = matchingTariff.dayTariff;
                } else {
                    // Fallback if no range matches - could be 0 or a default value
                    unitValue = concept.value || 0;
                }
            }

            dailyResults.push({
              date,
              container,
              totalPaletas,
              conceptName: concept.conceptName,
              quantity,
              unitOfMeasure: concept.unitOfMeasure,
              unitValue: unitValue,
              totalValue: quantity * unitValue,
            });
        }
      }
    }
    
    // Add manual operations
     for (const date in manualOpsByDay) {
        if (!resultsByDay.has(date)) {
            resultsByDay.set(date, []);
        }
        const dailyResults = resultsByDay.get(date)!;
        const dailyManualOps = manualOpsByDay[date];

        for (const manualOp of dailyManualOps) {
             const concept = selectedConcepts.find(c => c.conceptName === manualOp.concept);
             if (concept) {
                const quantity = Number(manualOp.quantity) || 0;
                let unitValue = 0;
                if (concept.tariffType === 'UNICA') {
                  unitValue = concept.value || 0;
                } else {
                  unitValue = concept.tariffRanges?.[0]?.dayTariff || 0;
                }
                dailyResults.push({
                  date,
                  container: manualOp.details?.plate || 'Manual',
                  totalPaletas: 0, // Manual operations don't have pallets
                  conceptName: concept.conceptName,
                  quantity,
                  unitOfMeasure: concept.unitOfMeasure,
                  unitValue: unitValue,
                  totalValue: quantity * unitValue,
                });
             }
        }
    }

    const finalReport = Array.from(resultsByDay.values()).flat();
    finalReport.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || a.conceptName.localeCompare(b.conceptName));
    
    return { success: true, data: finalReport };

  } catch (error: any) {
    console.error('Error in generateClientSettlement:', error);

     if (error instanceof Error && error.message.includes('requires an index')) {
      throw error;
    }
    
    return { success: false, error: error.message || 'Ocurrió un error desconocido en el servidor.' };
  }
}

