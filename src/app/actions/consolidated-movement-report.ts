
'use server';

import { firestore } from '@/lib/firebase-admin';
import { getBillingReport } from './billing-report';
import { getInventoryReport, getLatestStockBeforeDate } from './inventory-report';
import { subDays, format } from 'date-fns';


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

  // 1. Get daily movements (received and dispatched)
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

  // 3. Get initial stock from the day before the report starts
  const firstDayOfReport = new Date(criteria.startDate);
  // Adjust for timezone when creating the date object
  const dayBeforeReport = subDays(new Date(firstDayOfReport.valueOf() + firstDayOfReport.getTimezoneOffset() * 60 * 1000), 1);
  const dayBeforeReportStr = format(dayBeforeReport, 'yyyy-MM-dd');
  
  const saldoInicial = await getLatestStockBeforeDate(
    criteria.clientName,
    dayBeforeReportStr,
    criteria.sesion
  );

  // 4. Combine and process the data
  const consolidatedMap = new Map<string, Omit<ConsolidatedReportRow, 'posicionesAlmacenadas' | 'date'>>();
  
  billingData.forEach(item => {
      consolidatedMap.set(item.date, {
          paletasRecibidas: item.paletasRecibidas,
          paletasDespachadas: item.paletasDespachadas,
          inventarioAcumulado: 0,
      });
  });

  inventoryData.rows.forEach(item => {
    const inventoryCount = item.clientData[criteria.clientName] || 0;
    const existingEntry = consolidatedMap.get(item.date);
    if (existingEntry) {
      existingEntry.inventarioAcumulado = inventoryCount;
    } else {
      consolidatedMap.set(item.date, {
        paletasRecibidas: 0,
        paletasDespachadas: 0,
        inventarioAcumulado: inventoryCount,
      });
    }
  });

  // 5. Generate date range for the report to fill in missing days
  const fullDateRange: string[] = [];
  let currentDate = new Date(criteria.startDate + 'T00:00:00-05:00'); // Use timezone offset
  const endDate = new Date(criteria.endDate + 'T00:00:00-05:00');
  while(currentDate <= endDate) {
      fullDateRange.push(format(currentDate, 'yyyy-MM-dd'));
      currentDate.setDate(currentDate.getDate() + 1);
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

  // Sort is already guaranteed by iterating through the date range
  return consolidatedReport;
}
