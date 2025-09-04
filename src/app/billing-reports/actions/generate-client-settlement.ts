
'use server';

import { firestore } from '@/lib/firebase-admin';
import type { ClientBillingConcept } from '@/app/gestion-conceptos-liquidacion-clientes/actions';
import { getBillingReport } from '@/app/actions/billing-report';
import { getInventoryReport } from '@/app/actions/inventory-report';

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

export async function generateClientSettlement(criteria: ClientSettlementCriteria): Promise<ClientSettlementRow[]> {
  if (!firestore) {
    throw new Error('El servidor no está configurado correctamente.');
  }

  const { clientName, startDate, endDate, conceptIds } = criteria;
  if (!clientName || !startDate || !endDate || conceptIds.length === 0) {
    throw new Error('Faltan criterios para la liquidación.');
  }

  // 1. Fetch all concept definitions needed for the settlement
  const conceptsSnapshot = await firestore.collection('client_billing_concepts').get();
  const allConcepts = conceptsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as (ClientBillingConcept & {id: string})[];
  const selectedConcepts = allConcepts.filter(c => conceptIds.includes(c.id));

  const results: ClientSettlementRow[] = [];

  for (const concept of selectedConcepts) {
    let quantity = 0;
    
    // LOGIC PER CONCEPT
    switch (concept.conceptName) {
      case 'POSICION ESTIBA DIA':
        // This requires inventory data
        const inventoryReport = await getInventoryReport({
          clientNames: [clientName],
          startDate,
          endDate,
        });
        quantity = inventoryReport.rows.reduce((total, day) => total + (day.clientData[clientName] || 0), 0);
        break;
      
      case 'CARGUE PALETAS':
        const dispatchReport = await getBillingReport({ clientName, startDate, endDate, tipoOperacion: 'despacho' });
        quantity = dispatchReport.reduce((total, day) => total + day.paletasDespachadas, 0);
        break;
        
      case 'DESCARGUE PALETAS':
        const receptionReport = await getBillingReport({ clientName, startDate, endDate, tipoOperacion: 'recepcion' });
        quantity = receptionReport.reduce((total, day) => total + day.paletasRecibidas, 0);
        break;
      
      // Handle manual operations
      default:
        const manualOpsSnapshot = await firestore.collection('manual_client_operations')
            .where('clientName', '==', clientName)
            .where('concept', '==', concept.conceptName)
            .where('operationDate', '>=', new Date(startDate))
            .where('operationDate', '<=', new Date(endDate))
            .get();
        
        quantity = manualOpsSnapshot.docs.reduce((total, doc) => total + (Number(doc.data().quantity) || 0), 0);
        break;
    }

    if (quantity > 0) {
      results.push({
        conceptName: concept.conceptName,
        quantity,
        unitOfMeasure: concept.unitOfMeasure,
        unitValue: concept.value,
        totalValue: quantity * concept.value,
      });
    }
  }

  return results.sort((a, b) => a.conceptName.localeCompare(b.conceptName));
}
