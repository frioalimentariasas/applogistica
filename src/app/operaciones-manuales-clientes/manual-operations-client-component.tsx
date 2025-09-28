
"use client";

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, SubmitHandler, useFieldArray, useWatch, FieldErrors, useFormContext, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { format, parseISO, addDays, getDaysInMonth, getDay, isSaturday, isSunday, isWithinInterval, startOfDay, endOfDay, differenceInMinutes, parse, differenceInHours } from 'date-fns';
import { es } from 'date-fns/locale';
import { DateRange } from 'react-day-picker';


import { addManualClientOperation, updateManualClientOperation, deleteManualClientOperation, addBulkManualClientOperation, addBulkSimpleOperation } from './actions';
import { getAllManualClientOperations } from '@/app/billing-reports/actions/generate-client-settlement';
import type { ManualClientOperationData, ExcedentEntry } from './actions';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import type { ClientInfo } from '@/app/actions/clients';
import type { ClientBillingConcept, SpecificTariff } from '@/app/gestion-conceptos-liquidacion-clientes/actions';

import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { ArrowLeft, Loader2, CalendarIcon, PlusCircle, X, Edit2, Trash2, Edit, Search, XCircle, FolderSearch, Eye, Clock, DollarSign, ChevronsUpDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription as AlertDialogDesc, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { DateMultiSelector } from '@/components/app/date-multi-selector';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertTitle } from '@/components/ui/alert';


const specificTariffEntrySchema = z.object({
    tariffId: z.string(),
    quantity: z.coerce.number().min(0, "Debe ser >= 0"),
});

const bulkRoleSchema = z.object({
  roleName: z.string(),
  diurnaId: z.string(),
  nocturnaId: z.string(),
  diurnaLabel: z.string(),
  nocturnaValue: z.number(),
  diurnaValue: z.number(),
  numPersonas: z.coerce.number().int().min(0, "Debe ser un número positivo.").default(0),
});

const excedentSchema = z.object({
    date: z.string(),
    hours: z.coerce.number().min(0, "Debe ser un número positivo"),
});

const manualOperationSchema = z.object({
  clientName: z.string().min(1, 'El cliente es obligatorio.'),
  operationDate: z.date({ required_error: 'La fecha es obligatoria.' }).optional(),
  
  selectedDates: z.array(z.date()).optional().default([]),
  bulkRoles: z.array(bulkRoleSchema).optional(),
  excedentes: z.array(excedentSchema).optional(),

  concept: z.string().min(1, 'El concepto es obligatorio.'),
  specificTariffs: z.array(specificTariffEntrySchema).optional(),
  quantity: z.coerce.number().min(0, 'La cantidad debe ser 0 o mayor.').optional(),
  numeroPersonas: z.coerce.number().int().min(1, "Debe ser al menos 1.").optional(),
  numeroPosiciones: z.coerce.number().int().min(1, 'Debe ingresar al menos una posición.').optional(),
  comentarios: z.string().max(150, "Máximo 150 caracteres.").optional(),
  details: z.object({
      startTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Formato HH:MM requerido.').optional().or(z.literal('')),
      endTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Formato HH:MM requerido.').optional().or(z.literal('')),
      plate: z.string().optional(),
      container: z.string().optional(),
      totalPallets: z.coerce.number().int().min(0, 'Debe ser un número positivo.').optional().nullable(),
      arin: z.string().optional(),
      fechaArribo: z.date().optional(),
      horaArribo: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Formato HH:MM requerido.').optional().or(z.literal('')),
      fechaSalida: z.date().optional(),
      horaSalida: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Formato HH:MM requerido.').optional().or(z.literal('')),
      opLogistica: z.enum(['CARGUE', 'DESCARGUE']).optional(),
      fmmNumber: z.string().optional(),
      pedidoSislog: z.string().optional(),
      noDocumento: z.string().max(20, "Máximo 20 caracteres.").optional(),
  }).optional(),
}).superRefine((data, ctx) => {
    const isBulkMode = data.concept === 'TIEMPO EXTRA FRIOAL (FIJO)' || data.concept === 'ALQUILER DE ÁREA PARA EMPAQUE/DIA' || data.concept === 'SERVICIO APOYO JORNAL';
    const isTimeExtraMode = data.concept === 'TIEMPO EXTRA FRIOAL';
    const isPositionMode = data.concept === 'POSICIONES FIJAS CÁMARA CONGELADOS';
    const isFixedMonthlyService = isPositionMode || data.concept === 'IN-HOUSE INSPECTOR ZFPC' || data.concept === 'ALQUILER IMPRESORA ETIQUETADO';
    const isElectricConnection = data.concept === 'CONEXIÓN ELÉCTRICA CONTENEDOR';
    const isFmmZfpc = data.concept === 'FMM ZFPC';


    if (isBulkMode) {
      if (!data.selectedDates || data.selectedDates.length === 0) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Debe seleccionar al menos una fecha.", path: ["selectedDates"] });
      }
      if (data.concept === 'TIEMPO EXTRA FRIOAL (FIJO)' && (!data.bulkRoles || data.bulkRoles.every(r => r.numPersonas === 0))) {
           ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Debe ingresar al menos una persona en algún rol.", path: ["bulkRoles"] });
      }
    } else { // Not bulk mode
       if (!isElectricConnection && (!data.operationDate || isNaN(data.operationDate.getTime()))) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La fecha es obligatoria.", path: ["operationDate"] });
       }
        if(data.details?.startTime && data.details?.endTime && data.details.startTime === data.details.endTime) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "La hora de inicio no puede ser igual a la de fin.",
                path: ["details", "endTime"],
            });
        }
    }
    
    if (isTimeExtraMode) {
      if (!data.details?.startTime) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La hora de inicio es requerida.", path: ["details.startTime"] });
      if (!data.details?.endTime) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La hora de fin es requerida.", path: ["details.endTime"] });
       if (!data.bulkRoles || data.bulkRoles.every(r => r.numPersonas === 0)) {
           ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Debe ingresar al menos una persona en algún rol.", path: ["bulkRoles"] });
      }
    }

    if (isElectricConnection) {
        if (!data.details?.fechaArribo) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La fecha de arribo es obligatoria.", path: ["details.fechaArribo"] });
        if (!data.details?.horaArribo) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La hora de arribo es obligatoria.", path: ["details.horaArribo"] });
        if (!data.details?.fechaSalida) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La fecha de salida es obligatoria.", path: ["details.fechaSalida"] });
        if (!data.details?.horaSalida) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La hora de salida es obligatoria.", path: ["details.horaSalida"] });
        if (!data.details?.container?.trim()) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "El contenedor es obligatorio para este concepto.", path: ["details", "container"] });
        }
    }

    if (isFixedMonthlyService) {
        if (isPositionMode && (!data.specificTariffs || data.specificTariffs.length === 0)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Debe seleccionar al menos una tarifa.", path: ["specificTariffs"] });
        } else if (isPositionMode) {
            const excessTariff = data.specificTariffs?.find(t => t.tariffId.includes('EXCESO'));
            if (excessTariff && (excessTariff.quantity === undefined || excessTariff.quantity <= 0)) {
                 ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La cantidad para la tarifa de exceso es requerida.", path: [`specificTariffs.${data.specificTariffs?.indexOf(excessTariff)}.quantity`] });
            }
        }
    }
    
    if (isFmmZfpc) {
      if (!data.details?.opLogistica) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La Op. Logística es obligatoria.", path: ["details.opLogistica"] });
      if (!data.details?.fmmNumber?.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "El # FMM es obligatorio.", path: ["details.fmmNumber"] });
      if (!data.details?.plate?.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La Placa es obligatoria.", path: ["details.plate"] });
    }

    const specialConcepts = ['INSPECCIÓN ZFPC', 'TIEMPO EXTRA ZFPC', 'TOMA DE PESOS POR ETIQUETA HRS'];
    if (specialConcepts.includes(data.concept)) {
        if (!data.details?.container?.trim()) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "El contenedor es obligatorio para este concepto.", path: ["details", "container"] });
        }
    }

    if (data.concept === 'INSPECCIÓN ZFPC' && !data.details?.arin?.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "El ARIN es obligatorio para este concepto.", path: ["details", "arin"] });
    }
});


type ManualOperationValues = z.infer<typeof manualOperationSchema>;

interface ManualOperationsClientComponentProps {
    clients: ClientInfo[];
    billingConcepts: ClientBillingConcept[];
}

type DialogMode = 'add' | 'edit' | 'view';

export default function ManualOperationsClientComponent({ clients, billingConcepts }: ManualOperationsClientComponentProps) {
    const router = useRouter();
    const { toast } = useToast();
    const { user, displayName } = useAuth();
    
    const [allOperations, setAllOperations] = useState<any[]>([]);
    const [filteredOperations, setFilteredOperations] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searched, setSearched] = useState(false);
    
    const [dateRange, setDateRange] = useState<DateRange | undefined>();
    const [selectedClient, setSelectedClient] = useState<string>('all');
    const [selectedConcept, setSelectedConcept] = useState<string>('all');

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [dialogMode, setDialogMode] = useState<DialogMode>('add');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [opToManage, setOpToManage] = useState<any | null>(null);
    const [opToDelete, setOpToDelete] = useState<any | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isConceptDialogOpen, setConceptDialogOpen] = useState(false);

    const form = useForm<ManualOperationValues>({
        resolver: zodResolver(manualOperationSchema),
        defaultValues: {
            clientName: "",
            concept: "",
            operationDate: new Date(),
            quantity: 1,
            specificTariffs: [],
            numeroPersonas: 1,
            comentarios: "",
            details: {
                startTime: '',
                endTime: '',
                plate: '',
                container: '',
                totalPallets: null,
                arin: '',
                opLogistica: undefined,
                fmmNumber: '',
                pedidoSislog: '',
                noDocumento: '',
            },
            bulkRoles: [],
            excedentes: [],
            selectedDates: [],
        }
    });

    const { fields: bulkRoleFields } = useFieldArray({
        control: form.control,
        name: "bulkRoles"
    });
    const { fields: excedentFields, append: appendExcedent, remove: removeExcedent, update: updateExcedent } = useFieldArray({
        control: form.control,
        name: "excedentes"
    });
    
    const watchedClient = form.watch('clientName');
    const watchedConcept = form.watch('concept');
    const watchedTimes = form.watch(['details.startTime', 'details.endTime']);
    const watchedElectricConnectionDates = form.watch(['details.fechaArribo', 'details.horaArribo', 'details.fechaSalida', 'details.horaSalida']);
    const watchedFechaArribo = form.watch('details.fechaArribo');

    const selectedConceptInfo = useMemo(() => billingConcepts.find(c => c.conceptName === watchedConcept), [watchedConcept, billingConcepts]);
    
    const isBulkMode = watchedConcept === 'TIEMPO EXTRA FRIOAL (FIJO)' || watchedConcept === 'ALQUILER DE ÁREA PARA EMPAQUE/DIA' || watchedConcept === 'SERVICIO APOYO JORNAL';
    const isTimeExtraMode = watchedConcept === 'TIEMPO EXTRA FRIOAL';
    const isPositionMode = watchedConcept === 'POSICIONES FIJAS CÁMARA CONGELADOS';
    const isElectricConnection = watchedConcept === 'CONEXIÓN ELÉCTRICA CONTENEDOR';
    const isFmmZfpc = watchedConcept === 'FMM ZFPC';
    const isFmmConcept = watchedConcept === 'FMM DE INGRESO ZFPC' || watchedConcept === 'FMM DE SALIDA ZFPC';
    const isFixedMonthlyService = isPositionMode || watchedConcept === 'IN-HOUSE INSPECTOR ZFPC' || watchedConcept === 'ALQUILER IMPRESORA ETIQUETADO';
    const showNumeroPersonas = selectedConceptInfo?.tariffType === 'ESPECIFICA' && !isBulkMode && !isPositionMode && !isTimeExtraMode && !['TIEMPO EXTRA ZFPC', 'SERVICIO DE TUNEL DE CONGELACIÓN RAPIDA', 'INSPECCIÓN ZFPC'].includes(watchedConcept);
    
    const showAdvancedFields = ['INSPECCIÓN ZFPC', 'TIEMPO EXTRA ZFPC', 'TOMA DE PESOS POR ETIQUETA HRS'].includes(watchedConcept);
    const showTimeExtraFields = ['TIEMPO EXTRA ZFPC', 'TIEMPO EXTRA FRIOAL', 'INSPECCIÓN ZFPC'].includes(watchedConcept);
    const showTunelCongelacionFields = watchedConcept === 'SERVICIO DE TUNEL DE CONGELACIÓN RAPIDA';


    useEffect(() => {
        if (isElectricConnection && watchedFechaArribo) {
            form.setValue('operationDate', watchedFechaArribo);
        }
    }, [isElectricConnection, watchedFechaArribo, form]);


    useEffect(() => {
        const setInitialRoles = () => {
            const roles = [
              { role: "SUPERVISOR", diurna: "HORA EXTRA DIURNA", nocturna: "HORA EXTRA NOCTURNA" },
              { role: "MONTACARGUISTA TRILATERAL", diurna: "HORA EXTRA DIURNA", nocturna: "HORA EXTRA NOCTURNA" },
              { role: "MONTACARGUISTA NORMAL", diurna: "HORA EXTRA DIURNA", nocturna: "HORA EXTRA NOCTURNA" },
              { role: "OPERARIO", diurna: "HORA EXTRA DIURNA", nocturna: "HORA EXTRA NOCTURNA" },
            ];
            
            const conceptTariffs = selectedConceptInfo?.specificTariffs || [];
            
            const bulkRoles = roles.map(r => {
                const diurnaTariff = conceptTariffs.find(t => t.name.includes(r.role) && t.name.includes(r.diurna));
                const nocturnaTariff = conceptTariffs.find(t => t.name.includes(r.role) && t.name.includes(r.nocturna));
                return {
                    roleName: r.role,
                    diurnaId: diurnaTariff?.id || '',
                    nocturnaId: nocturnaTariff?.id || '',
                    diurnaLabel: diurnaTariff?.name || 'No encontrado',
                    nocturnaLabel: nocturnaTariff?.name || 'No encontrado',
                    diurnaValue: diurnaTariff?.value || 0,
                    nocturnaValue: nocturnaTariff?.value || 0,
                    numPersonas: 0
                };
            });
            
            form.setValue('bulkRoles', bulkRoles);
        };

        if (watchedConcept === 'TIEMPO EXTRA FRIOAL (FIJO)' || watchedConcept === 'TIEMPO EXTRA FRIOAL') {
            if (selectedConceptInfo?.specificTariffs) {
                setInitialRoles();
            }
        } else {
            form.setValue('bulkRoles', []);
        }

        if (selectedConceptInfo?.tariffType !== 'ESPECIFICA') {
            form.setValue('specificTariffs', []);
        }

        if (selectedConceptInfo?.tariffType !== 'ESPECIFICA' && !isPositionMode) {
            form.setValue('numeroPersonas', undefined);
        } else if(showNumeroPersonas) {
             form.setValue('numeroPersonas', form.getValues('numeroPersonas') || 1);
        }
        
        if (isBulkMode) {
            form.setValue('operationDate', undefined);
            if (!form.getValues('selectedDates')) form.setValue('selectedDates', []);
        } else {
            form.setValue('selectedDates', []);
            form.setValue('excedentes', []);
            if (!form.getValues('operationDate')) form.setValue('operationDate', new Date());
        }
    }, [watchedConcept, selectedConceptInfo, form, isBulkMode, isPositionMode, showNumeroPersonas]);

    const fetchAllOperations = useCallback(async () => {
        setIsLoading(true);
        try {
            const data = await getAllManualClientOperations();
            setAllOperations(data);
            return data;
        } catch (error) {
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar las operaciones.' });
            return [];
        } finally {
            setIsLoading(false);
        }
    }, [toast]);
    
    useEffect(() => {
        fetchAllOperations();
    }, [fetchAllOperations]);
    
    const handleSearch = useCallback((operations: any[]) => {
        if (!dateRange || !dateRange.from || !dateRange.to) {
            toast({
                variant: 'destructive',
                title: 'Rango de Fecha Requerido',
                description: 'Por favor, seleccione un rango de fechas para la consulta.'
            });
            return;
        }

        let results = operations;

        const start = startOfDay(dateRange.from);
        const end = endOfDay(dateRange.to);
        
        results = results.filter(op => {
            const opDate = op.startDate ? new Date(op.startDate) : parseISO(op.operationDate);
            return isWithinInterval(opDate, { start, end });
        });

        if (selectedClient !== 'all') {
            results = results.filter(op => op.clientName === selectedClient);
        }
        if (selectedConcept !== 'all') {
            results = results.filter(op => op.concept === selectedConcept);
        }
        
        results.sort((a, b) => new Date(a.operationDate).getTime() - new Date(b.operationDate).getTime());

        setSearched(true);
        setFilteredOperations(results);
        
        if (results.length === 0) {
            toast({
                title: "Sin resultados",
                description: "No se encontraron operaciones con los filtros seleccionados."
            });
        }
    }, [selectedClient, selectedConcept, dateRange, toast]);
    
    const handleClearFilters = () => {
        setDateRange(undefined);
        setSelectedClient('all');
        setSelectedConcept('all');
        setFilteredOperations([]);
        setSearched(false);
    };

    const openDialog = (mode: DialogMode, op?: any) => {
        setDialogMode(mode);
        setOpToManage(op || null);
    
        if (op) {
            form.reset({
                ...op,
                operationDate: op.operationDate ? parseISO(op.operationDate) : undefined,
                selectedDates: (op.selectedDates || []).map((d: string) => parseISO(d)),
                details: {
                    ...op.details,
                    fechaArribo: op.details?.fechaArribo ? parseISO(op.details.fechaArribo) : undefined,
                    fechaSalida: op.details?.fechaSalida ? parseISO(op.details.fechaSalida) : undefined,
                },
                comentarios: op.comentarios || '',
            });
        } else {
            form.reset({
                clientName: "",
                concept: "",
                operationDate: new Date(),
                quantity: 1,
                specificTariffs: [],
                numeroPersonas: 1,
                comentarios: "",
                details: { startTime: '', endTime: '', plate: '', container: '', totalPallets: null, arin: '', opLogistica: undefined, fmmNumber: '', pedidoSislog: '', noDocumento: '' },
                bulkRoles: [],
                excedentes: [],
                selectedDates: [],
            });
        }
        setIsDialogOpen(true);
    };

    const onSubmit: SubmitHandler<ManualOperationValues> = async (data) => {
        if (!user) return;
        setIsSubmitting(true);
    
        try {
            let result;
            const isBulk = isBulkMode;
            
            const commonPayload = {
                clientName: data.clientName,
                concept: data.concept,
                details: data.details,
                comentarios: data.comentarios,
                createdBy: { uid: user.uid, displayName: displayName || user.email! }
            };

            if (isBulk && data.selectedDates && data.selectedDates.length > 0) {
                if (data.concept === 'TIEMPO EXTRA FRIOAL (FIJO)') {
                    const bulkData = {
                        ...commonPayload,
                        dates: data.selectedDates.map(d => format(d, 'yyyy-MM-dd')),
                        roles: data.bulkRoles!.filter(r => r.numPersonas > 0),
                        excedentes: data.excedentes || [],
                    };
                    result = await addBulkManualClientOperation(bulkData);
                } else { // isBulkRent or isServicioApoyo
                    const simpleBulkData = {
                        ...commonPayload,
                        dates: data.selectedDates.map(d => format(d, 'yyyy-MM-dd')),
                        quantity: data.quantity!,
                    };
                    result = await addBulkSimpleOperation(simpleBulkData);
                }
                if (!result.success) throw new Error(result.message);

            } else {
                if(!isBulk && (!data.operationDate || isNaN(data.operationDate.getTime()))){
                    throw new Error("La fecha de operación es inválida o no está definida.");
                }

                const payload: ManualClientOperationData = {
                    ...data,
                    details: {
                        ...data.details,
                        fechaArribo: data.details?.fechaArribo ? data.details.fechaArribo.toISOString() : undefined,
                        fechaSalida: data.details?.fechaSalida ? data.details.fechaSalida.toISOString() : undefined,
                    }
                };
                
                if (data.operationDate) {
                    payload.operationDate = data.operationDate.toISOString();
                } else {
                    delete payload.operationDate;
                }

                delete payload.selectedDates;
                
                if (data.concept !== 'TIEMPO EXTRA FRIOAL (FIJO)' && data.concept !== 'TIEMPO EXTRA FRIOAL') {
                    delete payload.bulkRoles;
                }
                delete payload.excedentes;
                
                payload.createdBy = commonPayload.createdBy;


                if (dialogMode === 'edit' && opToManage) {
                    result = await updateManualClientOperation(opToManage.id, payload);
                } else {
                    result = await addManualClientOperation(payload);
                }
                if (!result.success) throw new Error(result.message);
            }
    
            toast({ title: 'Éxito', description: result.message });
            setIsDialogOpen(false);
            form.reset();
            const updatedOps = await fetchAllOperations();
            if (searched && dateRange) {
                handleSearch(updatedOps);
            }
    
        } catch(error) {
            const errorMessage = error instanceof Error ? error.message : "Error desconocido al guardar.";
            toast({ variant: "destructive", title: "Error", description: errorMessage });
        } finally {
             setIsSubmitting(false);
        }
    };

    const handleDeleteConfirm = async () => {
        if (!opToDelete) return;
        setIsDeleting(true);
        const result = await deleteManualClientOperation(opToDelete.id);
        if (result.success) {
            toast({ title: 'Éxito', description: result.message });
            const updatedOps = await fetchAllOperations();
             if (searched && dateRange) {
                handleSearch(updatedOps);
            }
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.message });
        }
        setOpToDelete(null);
        setIsDeleting(false);
    };

    const handleCaptureTime = (fieldName: 'details.startTime' | 'details.endTime' | 'details.horaArribo' | 'details.horaSalida') => {
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        form.setValue(fieldName, `${hours}:${minutes}`, { shouldValidate: true });
    };

    const calculatedDuration = useMemo(() => {
        const [startTime, endTime] = watchedTimes;
        if (startTime && endTime) {
            try {
                const start = parse(startTime, 'HH:mm', new Date());
                let end = parse(endTime, 'HH:mm', new Date());
                
                if (end < start) {
                    end = addDays(end, 1);
                }
                
                const minutes = differenceInMinutes(end, start);
                const hours = minutes / 60;
                return { hours, minutes };
            } catch (e) {
                console.error("Error calculating duration:", e);
                return null;
            }
        }
        return null;
    }, [watchedTimes]);
    
    const calculatedElectricConnectionHours = useMemo(() => {
        const [fechaArribo, horaArribo, fechaSalida, horaSalida] = watchedElectricConnectionDates;
        if (fechaArribo && horaArribo && fechaSalida && horaSalida) {
            try {
                const startDateTime = parse(`${format(fechaArribo, 'yyyy-MM-dd')} ${horaArribo}`, 'yyyy-MM-dd HH:mm', new Date());
                const endDateTime = parse(`${format(fechaSalida, 'yyyy-MM-dd')} ${horaSalida}`, 'yyyy-MM-dd HH:mm', new Date());

                if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime()) || endDateTime < startDateTime) {
                    return null;
                }
                
                const diffMinutes = differenceInMinutes(endDateTime, startDateTime);
                const hours = parseFloat((diffMinutes / 60).toFixed(1));
                return hours;

            } catch(e) {
                 console.error("Error calculating electric connection duration:", e);
                return null;
            }
        }
        return null;
    }, [watchedElectricConnectionDates]);

    useEffect(() => {
        if (isTimeExtraMode && calculatedDuration?.hours !== undefined) {
          const roundedHours = parseFloat(calculatedDuration.hours.toFixed(2));
          form.setValue('quantity', roundedHours);
        } else if (isElectricConnection && calculatedElectricConnectionHours !== null) {
            form.setValue('quantity', calculatedElectricConnectionHours);
        }
    }, [isTimeExtraMode, calculatedDuration, isElectricConnection, calculatedElectricConnectionHours, form]);

    return (
        <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
            <div className="max-w-4xl mx-auto">
                <header className="mb-8">
                    <div className="relative flex items-center justify-center text-center">
                         <Button variant="ghost" size="icon" className="absolute left-0 top-1/2 -translate-y-1/2" onClick={() => router.push('/billing-reports')}>
                            <ArrowLeft className="h-6 w-6" />
                        </Button>
                        <div>
                            <div className="flex items-center justify-center gap-2">
                                <Edit className="h-8 w-8 text-primary" />
                                <h1 className="text-2xl font-bold text-primary">Registro de Operaciones Manuales Clientes</h1>
                            </div>
                             <p className="text-sm text-gray-500">Agregue, edite o elimine operaciones manuales para facturar a clientes.</p>
                        </div>
                    </div>
                </header>
                
                <Card>
                    <CardHeader>
                        <div className="flex justify-between items-center">
                            <CardTitle>Operaciones Registradas</CardTitle>
                            <Button onClick={() => openDialog('add')}>
                                <PlusCircle className="mr-2 h-4 w-4" />
                                Nueva Operación
                            </Button>
                        </div>
                        <CardDescription>Filtre y consulte las operaciones manuales guardadas en el sistema.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 items-end mb-6 p-4 border rounded-lg bg-muted/50">
                             <div className="space-y-2">
                                <Label>Rango de Fechas <span className="text-destructive">*</span></Label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !dateRange && "text-muted-foreground")}>
                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                            {dateRange?.from ? (
                                                dateRange.to ? (
                                                <>
                                                    {format(dateRange.from, "LLL dd, y", { locale: es })} -{" "}
                                                    {format(dateRange.to, "LLL dd, y", { locale: es })}
                                                </>
                                                ) : (
                                                format(dateRange.from, "LLL dd, y", { locale: es })
                                                )
                                            ) : (
                                                <span>Seleccione un rango</span>
                                            )}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0"><Calendar mode="range" selected={dateRange} onSelect={setDateRange} initialFocus numberOfMonths={2} /></PopoverContent>
                                </Popover>
                            </div>
                             <div className="space-y-2">
                                <Label>Cliente</Label>
                                <Select value={selectedClient} onValueChange={setSelectedClient}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos los Clientes</SelectItem>{[...new Set(allOperations.map(op => op.clientName).filter(Boolean))].sort((a,b) => a.localeCompare(b)).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
                            </div>
                             <div className="space-y-2">
                                <Label>Concepto</Label>
                                <Select value={selectedConcept} onValueChange={setSelectedConcept}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos los Conceptos</SelectItem>{[...new Set(allOperations.map(op => op.concept))].sort((a,b) => a.localeCompare(b)).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
                            </div>
                            <div className="flex items-end gap-2 xl:col-span-2">
                                <Button onClick={() => handleSearch(allOperations)} disabled={!dateRange || isLoading} className="w-full">
                                    <Search className="mr-2 h-4 w-4" />
                                    Consultar
                                </Button>
                                <Button onClick={handleClearFilters} variant="outline" className="w-full">
                                    <XCircle className="mr-2 h-4 w-4" />
                                    Limpiar
                                </Button>
                            </div>
                        </div>

                        <ScrollArea className="h-96">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Fecha</TableHead>
                                        <TableHead>Concepto</TableHead>
                                        <TableHead>Cliente</TableHead>
                                        <TableHead>Creado Por</TableHead>
                                        <TableHead className="text-right">Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading && !searched ? (
                                        <TableRow><TableCell colSpan={5} className="text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
                                    ) : filteredOperations.length > 0 ? (
                                        filteredOperations.map((op) => (
                                            <TableRow key={op.id}>
                                                <TableCell>{op.details?.fechaArribo && op.details?.fechaSalida ? `${format(parseISO(op.details.fechaArribo), 'dd/MM/yy')} - ${format(parseISO(op.details.fechaSalida), 'dd/MM/yy')}` : format(parseISO(op.operationDate), 'dd/MM/yyyy')}</TableCell>
                                                <TableCell>{op.concept}</TableCell>
                                                <TableCell>{op.clientName || 'No Aplica'}</TableCell>
                                                <TableCell>{op.createdBy?.displayName || 'N/A'}</TableCell>
                                                <TableCell className="text-right">
                                                    <Button variant="ghost" size="icon" title="Ver" onClick={() => openDialog('view', op)}>
                                                        <Eye className="h-4 w-4 text-gray-500" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" title="Editar" onClick={() => openDialog('edit', op)}>
                                                        <Edit2 className="h-4 w-4 text-blue-600" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" title="Eliminar" onClick={() => setOpToDelete(op)}>
                                                        <Trash2 className="h-4 w-4 text-destructive" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={5} className="h-24 text-center">
                                                <div className="flex flex-col items-center gap-4 py-8">
                                                    <FolderSearch className="h-12 w-12 text-primary" />
                                                    <h3 className="text-xl font-semibold">
                                                        {searched ? "No se encontraron resultados" : "Realice una búsqueda"}
                                                    </h3>
                                                    <p className="text-muted-foreground">
                                                        {searched
                                                            ? "No hay operaciones manuales para los filtros seleccionados."
                                                            : "Seleccione una fecha y haga clic en 'Consultar' para ver los registros."}
                                                    </p>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </ScrollArea>
                    </CardContent>
                </Card>

                <Dialog open={isDialogOpen} onOpenChange={(isOpen) => { if (!isOpen) setOpToManage(null); setIsDialogOpen(isOpen); }}>
                    <DialogContent className="sm:max-w-xl">
                        <DialogHeader>
                            <DialogTitle>
                                {dialogMode === 'add' && 'Registrar Operación Manual'}
                                {dialogMode === 'edit' && 'Editar Operación Manual'}
                                {dialogMode === 'view' && 'Detalles de la Operación Manual'}
                            </DialogTitle>
                             <DialogDescription>
                                {dialogMode === 'add' ? 'Complete los datos para registrar una operación.' : 'Viendo detalles de una operación registrada.'}
                            </DialogDescription>
                        </DialogHeader>
                        <ScrollArea className="max-h-[70vh]">
                            <div className="p-4">
                                <Form {...form}>
                                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                                        <ConceptFormBody form={form} clients={clients} billingConcepts={billingConcepts} dialogMode={dialogMode} isConceptDialogOpen={isConceptDialogOpen} setConceptDialogOpen={setConceptDialogOpen} handleCaptureTime={handleCaptureTime} isTimeExtraMode={isTimeExtraMode} isBulkMode={isBulkMode} isElectricConnection={isElectricConnection} isPositionMode={isPositionMode} isFmmConcept={isFmmConcept} isFmmZfpc={isFmmZfpc} showNumeroPersonas={showNumeroPersonas} showAdvancedFields={showAdvancedFields} showTimeExtraFields={showTimeExtraFields} showTunelCongelacionFields={showTunelCongelacionFields} calculatedDuration={calculatedDuration} calculatedElectricConnectionHours={calculatedElectricConnectionHours} isFixedMonthlyService={isFixedMonthlyService} />
                                        <DialogFooter>
                                            <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                                                {dialogMode === 'view' ? 'Cerrar' : 'Cancelar'}
                                            </Button>
                                            {dialogMode !== 'view' && (
                                                <Button type="submit" disabled={isSubmitting}>{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}Guardar</Button>
                                            )}
                                        </DialogFooter>
                                    </form>
                                </Form>
                            </div>
                        </ScrollArea>
                    </DialogContent>
                </Dialog>

                <AlertDialog open={!!opToDelete} onOpenChange={() => setOpToDelete(null)}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>¿Está seguro?</AlertDialogTitle>
                            <AlertDialogDesc>Esta acción eliminará permanentemente la operación manual.</AlertDialogDesc>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={handleDeleteConfirm} disabled={isDeleting} className={cn(buttonVariants({ variant: 'destructive' }))}>
                                {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                Sí, Eliminar
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

            </div>
        </div>
    );
}

function ConceptSelectorDialog({ billingConcepts, selectedClient, onSelect }: { billingConcepts: ClientBillingConcept[], selectedClient: string, onSelect: (conceptName: string) => void }) {
    const [search, setSearch] = useState('');
    
    const specialConcepts = ["MOVIMIENTO ENTRADA PRODUCTOS - PALLET", "MOVIMIENTO SALIDA PRODUCTOS - PALLET"];

    const filteredConcepts = useMemo(() => {
        const manualConcepts = billingConcepts.filter(c => 
            c.calculationType === 'MANUAL' || specialConcepts.includes(c.conceptName)
        );
        
        const clientSpecific = manualConcepts.filter(c => c.clientNames.includes(selectedClient));
        const global = manualConcepts.filter(c => 
            c.clientNames.includes('TODOS (Cualquier Cliente)') && 
            !clientSpecific.some(sc => sc.conceptName === c.conceptName)
        );
        
        let displayConcepts = [...clientSpecific, ...global];
        
        if (search) {
            displayConcepts = displayConcepts.filter(c => c.conceptName.toLowerCase().includes(search.toLowerCase()));
        }

        return displayConcepts.sort((a,b) => a.conceptName.localeCompare(b.conceptName));
    }, [search, billingConcepts, selectedClient]);

    return (
        <div className="p-4">
            <Input
                placeholder="Buscar concepto..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="mb-4"
            />
            <ScrollArea className="h-60">
                <div className="space-y-1">
                    {filteredConcepts.map(c => (
                        <Button
                            key={c.id}
                            variant="ghost"
                            className="w-full justify-start"
                            onClick={() => onSelect(c.conceptName)}
                        >
                            {c.conceptName}
                        </Button>
                    ))}
                    {filteredConcepts.length === 0 && (
                        <p className="text-center text-sm text-muted-foreground">No se encontraron conceptos para este cliente.</p>
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}

function ConceptFormBody(props: any) {
  const { form, clients, billingConcepts, dialogMode, isConceptDialogOpen, setConceptDialogOpen, handleCaptureTime, isTimeExtraMode, isBulkMode, isElectricConnection, isPositionMode, isFmmConcept, isFmmZfpc, showNumeroPersonas, showAdvancedFields, showTimeExtraFields, showTunelCongelacionFields, calculatedDuration, calculatedElectricConnectionHours, isFixedMonthlyService } = props;
  return (
    <>
      <FormField control={form.control} name="clientName" render={({ field }) => ( <FormItem><FormLabel>Cliente <span className="text-destructive">*</span></FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={dialogMode === 'view'}><FormControl><SelectTrigger><SelectValue placeholder="Seleccione un cliente" /></SelectTrigger></FormControl><SelectContent><ScrollArea className="h-60">{clients.map((c: ClientInfo) => <SelectItem key={c.id} value={c.razonSocial}>{c.razonSocial}</SelectItem>)}</ScrollArea></SelectContent></Select><FormMessage /></FormItem> )}/>
      <FormField
          control={form.control}
          name="concept"
          render={({ field }) => (
              <FormItem>
              <FormLabel>Concepto de Liquidación</FormLabel>
              <Dialog open={isConceptDialogOpen} onOpenChange={setConceptDialogOpen}>
                  <DialogTrigger asChild>
                  <FormControl>
                      <Button
                      variant="outline"
                      role="combobox"
                      disabled={dialogMode === 'view' || !form.watch('clientName')}
                      className={cn("w-full justify-between", !field.value && "text-muted-foreground")}
                      >
                      {field.value || "Seleccione un concepto"}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                  </FormControl>
                  </DialogTrigger>
                  <DialogContent>
                      <DialogHeader>
                          <DialogTitle>Seleccionar Concepto</DialogTitle>
                      </DialogHeader>
                      <ConceptSelectorDialog
                          billingConcepts={billingConcepts}
                          selectedClient={form.watch('clientName')}
                          onSelect={(conceptName) => {
                              form.setValue("concept", conceptName);
                              setConceptDialogOpen(false);
                          }}
                      />
                  </DialogContent>
              </Dialog>
              <FormMessage />
              </FormItem>
          )}
      />

      {isBulkMode ? (
          <FormField
            control={form.control}
            name="selectedDates"
            render={({ field }) => (
              <FormItem>
                  <FormLabel>Fechas de Operación</FormLabel>
                  <DateMultiSelector 
                      value={field.value} 
                      onChange={field.onChange} 
                      disabled={dialogMode === 'view'}
                  />
                  <FormMessage />
              </FormItem>
            )}
          />
      ) : (
          <>
          {isElectricConnection ? (
              <div className='p-4 border rounded-md'>
                  <div className="grid grid-cols-2 gap-4">
                      <FormField control={form.control} name="details.fechaArribo" render={({ field }) => ( <FormItem className="flex flex-col"><FormLabel>Fecha Arribo</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} disabled={dialogMode === 'view'} className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4 opacity-50" />{field.value ? format(field.value, "PPP", { locale: es }) : <span>Seleccione</span>}</Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={field.value} onSelect={field.onChange} disabled={dialogMode === 'view'} initialFocus /></PopoverContent></Popover><FormMessage /></FormItem> )} />
                      <FormField control={form.control} name="details.horaArribo" render={({ field }) => (<FormItem><FormLabel>Hora Arribo</FormLabel><div className="flex items-center gap-2"><FormControl><Input type="time" {...field} value={field.value ?? ''} disabled={dialogMode === 'view'} className="flex-grow" /></FormControl>{dialogMode !== 'view' && (<Button type="button" variant="outline" size="icon" onClick={() => handleCaptureTime('details.horaArribo')}><Clock className="h-4 w-4" /></Button>)}</div><FormMessage /></FormItem>)} />
                      <FormField control={form.control} name="details.fechaSalida" render={({ field }) => ( <FormItem className="flex flex-col"><FormLabel>Fecha Salida</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} disabled={dialogMode === 'view'} className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4 opacity-50" />{field.value ? format(field.value, "PPP", { locale: es }) : <span>Seleccione</span>}</Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={field.value} onSelect={field.onChange} disabled={(date) => { const fechaArribo = form.getValues('details.fechaArribo'); return fechaArribo ? date < fechaArribo : false; }} initialFocus /></PopoverContent></Popover><FormMessage /></FormItem> )} />
                      <FormField control={form.control} name="details.horaSalida" render={({ field }) => (<FormItem><FormLabel>Hora Salida</FormLabel><div className="flex items-center gap-2"><FormControl><Input type="time" {...field} value={field.value ?? ''} disabled={dialogMode === 'view'} className="flex-grow" /></FormControl>{dialogMode !== 'view' && (<Button type="button" variant="outline" size="icon" onClick={() => handleCaptureTime('details.horaSalida')}><Clock className="h-4 w-4" /></Button>)}</div><FormMessage /></FormItem>)} />
                  </div>
              </div>
          ) : (
              <FormField control={form.control} name="operationDate" render={({ field }) => ( <FormItem className="flex flex-col"><FormLabel>Fecha de Operación <span className="text-destructive">*</span></FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} disabled={dialogMode === 'view'} className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4 opacity-50" />{field.value && field.value instanceof Date && !isNaN(field.value.getTime()) ? format(field.value, "PPP", { locale: es }) : <span>Seleccione una fecha</span>}</Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={field.value} onSelect={field.onChange} disabled={dialogMode === 'view'} initialFocus /></PopoverContent></Popover><FormMessage /></FormItem> )} />
          )}
          </>
      )}

      {isElectricConnection ? (
          <FormField control={form.control} name="operationDate" render={({ field }) => ( <FormItem className="flex flex-col"><FormLabel>Fecha de Liquidación (para búsqueda) <span className="text-destructive">*</span></FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} disabled={dialogMode === 'view'} className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4 opacity-50" />{field.value && field.value instanceof Date && !isNaN(field.value.getTime()) ? format(field.value, "PPP", { locale: es }) : <span>Seleccione una fecha</span>}</Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={field.value} onSelect={field.onChange} disabled={dialogMode === 'view'} initialFocus /></PopoverContent></Popover><FormMessage /></FormItem> )} />
      ) : null}

      {calculatedDuration && (showTimeExtraFields || isTimeExtraMode) ? (
            <Alert variant="default" className="border-sky-500 bg-sky-50 text-sky-800">
              <Clock className="h-4 w-4 !text-sky-600" />
              <AlertTitle className="text-sky-700">Duración Calculada</AlertTitle>
              <FormDescription>
                  <span className="font-bold">{calculatedDuration.hours.toFixed(2)} horas</span> ({calculatedDuration.minutes} minutos).
                  {isTimeExtraMode && " Este valor se ha asignado a la cantidad."}
              </FormDescription>
          </Alert>
      ) : null}

      {isElectricConnection && calculatedElectricConnectionHours !== null && (
          <Alert variant="default" className="border-sky-500 bg-sky-50 text-sky-800">
              <Clock className="h-4 w-4 !text-sky-600" />
              <AlertTitle className="text-sky-700">Duración Calculada</AlertTitle>
              <FormDescription>
                  <span className="font-bold">{calculatedElectricConnectionHours.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} horas</span>. Este valor se ha asignado a la cantidad.
              </FormDescription>
          </Alert>
      )}
      
      {(isBulkMode || isTimeExtraMode) && <BulkRolesSection form={form} dialogMode={dialogMode} />}
      {isBulkMode && form.watch('concept') === 'TIEMPO EXTRA FRIOAL (FIJO)' && <ExcedentManager />}
      {props.selectedConceptInfo?.tariffType === 'ESPECIFICA' && !isBulkMode && !isTimeExtraMode && (
            <TariffSelector form={form} selectedConceptInfo={props.selectedConceptInfo} dialogMode={dialogMode} />
      )}
      
      {props.selectedConceptInfo?.unitOfMeasure && (props.selectedConceptInfo.tariffType === 'UNICA' || isElectricConnection || isFmmZfpc) && !isFixedMonthlyService && (
          <FormField
              control={form.control}
              name="quantity"
              render={({ field }) => (
                  <FormItem>
                      <FormLabel>
                          Cantidad
                          {props.selectedConceptInfo && <span className="text-muted-foreground ml-2">({props.selectedConceptInfo.unitOfMeasure})</span>}
                      </FormLabel>
                      <FormControl><Input type="number" step="0.01" placeholder="Ej: 1.5" {...field} value={field.value ?? ''} disabled={dialogMode === 'view' || isElectricConnection} /></FormControl>
                      <FormMessage />
                  </FormItem>
              )}
          />
      )}
      
      {(showAdvancedFields || dialogMode === 'view' || isElectricConnection || isFmmZfpc || isFmmConcept || showTimeExtraFields || showTunelCongelacionFields) && (
          <>
              <Separator />
              <p className="text-sm font-medium text-muted-foreground">Detalles Adicionales</p>
              {showTimeExtraFields && (
                  <div className="grid grid-cols-2 gap-4">
                      <FormField control={form.control} name="details.startTime" render={({ field }) => (<FormItem><FormLabel>Hora Inicio</FormLabel><div className="flex items-center gap-2"><FormControl><Input type="time" {...field} value={field.value ?? ''} disabled={dialogMode === 'view'} className="flex-grow" /></FormControl>{dialogMode !== 'view' && (<Button type="button" variant="outline" size="icon" onClick={() => handleCaptureTime('details.startTime')}><Clock className="h-4 w-4" /></Button>)}</div><FormMessage /></FormItem>)} />
                      <FormField control={form.control} name="details.endTime" render={({ field }) => (<FormItem><FormLabel>Hora Fin</FormLabel><div className="flex items-center gap-2"><FormControl><Input type="time" {...field} value={field.value ?? ''} disabled={dialogMode === 'view'} className="flex-grow" /></FormControl>{dialogMode !== 'view' && (<Button type="button" variant="outline" size="icon" onClick={() => handleCaptureTime('details.endTime')}><Clock className="h-4 w-4" /></Button>)}</div><FormMessage /></FormItem>)} />
                  </div>
              )}

              {(showAdvancedFields || isElectricConnection) && (
                    <FormField control={form.control} name="details.container" render={({ field }) => (<FormItem><FormLabel>Contenedor {(showAdvancedFields || isElectricConnection) && <span className="text-destructive">*</span>}</FormLabel><FormControl><Input placeholder="Contenedor" {...field} value={field.value ?? ''} disabled={dialogMode === 'view'} onChange={e => field.onChange(e.target.value.toUpperCase())} /></FormControl><FormMessage /></FormItem>)} />
              )}
              
              {props.watchedConcept === 'INSPECCIÓN ZFPC' && (
                    <FormField control={form.control} name="details.arin" render={({ field }) => (<FormItem><FormLabel>ARIN <span className="text-destructive">*</span>}</FormLabel><FormControl><Input placeholder="Número de ARIN" {...field} value={field.value ?? ''} disabled={dialogMode === 'view'} /></FormControl><FormMessage /></FormItem>)} />
              )}
              
                {isFmmConcept && (
                  <>
                      <FormField control={form.control} name="details.opLogistica" render={({ field }) => (
                          <FormItem>
                              <FormLabel>Op. Logística</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value} disabled={dialogMode === 'view'}><FormControl><SelectTrigger><SelectValue placeholder="Seleccione una opción" /></SelectTrigger></FormControl><SelectContent><SelectItem value="CARGUE">CARGUE</SelectItem><SelectItem value="DESCARGUE">DESCARGUE</SelectItem></SelectContent></Select>
                              <FormMessage />
                          </FormItem>
                      )} />
                      <FormField control={form.control} name="details.fmmNumber" render={({ field }) => (<FormItem><FormLabel># FMM</FormLabel><FormControl><Input placeholder="Número de FMM" {...field} value={field.value ?? ''} disabled={dialogMode === 'view'} /></FormControl><FormMessage /></FormItem>)} />
                  </>
              )}
              
              <FormField control={form.control} name="details.totalPallets" render={({ field }) => (<FormItem><FormLabel>Total Paletas</FormLabel><FormControl><Input type="number" step="1" placeholder="Ej: 10" {...field} value={field.value ?? ''} disabled={dialogMode === 'view'} onChange={e => field.onChange(e.target.value === '' ? null : parseInt(e.target.value, 10))}/></FormControl><FormMessage /></FormItem>)}/>
          
              {showTunelCongelacionFields && (
                  <>
                      <FormField control={form.control} name="details.pedidoSislog" render={({ field }) => (<FormItem><FormLabel>Pedido Sislog</FormLabel><FormControl><Input placeholder="Pedido Sislog" {...field} value={field.value ?? ''} disabled={dialogMode === 'view'} /></FormControl><FormMessage /></FormItem>)} />
                      <FormField control={form.control} name="details.plate" render={({ field }) => (<FormItem><FormLabel>Placa</FormLabel><FormControl><Input placeholder="Placa" {...field} value={field.value ?? ''} disabled={dialogMode === 'view'} /></FormControl><FormMessage /></FormItem>)} />
                      <FormField control={form.control} name="details.noDocumento" render={({ field }) => (<FormItem><FormLabel>No. Documento</FormLabel><FormControl><Input placeholder="No. Documento (máx. 20)" {...field} value={field.value ?? ''} disabled={dialogMode === 'view'} maxLength={20} /></FormControl><FormMessage /></FormItem>)} />
                  </>
              )}
          </>
      )}
      {isFmmZfpc && (
          <>
              <Separator />
              <p className="text-sm font-medium text-muted-foreground">Detalles FMM</p>
              <FormField control={form.control} name="details.opLogistica" render={({ field }) => (
                  <FormItem>
                      <FormLabel>Op. Logística <span className="text-destructive">*</span></FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={dialogMode === 'view'}><FormControl><SelectTrigger><SelectValue placeholder="Seleccione una opción" /></SelectTrigger></FormControl><SelectContent><SelectItem value="CARGUE">CARGUE</SelectItem><SelectItem value="DESCARGUE">DESCARGUE</SelectItem></SelectContent></Select>
                      <FormMessage />
                  </FormItem>
              )} />
              <FormField control={form.control} name="details.fmmNumber" render={({ field }) => (<FormItem><FormLabel># FMM <span className="text-destructive">*</span></FormLabel><FormControl><Input placeholder="Número de FMM" {...field} value={field.value ?? ''} disabled={dialogMode === 'view'} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="details.plate" render={({ field }) => (<FormItem><FormLabel>Placa <span className="text-destructive">*</span>}</FormLabel><FormControl><Input placeholder="Placa del vehículo" {...field} value={field.value ?? ''} disabled={dialogMode === 'view'} onChange={e => field.onChange(e.target.value.toUpperCase())} /></FormControl><FormMessage /></FormItem>)} />
          </>
      )}
      
      <FormField control={form.control} name="comentarios" render={({ field }) => (<FormItem><FormLabel>Comentarios</FormLabel><FormControl><Textarea placeholder="Añada un comentario..." {...field} value={field.value ?? ""} disabled={dialogMode === 'view'} /></FormControl><FormMessage /></FormItem>)}/>
    </>
  );
}

function ExcedentManager() {
    const { control, getValues, setValue } = useFormContext<ManualOperationValues>();
    const { fields, append, remove } = useFieldArray({
        control,
        name: "excedentes"
    });
    const selectedDates = useWatch({ control, name: 'selectedDates' }) || [];

    useEffect(() => {
        const currentExcedentes = getValues('excedentes') || [];
        const dateStrings = selectedDates.map(d => format(d, 'yyyy-MM-dd'));
        
        // Remove excedentes for dates that are no longer selected
        const newExcedentes = currentExcedentes.filter(e => dateStrings.includes(e.date));

        // Add new excedentes for newly selected dates
        dateStrings.forEach(dateStr => {
            if (!newExcedentes.some(e => e.date === dateStr)) {
                newExcedentes.push({ date: dateStr, hours: 0 });
            }
        });
        
        // Sort for consistent order
        newExcedentes.sort((a, b) => a.date.localeCompare(b.date));
        
        // Only update if there's a change to prevent re-renders
        if (JSON.stringify(newExcedentes) !== JSON.stringify(currentExcedentes)) {
            setValue('excedentes', newExcedentes);
        }

    }, [selectedDates, getValues, setValue]);

    if (selectedDates.length === 0) {
        return null;
    }

    return (
        <div className="space-y-4">
            <FormLabel className="text-base">Horas Excedentes</FormLabel>
            <FormDescription>
                Ingrese las horas extra trabajadas para cada fecha seleccionada.
            </FormDescription>
            <ScrollArea className="h-40 border rounded-md p-4">
                <div className="space-y-4">
                    {fields.map((field, index) => (
                        <FormField
                            key={field.id}
                            control={control}
                            name={`excedentes.${index}.hours`}
                            render={({ field: hourField }) => (
                                <FormItem>
                                    <div className="flex items-center gap-4">
                                        <Label htmlFor={`excedente-${index}`} className="w-32">
                                            {format(parseISO(field.date), 'd MMM, yyyy', { locale: es })}
                                        </Label>
                                        <FormControl>
                                            <Input
                                                id={`excedente-${index}`}
                                                type="number"
                                                min="0"
                                                step="0.1"
                                                className="h-8"
                                                {...hourField}
                                            />
                                        </FormControl>
                                        <span className="text-sm text-muted-foreground">horas</span>
                                    </div>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    ))}
                </div>
            </ScrollArea>
        </div>
    );
}

function BulkRolesSection({ form, dialogMode }: { form: any, dialogMode: DialogMode }) {
  const { fields } = useFieldArray({ control: form.control, name: 'bulkRoles' });
  return (
    <div className="space-y-4">
      <FormLabel className="text-base">Asignación de Personal</FormLabel>
      {fields.map((field, index) => (
        <div key={field.id} className="grid grid-cols-5 items-center gap-2 border-b pb-2">
          <Label className="col-span-2 text-sm">{field.roleName}</Label>
          <FormField
            control={form.control}
            name={`bulkRoles.${index}.numPersonas`}
            render={({ field: numField }) => (
              <FormItem className="col-span-3">
                <div className="flex items-center gap-2">
                  <Label htmlFor={`num-personas-${index}`} className="text-xs">Personas:</Label>
                  <FormControl>
                    <Input id={`num-personas-${index}`} type="number" min="0" step="1" className="h-8 w-20" {...numField} disabled={dialogMode === 'view'} />
                  </FormControl>
                </div>
              </FormItem>
            )}
          />
        </div>
      ))}
    </div>
  );
}

```
- src/hooks/use-form-persistence.ts:
```ts

"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { useForm, FieldValues, useWatch } from 'react-hook-form';
import { useAuth } from './use-auth';
import * as idb from '@/lib/idb';
import { useToast } from './use-toast';

export function useFormPersistence<T extends FieldValues>(
    formIdentifier: string, 
    form: ReturnType<typeof useForm<T>>,
    originalDefaultValues: T,
    attachments: string[], 
    setAttachments: (attachments: string[] | ((prev: string[]) => string[])) => void,
    isEditMode = false
) {
    const { user } = useAuth();
    const { reset, getValues } = form;
    const { toast } = useToast();

    const [isRestoreDialogOpen, setRestoreDialogOpen] = useState(false);
    
    // This ref prevents saving the form's initial (blank) state over a saved draft before the user has a chance to restore it.
    const hasCheckedForDraft = useRef(false);
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    
    // Use a ref for attachments to avoid stale closures in callbacks
    const attachmentsRef = useRef(attachments);
    useEffect(() => {
        attachmentsRef.current = attachments;
    }, [attachments]);

    const getStorageKey = useCallback(() => {
        if (!user) return null;
        return `${formIdentifier}-${user.uid}`;
    }, [formIdentifier, user]);

    // Use useWatch to get updates from the form values
    const watchedValues = useWatch({ control: form.control });
    
    const saveDraft = useCallback(async () => {
        const storageKey = getStorageKey();
        if (!storageKey) return;
        
        try {
            const currentValues = getValues();
            await idb.set(storageKey, currentValues);

            const attachmentsKey = `${storageKey}-attachments`;
            await idb.set(attachmentsKey, attachmentsRef.current);
            console.log(`[Draft Saved] Key: ${storageKey}`);
        } catch (e) {
            console.error("Failed to save draft to IndexedDB", e);
        }
    }, [getStorageKey, getValues]);


    // --- SAVE DRAFT LOGIC ---
    useEffect(() => {
        // Don't save anything until we've checked for an existing draft and decided whether to restore it.
        if (!hasCheckedForDraft.current) {
            return;
        }

        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }

        saveTimeoutRef.current = setTimeout(() => {
            saveDraft();
        }, 1000); // Debounce save by 1 second

        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    }, [watchedValues, attachments, saveDraft]);

    // --- RESTORE DRAFT LOGIC ---
    useEffect(() => {
        // Wait until user is authenticated.
        if (!user) {
            return;
        }
        
        // This effect should only run once when the user is available.
        if (hasCheckedForDraft.current) {
            return;
        }

        const storageKey = getStorageKey();
        if (!storageKey) return;
        
        const checkData = async () => {
            try {
                const savedData = await idb.get<T>(storageKey);
                const attachmentsKey = `${storageKey}-attachments`;
                const savedAttachments = await idb.get<string[]>(attachmentsKey);
                
                let hasMeaningfulData = false;
                if (savedData) {
                    if (isEditMode) {
                        hasMeaningfulData = true; // Any saved draft for an edit form is meaningful.
                    } else {
                        const hasTextFields = savedData.pedidoSislog || savedData.cliente || savedData.nombreCliente || savedData.conductor || savedData.nombreConductor;
                        const hasItems = savedData.items && (savedData.items.length > 1 || (savedData.items.length === 1 && savedData.items[0].descripcion?.trim()));
                        const hasProducts = savedData.productos && (savedData.productos.length > 1 || (savedData.productos.length === 1 && savedData.productos[0].descripcion?.trim()));

                        if (hasTextFields || hasItems || hasProducts) {
                            hasMeaningfulData = true;
                        }
                    }
                }
                
                if (hasMeaningfulData || (savedAttachments && savedAttachments.length > 0)) {
                    setRestoreDialogOpen(true);
                } else {
                    // No meaningful draft found, so we can enable saving.
                    hasCheckedForDraft.current = true;
                }
            } catch (e) {
                console.error("Failed to check for draft in IndexedDB", e);
                // On error, enable saving to prevent getting stuck.
                hasCheckedForDraft.current = true;
            }
        };

        // Use a short delay to ensure other initializations are complete.
        const timer = setTimeout(checkData, 100);
        return () => clearTimeout(timer);
    }, [isEditMode, user, getStorageKey]);


    const restoreDraft = useCallback(async () => {
        const storageKey = getStorageKey();
        if (!storageKey) return;

        try {
            const savedData = await idb.get<T>(storageKey);
            if (savedData) {
                const parsedData = savedData;
                // Convert date strings back to Date objects
                Object.keys(parsedData).forEach(key => {
                    const value = parsedData[key as keyof typeof parsedData];
                    if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
                         parsedData[key as keyof typeof parsedData] = new Date(value) as any;
                    }
                });
                reset(parsedData);
            }

            const attachmentsKey = `${storageKey}-attachments`;
            const savedAttachments = await idb.get<string[]>(attachmentsKey);
            if (savedAttachments) {
                setAttachments(savedAttachments);
            }
            
            toast({ title: "Datos Restaurados", description: "Tu borrador ha sido cargado." });
        } catch (e) {
            console.error("Failed to restore draft from IndexedDB", e);
            toast({ variant: 'destructive', title: "Error", description: "No se pudo restaurar el borrador." });
        } finally {
            setRestoreDialogOpen(false);
            hasCheckedForDraft.current = true; // Enable saving after restoring.
        }
    }, [getStorageKey, reset, setAttachments, toast]);

    const clearDraft = useCallback(async (showToast = false) => {
        // Stop any pending save
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }
        
        const storageKey = getStorageKey();
        if (!storageKey) return;
        
        try {
            const attachmentsKey = `${storageKey}-attachments`;
            await idb.del(storageKey);
            await idb.del(attachmentsKey);
            
            if (showToast) {
                 toast({ title: "Borrador Descartado" });
            }
        } catch (e) {
            console.error("Failed to clear draft from IndexedDB", e);
             if (showToast) {
                toast({ variant: "destructive", title: "Error", description: "No se pudo descartar el borrador." });
            }
        }
    }, [getStorageKey, toast]);

    const onDiscard = useCallback(async () => {
        // Stop any pending save that might be about to fire
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }
        await clearDraft(true);
        // This function will NOT reset the form state. The component is responsible for that.
        setRestoreDialogOpen(false);
        hasCheckedForDraft.current = true; // Enable saving for the new (reset) form state.
    }, [clearDraft]);
    
    return {
        isRestoreDialogOpen,
        onOpenChange: setRestoreDialogOpen,
        onRestore: restoreDraft,
        onDiscard: onDiscard,
        clearDraft: () => clearDraft(false)
    };
}
```
- src/lib/report-utils.ts:
```ts
export const processTunelACamaraData = (formData: any) => {
    const allItems = formData.items || [];
    
    const groupedByPresentation = allItems.reduce((acc: any, item: any) => {
        const presentation = item.presentacion || 'SIN PRESENTACIÓN';
        if (!acc[presentation]) {
            acc[presentation] = { products: {} };
        }
        
        const desc = item.descripcion || 'SIN DESCRIPCIÓN';
        if (!acc[presentation].products[desc]) {
            // Find corresponding summary item to get temperatures
            const summaryItem = formData.summary?.find((s: any) => s.descripcion === desc && s.presentacion === presentation);
            acc[presentation].products[desc] = {
                descripcion: desc,
                cantidad: 0,
                paletas: new Set(),
                pesoNeto: 0,
                temperatura1: summaryItem?.temperatura1,
                temperatura2: summaryItem?.temperatura2,
                temperatura3: summaryItem?.temperatura3,
            };
        }
        
        const productGroup = acc[presentation].products[desc];
        productGroup.cantidad += Number(item.cantidadPorPaleta) || 0;
        productGroup.pesoNeto += Number(item.pesoNeto) || 0;
        if (item.paleta !== undefined && !isNaN(Number(item.paleta)) && Number(item.paleta) > 0) {
            productGroup.paletas.add(item.paleta);
        }

        return acc;
    }, {});
    
    Object.values(groupedByPresentation).forEach((group: any) => {
        group.products = Object.values(group.products).map((prod: any) => ({
            ...prod,
            totalPaletas: prod.paletas.size,
        }));
        group.subTotalCantidad = group.products.reduce((sum: number, p: any) => sum + p.cantidad, 0);
        group.subTotalPeso = group.products.reduce((sum: number, p: any) => sum + p.pesoNeto, 0);
        group.subTotalPaletas = group.products.reduce((sum: number, p: any) => sum + p.totalPaletas, 0);
    });

    const totalGeneralCantidad = Object.values(groupedByPresentation).reduce((sum: number, group: any) => sum + group.subTotalCantidad, 0);
    const totalGeneralPeso = Object.values(groupedByPresentation).reduce((sum: number, group: any) => sum + group.subTotalPeso, 0);
    const totalGeneralPaletas = Object.values(groupedByPresentation).reduce((sum: number, group: any) => sum + group.subTotalPaletas, 0);
    
    return { groupedByPresentation, totalGeneralCantidad, totalGeneralPeso, totalGeneralPaletas };
};

export const processTunelCongelacionData = (formData: any) => {
    const placaGroups = (formData.placas || []).map((placa: any) => {
        const itemsByPresentation = (placa.items || []).reduce((acc: any, item: any) => {
            const presentation = item.presentacion || 'SIN PRESENTACIÓN';
            if (!acc[presentation]) {
                acc[presentation] = {
                    presentation: presentation,
                    products: [],
                };
            }
            acc[presentation].products.push(item);
            return acc;
        }, {});

        const presentationGroups = Object.values(itemsByPresentation).map((group: any) => {
             const productsWithSummary = group.products.reduce((acc: any, item: any) => {
                const desc = item.descripcion;
                if (!acc[desc]) {
                     const summaryItem = formData.summary?.find((s: any) => s.descripcion === desc && s.presentacion === group.presentation && s.placa === placa.numeroPlaca);
                     acc[desc] = {
                        descripcion: desc,
                        temperatura1: summaryItem?.temperatura1 || 'N/A',
                        temperatura2: summaryItem?.temperatura2 || 'N/A',
                        temperatura3: summaryItem?.temperatura3 || 'N/A',
                        totalPaletas: 0,
                        totalCantidad: 0,
                        totalPeso: 0,
                    };
                }
                acc[desc].totalPaletas += 1;
                acc[desc].totalCantidad += Number(item.cantidadPorPaleta) || 0;
                acc[desc].totalPeso += Number(item.pesoNeto) || 0;
                return acc;
             }, {});

             const subTotalPaletas = Object.values(productsWithSummary).reduce((sum: number, p: any) => sum + p.totalPaletas, 0);
             const subTotalCantidad = Object.values(productsWithSummary).reduce((sum: number, p: any) => sum + p.totalCantidad, 0);
             const subTotalPeso = Object.values(productsWithSummary).reduce((sum: number, p: any) => sum + p.totalPeso, 0);

            return {
                presentation: group.presentation,
                products: Object.values(productsWithSummary),
                subTotalPaletas,
                subTotalCantidad,
                subTotalPeso,
            };
        });

        const totalPaletasPlaca = presentationGroups.reduce((acc: number, group: any) => acc + group.subTotalPaletas, 0);
        const totalCantidadPlaca = presentationGroups.reduce((acc: number, group: any) => acc + group.subTotalCantidad, 0);
        const totalPesoPlaca = presentationGroups.reduce((acc: number, group: any) => acc + group.subTotalPeso, 0);

        return {
            placa: placa.numeroPlaca,
            conductor: placa.conductor,
            cedulaConductor: placa.cedulaConductor,
            presentationGroups: presentationGroups,
            totalPaletasPlaca,
            totalCantidadPlaca,
            totalPesoPlaca,
        };
    });

    const totalGeneralPaletas = placaGroups.reduce((acc, placa) => acc + placa.totalPaletasPlaca, 0);
    const totalGeneralCantidad = placaGroups.reduce((acc, placa) => acc + placa.totalCantidadPlaca, 0);
    const totalGeneralPeso = placaGroups.reduce((acc, placa) => acc + placa.totalPesoPlaca, 0);

    return { placaGroups, totalGeneralPaletas, totalGeneralCantidad, totalGeneralPeso };
};

export const processDefaultData = (formData: any) => {
    const allItems = formData.items || [];
    const isSummaryMode = allItems.some((p: any) => Number(p.paleta) === 0);
    
    const summaryData = (formData.summary || []).map((s: any) => {
        const totalPaletas = isSummaryMode
            ? allItems.filter((i: any) => i.descripcion === s.descripcion && Number(i.paleta) === 0).reduce((sum: number, i: any) => sum + (Number(i.totalPaletas) || 0), 0)
            : new Set(allItems.filter((i: any) => i.descripcion === s.descripcion).map((i: any) => i.paleta)).size;
        
        return { ...s, totalPaletas };
    });

    const totalGeneralPaletas = summaryData.reduce((acc: number, p: any) => acc + p.totalPaletas, 0);
    const totalGeneralCantidad = summaryData.reduce((acc: number, p: any) => acc + p.totalCantidad, 0);
    const totalGeneralPeso = summaryData.reduce((acc: number, p: any) => acc + p.totalPeso, 0);

    return { summaryData, totalGeneralPaletas, totalGeneralCantidad, totalGeneralPeso, isSummaryMode };
};

```
- src/hooks/use-form-persistence.ts:
```ts

"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { useForm, FieldValues, useWatch } from 'react-hook-form';
import { useAuth } from './use-auth';
import * as idb from '@/lib/idb';
import { useToast } from './use-toast';

export function useFormPersistence<T extends FieldValues>(
    formIdentifier: string, 
    form: ReturnType<typeof useForm<T>>,
    originalDefaultValues: T,
    attachments: string[], 
    setAttachments: (attachments: string[] | ((prev: string[]) => string[])) => void,
    isEditMode = false
) {
    const { user } = useAuth();
    const { reset, getValues } = form;
    const { toast } = useToast();

    const [isRestoreDialogOpen, setRestoreDialogOpen] = useState(false);
    
    // This ref prevents saving the form's initial (blank) state over a saved draft before the user has a chance to restore it.
    const hasCheckedForDraft = useRef(false);
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    
    // Use a ref for attachments to avoid stale closures in callbacks
    const attachmentsRef = useRef(attachments);
    useEffect(() => {
        attachmentsRef.current = attachments;
    }, [attachments]);

    const getStorageKey = useCallback(() => {
        if (!user) return null;
        return `${formIdentifier}-${user.uid}`;
    }, [formIdentifier, user]);

    // Use useWatch to get updates from the form values
    const watchedValues = useWatch({ control: form.control });
    
    const saveDraft = useCallback(async () => {
        const storageKey = getStorageKey();
        if (!storageKey) return;
        
        try {
            const currentValues = getValues();
            await idb.set(storageKey, currentValues);

            const attachmentsKey = `${storageKey}-attachments`;
            await idb.set(attachmentsKey, attachmentsRef.current);
            console.log(`[Draft Saved] Key: ${storageKey}`);
        } catch (e) {
            console.error("Failed to save draft to IndexedDB", e);
        }
    }, [getStorageKey, getValues]);


    // --- SAVE DRAFT LOGIC ---
    useEffect(() => {
        // Don't save anything until we've checked for an existing draft and decided whether to restore it.
        if (!hasCheckedForDraft.current) {
            return;
        }

        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }

        saveTimeoutRef.current = setTimeout(() => {
            saveDraft();
        }, 1000); // Debounce save by 1 second

        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    }, [watchedValues, attachments, saveDraft]);

    // --- RESTORE DRAFT LOGIC ---
    useEffect(() => {
        // Wait until user is authenticated.
        if (!user) {
            return;
        }
        
        // This effect should only run once when the user is available.
        if (hasCheckedForDraft.current) {
            return;
        }

        const storageKey = getStorageKey();
        if (!storageKey) return;
        
        const checkData = async () => {
            try {
                const savedData = await idb.get<T>(storageKey);
                const attachmentsKey = `${storageKey}-attachments`;
                const savedAttachments = await idb.get<string[]>(attachmentsKey);
                
                let hasMeaningfulData = false;
                if (savedData) {
                    if (isEditMode) {
                        hasMeaningfulData = true; // Any saved draft for an edit form is meaningful.
                    } else {
                        const hasTextFields = savedData.pedidoSislog || savedData.cliente || savedData.nombreCliente || savedData.conductor || savedData.nombreConductor;
                        const hasItems = savedData.items && (savedData.items.length > 1 || (savedData.items.length === 1 && savedData.items[0].descripcion?.trim()));
                        const hasProducts = savedData.productos && (savedData.productos.length > 1 || (savedData.productos.length === 1 && savedData.productos[0].descripcion?.trim()));

                        if (hasTextFields || hasItems || hasProducts) {
                            hasMeaningfulData = true;
                        }
                    }
                }
                
                if (hasMeaningfulData || (savedAttachments && savedAttachments.length > 0)) {
                    setRestoreDialogOpen(true);
                } else {
                    // No meaningful draft found, so we can enable saving.
                    hasCheckedForDraft.current = true;
                }
            } catch (e) {
                console.error("Failed to check for draft in IndexedDB", e);
                // On error, enable saving to prevent getting stuck.
                hasCheckedForDraft.current = true;
            }
        };

        // Use a short delay to ensure other initializations are complete.
        const timer = setTimeout(checkData, 100);
        return () => clearTimeout(timer);
    }, [isEditMode, user, getStorageKey]);


    const restoreDraft = useCallback(async () => {
        const storageKey = getStorageKey();
        if (!storageKey) return;

        try {
            const savedData = await idb.get<T>(storageKey);
            if (savedData) {
                const parsedData = savedData;
                // Convert date strings back to Date objects
                Object.keys(parsedData).forEach(key => {
                    const value = parsedData[key as keyof typeof parsedData];
                    if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
                         parsedData[key as keyof typeof parsedData] = new Date(value) as any;
                    }
                });
                reset(parsedData);
            }

            const attachmentsKey = `${storageKey}-attachments`;
            const savedAttachments = await idb.get<string[]>(attachmentsKey);
            if (savedAttachments) {
                setAttachments(savedAttachments);
            }
            
            toast({ title: "Datos Restaurados", description: "Tu borrador ha sido cargado." });
        } catch (e) {
            console.error("Failed to restore draft from IndexedDB", e);
            toast({ variant: 'destructive', title: "Error", description: "No se pudo restaurar el borrador." });
        } finally {
            setRestoreDialogOpen(false);
            hasCheckedForDraft.current = true; // Enable saving after restoring.
        }
    }, [getStorageKey, reset, setAttachments, toast]);

    const clearDraft = useCallback(async (showToast = false) => {
        // Stop any pending save
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }
        
        const storageKey = getStorageKey();
        if (!storageKey) return;
        
        try {
            const attachmentsKey = `${storageKey}-attachments`;
            await idb.del(storageKey);
            await idb.del(attachmentsKey);
            
            if (showToast) {
                 toast({ title: "Borrador Descartado" });
            }
        } catch (e) {
            console.error("Failed to clear draft from IndexedDB", e);
             if (showToast) {
                toast({ variant: "destructive", title: "Error", description: "No se pudo descartar el borrador." });
            }
        }
    }, [getStorageKey, toast]);

    const onDiscard = useCallback(async () => {
        // Stop any pending save that might be about to fire
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }
        await clearDraft(true);
        // This function will NOT reset the form state. The component is responsible for that.
        setRestoreDialogOpen(false);
        hasCheckedForDraft.current = true; // Enable saving for the new (reset) form state.
    }, [clearDraft]);
    
    return {
        isRestoreDialogOpen,
        onOpenChange: setRestoreDialogOpen,
        onRestore: restoreDraft,
        onDiscard: onDiscard,
        clearDraft: () => clearDraft(false)
    };
}
```
- src/lib/idb.ts:
```ts
// A simple key-value store using IndexedDB
const DB_NAME = 'frio-alimentaria-db';
const STORE_NAME = 'keyval';

function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      return reject('IndexedDB can only be used in the browser.');
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
  });
}

function withStore(type: IDBTransactionMode, callback: (store: IDBObjectStore) => void): Promise<void> {
  return getDB().then(db => {
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, type);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      callback(transaction.objectStore(STORE_NAME));
    });
  });
}

export async function get<T>(key: IDBValidKey): Promise<T | undefined> {
  let request: IDBRequest;
  await withStore('readonly', store => {
    request = store.get(key);
  });
  return (request! as IDBRequest<T>).result;
}

export function set(key: IDBValidKey, value: any): Promise<void> {
  return withStore('readwrite', store => {
    store.put(value, key);
  });
}

export function del(key: IDBValidKey): Promise<void> {
  return withStore('readwrite', store => {
    store.delete(key);
  });
}

export function clear(): Promise<void> {
  return withStore('readwrite', store => {
    store.clear();
  });
}
```
- src/app/globals.css:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  font-family: Arial, Helvetica, sans-serif;
}

@layer base {
  :root {
    --background: 210 40% 98%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary: 203 79% 44%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 208 92% 70%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 203 79% 44%;
    --chart-1: 12 76% 61%;
    --chart-2: 173 58% 39%;
    --chart-3: 197 37% 24%;
    --chart-4: 43 74% 66%;
    --chart-5: 27 87% 67%;
    --radius: 0.5rem;
    --sidebar-background: 0 0% 98%;
    --sidebar-foreground: 240 5.3% 26.1%;
    --sidebar-primary: 240 5.9% 10%;
    --sidebar-primary-foreground: 0 0% 98%;
    --sidebar-accent: 240 4.8% 95.9%;
    --sidebar-accent-foreground: 240 5.9% 10%;
    --sidebar-border: 220 13% 91%;
    --sidebar-ring: 217.2 91.2% 59.8%;
  }
  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;
    --primary: 203 79% 54%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 208 92% 60%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 203 79% 54%;
    --chart-1: 220 70% 50%;
    --chart-2: 160 60% 45%;
    --chart-3: 30 80% 55%;
    --chart-4: 280 65% 60%;
    --chart-5: 340 75% 55%;
    --sidebar-background: 240 5.9% 10%;
    --sidebar-foreground: 240 4.8% 95.9%;
    --sidebar-primary: 224.3 76.3% 48%;
    --sidebar-primary-foreground: 0 0% 100%;
    --sidebar-accent: 240 3.7% 15.9%;
    --sidebar-accent-foreground: 240 4.8% 95.9%;
    --sidebar-border: 240 3.7% 15.9%;
    --sidebar-ring: 217.2 91.2% 59.8%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```