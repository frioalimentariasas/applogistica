
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
    needsIndex?: boolean;
    indexCreationLink?: string;
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
    
    const results: ClientSettlementRow[] = [];

    for (const concept of selectedConcepts) {
      let quantity = 0;
      
      const applicableOperations = allOperations.filter(op => {
        let opTypeMatch = false;
        if (concept.filterOperationType === 'ambos') opTypeMatch = true;
        else if (concept.filterOperationType === 'recepcion' && op.tipoOperacion === 'Recepción') opTypeMatch = true;
        else if (concept.filterOperationType === 'despacho' && op.tipoOperacion === 'Despacho') opTypeMatch = true;
        
        const prodTypeMatch = concept.filterProductType === 'ambos';

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

      manualOpsSnapshot.docs.forEach(doc => {
        const manualOp = doc.data();
        if (manualOp.concept === concept.conceptName) {
          quantity += Number(manualOp.quantity) || 0;
        }
      });

      if (quantity > 0) {
        let unitValue = 0;
        if (concept.tariffType === 'UNICA') {
          unitValue = concept.value || 0;
        } else {
          unitValue = concept.tariffRanges?.[0]?.dayTariff || 0;
        }
        
        results.push({
          conceptName: concept.conceptName,
          quantity,
          unitOfMeasure: concept.unitOfMeasure,
          unitValue: unitValue,
          totalValue: quantity * unitValue,
        });
      }
    }
    
    results.sort((a, b) => a.conceptName.localeCompare(b.conceptName));
    return { success: true, data: results };

  } catch (error: any) {
    console.error('Error in generateClientSettlement:', error);

    if (error instanceof Error && error.message.includes('requires an index')) {
      return {
        success: false,
        error: error.message,
      };
    }
    
    return { success: false, error: error.message || 'Ocurrió un error desconocido en el servidor.' };
  }
}
