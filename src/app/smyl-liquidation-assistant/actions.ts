
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

    // 1. Find the initial reception
    const receptionSnapshot = await firestore.collection('submissions')
        .where('formData.tipoPedido', '==', 'GENERICO')
        .where('formType', 'in', ['variable-weight-reception', 'variable-weight-recepcion'])
        .get();

    let initialReceptionDoc = null;
    for (const doc of receptionSnapshot.docs) {
        const data = doc.data();
        // Check both possible field names for client
        const docClientName = data.formData.nombreCliente || data.formData.cliente;
        if (docClientName !== clientName) {
            continue;
        }

        const hasLot = (data.formData.items || []).some((item: any) => item.lote === lotId);
        if (hasLot) {
            const grossWeight = Number(data.formData.totalPesoBrutoKg) || 0;
            if (grossWeight >= 20000) {
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
    
    const initialReception = {
        date: initialData.fecha,
        pallets: initialPallets,
        grossWeight: Number(initialData.totalPesoBrutoKg) || 0,
        pedidoSislog: initialData.pedidoSislog,
    };

    // 2. Find all subsequent movements
    const movements: Movement[] = [];
    const submissionsRef = firestore.collection('submissions');

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
            const palletsInMovement = new Set(lotItems.filter(item => !item.esPicking).map((item: any) => item.paleta)).size;
            movements.push({
                date: data.fecha,
                type: 'despacho',
                pallets: palletsInMovement,
                description: `Despacho (Pedido: ${data.pedidoSislog})`
            });
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
            movements.push({
                date: data.fecha,
                type: 'ingreso_saldos',
                pallets: palletsInMovement,
                description: `Ingreso Saldos (Pedido: ${data.pedidoSislog})`
            });
        }
    });

    return { initialReception, movements };
}

export async function getSmylLotAssistantReport(lotId: string, queryStartDate: string, queryEndDate: string): Promise<AssistantReport | { error: string }> {
    if (!lotId) return { error: "Debe proporcionar un número de lote." };

    try {
        const history = await getLotHistory(lotId);
        if (!history) return { error: `No se encontró una recepción 'GENERICO' inicial para el lote '${lotId}' que cumpla los criterios.` };

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

            currentBalance = currentBalance - despachosHoy + ingresosHoy;
            
            // Only add to report if the date is within the user's query range
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
