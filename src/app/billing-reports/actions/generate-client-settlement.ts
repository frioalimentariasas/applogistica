
'use server';

import { firestore } from '@/lib/firebase-admin';
import type { ClientBillingConcept } from '@/app/gestion-conceptos-liquidacion-clientes/actions';
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
}

export interface ClientSettlementRow {
  date: string;
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


export async function generateClientSettlement(criteria: ClientSettlementCriteria): Promise<ClientSettlementResult> {
  if (!firestore) {
    return { success: false, error: 'El servidor no está configurado correctamente.' };
  }

  const { clientName, startDate, endDate, conceptIds } = criteria;
  if (!clientName || !startDate || !endDate || conceptIds.length === 0) {
    return { success: false, error: 'Faltan criterios para la liquidación.' };
  }

  try {
    const conceptsSnapshot = await firestore.collection('client_billing_concepts').get();
    const allConcepts = conceptsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as (ClientBillingConcept & {id: string})[];
    const selectedConcepts = allConcepts.filter(c => conceptIds.includes(c.id));

    const allOperations = await getDetailedReport({ clientName, startDate, endDate });

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
    
    // Group automatic operations by day
    const operationsByDay = allOperations.reduce((acc, op) => {
        const date = getLocalGroupingDate(op.fecha);
        if (!acc[date]) {
            acc[date] = [];
        }
        acc[date].push(op);
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


    // Iterate over each day in the grouped operations
    for (const date in operationsByDay) {
      if (!resultsByDay.has(date)) {
        resultsByDay.set(date, []);
      }
      const dailyResults = resultsByDay.get(date)!;
      const dailyOperations = operationsByDay[date];

      for (const concept of selectedConcepts) {
        let quantity = 0;
        
        const applicableOperations = dailyOperations.filter(op => {
          let opTypeMatch = false;
          if (concept.filterOperationType === 'ambos') opTypeMatch = true;
          else if (concept.filterOperationType === 'recepcion' && op.tipoOperacion === 'Recepción') opTypeMatch = true;
          else if (concept.filterOperationType === 'despacho' && op.tipoOperacion === 'Despacho') opTypeMatch = true;
          
          const prodTypeMatch = concept.filterProductType === 'ambos'; // Simplified, needs more logic if we add fijo/variable filters
          return opTypeMatch && prodTypeMatch;
        });

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
                const uniqueContainers = new Set(applicableOperations.map(op => op.contenedor).filter(Boolean));
                quantity = uniqueContainers.size;
                break;
            default:
                quantity = 0;
        }

        if (quantity > 0) {
            let unitValue = 0;
            if (concept.tariffType === 'UNICA') {
              unitValue = concept.value || 0;
            } else {
              // This is a simplified tariff logic. More complex logic can be added here.
              unitValue = concept.tariffRanges?.[0]?.dayTariff || 0;
            }

            dailyResults.push({
              date,
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
