'use server';

import admin from 'firebase-admin';
import { firestore } from '@/lib/firebase-admin';
import { getBillingReport } from './billing-report';
import { subDays, format, addDays, parseISO } from 'date-fns';
import type { ClientInventoryDetail } from './inventory-report';


export interface ConsolidatedReportCriteria {
  clientName: string;
  startDate: string;
  endDate: string;
  sesion: 'CO' | 'RE' | 'SE'; // Keep session here as the final report is for ONE session
  filterByArticleCodes?: string;
  excludeArticleCodes?: boolean;
}

export interface ConsolidatedReportRow {
  date: string;
  paletasRecibidas: number;
  paletasDespachadas: number;
  inventarioAcumulado: number | ClientInventoryDetail; // Can be a number or the detailed object
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
  
  const filterIdentifiers = criteria.filterByArticleCodes?.split(',').map(c => c.trim().toLowerCase()).filter(Boolean);

  // 1. Get daily movements for the specified client, but for ALL sessions to calculate the base saldo.
  const billingData = await getBillingReport({
    clientName: criteria.clientName,
    startDate: criteria.startDate,
    endDate: criteria.endDate,
  });

  // 2. Get daily inventory stock for the period for the specific session
  const inventorySnapshot = await firestore.collection('dailyInventories')
      .where(admin.firestore.FieldPath.documentId(), '>=', criteria.startDate)
      .where(admin.firestore.FieldPath.documentId(), '<=', criteria.endDate)
      .get();
  
  const detailedInventoryByDate = new Map<string, any[]>();
  inventorySnapshot.forEach(doc => {
      if (doc.data()?.data) {
        detailedInventoryByDate.set(doc.id, doc.data().data);
      }
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
        
          let relevantRows = (inventoryDay.data as any[]).filter(row => 
            row && row.PROPIETARIO && typeof row.PROPIETARIO === 'string' &&
            row.PROPIETARIO.trim() === criteria.clientName
        );

            // Filter by session
            if (criteria.sesion && criteria.sesion.trim() && criteria.sesion !== 'TODAS') {
                relevantRows = relevantRows.filter(row => 
                    row && row.SE !== undefined && row.SE !== null &&
                    String(row.SE).trim().toLowerCase() === criteria.sesion.trim().toLowerCase()
                );
            }
            
            // This part was flawed. Now we correctly count unique pallets for the initial balance.
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
  
  // 4. Populate map with movements for the SELECTED session from the comprehensive billing data
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

  const fullDateRange: string[] = [];
  let currentDate = parseISO(criteria.startDate);
  const reportEndDate = parseISO(criteria.endDate);
  while(currentDate <= reportEndDate) {
      fullDateRange.push(format(currentDate, 'yyyy-MM-dd'));
      currentDate = addDays(currentDate, 1);
  }

  // 5. Calculate rolling balance for "Posiciones Almacenadas"
  const consolidatedReport: ConsolidatedReportRow[] = [];
  let posicionesDiaAnterior = saldoInicial;

  for (const dateStr of fullDateRange) {
      const dataForDay = consolidatedMap.get(dateStr);
      let recibidasHoy = dataForDay?.paletasRecibidas || 0;
      const despachadasHoy = dataForDay?.paletasDespachadas || 0;
      
      const posicionesAlmacenadas = posicionesDiaAnterior + recibidasHoy - despachadasHoy;

      // START OF CORRECTION LOGIC
      let finalPosicionesAlmacenadas = posicionesAlmacenadas;
      let finalInventarioAcumulado = 0;

      const dailyInventory = detailedInventoryByDate.get(dateStr) || [];
      
      let relevantRowsForDay = dailyInventory.filter(row => 
          row && row.PROPIETARIO && typeof row.PROPIETARIO === 'string' &&
          row.PROPIETARIO.trim() === criteria.clientName &&
          row && row.SE !== undefined && row.SE !== null &&
          String(row.SE).trim().toLowerCase() === criteria.sesion.trim().toLowerCase()
      );

      if (filterIdentifiers && filterIdentifiers.length > 0) {
        const filteredInventoryRows = relevantRowsForDay.filter(row => {
          const articleCode = String(row.ARTICUL || '').trim();
          let finalArticleCode = articleCode;
          if (row.DENOMINACION && typeof row.DENOMINACION === 'string' && row.DENOMINACION.toUpperCase().includes('PAPA PREFRITAS CONGELADAS') && articleCode === '3') {
            finalArticleCode = '03';
          }
          const description = String(row.DENOMINACION || '').trim().toLowerCase();
          
          const identifierMatch = filterIdentifiers.some(id => 
            id === finalArticleCode.toLowerCase() || id === description
          );
          return criteria.excludeArticleCodes ? !identifierMatch : identifierMatch;
        });

        const uniquePallets = new Set<string>();
        filteredInventoryRows.forEach((row: any) => {
            if (row.PALETA !== undefined && row.PALETA !== null) {
                uniquePallets.add(String(row.PALETA).trim());
            }
        });

        // Use the count of filtered pallets, but don't let it exceed the calculated historical balance
        finalPosicionesAlmacenadas = Math.min(posicionesAlmacenadas, uniquePallets.size);
        finalInventarioAcumulado = uniquePallets.size;

      } else {
        // If no filter, the 'inventarioAcumulado' is the count of all unique pallets for that client/session
        const uniquePalletsTotal = new Set<string>();
        relevantRowsForDay.forEach((row: any) => {
            if (row.PALETA !== undefined && row.PALETA !== null) {
                uniquePalletsTotal.add(String(row.PALETA).trim());
            }
        });
        finalInventarioAcumulado = uniquePalletsTotal.size;
      }
      // END OF CORRECTION LOGIC


      consolidatedReport.push({
          date: dateStr,
          paletasRecibidas: recibidasHoy,
          paletasDespachadas: despachadasHoy,
          inventarioAcumulado: finalInventarioAcumulado,
          posicionesAlmacenadas: finalPosicionesAlmacenadas,
      });

      posicionesDiaAnterior = posicionesAlmacenadas;
  }

  return consolidatedReport;
}
    