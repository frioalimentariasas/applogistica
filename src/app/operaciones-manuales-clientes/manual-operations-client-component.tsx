

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
    quantity: z.coerce.number().min(0, "Debe ser >= 0").optional().default(0),
    role: z.string().optional(),
    numPersonas: z.coerce.number().int().min(0).optional(),
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
    const isElectricConnection = data.concept === 'CONEXIÓN ELÉCTRICA CONTENEDOR';
    const isFmmZfpc = data.concept === 'FMM DE INGRESO ZFPC (MANUAL)' || data.concept === 'FMM DE SALIDA ZFPC (MANUAL)';
    const isArinZfpc = data.concept === 'ARIN DE INGRESO ZFPC (MANUAL)' || data.concept === 'ARIN DE SALIDA ZFPC (MANUAL)';

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

    if (isPositionMode) {
        if (!data.specificTariffs || data.specificTariffs.length === 0) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Debe seleccionar al menos una tarifa.", path: ["specificTariffs"] });
        } else {
            const excessTariffIndex = data.specificTariffs?.findIndex(t => t.tariffId.includes('EXCESO'));
            if (excessTariffIndex !== undefined && excessTariffIndex > -1) {
                const excessTariff = data.specificTariffs?.[excessTariffIndex];
                 if (excessTariff && (excessTariff.quantity === undefined || excessTariff.quantity <= 0)) {
                    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La cantidad para la tarifa de exceso es requerida.", path: [`specificTariffs.${excessTariffIndex}.quantity`] });
                 }
            }
        }
    }
    
    if (isFmmZfpc) {
      if (!data.details?.opLogistica) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La Op. Logística es obligatoria.", path: ["details.opLogistica"] });
      if (!data.details?.fmmNumber?.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "El # FMM es obligatorio.", path: ["details.fmmNumber"] });
      if (!data.details?.plate?.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La Placa es obligatoria.", path: ["details.plate"] });
    }

    if (isArinZfpc) {
      if (!data.details?.opLogistica) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La Op. Logística es obligatoria.", path: ["details.opLogistica"] });
      if (!data.details?.arin?.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "El # ARIN es obligatorio.", path: ["details.arin"] });
      if (!data.details?.plate?.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La Placa es obligatoria.", path: ["details.plate"] });
      if (!data.details?.container?.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "El Contenedor es obligatorio.", path: ["details.container"] });
    }

    const specialConcepts = ['INSPECCIÓN ZFPC', 'TOMA DE PESOS POR ETIQUETA HRS'];
    if (specialConcepts.includes(data.concept)) {
        if (!data.details?.container?.trim()) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "El contenedor es obligatorio para este concepto.", path: ["details", "container"] });
        }
    }
    
    if (data.concept === 'INSPECCIÓN ZFPC') {
        if (!data.details?.arin?.trim()) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "El ARIN es obligatorio para este concepto.", path: ["details", "arin"] });
        }
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

    const watchedConcept = form.watch('concept');
    const watchedTimes = form.watch(['details.startTime', 'details.endTime']);
    const watchedElectricConnectionDates = form.watch(['details.fechaArribo', 'details.horaArribo', 'details.fechaSalida', 'details.horaSalida']);
    const watchedFechaArribo = form.watch('details.fechaArribo');

    const selectedConceptInfo = useMemo(() => billingConcepts.find(c => c.conceptName === watchedConcept), [watchedConcept, billingConcepts]);
    
    const isBulkMode = watchedConcept === 'TIEMPO EXTRA FRIOAL (FIJO)' || watchedConcept === 'ALQUILER DE ÁREA PARA EMPAQUE/DIA' || watchedConcept === 'SERVICIO APOYO JORNAL';
    const isTimeExtraMode = watchedConcept === 'TIEMPO EXTRA FRIOAL';
    const isPositionMode = watchedConcept === 'POSICIONES FIJAS CÁMARA CONGELADOS';
    const isElectricConnection = watchedConcept === 'CONEXIÓN ELÉCTRICA CONTENEDOR';
    const isFmmZfpc = watchedConcept === 'FMM DE INGRESO ZFPC (MANUAL)' || watchedConcept === 'FMM DE SALIDA ZFPC (MANUAL)';
    const isFmmConcept = isFmmZfpc || watchedConcept === 'FMM DE INGRESO ZFPC' || watchedConcept === 'FMM DE SALIDA ZFPC';
    const isArinZfpc = watchedConcept === 'ARIN DE INGRESO ZFPC (MANUAL)' || watchedConcept === 'ARIN DE SALIDA ZFPC (MANUAL)';
    const showAdvancedFields = ['TOMA DE PESOS POR ETIQUETA HRS', 'INSPECCIÓN ZFPC', 'TIEMPO EXTRA FRIOAL', 'TIEMPO EXTRA ZFPC'].includes(watchedConcept);
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
                { role: "SUPERVISOR", diurna: "DIURNA", nocturna: "NOCTURNA" },
                { role: "MONTACARGUISTA TRILATERAL", diurna: "DIURNA", nocturna: "NOCTURNA" },
                { role: "MONTACARGUISTA NORMAL", diurna: "DIURNA", nocturna: "NOCTURNA" },
                { role: "OPERARIO", diurna: "DIURNA", nocturna: "NOCTURNA" },
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
        
        if (isBulkMode) {
            form.setValue('operationDate', undefined);
            if (!form.getValues('selectedDates')) form.setValue('selectedDates', []);
        } else {
            form.setValue('selectedDates', []);
            form.setValue('excedentes', []);
            if (!form.getValues('operationDate')) form.setValue('operationDate', new Date());
        }
    }, [watchedConcept, selectedConceptInfo, form, isBulkMode]);

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
                             <p className="text-sm text-gray-500">Agregue, edite o elimine operaciones manuales de facturación a clientes.</p>
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
                                                            : "Seleccione un rango de fechas y haga clic en 'Consultar' para ver los registros."}
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
                                        <ConceptFormBody form={form} clients={clients} billingConcepts={billingConcepts} dialogMode={dialogMode} isConceptDialogOpen={isConceptDialogOpen} setConceptDialogOpen={setConceptDialogOpen} handleCaptureTime={handleCaptureTime} isTimeExtraMode={isTimeExtraMode} isBulkMode={isBulkMode} isElectricConnection={isElectricConnection} isPositionMode={isPositionMode} isFmmZfpc={isFmmZfpc} isArinZfpc={isArinZfpc} showAdvancedFields={showAdvancedFields} showTimeExtraFields={showTimeExtraFields} showTunelCongelacionFields={showTunelCongelacionFields} calculatedDuration={calculatedDuration} calculatedElectricConnectionHours={calculatedElectricConnectionHours} />
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

function ExcedentManager() {
    const { control, getValues, setValue } = useFormContext<ManualOperationValues>();
    const { fields } = useFieldArray({
        control,
        name: "excedentes"
    });
    const selectedDates = useWatch({ control, name: 'selectedDates' }) || [];

    useEffect(() => {
        const currentExcedentes = getValues('excedentes') || [];
        const dateStrings = selectedDates.map(d => format(d, 'yyyy-MM-dd'));
        
        const newExcedentes = dateStrings.map(dateStr => {
            const existing = currentExcedentes.find(e => e.date === dateStr);
            return existing || { date: dateStr, hours: 0 };
        }).sort((a, b) => a.date.localeCompare(b.date));
        
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

function BulkRolesSection({ form, dialogMode, conceptName }: { form: any; dialogMode: string; conceptName: string; }) {
  const { fields: bulkRoleFields } = useFieldArray({
      control: form.control,
      name: "bulkRoles"
  });
  
  const title = conceptName === 'ALQUILER DE ÁREA PARA EMPAQUE/DIA' ? 'Asignación de Área' : 'Asignación de Personal';

  return (
    <div className="space-y-4">
      <FormLabel className="text-base">{title}</FormLabel>
      {bulkRoleFields.map((field: any, index: number) => (
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

function TariffSelector({ form, selectedConceptInfo, dialogMode }: { form: any; selectedConceptInfo: ClientBillingConcept; dialogMode: string; }) {
    const { fields, replace } = useFieldArray({
        control: form.control,
        name: "specificTariffs"
    });
    const watchedTariffs = useWatch({ control: form.control, name: 'specificTariffs' }) || [];

    const handleToggle = (tariffId: string) => {
        const existingIndex = watchedTariffs.findIndex((t: any) => t.tariffId === tariffId);
        let newTariffs = [...watchedTariffs];
        if (existingIndex > -1) {
            newTariffs.splice(existingIndex, 1);
        } else {
            newTariffs.push({ tariffId, quantity: 0, role: '', numPersonas: 1 });
        }
        replace(newTariffs);
    };
    
    return (
        <div className="space-y-2">
            <FormLabel>Tarifas a Aplicar</FormLabel>
            <FormDescription>Seleccione una o más tarifas específicas para esta operación.</FormDescription>
            <div className="space-y-2 rounded-md border p-4">
                {(selectedConceptInfo?.specificTariffs || []).map(tariff => {
                    const selectedIndex = watchedTariffs.findIndex((t: any) => t.tariffId === tariff.id);
                    const isSelected = selectedIndex > -1;
                    
                    let showQuantity = false;
                    if (isSelected) {
                        if (selectedConceptInfo.conceptName === 'POSICIONES FIJAS CÁMARA CONGELADOS') {
                            showQuantity = tariff.name.includes("EXCESO");
                        } else if (
                            selectedConceptInfo.conceptName === 'TIEMPO EXTRA ZFPC' ||
                            selectedConceptInfo.conceptName === 'SERVICIO DE TUNEL DE CONGELACIÓN RAPIDA'
                        ) {
                            showQuantity = true;
                        }
                    }

                    const isDisabled = dialogMode === 'view';

                    return (
                        <div key={tariff.id} className="space-y-2">
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id={tariff.id}
                                    checked={isSelected}
                                    onCheckedChange={() => handleToggle(tariff.id)}
                                    disabled={isDisabled}
                                />
                                <Label htmlFor={tariff.id} className={cn("font-normal cursor-pointer flex-grow", isDisabled && "text-muted-foreground")}>{tariff.name} ({tariff.value.toLocaleString('es-CO', {style:'currency', currency: 'COP', minimumFractionDigits: 0})} / {tariff.unit})</Label>
                            </div>
                            {showQuantity && (
                                <FormField
                                    control={form.control}
                                    name={`specificTariffs.${selectedIndex}.quantity`}
                                    render={({ field }) => (
                                        <FormItem className="pl-6">
                                            <div className="flex items-center gap-2">
                                                <Label className="text-xs">Cant. ({tariff.unit}):</Label>
                                                <FormControl>
                                                    <Input
                                                        type="number"
                                                        step="1"
                                                        min="1"
                                                        className="h-8 w-24"
                                                        disabled={dialogMode === 'view'}
                                                        {...field}
                                                    />
                                                </FormControl>
                                            </div>
                                            <FormMessage className="text-xs" />
                                        </FormItem>
                                    )}
                                />
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function ConceptFormBody(props: any) {
  const { form, clients, billingConcepts, dialogMode, isConceptDialogOpen, setConceptDialogOpen, handleCaptureTime, isTimeExtraMode, isBulkMode, isElectricConnection, isPositionMode, isFmmZfpc, isArinZfpc, showAdvancedFields, showTimeExtraFields, showTunelCongelacionFields, calculatedDuration, calculatedElectricConnectionHours } = props;
  const watchedConcept = useWatch({ control: form.control, name: 'concept' });
  const selectedConceptInfo = useMemo(() => billingConcepts.find((c: ClientBillingConcept) => c.conceptName === watchedConcept), [watchedConcept, billingConcepts]);
  const isFmmConcept = isFmmZfpc || watchedConcept === 'FMM DE INGRESO ZFPC' || watchedConcept === 'FMM DE SALIDA ZFPC';
  
  const showNumeroPersonas = ['INSPECCIÓN ZFPC', 'TOMA DE PESOS POR ETIQUETA HRS', 'SERVICIO APOYO JORNAL'].includes(watchedConcept);
  const hideGeneralQuantityField = ['TIEMPO EXTRA FRIOAL (FIJO)', 'POSICIONES FIJAS CÁMARA CONGELADOS', 'IN-HOUSE INSPECTOR ZFPC', 'ALQUILER IMPRESORA ETIQUETADO', 'TIEMPO EXTRA ZFPC', 'SERVICIO DE TUNEL DE CONGELACIÓN RAPIDA', 'SERVICIO APOYO JORNAL'].includes(watchedConcept);
  const showAdvancedTariffs = ['POSICIONES FIJAS CÁMARA CONGELADOS', 'TIEMPO EXTRA ZFPC', 'SERVICIO DE TUNEL DE CONGELACIÓN RAPIDA'].includes(watchedConcept);
  
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
                          onSelect={(conceptName: string) => {
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
      
      {(isBulkMode || isTimeExtraMode) && <BulkRolesSection form={form} dialogMode={dialogMode} conceptName={watchedConcept}/>}

      {watchedConcept === 'TIEMPO EXTRA FRIOAL (FIJO)' && <ExcedentManager />}
      
      {showAdvancedTariffs && selectedConceptInfo && selectedConceptInfo.tariffType === 'ESPECIFICA' && <TariffSelector form={form} selectedConceptInfo={selectedConceptInfo} dialogMode={dialogMode} />}
      
      {!hideGeneralQuantityField && (
        <FormField
            control={form.control}
            name="quantity"
            render={({ field }) => (
                <FormItem>
                    <FormLabel>
                        Cantidad
                        {selectedConceptInfo && <span className="text-muted-foreground ml-2">({selectedConceptInfo.unitOfMeasure})</span>}
                    </FormLabel>
                    <FormControl><Input type="number" step="0.01" placeholder="Ej: 1.5" {...field} value={field.value ?? ''} disabled={dialogMode === 'view' || isElectricConnection || isTimeExtraMode} /></FormControl>
                    <FormMessage />
                </FormItem>
            )}
        />
      )}
      
      {showNumeroPersonas && (
        <FormField
          control={form.control}
          name="numeroPersonas"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Número de Personas</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  placeholder="Ej: 3"
                  {...field}
                  disabled={dialogMode === 'view'}
                  onChange={(e) => field.onChange(parseInt(e.target.value, 10) || undefined)}
                  value={field.value ?? ''}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {(showAdvancedFields || dialogMode === 'view' || isElectricConnection || isFmmZfpc || isFmmConcept || showTimeExtraFields || showTunelCongelacionFields || isArinZfpc) && (
          <>
              <Separator />
              <p className="text-sm font-medium text-muted-foreground">Detalles Adicionales</p>
              {showTimeExtraFields && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <FormField control={form.control} name="details.startTime" render={({ field }) => (<FormItem><FormLabel>Hora Inicio</FormLabel><div className="flex items-center gap-2"><FormControl><Input type="time" {...field} value={field.value ?? ''} disabled={dialogMode === 'view'} className="flex-grow" /></FormControl>{dialogMode !== 'view' && (<Button type="button" variant="outline" size="icon" onClick={() => handleCaptureTime('details.startTime')}><Clock className="h-4 w-4" /></Button>)}</div><FormMessage /></FormItem>)} />
                      <FormField control={form.control} name="details.endTime" render={({ field }) => (<FormItem><FormLabel>Hora Fin</FormLabel><div className="flex items-center gap-2"><FormControl><Input type="time" {...field} value={field.value ?? ''} disabled={dialogMode === 'view'} className="flex-grow" /></FormControl>{dialogMode !== 'view' && (<Button type="button" variant="outline" size="icon" onClick={() => handleCaptureTime('details.endTime')}><Clock className="h-4 w-4" /></Button>)}</div><FormMessage /></FormItem>)} />
                      <FormField
                          control={form.control}
                          name="details.plate"
                          render={({ field }) => (
                              <FormItem>
                                  <FormLabel>Placa (Opcional)</FormLabel>
                                  <FormControl>
                                      <Input 
                                          placeholder="ABC123" 
                                          {...field} 
                                          value={field.value ?? ''} 
                                          disabled={dialogMode === 'view'} 
                                          onChange={e => field.onChange(e.target.value.toUpperCase())} 
                                      />
                                  </FormControl>
                                  <FormMessage />
                              </FormItem>
                          )}
                      />
                  </div>
              )}

              {(showAdvancedFields || isElectricConnection || isFmmZfpc || isArinZfpc) && (
                    <FormField control={form.control} name="details.container" render={({ field }) => (<FormItem><FormLabel>Contenedor {(showAdvancedFields || isElectricConnection || isArinZfpc) && <span className="text-destructive">*</span>}</FormLabel><FormControl><Input placeholder="Contenedor" {...field} value={field.value ?? ''} disabled={dialogMode === 'view'} onChange={e => field.onChange(e.target.value.toUpperCase())} /></FormControl><FormMessage /></FormItem>)} />
              )}
              
              {(watchedConcept === 'INSPECCIÓN ZFPC' || isArinZfpc) && (
                  <FormField
                      control={form.control}
                      name="details.arin"
                      render={({ field }) => (
                          <FormItem>
                              <FormLabel># ARIN <span className="text-destructive">*</span></FormLabel>
                              <FormControl><Input placeholder="Número de ARIN" {...field} value={field.value ?? ''} disabled={dialogMode === 'view'} /></FormControl>
                              <FormMessage />
                          </FormItem>
                      )}
                  />
              )}
              
                {(isFmmConcept || isFmmZfpc || isArinZfpc) && (
                  <>
                      <FormField control={form.control} name="details.opLogistica" render={({ field }) => (
                          <FormItem>
                              <FormLabel>Op. Logística</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value} disabled={dialogMode === 'view'}><FormControl><SelectTrigger><SelectValue placeholder="Seleccione una opción" /></SelectTrigger></FormControl><SelectContent><SelectItem value="CARGUE">CARGUE</SelectItem><SelectItem value="DESCARGUE">DESCARGUE</SelectItem></SelectContent></Select>
                              <FormMessage />
                          </FormItem>
                      )} />
                      {(isFmmConcept || isFmmZfpc) && (
                        <FormField control={form.control} name="details.fmmNumber" render={({ field }) => (<FormItem><FormLabel># FMM</FormLabel><FormControl><Input placeholder="Número de FMM" {...field} value={field.value ?? ''} disabled={dialogMode === 'view'} /></FormControl><FormMessage /></FormItem>)} />
                      )}
                      {(isFmmZfpc || isArinZfpc) && (
                         <FormField control={form.control} name="details.plate" render={({ field }) => (<FormItem><FormLabel>Placa <span className="text-destructive">*</span></FormLabel><FormControl><Input placeholder="Placa del vehículo" {...field} value={field.value ?? ''} disabled={dialogMode === 'view'} onChange={e => field.onChange(e.target.value.toUpperCase())} /></FormControl><FormMessage /></FormItem>)} />
                      )}
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
      
      <FormField control={form.control} name="comentarios" render={({ field }) => (<FormItem><FormLabel>Comentarios</FormLabel><FormControl><Textarea placeholder="Añada un comentario..." {...field} value={field.value ?? ""} disabled={dialogMode === 'view'} /></FormControl><FormMessage /></FormItem>)}/>
    </>
  );
}

