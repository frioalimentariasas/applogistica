

'use server';

import { firestore } from '@/lib/firebase-admin';
import { revalidatePath } from 'next/cache';
import admin from 'firebase-admin';
import { startOfDay, endOfDay, parseISO, differenceInHours, getDaysInMonth, getDay, format, addMinutes, addHours, differenceInMinutes, parse, isSaturday, isSunday, addDays, eachDayOfInterval, isWithinInterval, isBefore, isEqual } from 'date-fns';
import type { ArticuloData } from '@/app/actions/articulos';
import { getConsolidatedMovementReport } from '@/app/actions/consolidated-movement-report';
import { processTunelCongelacionData } from '@/lib/report-utils';
import { getSmylLotAssistantReport, type AssistantReport } from '@/app/smyl-liquidation-assistant/actions';
import { getDetailedInventoryForExport } from '@/app/actions/inventory-report';


export interface TariffRange {
  minTons: number;
  maxTons: number;
  vehicleType: string;
  dayTariff: number;
  nightTariff: number;
  extraTariff: number; // Added for Saturday/Sunday/Holiday logic
}

export interface TemperatureTariffRange {
  minTemp: number;
  maxTemp: number;
  ratePerKg: number;
}

export interface SpecificTariff {
  id: string; // e.g., 'hora-extra-diurna'
  name: string; // e.g., 'HORA EXTRA DIURNA'
  value: number;
  baseQuantity?: number; // New field for base positions
  unit: 'HORA' | 'UNIDAD' | 'DIA' | 'VIAJE' | 'ALIMENTACION' | 'TRANSPORTE' | 'HORA EXTRA DIURNA' | 'HORA EXTRA NOCTURNA' | 'HORA EXTRA DIURNA DOMINGO Y FESTIVO' | 'HORA EXTRA NOCTURNA DOMINGO Y FESTIVO' | 'TRANSPORTE EXTRAORDINARIO' | 'TRANSPORTE DOMINICAL Y FESTIVO' | 'POSICION/DIA' | 'POSICIONES/MES';
}

export interface FixedTimeConfig {
    weekdayStartTime?: string;
    weekdayEndTime?: string;
    saturdayStartTime?: string;
    saturdayEndTime?: string;
    dayShiftEndTime?: string;
}

export interface ClientBillingConcept {
  id: string;
  conceptName: string;
  clientNames: string[];
  status: 'activo' | 'inactivo'; // New status field
  unitOfMeasure: 'KILOGRAMOS' | 'TONELADA' | 'PALETA' | 'ESTIBA' | 'UNIDAD' | 'CAJA' | 'SACO' | 'CANASTILLA' | 'HORA' | 'DIA' | 'VIAJE' | 'MES' | 'CONTENEDOR' | 'HORA EXTRA DIURNA' | 'HORA EXTRA NOCTURNA' | 'HORA EXTRA DIURNA DOMINGO Y FESTIVO' | 'HORA EXTRA NOCTURNA DOMINGO Y FESTIVO' | 'POSICION/DIA' | 'POSICIONES' | 'TIPO VEHÍCULO' | 'TRACTOMULA' | 'QUINCENA';
  
  calculationType: 'REGLAS' | 'OBSERVACION' | 'MANUAL' | 'SALDO_INVENTARIO' | 'LÓGICA ESPECIAL' | 'SALDO_CONTENEDOR';

  // For 'REGLAS'
  calculationBase?: 'TONELADAS' | 'KILOGRAMOS' | 'CANTIDAD_PALETAS' | 'CANTIDAD_CAJAS' | 'NUMERO_OPERACIONES' | 'NUMERO_CONTENEDORES' | 'PALETAS_SALIDA_MAQUILA_CONGELADOS' | 'PALETAS_SALIDA_MAQUILA_SECO' | 'CANTIDAD_SACOS_MAQUILA';
  filterOperationType?: 'recepcion' | 'despacho' | 'ambos';
  filterProductType?: 'fijo' | 'variable' | 'ambos';
  filterSesion?: 'CO' | 'RE' | 'SE' | 'AMBOS';
  filterPedidoTypes?: string[];
  palletTypeFilter?: 'completas' | 'picking' | 'ambas'; // NUEVO CAMPO
  
  // For 'OBSERVACION'
  associatedObservation?: string;

  // For 'SALDO_INVENTARIO' or 'SALDO_CONTENEDOR'
  inventorySource?: 'POSICIONES_ALMACENADAS';
  inventorySesion?: 'CO' | 'RE' | 'SE';

  // Tariff Rules
  tariffType: 'UNICA' | 'RANGOS' | 'ESPECIFICA' | 'POR_TEMPERATURA';
  value?: number; // For 'UNICA' tariffType
  billingPeriod?: 'DIARIO' | 'QUINCENAL' | 'MENSUAL'; // New field
  
  // New granular shift times
  weekdayDayShiftStart?: string;
  weekdayDayShiftEnd?: string;
  saturdayDayShiftStart?: string;
  saturdayDayShiftEnd?: string;
  
  tariffRanges?: TariffRange[];
  tariffRangesTemperature?: TemperatureTariffRange[];
  specificTariffs?: SpecificTariff[];
  fixedTimeConfig?: FixedTimeConfig; // New field for TIEMPO EXTRA FRIOAL (FIJO)
}

const serializeTimestamps = (data: any): any => {
    if (data === null || data === undefined || typeof data !== 'object') {
        return data;
    }
    if (data instanceof admin.firestore.Timestamp) {
      return data.toDate().toISOString();
    }
    if (Array.isArray(data)) {
        return data.map(serializeTimestamps);
    }
    const newObj: { [key: string]: any } = {};
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
            newObj[key] = serializeTimestamps(data[key]);
      }
    }
    return newObj;
};

const getFilteredItems = (
    op: any,
    sessionFilter: 'CO' | 'RE' | 'SE' | 'AMBOS' | undefined,
    articleSessionMap: Map<string, string>
): any[] => {
    const allItems = (op.formData.productos || [])
        .concat(op.formData.items || [])
        .concat((op.formData.destinos || []).flatMap((d: any) => d.items || []))
        .concat((op.formData.placas || []).flatMap((p: any) => p.items || []));

    if (!sessionFilter || sessionFilter === 'AMBOS') {
        return allItems;
    }

    return allItems.filter((item: any) => {
        if (!item || !item.codigo) return false;
        const itemSession = articleSessionMap.get(item.codigo);
        return itemSession === sessionFilter;
    });
};

export async function findApplicableConcepts(clientName: string, startDate: string, endDate: string): Promise<ClientBillingConcept[]> {
    if (!firestore) return [];

    const allConcepts = await getClientBillingConcepts();
    const applicableConcepts = new Map<string, ClientBillingConcept>();

    const serverQueryStartDate = new Date(`${startDate}T00:00:00-05:00`);
    const serverQueryEndDate = new Date(`${endDate}T23:59:59.999-05:00`);
    
    // Fetch all submissions in the date range
    const submissionsSnapshot = await firestore.collection('submissions')
        .where('formData.fecha', '>=', serverQueryStartDate)
        .where('formData.fecha', '<=', serverQueryEndDate)
        .get();

    // Fetch all manual operations in the date range. Client will be filtered later.
    const manualOpsSnapshot = await firestore.collection('manual_client_operations')
        .where('operationDate', '>=', serverQueryStartDate)
        .where('operationDate', '<=', serverQueryEndDate)
        .get();
        
    const clientArticlesSnapshot = await firestore.collection('articulos').where('razonSocial', '==', clientName).get();
    const articleSessionMap = new Map<string, string>();
    clientArticlesSnapshot.forEach(doc => {
        const article = doc.data() as ArticuloData;
        articleSessionMap.set(article.codigoProducto, article.sesion);
    });

    const clientSubmissions = submissionsSnapshot.docs.filter(doc => {
        const docData = doc.data();
        const docClientName = docData.formData?.cliente || docData.formData?.nombreCliente;
        return docClientName === clientName;
    });
    
    let conceptsForClient = allConcepts.filter(c => 
        (c.clientNames.includes(clientName) || c.clientNames.includes('TODOS (Cualquier Cliente)')) &&
        c.status === 'activo'
    );
    
    for (const concept of conceptsForClient) {
        if (concept.calculationType === 'REGLAS') {
            const hasApplicableOperation = clientSubmissions.some(doc => {
                const submission = serializeTimestamps(doc.data());
                
                const isRecepcion = submission.formType.includes('recepcion') || submission.formType.includes('reception');
                const isDespacho = submission.formType.includes('despacho');

                const opTypeMatch = concept.filterOperationType === 'ambos' ||
                                    (concept.filterOperationType === 'recepcion' && isRecepcion) ||
                                    (concept.filterOperationType === 'despacho' && isDespacho);
                if (!opTypeMatch) return false;
                
                const isFixed = submission.formType.includes('fixed-weight');
                const isVariable = submission.formType.includes('variable-weight');

                const prodTypeMatch = concept.filterProductType === 'ambos' ||
                                      (concept.filterProductType === 'fijo' && isFixed) ||
                                      (concept.filterProductType === 'variable' && isVariable);
                if (!prodTypeMatch) return false;

                const pedidoType = submission.formData?.tipoPedido;
                if (concept.filterPedidoTypes && concept.filterPedidoTypes.length > 0) {
                    if (!pedidoType || !concept.filterPedidoTypes.includes(pedidoType)) {
                        return false;
                    }
                }
                
                const items = getFilteredItems(submission, concept.filterSesion, articleSessionMap);
                if (items.length === 0) return false;

                
                return true;
            });

            if (hasApplicableOperation) {
                 if (!applicableConcepts.has(concept.id)) {
                    applicableConcepts.set(concept.id, concept);
                }
            }

        } else if (concept.calculationType === 'OBSERVACION') {
            for (const doc of clientSubmissions) {
                const formData = doc.data().formData;
                if (Array.isArray(formData.observaciones) && formData.observaciones.some((obs: any) => obs.type === concept.associatedObservation)) {
                     if (!applicableConcepts.has(concept.id)) {
                        applicableConcepts.set(concept.id, concept);
                    }
                    break;
                }
            }
        } else if (concept.calculationType === 'MANUAL') {
             for (const doc of manualOpsSnapshot.docs) {
                const opData = doc.data();
                if (opData.clientName === clientName && concept.conceptName === opData.concept) {
                    if (!applicableConcepts.has(concept.id)) {
                        applicableConcepts.set(concept.id, concept);
                    }
                    break;
                }
            }
        } else if (concept.calculationType === 'SALDO_INVENTARIO' || concept.calculationType === 'SALDO_CONTENEDOR') {
            if (!concept.inventorySesion) continue;
            const targetSesion = concept.inventorySesion;

            const consolidatedReportForConcept = await getConsolidatedMovementReport({
                clientName: clientName,
                startDate: startDate,
                endDate: endDate,
                sesion: targetSesion,
            });

            const hasBalanceInPeriod = consolidatedReportForConcept.some(day => day.posicionesAlmacenadas > 0);

            if (hasBalanceInPeriod) {
                if (!applicableConcepts.has(concept.id)) {
                    applicableConcepts.set(concept.id, concept);
                }
            }
        } else if (concept.calculationType === 'LÓGICA ESPECIAL') {
            if (!applicableConcepts.has(concept.id)) {
                applicableConcepts.set(concept.id, concept);
            }
        }
    }
    
    const sortedConcepts = Array.from(applicableConcepts.values());
    sortedConcepts.sort((a, b) => a.conceptName.localeCompare(b.conceptName));
    return sortedConcepts;
}

// Fetches all concepts
export async function getClientBillingConcepts(): Promise<ClientBillingConcept[]> {
  if (!firestore) return [];
  try {
    const snapshot = await firestore.collection('client_billing_concepts').orderBy('conceptName').get();
    if (snapshot.empty) return [];
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        conceptName: data.conceptName,
        clientNames: Array.isArray(data.clientNames) ? data.clientNames : [data.clientName],
        status: data.status || 'activo',
        unitOfMeasure: data.unitOfMeasure,
        
        calculationType: data.calculationType || 'REGLAS',
        calculationBase: data.calculationBase,
        filterOperationType: data.filterOperationType,
        filterProductType: data.filterProductType,
        filterSesion: data.filterSesion,
        filterPedidoTypes: data.filterPedidoTypes || [],
        palletTypeFilter: data.palletTypeFilter || 'ambas', // NUEVO CAMPO
        associatedObservation: data.associatedObservation,
        inventorySource: data.inventorySource,
        inventorySesion: data.inventorySesion,

        tariffType: data.tariffType || 'UNICA',
        value: data.value,
        billingPeriod: data.billingPeriod,

        // New granular shift times
        weekdayDayShiftStart: data.weekdayDayShiftStart || data.dayShiftStart,
        weekdayDayShiftEnd: data.weekdayDayShiftEnd || data.dayShiftEnd,
        saturdayDayShiftStart: data.saturdayDayShiftStart,
        saturdayDayShiftEnd: data.saturdayDayShiftEnd,

        tariffRanges: Array.isArray(data.tariffRanges) ? data.tariffRanges : [],
        tariffRangesTemperature: Array.isArray(data.tariffRangesTemperature) ? data.tariffRangesTemperature : [],
        specificTariffs: Array.isArray(data.specificTariffs) ? data.specificTariffs : [],
        fixedTimeConfig: data.fixedTimeConfig,
      } as ClientBillingConcept;
    });
  } catch (error) {
    console.error("Error fetching client billing concepts:", error);
    return [];
  }
}

// Action to add a new concept
export async function addClientBillingConcept(data: Omit<ClientBillingConcept, 'id'>): Promise<{ success: boolean; message: string; newConcept?: ClientBillingConcept }> {
  if (!firestore) return { success: false, message: 'Error de configuración del servidor.' };
  
  try {
    const conceptsRef = firestore.collection('client_billing_concepts');
    const querySnapshot = await conceptsRef
      .where('conceptName', '==', data.conceptName)
      .where('clientNames', 'array-contains-any', data.clientNames)
      .get();
      
    if (!querySnapshot.empty) {
      const conflictingClient = querySnapshot.docs[0].data().clientNames.find((c: string) => data.clientNames.includes(c));
      return { success: false, message: `El concepto "${data.conceptName}" ya tiene una configuración para el cliente "${conflictingClient}". Edite el concepto existente en lugar de crear uno nuevo.` };
    }

    const dataToSave = { ...data, status: 'activo' };

    const docRef = await conceptsRef.add(dataToSave);
    revalidatePath('/gestion-conceptos-liquidacion-clientes');
    return { success: true, message: 'Concepto de cliente agregado con éxito.', newConcept: { id: docRef.id, ...dataToSave } as ClientBillingConcept };
  } catch (error) {
    console.error('Error al agregar concepto de liquidación de cliente:', error);
    return { success: false, message: 'Ocurrió un error en el servidor.' };
  }
}

// Action to update a concept
export async function updateClientBillingConcept(id: string, data: Omit<ClientBillingConcept, 'id'>): Promise<{ success: boolean; message: string }> {
  if (!firestore) return { success: false, message: 'Error de configuración del servidor.' };
  
  try {
     const conceptsRef = firestore.collection('client_billing_concepts');
    const querySnapshot = await conceptsRef
      .where('conceptName', '==', data.conceptName)
      .where('clientNames', 'array-contains-any', data.clientNames)
      .get();

    // Find if there's a conflicting document that is not the one we are editing
    const conflictingDoc = querySnapshot.docs.find(doc => doc.id !== id);

    if (conflictingDoc) {
      const conflictingClient = conflictingDoc.data().clientNames.find((c: string) => data.clientNames.includes(c));
      return { success: false, message: `El concepto "${data.conceptName}" ya tiene una configuración para el cliente "${conflictingClient}". No se puede duplicar.` };
    }

    await firestore.collection('client_billing_concepts').doc(id).update(data);
    revalidatePath('/gestion-conceptos-liquidacion-clientes');
    return { success: true, message: 'Concepto de cliente actualizado con éxito.' };
  } catch (error) {
    console.error('Error al actualizar concepto de cliente:', error);
    return { success: false, message: 'Ocurrió un error en el servidor.' };
  }
}

export async function toggleConceptStatus(id: string, currentStatus: 'activo' | 'inactivo'): Promise<{ success: boolean; message: string }> {
  if (!firestore) {
    return { success: false, message: 'Error de configuración del servidor.' };
  }
  const newStatus = currentStatus === 'activo' ? 'inactivo' : 'activo';
  try {
    await firestore.collection('client_billing_concepts').doc(id).update({ status: newStatus });
    revalidatePath('/gestion-conceptos-liquidacion-clientes');
    return { success: true, message: `Concepto ${newStatus}.` };
  } catch (error) {
    console.error(`Error al cambiar el estado del concepto ${id}:`, error);
    return { success: false, message: 'Ocurrió un error en el servidor.' };
  }
}

// Action to delete one or more concepts
export async function deleteMultipleClientBillingConcepts(ids: string[]): Promise<{ success: boolean; message: string }> {
  if (!firestore) return { success: false, message: 'Error de configuración del servidor.' };
  if (!ids || ids.length === 0) return { success: false, message: 'No se seleccionaron conceptos para eliminar.' };
  
  try {
    const batch = firestore.batch();
    ids.forEach(id => {
      const docRef = firestore.collection('client_billing_concepts').doc(id);
      batch.delete(docRef);
    });
    await batch.commit();
    revalidatePath('/gestion-conceptos-liquidacion-clientes');
    return { success: true, message: `${ids.length} concepto(s) de cliente eliminado(s) con éxito.` };
  } catch (error) {
    console.error('Error al eliminar conceptos de cliente:', error);
    return { success: false, message: 'Ocurrió un error en el servidor.' };
  }
}
