

'use server';

import admin from 'firebase-admin';
import { firestore } from '@/lib/firebase-admin';
import { getBillingReport } from './billing-report';
import { getInventoryReport } from './inventory-report';
import { subDays, format, addDays, parseISO } from 'date-fns';
import type { InventoryRow } from './inventory-report';


export interface ConsolidatedReportCriteria {
  clientName: string;
  startDate: string;
  endDate: string;
  sesion: 'CO' | 'RE' | 'SE'; // Keep session here as the final report is for ONE session
}

export interface ConsolidatedReportRow {
  date: string;
  paletasRecibidas: number;
  paletasDespachadas: number;
  inventarioAcumulado: number;
  posicionesAlmacenadas: number;
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

  // 1. Get daily movements for ALL sessions
  const billingData = await getBillingReport({
    clientName: criteria.clientName,
    startDate: criteria.startDate,
    endDate: criteria.endDate,
  });

  // 2. Get daily inventory stock for the period for the specific session
  const inventoryData = await getInventoryReport({
    clientNames: [criteria.clientName],
    startDate: criteria.startDate,
    endDate: criteria.endDate,
    sesion: criteria.sesion,
  });

  // 3. Get initial stock from the day before the report's start date for the specific session.
  let saldoInicial = 0;
  try {
    const reportStartDate = parseISO(criteria.startDate);
    const dayBeforeReport = subDays(reportStartDate, 1);
    const dayBeforeReportStr = format(dayBeforeReport, 'yyyy-MM-dd');
    
    const latestInventoryDoc = await firestore.collection('dailyInventories').doc(dayBeforeReportStr).get();

    if (latestInventoryDoc.exists) {
        const inventoryDay = latestInventoryDoc.data();
        if (inventoryDay && Array.isArray(inventoryDay.data)) {
            let relevantRows = (inventoryDay.data as InventoryRow[]).filter(row => 
                row?.PROPIETARIO?.trim() === criteria.clientName
            );

            // Filter by session
            if (criteria.sesion && criteria.sesion.trim() && criteria.sesion !== 'TODAS') {
                relevantRows = relevantRows.filter(row => 
                    row && row.SE !== undefined && row.SE !== null &&
                    String(row.SE).trim().toLowerCase() === criteria.sesion.trim().toLowerCase()
                );
            }

            const pallets = new Set<string>();
            relevantRows.forEach((row: any) => {
                if (row.PALETA !== undefined && row.PALETA !== null) {
                    pallets.add(String(row.PALETA).trim());
                }
            });
            saldoInicial = pallets.size;
        }
    }
  } catch (error) {
      console.error(`Error fetching latest stock for ${criteria.clientName} before ${criteria.startDate}:`, error);
      saldoInicial = 0;
  }

  const consolidatedMap = new Map<string, Omit<ConsolidatedReportRow, 'date'>>();
  
  // 4. Populate map with movements for the SELECTED session
  const recibidasKey = `paletasRecibidas${criteria.sesion}` as keyof typeof billingData[0];
  const despachadasKey = `paletasDespachadas${criteria.sesion}` as keyof typeof billingData[0];

  billingData.forEach(item => {
    if (!consolidatedMap.has(item.date)) {
        consolidatedMap.set(item.date, { paletasRecibidas: 0, paletasDespachadas: 0, inventarioAcumulado: 0, posicionesAlmacenadas: 0 });
    }
    const entry = consolidatedMap.get(item.date)!;
    entry.paletasRecibidas = (item[recibidasKey] as number) || 0;
    entry.paletasDespachadas = (item[despachadasKey] as number) || 0;
  });

  // 5. Populate map with inventory data for the SELECTED session
  inventoryData.rows.forEach(item => {
    const inventoryCount = item.clientData[criteria.clientName] || 0;
    if (!consolidatedMap.has(item.date)) {
        consolidatedMap.set(item.date, { paletasRecibidas: 0, paletasDespachadas: 0, inventarioAcumulado: 0, posicionesAlmacenadas: 0 });
    }
    consolidatedMap.get(item.date)!.inventarioAcumulado = inventoryCount;
  });

  const fullDateRange: string[] = [];
  let currentDate = parseISO(criteria.startDate);
  const reportEndDate = parseISO(criteria.endDate);
  while(currentDate <= reportEndDate) {
      fullDateRange.push(format(currentDate, 'yyyy-MM-dd'));
      currentDate = addDays(currentDate, 1);
  }

  // 6. Calculate rolling balance for "Posiciones Almacenadas"
  const consolidatedReport: ConsolidatedReportRow[] = [];
  let posicionesDiaAnterior = saldoInicial;

  for (const dateStr of fullDateRange) {
      const dataForDay = consolidatedMap.get(dateStr);
      const recibidasHoy = dataForDay?.paletasRecibidas || 0;
      const despachadasHoy = dataForDay?.paletasDespachadas || 0;
      const inventarioHoy = dataForDay?.inventarioAcumulado || 0;

      const posicionesAlmacenadas = posicionesDiaAnterior + recibidasHoy - despachadasHoy;

      consolidatedReport.push({
          date: dateStr,
          paletasRecibidas: recibidasHoy,
          paletasDespachadas: despachadasHoy,
          inventarioAcumulado: inventarioHoy,
          posicionesAlmacenadas: posicionesAlmacenadas,
      });

      posicionesDiaAnterior = posicionesAlmacenadas;
  }

  return consolidatedReport;
}
