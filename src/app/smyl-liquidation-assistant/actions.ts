

'use server';

import admin from 'firebase-admin';
import { firestore } from '@/lib/firebase-admin';
import { startOfDay, endOfDay, eachDayOfInterval, format, parseISO, addDays, isWithinInterval } from 'date-fns';

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
        container: string;
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

export type LotStatus = 'liquidado' | 'pendiente';

export interface EligibleLot {
    lotId: string;
    receptionDate: string;
    pedidoSislog: string;
    status?: LotStatus;
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

async function getLotHistory(lotId: string): Promise<LotHistory | null> {
    if (!firestore) throw new Error("Firestore not configured.");

    const clientName = "SMYL TRANSPORTE Y LOGISTICA SAS";

    // 1. Find the initial reception without a date constraint
    const submissionsRef = firestore.collection('submissions');
    const querySnapshot = await submissionsRef
        .where('formData.cliente', '==', clientName)
        .where('formType', 'in', ['variable-weight-reception', 'variable-weight-recepcion'])
        .where('formData.tipoPedido', '==', 'GENERICO')
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
        container: initialData.contenedor || 'N/A',
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
            
            const isSummaryFormat = lotItems.some((item: any) => Number(item.paleta) === 0);
            let palletsInMovement = 0;

            if (isSummaryFormat) {
                palletsInMovement = lotItems.reduce((sum: number, item: any) => sum + (Number(item.paletasCompletas) || 0), 0);
            } else {
                palletsInMovement = new Set(lotItems.filter((item: any) => !item.esPicking).map((item: any) => item.paleta)).size;
            }

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
        const history = await getLotHistory(lotId);
        if (!history) return { error: `No se encontró una recepción 'GENERICO' inicial para el lote '${lotId}' con peso >= 20000kg.` };

        const { initialReception, movements } = history;
        const dailyBalances: DailyBalance[] = [];
        let currentBalance = initialReception.pallets;

        const loopEndDate = addDays(parseISO(queryEndDate), 1); 
        const dateInterval = eachDayOfInterval({ start: startOfDay(initialReception.date), end: loopEndDate });

        for (const [dayIndex, date] of dateInterval.entries()) {
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

            if (isWithinInterval(date, { start: queryStart, end: queryEnd })) {
                dailyBalances.push({
                    date: dateStr,
                    dayNumber: Math.ceil(dayIndex + 1), // Start from Day 1
                    isGracePeriod: dayIndex < 4,
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

export type GraceFilter = "all" | "in_grace" | "post_grace";
export type LotStatusFilter = "all" | "pendiente" | "liquidado";


async function getLotStatuses(lotIds: string[]): Promise<Record<string, LotStatus>> {
  if (!firestore || lotIds.length === 0) return {};

  const lotStatusMap: Record<string, LotStatus> = {};
  const statusCollection = firestore.collection('smyl_lot_status');

  // Firestore 'in' queries are limited to 30 elements
  const chunks: string[][] = [];
  for (let i = 0; i < lotIds.length; i += 30) {
    chunks.push(lotIds.slice(i, i + 30));
  }

  for (const chunk of chunks) {
    const querySnapshot = await statusCollection.where(admin.firestore.FieldPath.documentId(), 'in', chunk).get();
    querySnapshot.forEach(doc => {
      lotStatusMap[doc.id] = doc.data().status as LotStatus;
    });
  }

  return lotStatusMap;
}

export async function getSmylEligibleLots(
  startDate: string,
  endDate: string,
  graceFilter: GraceFilter,
  statusFilter: LotStatusFilter = 'pendiente'
): Promise<EligibleLot[]> {
  if (!firestore) throw new Error("Firestore no está configurado.");

  const clientName = "SMYL TRANSPORTE Y LOGISTICA SAS";
  const queryStart = startOfDay(parseISO(startDate));
  const queryEnd = endOfDay(parseISO(endDate));

  // Find all potential lots, regardless of date.
  const querySnapshot = await firestore
    .collection('submissions')
    .where('formData.cliente', '==', clientName)
    .where('formType', 'in', ['variable-weight-reception', 'variable-weight-recepcion'])
    .where('formData.tipoPedido', '==', 'GENERICO')
    .get();

  const allPossibleLots = new Map<string, EligibleLot>();

  querySnapshot.docs.forEach(doc => {
    const data = doc.data().formData;
    const items = data.items || [];
    const totalWeight = items.reduce((sum: number, item: any) => sum + (Number(item.pesoBruto) || 0), 0);

    if (totalWeight >= 20000) {
      items.forEach((item: any) => {
        if (item.lote && !allPossibleLots.has(item.lote)) {
          allPossibleLots.set(item.lote, {
            lotId: item.lote,
            receptionDate: format(data.fecha.toDate(), 'yyyy-MM-dd'),
            pedidoSislog: data.pedidoSislog,
          });
        }
      });
    }
  });

  const finalLots: EligibleLot[] = [];
  const lotIds = Array.from(allPossibleLots.keys());

  if (lotIds.length === 0) return [];
  
  const lotStatuses = await getLotStatuses(lotIds);

  for (const lot of allPossibleLots.values()) {
    const history = await getLotHistory(lot.lotId);
    if (!history) continue;

    const { initialReception, movements } = history;
    const receptionDate = startOfDay(initialReception.date);
    const gracePeriodEndDate = addDays(receptionDate, 4);

    let hasActivityInGrace = false;
    let hasActivityPostGrace = false;
    let hasBalancePostGrace = false;

    // Check if grace period overlaps with query range
    const graceInterval = { start: receptionDate, end: addDays(receptionDate, 3) };
    if (isWithinInterval(queryStart, graceInterval) || isWithinInterval(queryEnd, graceInterval) || isWithinInterval(graceInterval.start, { start: queryStart, end: queryEnd })) {
        hasActivityInGrace = true;
    }

    // Check if post-grace period overlaps and has balance
    let currentBalance = initialReception.pallets;
    const allDates = eachDayOfInterval({ start: receptionDate, end: addDays(queryEnd, 1) }); // Extend to ensure we capture the end date's balance change
    for (const [index, date] of allDates.entries()) {
        const dateStr = format(date, 'yyyy-MM-dd');
        const movementsToday = movements.filter(m => format(m.date, 'yyyy-MM-dd') === dateStr);
        movementsToday.forEach(mov => {
            currentBalance += mov.type === 'ingreso_saldos' ? mov.pallets : -mov.pallets;
        });

        const isPostGrace = date >= gracePeriodEndDate;
        const isInQueryRange = isWithinInterval(date, { start: queryStart, end: queryEnd });
        
        if (isPostGrace && isInQueryRange && currentBalance > 0) {
            hasActivityPostGrace = true;
            hasBalancePostGrace = true;
        }
    }

    let isEligible = false;
    if (graceFilter === 'all') {
        isEligible = hasActivityInGrace || hasActivityPostGrace;
    } else if (graceFilter === 'in_grace') {
        isEligible = hasActivityInGrace;
    } else if (graceFilter === 'post_grace') {
        isEligible = hasActivityPostGrace && hasBalancePostGrace;
    }

    if (isEligible) {
      const status = lotStatuses[lot.lotId] || 'pendiente';
      if (statusFilter === 'all' || statusFilter === status) {
        finalLots.push({ ...lot, status });
      }
    }
  }

  return finalLots.sort((a, b) => b.receptionDate.localeCompare(a.receptionDate));
}

export async function toggleLotStatus(lotId: string): Promise<{ success: boolean; newStatus?: LotStatus, message: string }> {
  if (!firestore) {
    return { success: false, message: 'El servidor no está configurado.' };
  }

  try {
    const docRef = firestore.collection('smyl_lot_status').doc(lotId);
    const doc = await docRef.get();
    
    let currentStatus: LotStatus = 'pendiente';
    if (doc.exists) {
      currentStatus = doc.data()?.status || 'pendiente';
    }

    const newStatus: LotStatus = currentStatus === 'pendiente' ? 'liquidado' : 'pendiente';

    await docRef.set({ status: newStatus }, { merge: true });

    return { success: true, newStatus: newStatus, message: `Estado del lote ${lotId} actualizado a ${newStatus}.` };

  } catch (error) {
    console.error(`Error toggling status for lot ${lotId}:`, error);
    const errorMessage = error instanceof Error ? error.message : "Un error desconocido ocurrió.";
    return { success: false, message: errorMessage };
  }
}
    

    


