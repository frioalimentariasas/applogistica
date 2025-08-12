'use server';

import { firestore } from '@/lib/firebase-admin';
import { getBillingReport } from './billing-report';
import { getInventoryReport } from './inventory-report';

export interface ConsolidatedReportCriteria {
  clientName: string;
  startDate: string;
  endDate: string;
  sesion: string;
}

export interface ConsolidatedReportRow {
  date: string;
  paletasRecibidas: number;
  paletasDespachadas: number;
  inventarioFinalDia: number;
}

export async function getConsolidatedMovementReport(
  criteria: ConsolidatedReportCriteria
): Promise<ConsolidatedReportRow[]> {
  if (!firestore) {
    throw new Error('El servidor no está configurado correctamente.');
  }
  if (!criteria.clientName || !criteria.sesion || !criteria.startDate || !criteria.endDate) {
    throw new Error('Se requieren el cliente, la sesión y un rango de fechas.');
  }

  // 1. Get daily movements (received and dispatched)
  // Pass session criteria to billing report
  const billingData = await getBillingReport({
    clientName: criteria.clientName,
    startDate: criteria.startDate,
    endDate: criteria.endDate,
    sesion: criteria.sesion as any,
  });

  // 2. Get daily inventory stock
  const inventoryData = await getInventoryReport({
    clientNames: [criteria.clientName],
    startDate: criteria.startDate,
    endDate: criteria.endDate,
    sesion: criteria.sesion,
  });

  // 3. Combine the data
  const consolidatedMap = new Map<string, ConsolidatedReportRow>();
  const allDates = new Set<string>();

  billingData.forEach(item => {
    allDates.add(item.date);
    consolidatedMap.set(item.date, {
      date: item.date,
      paletasRecibidas: item.paletasRecibidas,
      paletasDespachadas: item.paletasDespachadas,
      inventarioFinalDia: 0, // Default value
    });
  });

  inventoryData.rows.forEach(item => {
    allDates.add(item.date);
    const existingEntry = consolidatedMap.get(item.date);
    const inventoryCount = item.clientData[criteria.clientName] || 0;
    if (existingEntry) {
      existingEntry.inventarioFinalDia = inventoryCount;
    } else {
      consolidatedMap.set(item.date, {
        date: item.date,
        paletasRecibidas: 0,
        paletasDespachadas: 0,
        inventarioFinalDia: inventoryCount,
      });
    }
  });

  const consolidatedReport = Array.from(consolidatedMap.values());
  
  // Sort the final report by date ascending
  consolidatedReport.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return consolidatedReport;
}
