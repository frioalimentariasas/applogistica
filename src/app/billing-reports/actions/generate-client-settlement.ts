

'use server';

import { firestore } from '@/lib/firebase-admin';
import type { ClientBillingConcept } from '@/app/gestion-conceptos-liquidacion-clientes/actions';
import { DetailedReportRow, getDetailedReport } from '@/app/actions/detailed-report';
import admin from 'firebase-admin';

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


export async function generateClientSettlement(criteria: ClientSettlementCriteria): Promise<ClientSettlementRow[]> {
  if (!firestore) {
    throw new Error('El servidor no está configurado correctamente.');
  }

  const { clientName, startDate, endDate, conceptIds } = criteria;
  if (!clientName || !startDate || !endDate || conceptIds.length === 0) {
    throw new Error('Faltan criterios para la liquidación.');
  }

  try {
    // 1. Fetch all concept definitions needed for the settlement
    const conceptsSnapshot = await firestore.collection('client_billing_concepts').get();
    const allConcepts = conceptsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as (ClientBillingConcept & {id: string})[];
    const selectedConcepts = allConcepts.filter(c => conceptIds.includes(c.id));

    // 2. Fetch all operations for the client in the date range
    const allOperations = await getDetailedReport({
      clientName,
      startDate,
      endDate
    });

    const manualOpsSnapshot = await firestore.collection('manual_client_operations')
        .where('clientName', '==', clientName)
        .where('operationDate', '>=', new Date(startDate))
        .where('operationDate', '<=', new Date(endDate))
        .get();
    
    const results: ClientSettlementRow[] = [];

    for (const concept of selectedConcepts) {
      let quantity = 0;
      
      // --- Step 3a: Filter operations from standard forms ---
      const applicableOperations = allOperations.filter(op => {
        let opTypeMatch = false;
        if (concept.filterOperationType === 'ambos') opTypeMatch = true;
        else if (concept.filterOperationType === 'recepcion' && op.tipoOperacion === 'Recepción') opTypeMatch = true;
        else if (concept.filterOperationType === 'despacho' && op.tipoOperacion === 'Despacho') opTypeMatch = true;
        
        // For now, product type is not a field in the detailed report, so we assume 'ambos' matches everything.
        // This can be enhanced if productType is added to DetailedReportRow.
        const prodTypeMatch = concept.filterProductType === 'ambos';

        return opTypeMatch && prodTypeMatch;
      });

      // --- Step 3b: Calculate the base quantity from standard forms ---
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

      // --- Step 3c: Add quantities from manual operations ---
      manualOpsSnapshot.docs.forEach(doc => {
        const manualOp = doc.data();
        if (manualOp.concept === concept.conceptName) {
          quantity += Number(manualOp.quantity) || 0;
        }
      });

      if (quantity > 0) {
        // Step 4: Apply tariff (Simplified for now, will add range/turn logic next)
        let unitValue = 0;
        if (concept.tariffType === 'UNICA') {
          unitValue = concept.value || 0;
        } else {
          // TODO: Implement complex tariff logic for ranges and turns
          // For now, we'll use the first day tariff as a placeholder
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

    return results.sort((a, b) => a.conceptName.localeCompare(b.conceptName));

  } catch (error) {
    console.error('Error generating client settlement:', error);
    if (error instanceof Error && (error.message.includes('requires an index') || error.message.includes('needs an index'))) {
        throw error;
    }
    throw new Error('No se pudo generar la liquidación del cliente.');
  }
}
