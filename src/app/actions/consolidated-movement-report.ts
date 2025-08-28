
'use server';

import { firestore } from '@/lib/firebase-admin';
import { getBillingReport } from './billing-report';
import { getInventoryReport, getLatestStockBeforeDate } from './inventory-report';
import { subDays, format, addDays, parseISO } from 'date-fns';


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

  // 3. Get initial stock from the day before the *report's start date*.
  const reportStartDate = parseISO(criteria.startDate);
  const dayBeforeReport = subDays(reportStartDate, 1);
  const dayBeforeReportStr = format(dayBeforeReport, 'yyyy-MM-dd');
  
  const saldoInicial = await getLatestStockBeforeDate(
    criteria.clientName,
    dayBeforeReportStr,
    criteria.sesion
  );

  // 4. Combine and process the data into a map
  const consolidatedMap = new Map<string, Omit<ConsolidatedReportRow, 'date'>>();
  
  billingData.forEach(item => {
    if (!consolidatedMap.has(item.date)) {
        consolidatedMap.set(item.date, { paletasRecibidas: 0, paletasDespachadas: 0, inventarioAcumulado: 0, posicionesAlmacenadas: 0 });
    }
    const entry = consolidatedMap.get(item.date)!;
    entry.paletasRecibidas = item.paletasRecibidas;
    entry.paletasDespachadas = item.paletasDespachadas;
  });

  inventoryData.rows.forEach(item => {
    const inventoryCount = item.clientData[criteria.clientName] || 0;
    if (!consolidatedMap.has(item.date)) {
        consolidatedMap.set(item.date, { paletasRecibidas: 0, paletasDespachadas: 0, inventarioAcumulado: 0, posicionesAlmacenadas: 0 });
    }
    consolidatedMap.get(item.date)!.inventarioAcumulado = inventoryCount;
  });


  // 5. Generate date range for the report to fill in missing days, using the filter dates.
  const fullDateRange: string[] = [];
  let currentDate = reportStartDate;
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
