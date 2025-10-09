
'use server';

import admin from 'firebase-admin';
import { firestore } from '@/lib/firebase-admin';
import { startOfDay, endOfDay, eachDayOfInterval, format, parseISO, addDays } from 'date-fns';

interface Movement {
    date: Date;
    type: 'recepcion' | 'despacho' | 'ingreso_saldos';
    pallets: number;
    description: string;
}

interface LotHistory {
    initialReception: {
        date: Date;
        pallets: number;
        grossWeight: number;
        pedidoSislog: string;
    };
    movements: Movement[];
}

interface DailyBalance {
    date: string;
    dayNumber: number;
    isGracePeriod: boolean;
    movementsDescription: string;
    initialBalance: number;
    finalBalance: number;
}

export interface AssistantReport {
    lotId: string;
    initialReception: LotHistory['initialReception'];
    dailyBalances: DailyBalance[];
}

export interface EligibleLot {
    lotId: string;
    receptionDate: string;
    pedidoSislog: string;
}


const serializeTimestamps = (data: any): any => {
    if (!data) return data;
    if (data instanceof admin.firestore.Timestamp) return data.toDate();
    if (Array.isArray(data)) return data.map(serializeTimestamps);
    if (typeof data === 'object') {
        const res: { [key: string]: any } = {};
        for (const key in data) {
            res[key] = serializeTimestamps(data[key]);
        }
        return res;
    }
    return data;
};

async function getLotHistory(lotId: string, startDate: string, endDate: string): Promise<LotHistory | null> {
    if (!firestore) throw new Error("Firestore not configured.");

    const clientName = "SMYL TRANSPORTE Y LOGISTICA SAS";

    // 1. Find the initial reception by querying all receptions for the client in the date range
    const submissionsRef = firestore.collection('submissions');
    const querySnapshot = await submissionsRef
        .where('formData.cliente', '==', clientName)
        .where('formType', 'in', ['variable-weight-reception', 'variable-weight-recepcion'])
        .where('formData.tipoPedido', '==', 'GENERICO')
        .where('formData.fecha', '>=', startOfDay(parseISO(startDate)))
        .where('formData.fecha', '<=', endOfDay(parseISO(endDate)))
        .get();

    let initialReceptionDoc = null;

    for (const doc of querySnapshot.docs) {
        const data = doc.data().formData;
        const items = data.items || [];
        if (items.some((item: any) => item.lote === lotId)) {
            const totalCalculatedWeight = items.reduce((sum: number, item: any) => sum + (Number(item.pesoBruto) || 0), 0);
            if (totalCalculatedWeight >= 20000) {
                initialReceptionDoc = doc;
                break;
            }
        }
    }


    if (!initialReceptionDoc) return null;

    const initialData = serializeTimestamps(initialReceptionDoc.data().formData);
    const initialItemsForLot = (initialData.items || []).filter((item: any) => item.lote === lotId);
    
    if (initialItemsForLot.length === 0) return null;

    const initialPallets = new Set(initialItemsForLot.map((item: any) => item.paleta)).size;
    const initialGrossWeight = initialItemsForLot.reduce((sum: number, item: any) => sum + (Number(item.pesoBruto) || 0), 0);
    
    const initialReception = {
        date: initialData.fecha,
        pallets: initialPallets,
        grossWeight: initialGrossWeight,
        pedidoSislog: initialData.pedidoSislog,
    };

    // 2. Find all subsequent movements
    const movements: Movement[] = [];

    // Despachos GENERICO
    const dispatchSnapshot = await submissionsRef
        .where('formData.cliente', '==', clientName)
        .where('formType', '==', 'variable-weight-despacho')
        .where('formData.tipoPedido', '==', 'GENERICO')
        .where('formData.fecha', '>=', initialReception.date)
        .get();
        
    dispatchSnapshot.forEach(doc => {
        const data = serializeTimestamps(doc.data().formData);
        const allItems = data.despachoPorDestino ? (data.destinos || []).flatMap((d:any) => d.items) : (data.items || []);
        const lotItems = allItems.filter((item: any) => item.lote === lotId);
        if (lotItems.length > 0) {
            const palletsInMovement = new Set(lotItems.filter((item: any) => !item.esPicking).map((item: any) => item.paleta)).size;
            if (palletsInMovement > 0) {
                movements.push({
                    date: data.fecha,
                    type: 'despacho',
                    pallets: palletsInMovement,
                    description: `Despacho (Pedido: ${data.pedidoSislog})`
                });
            }
        }
    });

    // Ingresos de Saldos
    const incomeSnapshot = await submissionsRef
        .where('formData.cliente', '==', clientName)
        .where('formType', 'in', ['variable-weight-reception', 'variable-weight-recepcion'])
        .where('formData.tipoPedido', '==', 'INGRESO DE SALDOS')
        .where('formData.fecha', '>=', initialReception.date)
        .get();

    incomeSnapshot.forEach(doc => {
        const data = serializeTimestamps(doc.data().formData);
        const lotItems = (data.items || []).filter((item: any) => item.lote === lotId);
        if (lotItems.length > 0) {
            const palletsInMovement = new Set(lotItems.map((item: any) => item.paleta)).size;
             if (palletsInMovement > 0) {
                movements.push({
                    date: data.fecha,
                    type: 'ingreso_saldos',
                    pallets: palletsInMovement,
                    description: `Ingreso Saldos (Pedido: ${data.pedidoSislog})`
                });
            }
        }
    });

    return { initialReception, movements };
}


export async function getSmylLotAssistantReport(lotId: string, queryStartDate: string, queryEndDate: string): Promise<AssistantReport | { error: string }> {
    if (!lotId) return { error: "Debe proporcionar un número de lote." };

    try {
        const history = await getLotHistory(lotId, queryStartDate, queryEndDate);
        if (!history) return { error: `No se encontró una recepción 'GENERICO' inicial para el lote '${lotId}' con peso >= 20000kg en el rango de fechas.` };

        const { initialReception, movements } = history;
        const dailyBalances: DailyBalance[] = [];
        let currentBalance = initialReception.pallets;

        const loopEndDate = addDays(parseISO(queryEndDate), 1); // Loop one day past query end to include its movements
        const dateInterval = eachDayOfInterval({ start: startOfDay(initialReception.date), end: loopEndDate });

        for (const [dayNumber, date] of dateInterval.entries()) {
            const dateStr = format(date, 'yyyy-MM-dd');
            const initialBalanceForDay = currentBalance;
            
            const movementsToday = movements.filter(m => format(m.date, 'yyyy-MM-dd') === dateStr);
            
            let despachosHoy = 0;
            let ingresosHoy = 0;
            const descriptions: string[] = [];

            movementsToday.forEach(mov => {
                if (mov.type === 'despacho') {
                    despachosHoy += mov.pallets;
                    descriptions.push(`- ${mov.pallets} Pal. (${mov.description})`);
                } else if (mov.type === 'ingreso_saldos') {
                    ingresosHoy += mov.pallets;
                     descriptions.push(`+ ${mov.pallets} Pal. (${mov.description})`);
                }
            });

            currentBalance = initialBalanceForDay - despachosHoy + ingresosHoy;
            
            const queryStart = startOfDay(parseISO(queryStartDate));
            const queryEnd = endOfDay(parseISO(queryEndDate));
            if (date >= queryStart && date <= queryEnd) {
                dailyBalances.push({
                    date: dateStr,
                    dayNumber: dayNumber + 1, // 1-based day number
                    isGracePeriod: dayNumber < 4,
                    movementsDescription: descriptions.join('; ') || 'Sin movimientos',
                    initialBalance: initialBalanceForDay,
                    finalBalance: currentBalance
                });
            }
        }
        
        return { lotId, initialReception, dailyBalances };

    } catch (e) {
        console.error("Error generating SMYL assistant report:", e);
        const message = e instanceof Error ? e.message : "Un error desconocido ocurrió en el servidor.";
        return { error: message };
    }
}

export async function getSmylEligibleLots(startDate: string, endDate: string, filterPostGraceBalance: boolean): Promise<EligibleLot[]> {
  if (!firestore) throw new Error("Firestore no está configurado.");

  const clientName = "SMYL TRANSPORTE Y LOGISTICA SAS";

  const querySnapshot = await firestore
    .collection('submissions')
    .where('formData.cliente', '==', clientName)
    .where('formType', 'in', ['variable-weight-reception', 'variable-weight-recepcion'])
    .where('formData.tipoPedido', '==', 'GENERICO')
    .where('formData.fecha', '>=', startOfDay(parseISO(startDate)))
    .where('formData.fecha', '<=', endOfDay(parseISO(endDate)))
    .get();

  const eligibleLotsMap = new Map<string, EligibleLot>();

  querySnapshot.docs.forEach(doc => {
    const data = doc.data().formData;
    const items = data.items || [];
    const totalWeight = items.reduce((sum: number, item: any) => sum + (Number(item.pesoBruto) || 0), 0);

    if (totalWeight >= 20000) {
      items.forEach((item: any) => {
        if (item.lote && !eligibleLotsMap.has(item.lote)) {
          eligibleLotsMap.set(item.lote, {
            lotId: item.lote,
            receptionDate: format(data.fecha.toDate(), 'yyyy-MM-dd'),
            pedidoSislog: data.pedidoSislog,
          });
        }
      });
    }
  });

  const finalLots = Array.from(eligibleLotsMap.values());
  
  if (filterPostGraceBalance) {
      const filteredResults: EligibleLot[] = [];
      for (const lot of finalLots) {
          const history = await getLotHistory(lot.lotId, lot.receptionDate, endDate);
          if (history) {
              const { initialReception, movements } = history;
              const gracePeriodEndDate = addDays(initialReception.date, 3);
              
              let currentBalance = initialReception.pallets;
              let hasBalanceAfterGrace = false;

              const loopEndDate = addDays(parseISO(endDate), 1);
              const dateInterval = eachDayOfInterval({ start: startOfDay(initialReception.date), end: loopEndDate });

              for (const date of dateInterval) {
                  const dateStr = format(date, 'yyyy-MM-dd');
                  const movementsToday = movements.filter(m => format(m.date, 'yyyy-MM-dd') === dateStr);
                  
                  movementsToday.forEach(mov => {
                      if (mov.type === 'despacho') currentBalance -= mov.pallets;
                      else if (mov.type === 'ingreso_saldos') currentBalance += mov.pallets;
                  });

                  // Check if the current day is after the grace period and has a balance
                  if (date > gracePeriodEndDate && currentBalance > 0) {
                      hasBalanceAfterGrace = true;
                      break; // Found a day with balance, no need to check further
                  }
              }

              if (hasBalanceAfterGrace) {
                  filteredResults.push(lot);
              }
          }
      }
      return filteredResults.sort((a, b) => b.receptionDate.localeCompare(a.receptionDate));
  }


  return finalLots.sort((a, b) => b.receptionDate.localeCompare(a.receptionDate));
}

    