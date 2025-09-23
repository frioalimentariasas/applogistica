

"use client";

import React, { useState, useMemo } from 'react';
import { useForm, SubmitHandler, useFieldArray, useWatch, FieldErrors, useFormContext, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';

import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { addClientBillingConcept, updateClientBillingConcept, deleteMultipleClientBillingConcepts, type ClientBillingConcept } from './actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Loader2, PlusCircle, Edit, Trash2, ShieldAlert, DollarSign, ChevronsUpDown, Check, Info, Calculator, ListChecks } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import type { ClientInfo } from '@/app/actions/clients';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import type { StandardObservation } from '@/app/gestion-observaciones/actions';


const tariffRangeSchema = z.object({
  minTons: z.coerce.number({ invalid_type_error: "Debe ser un número" }).min(0, "Debe ser >= 0"),
  maxTons: z.coerce.number({ invalid_type_error: "Debe ser un número" }).min(0, "Debe ser >= 0"),
  vehicleType: z.string().min(1, "El tipo de vehículo es requerido."),
  dayTariff: z.coerce.number({ invalid_type_error: "Debe ser un número" }).min(0, "Debe ser >= 0"),
  nightTariff: z.coerce.number({ invalid_type_error: "Debe ser un número" }).min(0, "Debe ser >= 0"),
}).refine(data => data.maxTons > data.minTons, {
    message: "Max. debe ser mayor que Min.",
    path: ['maxTons'],
});

const specificTariffSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, "El nombre es requerido."),
  value: z.coerce.number({ invalid_type_error: "Debe ser un número."}).min(0, "Debe ser >= 0"),
  unit: z.enum(['HORA', 'UNIDAD', 'DIA', 'VIAJE', 'ALIMENTACION', 'TRANSPORTE', 'HORA EXTRA DIURNA', 'HORA EXTRA NOCTURNA', 'HORA EXTRA DIURNA DOMINGO Y FESTIVO', 'HORA EXTRA NOCTURNA DOMINGO Y FESTIVO', 'TRANSPORTE EXTRAORDINARIO', 'TRANSPORTE DOMINICAL Y FESTIVO', 'POSICION/DIA', 'POSICIONES/MES', 'TRACTOMULA'], { required_error: 'Debe seleccionar una unidad.' }),
});

const fixedTimeConfigSchema = z.object({
    weekdayStartTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Formato HH:MM requerido.').optional(),
    weekdayEndTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Formato HH:MM requerido.').optional(),
    saturdayStartTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Formato HH:MM requerido.').optional(),
    saturdayEndTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Formato HH:MM requerido.').optional(),
    dayShiftEndTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Formato HH:MM requerido.').optional(),
});


const conceptSchema = z.object({
  conceptName: z.string().min(3, { message: "El nombre del concepto es requerido (mín. 3 caracteres)."}),
  clientNames: z.array(z.string()).min(1, { message: 'Debe seleccionar al menos un cliente.' }),
  unitOfMeasure: z.enum(['KILOGRAMOS', 'TONELADA', 'PALETA', 'ESTIBA', 'UNIDAD', 'CAJA', 'SACO', 'CANASTILLA', 'HORA', 'DIA', 'VIAJE', 'MES', 'CONTENEDOR', 'HORA EXTRA DIURNA', 'HORA EXTRA NOCTURNA', 'HORA EXTRA DIURNA DOMINGO Y FESTIVO', 'HORA EXTRA NOCTURNA DOMINGO Y FESTIVO', 'POSICION/DIA', 'POSICIONES', 'TIPO VEHÍCULO', 'TRACTOMULA'], { required_error: 'Debe seleccionar una unidad de medida.'}),
  
  calculationType: z.enum(['REGLAS', 'OBSERVACION', 'MANUAL'], { required_error: 'Debe seleccionar un tipo de cálculo.' }),
  
  // Calculation Rules (for REGLAS)
  calculationBase: z.enum(['TONELADAS', 'KILOGRAMOS', 'CANTIDAD_PALETAS', 'CANTIDAD_CAJAS', 'NUMERO_OPERACIONES', 'NUMERO_CONTENEDORES']).optional(),
  filterOperationType: z.enum(['recepcion', 'despacho', 'ambos']).optional(),
  filterProductType: z.enum(['fijo', 'variable', 'ambos']).optional(),
  
  // Observation Rule (for OBSERVACION)
  associatedObservation: z.string().optional(),

  // Tariff Rules
  tariffType: z.enum(['UNICA', 'RANGOS', 'ESPECIFICA'], { required_error: "Debe seleccionar un tipo de tarifa."}),
  value: z.coerce.number({invalid_type_error: "Debe ser un número"}).min(0, "Debe ser >= 0").optional(),
  dayShiftStart: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Formato HH:MM requerido.').optional(),
  dayShiftEnd: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Formato HH:MM requerido.').optional(),
  tariffRanges: z.array(tariffRangeSchema).optional(),
  specificTariffs: z.array(specificTariffSchema).optional(),
  fixedTimeConfig: fixedTimeConfigSchema.optional(),
}).superRefine((data, ctx) => {
    if (data.calculationType === 'REGLAS') {
        if (!data.calculationBase) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La base de cálculo es requerida.", path: ["calculationBase"] });
        if (!data.filterOperationType) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "El tipo de operación es requerido.", path: ["filterOperationType"] });
        if (!data.filterProductType) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "El tipo de producto es requerido.", path: ["filterProductType"] });
    }
    if (data.calculationType === 'OBSERVACION' && !data.associatedObservation) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Debe seleccionar una observación asociada.", path: ["associatedObservation"] });
    }

    if (data.tariffType === 'UNICA' && (data.value === undefined || data.value === null)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La tarifa es obligatoria.", path: ["value"] });
    }
    if (data.tariffType === 'RANGOS') {
        if (!data.dayShiftStart) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La hora de inicio es obligatoria.", path: ["dayShiftStart"] });
        if (!data.dayShiftEnd) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La hora de fin es obligatoria.", path: ["dayShiftEnd"] });
    }
    if (data.tariffType === 'ESPECIFICA' && (!data.specificTariffs || data.specificTariffs.length === 0)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Debe definir al menos una tarifa específica.", path: ["specificTariffs"] });
    }
    if (data.conceptName === 'TIEMPO EXTRA FRIOAL (FIJO)') {
        if (!data.fixedTimeConfig?.weekdayStartTime) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Hora de inicio L-V requerida.", path: ["fixedTimeConfig.weekdayStartTime"] });
        if (!data.fixedTimeConfig?.weekdayEndTime) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Hora de fin L-V requerida.", path: ["fixedTimeConfig.weekdayEndTime"] });
        if (!data.fixedTimeConfig?.saturdayStartTime) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Hora de inicio Sáb. requerida.", path: ["fixedTimeConfig.saturdayStartTime"] });
        if (!data.fixedTimeConfig?.saturdayEndTime) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Hora de fin Sáb. requerida.", path: ["fixedTimeConfig.saturdayEndTime"] });
        if (!data.fixedTimeConfig?.dayShiftEndTime) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Hora de fin turno diurno requerida.", path: ["fixedTimeConfig.dayShiftEndTime"] });
    }
});


type ConceptFormValues = z.infer<typeof conceptSchema>;

const AccessDenied = () => (
    <div className="flex flex-col items-center justify-center text-center gap-4">
        <div className="rounded-full bg-destructive/10 p-4">
            <ShieldAlert className="h-12 w-12 text-destructive" />
        </div>
        <h3 className="text-xl font-semibold">Acceso Denegado</h3>
        <p className="text-muted-foreground">
            No tiene permisos para acceder a esta página.
        </p>
    </div>
);

export default function ConceptManagementClientComponent({ initialClients, initialConcepts, standardObservations }: { initialClients: ClientInfo[], initialConcepts: ClientBillingConcept[], standardObservations: StandardObservation[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const { permissions, loading: authLoading } = useAuth();
  
  const [concepts, setConcepts] = useState<ClientBillingConcept[]>(initialConcepts);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [conceptToEdit, setConceptToEdit] = useState<ClientBillingConcept | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isConfirmBulkDeleteOpen, setIsConfirmBulkDeleteOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  
  const addForm = useForm<ConceptFormValues>({
    resolver: zodResolver(conceptSchema),
    defaultValues: {
      conceptName: '',
      clientNames: [],
      unitOfMeasure: undefined,
      calculationType: 'REGLAS',
      calculationBase: undefined,
      filterOperationType: 'ambos',
      filterProductType: 'ambos',
      associatedObservation: undefined,
      tariffType: 'UNICA',
      value: 0,
      dayShiftStart: '07:00',
      dayShiftEnd: '19:00',
      tariffRanges: [],
      specificTariffs: [],
      fixedTimeConfig: {
        weekdayStartTime: "17:00",
        weekdayEndTime: "22:00",
        saturdayStartTime: "12:00",
        saturdayEndTime: "17:00",
        dayShiftEndTime: "19:00",
      },
    },
  });

  const { fields: addFields, append: addAppend, remove: addRemove } = useFieldArray({ control: addForm.control, name: "tariffRanges" });
  const { fields: addSpecificFields, append: addSpecificAppend, remove: addSpecificRemove } = useFieldArray({ control: addForm.control, name: "specificTariffs" });
  const watchedAddTariffType = useWatch({ control: addForm.control, name: "tariffType" });
  const watchedAddCalculationType = useWatch({ control: addForm.control, name: "calculationType" });
  const watchedAddConceptName = useWatch({ control: addForm.control, name: "conceptName" });
  
  const editForm = useForm<ConceptFormValues>({ resolver: zodResolver(conceptSchema) });
  const { fields: editFields, append: editAppend, remove: editRemove } = useFieldArray({ control: editForm.control, name: "tariffRanges" });
  const { fields: editSpecificFields, append: editSpecificAppend, remove: editSpecificRemove } = useFieldArray({ control: editForm.control, name: "specificTariffs" });
  const watchedEditTariffType = useWatch({ control: editForm.control, name: "tariffType" });
  const watchedEditCalculationType = useWatch({ control: editForm.control, name: "calculationType" });
  const watchedEditConceptName = useWatch({ control: editForm.control, name: "conceptName" });


  const clientOptions: ClientInfo[] = useMemo(() => [
    { id: 'TODOS', razonSocial: 'TODOS (Cualquier Cliente)' }, 
    ...initialClients
  ], [initialClients]);
  
  const onAddSubmit: SubmitHandler<ConceptFormValues> = async (data) => {
    setIsSubmitting(true);
    const result = await addClientBillingConcept(data as Omit<ClientBillingConcept, 'id'>);
    if (result.success && result.newConcept) {
      toast({ title: 'Éxito', description: result.message });
      setConcepts(prev => [...prev, result.newConcept!]);
      addForm.reset();
    } else {
      toast({ variant: 'destructive', title: 'Error', description: result.message });
    }
    setIsSubmitting(false);
  };
  
  const onEditSubmit: SubmitHandler<ConceptFormValues> = async (data) => {
    if (!conceptToEdit) return;
    setIsEditing(true);
    const result = await updateClientBillingConcept(conceptToEdit.id, data as Omit<ClientBillingConcept, 'id'>);
    if (result.success) {
      toast({ title: 'Éxito', description: result.message });
      setConcepts(prev => prev.map(s => s.id === conceptToEdit.id ? { ...data, id: s.id } as ClientBillingConcept : s));
      setConceptToEdit(null);
    } else {
      toast({ variant: 'destructive', title: 'Error', description: result.message });
    }
    setIsEditing(false);
  };

  const handleBulkDeleteConfirm = async () => {
    if (selectedIds.size === 0) return;
    setIsBulkDeleting(true);
    const idsToDelete = Array.from(selectedIds);
    const result = await deleteMultipleClientBillingConcepts(idsToDelete);
    if (result.success) {
      toast({ title: 'Éxito', description: result.message });
      setConcepts(prev => prev.filter(s => !selectedIds.has(s.id)));
      setSelectedIds(new Set());
    } else {
      toast({ variant: 'destructive', title: 'Error', description: result.message });
    }
    setIsConfirmBulkDeleteOpen(false);
    setIsBulkDeleting(false);
  };

  const openEditDialog = (concept: ClientBillingConcept) => {
    setConceptToEdit(concept);
    editForm.reset({
        ...concept,
        value: concept.value ?? 0,
        dayShiftStart: concept.dayShiftStart || '07:00',
        dayShiftEnd: concept.dayShiftEnd || '19:00',
        tariffRanges: concept.tariffRanges || [],
        specificTariffs: concept.specificTariffs || [],
        calculationType: concept.calculationType || 'REGLAS',
        fixedTimeConfig: concept.fixedTimeConfig || {
            weekdayStartTime: "17:00",
            weekdayEndTime: "22:00",
            saturdayStartTime: "12:00",
            saturdayEndTime: "17:00",
            dayShiftEndTime: "19:00",
        },
    });
  };

  const handleRowSelect = (id: string, checked: boolean) => {
    const newSet = new Set(selectedIds);
    if (checked) newSet.add(id); else newSet.delete(id);
    setSelectedIds(newSet);
  };
  
  const sortedConcepts = useMemo(() => {
    const order: Record<string, number> = {
        'REGLAS': 1,
        'OBSERVACION': 2,
        'MANUAL': 3,
    };

    return [...concepts].sort((a, b) => {
        const orderA = order[a.calculationType] ?? 99;
        const orderB = order[b.calculationType] ?? 99;

        if (orderA !== orderB) {
            return orderA - orderB;
        }
        return a.conceptName.localeCompare(b.conceptName);
    });
  }, [concepts]);

  const isAllSelected = useMemo(() => {
    if (sortedConcepts.length === 0) return false;
    return sortedConcepts.every(s => selectedIds.has(s.id));
  }, [selectedIds, sortedConcepts]);
  
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(sortedConcepts.map(s => s.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  if (authLoading) {
      return <div className="flex min-h-screen w-full items-center justify-center"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>
  }

  if (!permissions.canManageClientLiquidationConcepts) {
      return (
          <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8 flex items-center justify-center">
              <div className="max-w-xl mx-auto text-center">
                  <AccessDenied />
                  <Button onClick={() => router.push('/')} className="mt-6"><ArrowLeft className="mr-2 h-4 w-4" />Volver al Inicio</Button>
              </div>
          </div>
      );
  }

  const unitOfMeasureOptions = ['KILOGRAMOS', 'TONELADA', 'PALETA', 'ESTIBA', 'UNIDAD', 'CAJA', 'SACO', 'CANASTILLA', 'HORA', 'DIA', 'VIAJE', 'MES', 'CONTENEDOR', 'HORA EXTRA DIURNA', 'HORA EXTRA NOCTURNA', 'HORA EXTRA DIURNA DOMINGO Y FESTIVO', 'HORA EXTRA NOCTURNA DOMINGO Y FESTIVO', 'POSICION/DIA', 'POSICIONES', 'TIPO VEHÍCULO', 'TRACTOMULA'];
  const specificUnitOptions = ['HORA', 'UNIDAD', 'DIA', 'VIAJE', 'ALIMENTACION', 'TRANSPORTE', 'HORA EXTRA DIURNA', 'HORA EXTRA NOCTURNA', 'HORA EXTRA DIURNA DOMINGO Y FESTIVO', 'HORA EXTRA NOCTURNA DOMINGO Y FESTIVO', 'TRANSPORTE EXTRAORDINARIO', 'TRANSPORTE DOMINICAL Y FESTIVO', 'POSICION/DIA', 'POSICIONES/MES', 'TRACTOMULA'];

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <div className="relative flex items-center justify-center text-center">
            <Button variant="ghost" size="icon" className="absolute left-0 top-1/2 -translate-y-1/2" onClick={() => router.push('/')}>
              <ArrowLeft className="h-6 w-6" />
            </Button>
            <div>
              <div className="flex items-center justify-center gap-2">
                <DollarSign className="h-8 w-8 text-primary" />
                <h1 className="text-2xl font-bold text-primary">Gestión de Conceptos de Liquidación Clientes</h1>
              </div>
              <p className="text-sm text-gray-500">Defina los conceptos y tarifas para la facturación de servicios a clientes.</p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1">
                <Card>
                    <CardHeader>
                        <CardTitle>Nuevo Concepto de Cliente</CardTitle>
                        <CardDescription>Cree una nueva regla de cobro para uno o más clientes.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Form {...addForm}>
                            <form onSubmit={addForm.handleSubmit(onAddSubmit)} className="space-y-4">
                                <FormField control={addForm.control} name="conceptName" render={({ field }) => (<FormItem><FormLabel>Nombre del Concepto</FormLabel><FormControl><Input placeholder="Ej: ALMACENAMIENTO PALETA/DIA" {...field} onChange={e => field.onChange(e.target.value.toUpperCase())} /></FormControl><FormMessage /></FormItem>)}/>
                                <FormField
                                  control={addForm.control}
                                  name="clientNames"
                                  render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Aplicar a Cliente(s)</FormLabel>
                                        <ClientMultiSelectDialog
                                            options={clientOptions.map(c => ({value: c.razonSocial, label: c.razonSocial}))}
                                            selected={field.value}
                                            onChange={field.onChange}
                                            placeholder="Seleccione clientes..."
                                        />
                                        <FormMessage />
                                    </FormItem>
                                  )}
                                />
                                <FormField control={addForm.control} name="unitOfMeasure" render={({ field }) => (<FormItem><FormLabel>Unidad de Medida (Para Reporte)</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Seleccione una unidad" /></SelectTrigger></FormControl><SelectContent>{unitOfMeasureOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)}/>
                                
                                <Separator />
                                <FormField control={addForm.control} name="calculationType" render={({ field }) => (
                                    <FormItem className="space-y-3">
                                        <FormLabel>Tipo de Cálculo</FormLabel>
                                        <FormControl>
                                            <RadioGroup onValueChange={field.onChange} value={field.value} className="flex flex-wrap gap-4">
                                                <FormItem className="flex items-center space-x-2"><RadioGroupItem value="REGLAS" id="add-reglas" /><Label htmlFor="add-reglas">Por Reglas</Label></FormItem>
                                                <FormItem className="flex items-center space-x-2"><RadioGroupItem value="OBSERVACION" id="add-obs" /><Label htmlFor="add-obs">Por Observación</Label></FormItem>
                                                <FormItem className="flex items-center space-x-2"><RadioGroupItem value="MANUAL" id="add-manual" /><Label htmlFor="add-manual">Op. Manual</Label></FormItem>
                                            </RadioGroup>
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}/>
                                
                                {watchedAddCalculationType === 'REGLAS' && (
                                    <div className='space-y-4 p-4 border rounded-md bg-muted/20'>
                                        <FormField control={addForm.control} name="calculationBase" render={({ field }) => (<FormItem><FormLabel>Calcular Usando</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Seleccione una base..." /></SelectTrigger></FormControl><SelectContent><SelectItem value="TONELADAS">TONELADAS</SelectItem><SelectItem value="KILOGRAMOS">KILOGRAMOS</SelectItem><SelectItem value="CANTIDAD_PALETAS">CANTIDAD DE PALETAS</SelectItem><SelectItem value="CANTIDAD_CAJAS">CANTIDAD DE CAJAS/UNIDADES</SelectItem><SelectItem value="NUMERO_OPERACIONES">NÚMERO DE OPERACIONES</SelectItem><SelectItem value="NUMERO_CONTENEDORES">NÚMERO DE CONTENEDORES</SelectItem></SelectContent></Select><FormMessage /></FormItem>)}/>
                                        <FormField control={addForm.control} name="filterOperationType" render={({ field }) => (<FormItem><FormLabel>Filtrar por Tipo de Operación</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent><SelectItem value="ambos">Ambos (Recepción y Despacho)</SelectItem><SelectItem value="recepcion">Recepción</SelectItem><SelectItem value="despacho">Despacho</SelectItem></SelectContent></Select><FormMessage /></FormItem>)}/>
                                        <FormField control={addForm.control} name="filterProductType" render={({ field }) => (<FormItem><FormLabel>Filtrar por Tipo de Producto</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent><SelectItem value="ambos">Ambos (Peso Fijo y Variable)</SelectItem><SelectItem value="fijo">Peso Fijo</SelectItem><SelectItem value="variable">Peso Variable</SelectItem></SelectContent></Select><FormMessage /></FormItem>)}/>
                                    </div>
                                )}
                                {watchedAddCalculationType === 'OBSERVACION' && (
                                     <div className='space-y-4 p-4 border rounded-md bg-muted/20'>
                                        <FormField control={addForm.control} name="associatedObservation" render={({ field }) => (<FormItem><FormLabel>Observación Asociada</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Seleccione una observación..." /></SelectTrigger></FormControl><SelectContent>{standardObservations.map(obs => <SelectItem key={obs.id} value={obs.name}>{obs.name}</SelectItem>)}</SelectContent></Select><FormDescription>El sistema buscará esta observación en los formularios.</FormDescription><FormMessage /></FormItem>)}/>
                                    </div>
                                )}

                                <Separator />

                                <FormField
                                    control={addForm.control}
                                    name="tariffType"
                                    render={({ field }) => (
                                        <FormItem className="space-y-3">
                                        <FormLabel>Tipo de Tarifa</FormLabel>
                                        <FormControl>
                                            <RadioGroup onValueChange={field.onChange} value={field.value} className="flex flex-wrap gap-4">
                                                <FormItem className="flex items-center space-x-2"><RadioGroupItem value="UNICA" id="add-unica" /><Label htmlFor="add-unica">Única</Label></FormItem>
                                                <FormItem className="flex items-center space-x-2"><RadioGroupItem value="RANGOS" id="add-rangos" /><Label htmlFor="add-rangos">Rangos</Label></FormItem>
                                                <FormItem className="flex items-center space-x-2"><RadioGroupItem value="ESPECIFICA" id="add-especifica" /><Label htmlFor="add-especifica">Específica</Label></FormItem>
                                            </RadioGroup>
                                        </FormControl>
                                        <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                {watchedAddTariffType === 'UNICA' && (
                                     <FormField control={addForm.control} name="value" render={({ field }) => (<FormItem><FormLabel>Tarifa Única (COP)</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                                )}
                                
                                {watchedAddTariffType === 'RANGOS' && (
                                    <div className='space-y-4 p-4 border rounded-md bg-muted/20'>
                                        <div className="space-y-2">
                                            <FormLabel>Definición de Turno</FormLabel>
                                            <div className="grid grid-cols-2 gap-4">
                                            <FormField control={addForm.control} name="dayShiftStart" render={({ field }) => (<FormItem><FormLabel>Inicio Turno Diurno</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>)} />
                                            <FormField control={addForm.control} name="dayShiftEnd" render={({ field }) => (<FormItem><FormLabel>Fin Turno Diurno</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>)} />
                                            </div>
                                        </div>
                                        <Separator />

                                        <div className="space-y-2">
                                            <FormLabel>Rangos de Tarifas (Opcional)</FormLabel>
                                            <FormDescription>Añada rangos si la tarifa varía por peso. Déjelo vacío para usar la misma tarifa sin importar el peso.</FormDescription>
                                        </div>
                                        
                                        <div className="space-y-4">
                                            {addFields.map((field, index) => (
                                                <div key={field.id} className="grid grid-cols-1 gap-3 border p-3 rounded-md relative">
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <FormField control={addForm.control} name={`tariffRanges.${index}.minTons`} render={({ field }) => (<FormItem><FormLabel>Min. Ton.</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                                                        <FormField control={addForm.control} name={`tariffRanges.${index}.maxTons`} render={({ field }) => (<FormItem><FormLabel>Max. Ton.</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                                                    </div>
                                                    <FormField control={addForm.control} name={`tariffRanges.${index}.vehicleType`} render={({ field }) => (<FormItem><FormLabel>Tipo Vehículo</FormLabel><FormControl><Input placeholder="EJ: TURBO" {...field} onChange={e => field.onChange(e.target.value.toUpperCase())} /></FormControl><FormMessage /></FormItem>)}/>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <FormField control={addForm.control} name={`tariffRanges.${index}.dayTariff`} render={({ field }) => (<FormItem><FormLabel>Tarifa Diurna</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                                                        <FormField control={addForm.control} name={`tariffRanges.${index}.nightTariff`} render={({ field }) => (<FormItem><FormLabel>Tarifa Nocturna</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                                                    </div>
                                                    <Button type="button" variant="ghost" size="icon" className="absolute top-1 right-1 text-destructive h-6 w-6" onClick={() => addRemove(index)}>
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            ))}
                                            <Button type="button" variant="outline" size="sm" onClick={() => addAppend({ minTons: 0, maxTons: 999, vehicleType: '', dayTariff: 0, nightTariff: 0 })}>
                                                <PlusCircle className="mr-2 h-4 w-4" /> Agregar Rango
                                            </Button>
                                        </div>
                                    </div>
                                )}
                                
                                {watchedAddTariffType === 'ESPECIFICA' && (
                                    <div className='space-y-4 p-4 border rounded-md bg-muted/20'>
                                        {watchedAddConceptName === 'TIEMPO EXTRA FRIOAL (FIJO)' ? (
                                            <div className="space-y-4">
                                                <FormLabel>Configuración de Horarios Fijos</FormLabel>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <FormField control={addForm.control} name="fixedTimeConfig.weekdayStartTime" render={({ field }) => (<FormItem><FormLabel>Inicio L-V</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>)} />
                                                    <FormField control={addForm.control} name="fixedTimeConfig.weekdayEndTime" render={({ field }) => (<FormItem><FormLabel>Fin L-V</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>)} />
                                                    <FormField control={addForm.control} name="fixedTimeConfig.saturdayStartTime" render={({ field }) => (<FormItem><FormLabel>Inicio Sáb.</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>)} />
                                                    <FormField control={addForm.control} name="fixedTimeConfig.saturdayEndTime" render={({ field }) => (<FormItem><FormLabel>Fin Sáb.</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>)} />
                                                </div>
                                                <FormField control={addForm.control} name="fixedTimeConfig.dayShiftEndTime" render={({ field }) => (<FormItem><FormLabel>Hora Fin Turno Diurno</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormDescription>Para calcular horas nocturnas.</FormDescription><FormMessage /></FormItem>)} />
                                            </div>
                                        ) : (
                                            <>
                                            <FormLabel>Tarifas Específicas</FormLabel>
                                            <div className="space-y-4">
                                                {addSpecificFields.map((field, index) => (
                                                    <div key={field.id} className="grid grid-cols-1 sm:grid-cols-2 gap-3 border p-3 rounded-md relative">
                                                        <FormField control={addForm.control} name={`specificTariffs.${index}.name`} render={({ field }) => (<FormItem><FormLabel>Nombre Tarifa</FormLabel><FormControl><Input placeholder="Ej: HORA EXTRA DIURNA" {...field} onChange={e => field.onChange(e.target.value.toUpperCase())} /></FormControl><FormMessage /></FormItem>)} />
                                                        <FormField control={addForm.control} name={`specificTariffs.${index}.unit`} render={({ field }) => (<FormItem><FormLabel>Unidad</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent><ScrollArea className="h-48">{specificUnitOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</ScrollArea></SelectContent></Select><FormMessage /></FormItem>)}/>
                                                        <FormField control={addForm.control} name={`specificTariffs.${index}.value`} render={({ field }) => (<FormItem className="sm:col-span-2"><FormLabel>Valor (COP)</FormLabel><FormControl><Input type="number" step="0.01" {...field}/></FormControl><FormMessage /></FormItem>)}/>
                                                        <Button type="button" variant="ghost" size="icon" className="absolute top-1 right-1 text-destructive h-6 w-6" onClick={() => addSpecificRemove(index)}><Trash2 className="h-4 w-4" /></Button>
                                                    </div>
                                                ))}
                                                <Button type="button" variant="outline" size="sm" onClick={() => addSpecificAppend({ id: `new_${Date.now()}`, name: '', value: 0, unit: 'UNIDAD' })}>
                                                    <PlusCircle className="mr-2 h-4 w-4" /> Agregar Tarifa Específica
                                                </Button>
                                            </div>
                                            </>
                                        )}
                                    </div>
                                )}
                                
                                <Button type="submit" disabled={isSubmitting} className="w-full">
                                    {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                                    Guardar Concepto
                                </Button>
                            </form>
                        </Form>
                    </CardContent>
                </Card>
            </div>
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <CardTitle>Conceptos de Cliente Actuales</CardTitle>
                        {selectedIds.size > 0 && (
                            <Button onClick={() => setIsConfirmBulkDeleteOpen(true)} variant="destructive" size="sm" disabled={isBulkDeleting}>
                                <Trash2 className="mr-2 h-4 w-4" />
                                Eliminar ({selectedIds.size})
                            </Button>
                        )}
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <ScrollArea className="h-[700px]">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-12"><Checkbox checked={isAllSelected} onCheckedChange={(checked) => handleSelectAll(checked === true)} /></TableHead>
                                        <TableHead>Concepto</TableHead>
                                        <TableHead>Tipo Cálculo</TableHead>
                                        <TableHead>Tarifa</TableHead>
                                        <TableHead className="text-right">Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {sortedConcepts.length > 0 ? (
                                        sortedConcepts.map((c) => (
                                        <TableRow key={c.id} data-state={selectedIds.has(c.id) && "selected"}>
                                            <TableCell><Checkbox checked={selectedIds.has(c.id)} onCheckedChange={(checked) => handleRowSelect(c.id, checked === true)} /></TableCell>
                                            <TableCell>
                                                <div className="font-medium">{c.conceptName}</div>
                                                <div className="text-xs text-muted-foreground max-w-[250px] truncate" title={(c.clientNames || []).join(', ')}>
                                                    Aplica a: {(c.clientNames || []).join(', ')}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={c.calculationType === 'OBSERVACION' ? "default" : c.calculationType === 'MANUAL' ? 'destructive' : "secondary"}>
                                                    {c.calculationType === 'OBSERVACION' ? `OBS: ${c.associatedObservation}` : c.calculationType || 'REGLAS'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                {c.tariffType === 'UNICA' ? (
                                                    <span className="font-semibold text-green-700">{c.value?.toLocaleString('es-CO', {style:'currency', currency: 'COP', minimumFractionDigits: 0})}</span>
                                                ) : (
                                                    <Badge variant="outline">{c.tariffType === 'RANGOS' ? 'Por Rangos' : 'Específica'}</Badge>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="ghost" size="icon" onClick={() => openEditDialog(c)}><Edit className="h-4 w-4 text-blue-600" /></Button>
                                            </TableCell>
                                        </TableRow>
                                        ))
                                    ) : (
                                        <TableRow><TableCell colSpan={5} className="h-24 text-center">No hay conceptos de cliente definidos.</TableCell></TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </ScrollArea>
                    </div>
                </CardContent>
              </Card>
            </div>
        </div>
      </div>
      
      {/* Edit Dialog */}
      <Dialog open={!!conceptToEdit} onOpenChange={(isOpen) => { if (!isOpen) setConceptToEdit(null) }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Editar Concepto de Liquidación de Cliente</DialogTitle></DialogHeader>
          <ScrollArea className="max-h-[70vh]">
            <div className="p-4">
            <Form {...editForm}>
                <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4 pt-4">
                    <FormField control={editForm.control} name="conceptName" render={({ field }) => (<FormItem><FormLabel>Nombre del Concepto</FormLabel><FormControl><Input {...field} onChange={e => field.onChange(e.target.value.toUpperCase())} /></FormControl><FormMessage /></FormItem>)}/>
                    <FormField
                        control={editForm.control}
                        name="clientNames"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Aplicar a Cliente(s)</FormLabel>
                            <ClientMultiSelectDialog
                                options={clientOptions.map(c => ({value: c.razonSocial, label: c.razonSocial}))}
                                selected={field.value}
                                onChange={field.onChange}
                                placeholder="Seleccione clientes..."
                            />
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                    <FormField control={editForm.control} name="unitOfMeasure" render={({ field }) => (<FormItem><FormLabel>Unidad de Medida (Para Reporte)</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Seleccione una unidad" /></SelectTrigger></FormControl><SelectContent>{unitOfMeasureOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)}/>

                    <Separator />
                     <FormField control={editForm.control} name="calculationType" render={({ field }) => (
                        <FormItem className="space-y-3">
                            <FormLabel>Tipo de Cálculo</FormLabel>
                            <FormControl>
                                <RadioGroup onValueChange={field.onChange} value={field.value} className="flex flex-wrap gap-4">
                                    <FormItem className="flex items-center space-x-2"><RadioGroupItem value="REGLAS" id="edit-reglas" /><Label htmlFor="edit-reglas">Por Reglas</Label></FormItem>
                                    <FormItem className="flex items-center space-x-2"><RadioGroupItem value="OBSERVACION" id="edit-obs" /><Label htmlFor="edit-obs">Por Observación</Label></FormItem>
                                    <FormItem className="flex items-center space-x-2"><RadioGroupItem value="MANUAL" id="edit-manual" /><Label htmlFor="edit-manual">Op. Manual</Label></FormItem>
                                </RadioGroup>
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}/>
                    
                    {watchedEditCalculationType === 'REGLAS' && (
                        <div className='space-y-4 p-4 border rounded-md bg-muted/20'>
                            <FormField control={editForm.control} name="calculationBase" render={({ field }) => (<FormItem><FormLabel>Calcular Usando</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Seleccione una base..." /></SelectTrigger></FormControl><SelectContent><SelectItem value="TONELADAS">TONELADAS</SelectItem><SelectItem value="KILOGRAMOS">KILOGRAMOS</SelectItem><SelectItem value="CANTIDAD_PALETAS">CANTIDAD DE PALETAS</SelectItem><SelectItem value="CANTIDAD_CAJAS">CANTIDAD DE CAJAS/UNIDADES</SelectItem><SelectItem value="NUMERO_OPERACIONES">NÚMERO DE OPERACIONES</SelectItem><SelectItem value="NUMERO_CONTENEDORES">NÚMERO DE CONTENEDORES</SelectItem></SelectContent></Select><FormMessage /></FormItem>)}/>
                            <FormField control={editForm.control} name="filterOperationType" render={({ field }) => (<FormItem><FormLabel>Filtrar por Tipo de Operación</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent><SelectItem value="ambos">Ambos (Recepción y Despacho)</SelectItem><SelectItem value="recepcion">Recepción</SelectItem><SelectItem value="despacho">Despacho</SelectItem></SelectContent></Select><FormMessage /></FormItem>)}/>
                            <FormField control={editForm.control} name="filterProductType" render={({ field }) => (<FormItem><FormLabel>Filtrar por Tipo de Producto</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent><SelectItem value="ambos">Ambos (Peso Fijo y Variable)</SelectItem><SelectItem value="fijo">Peso Fijo</SelectItem><SelectItem value="variable">Peso Variable</SelectItem></SelectContent></Select><FormMessage /></FormItem>)}/>
                        </div>
                    )}
                    {watchedEditCalculationType === 'OBSERVACION' && (
                            <div className='space-y-4 p-4 border rounded-md bg-muted/20'>
                            <FormField control={editForm.control} name="associatedObservation" render={({ field }) => (<FormItem><FormLabel>Observación Asociada</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Seleccione una observación..." /></SelectTrigger></FormControl><SelectContent>{standardObservations.map(obs => <SelectItem key={obs.id} value={obs.name}>{obs.name}</SelectItem>)}</SelectContent></Select><FormDescription>El sistema buscará esta observación en los formularios.</FormDescription><FormMessage /></FormItem>)}/>
                        </div>
                    )}
                    <Separator />
                    <FormField
                        control={editForm.control}
                        name="tariffType"
                        render={({ field }) => (
                            <FormItem className="space-y-3">
                            <FormLabel>Tipo de Tarifa</FormLabel>
                            <FormControl>
                                <RadioGroup onValueChange={field.onChange} value={field.value} className="flex flex-wrap gap-4">
                                    <FormItem className="flex items-center space-x-2"><RadioGroupItem value="UNICA" id="edit-unica" /><Label htmlFor="edit-unica">Única</Label></FormItem>
                                    <FormItem className="flex items-center space-x-2"><RadioGroupItem value="RANGOS" id="edit-rangos" /><Label htmlFor="edit-rangos">Rangos</Label></FormItem>
                                    <FormItem className="flex items-center space-x-2"><RadioGroupItem value="ESPECIFICA" id="edit-especifica" /><Label htmlFor="edit-especifica">Específica</Label></FormItem>
                                </RadioGroup>
                            </FormControl>
                            <FormMessage />
                            </FormItem>
                        )}
                    />
                    {watchedEditTariffType === 'UNICA' && (
                        <FormField control={editForm.control} name="value" render={({ field }) => (<FormItem><FormLabel>Tarifa Única (COP)</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                    )}
                    
                    {watchedEditTariffType === 'RANGOS' && (
                        <div className='space-y-4 p-4 border rounded-md bg-muted/20'>
                            <div className="space-y-2">
                                <FormLabel>Definición de Turno</FormLabel>
                                <div className="grid grid-cols-2 gap-4">
                                <FormField control={editForm.control} name="dayShiftStart" render={({ field }) => (<FormItem><FormLabel>Inicio Turno Diurno</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>)} />
                                <FormField control={editForm.control} name="dayShiftEnd" render={({ field }) => (<FormItem><FormLabel>Fin Turno Diurno</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>)} />
                                </div>
                            </div>
                            <Separator />
                            <div className="space-y-2">
                                <FormLabel>Rangos de Tarifas (Opcional)</FormLabel>
                            </div>
                            <ScrollArea className="h-40 pr-4">
                                <div className="space-y-4">
                                {editFields.map((field, index) => (
                                    <div key={field.id} className="grid grid-cols-1 gap-3 border p-3 rounded-md relative">
                                        <div className="grid grid-cols-2 gap-2">
                                            <FormField control={editForm.control} name={`tariffRanges.${index}.minTons`} render={({ field }) => (<FormItem><FormLabel>Min. Ton.</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                                            <FormField control={editForm.control} name={`tariffRanges.${index}.maxTons`} render={({ field }) => (<FormItem><FormLabel>Max. Ton.</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                                        </div>
                                        <FormField control={editForm.control} name={`tariffRanges.${index}.vehicleType`} render={({ field }) => (<FormItem><FormLabel>Tipo Vehículo</FormLabel><FormControl><Input placeholder="EJ: TURBO" {...field} onChange={e => field.onChange(e.target.value.toUpperCase())} /></FormControl><FormMessage /></FormItem>)}/>
                                        <div className="grid grid-cols-2 gap-2">
                                            <FormField control={editForm.control} name={`tariffRanges.${index}.dayTariff`} render={({ field }) => (<FormItem><FormLabel>Tarifa Diurna</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                                            <FormField control={editForm.control} name={`tariffRanges.${index}.nightTariff`} render={({ field }) => (<FormItem><FormLabel>Tarifa Nocturna</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                                        </div>
                                        <Button type="button" variant="ghost" size="icon" className="absolute top-1 right-1 text-destructive h-6 w-6" onClick={() => editRemove(index)}>
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ))}
                                </div>
                            </ScrollArea>
                            <Button type="button" variant="outline" size="sm" onClick={() => editAppend({ minTons: 0, maxTons: 999, vehicleType: '', dayTariff: 0, nightTariff: 0 })}>
                                <PlusCircle className="mr-2 h-4 w-4" /> Agregar Rango
                            </Button>
                        </div>
                    )}
                    {watchedEditTariffType === 'ESPECIFICA' && (
                         <div className='space-y-4 p-4 border rounded-md bg-muted/20'>
                            {watchedEditConceptName === 'TIEMPO EXTRA FRIOAL (FIJO)' && (
                                <div className="space-y-4 mb-4 pb-4 border-b">
                                    <FormLabel>Configuración de Horarios Fijos</FormLabel>
                                    <div className="grid grid-cols-2 gap-4">
                                        <FormField control={editForm.control} name="fixedTimeConfig.weekdayStartTime" render={({ field }) => (<FormItem><FormLabel>Inicio L-V</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>)} />
                                        <FormField control={editForm.control} name="fixedTimeConfig.weekdayEndTime" render={({ field }) => (<FormItem><FormLabel>Fin L-V</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>)} />
                                        <FormField control={editForm.control} name="fixedTimeConfig.saturdayStartTime" render={({ field }) => (<FormItem><FormLabel>Inicio Sáb.</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>)} />
                                        <FormField control={editForm.control} name="fixedTimeConfig.saturdayEndTime" render={({ field }) => (<FormItem><FormLabel>Fin Sáb.</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>)} />
                                    </div>
                                    <FormField control={editForm.control} name="fixedTimeConfig.dayShiftEndTime" render={({ field }) => (<FormItem><FormLabel>Hora Fin Turno Diurno</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormDescription>Para calcular horas nocturnas.</FormDescription><FormMessage /></FormItem>)} />
                                </div>
                            )}
                            <FormLabel>Tarifas Específicas</FormLabel>
                            <ScrollArea className="h-40 pr-4">
                            <div className="space-y-4">
                                {editSpecificFields.map((field, index) => (
                                    <div key={field.id} className="grid grid-cols-1 sm:grid-cols-2 gap-3 border p-3 rounded-md relative">
                                        <FormField control={editForm.control} name={`specificTariffs.${index}.name`} render={({ field }) => (<FormItem><FormLabel>Nombre Tarifa</FormLabel><FormControl><Input placeholder="Ej: HORA EXTRA DIURNA" {...field} onChange={e => field.onChange(e.target.value.toUpperCase())} /></FormControl><FormMessage /></FormItem>)} />
                                        <FormField control={editForm.control} name={`specificTariffs.${index}.unit`} render={({ field }) => (<FormItem><FormLabel>Unidad</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent><ScrollArea className="h-48">{specificUnitOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</ScrollArea></SelectContent></Select><FormMessage /></FormItem>)}/>
                                        <FormField control={editForm.control} name={`specificTariffs.${index}.value`} render={({ field }) => (<FormItem className="sm:col-span-2"><FormLabel>Valor (COP)</FormLabel><FormControl><Input type="number" step="0.01" {...field}/></FormControl><FormMessage /></FormItem>)}/>
                                        <Button type="button" variant="ghost" size="icon" className="absolute top-1 right-1 text-destructive h-6 w-6" onClick={() => editSpecificRemove(index)}><Trash2 className="h-4 w-4" /></Button>
                                    </div>
                                ))}
                            </div>
                            </ScrollArea>
                            <Button type="button" variant="outline" size="sm" onClick={() => editSpecificAppend({ id: `new_${Date.now()}`, name: '', value: 0, unit: 'UNIDAD' })}>
                                <PlusCircle className="mr-2 h-4 w-4" /> Agregar Tarifa
                            </Button>
                        </div>
                    )}
                    <DialogFooter className="pt-4">
                        <Button type="button" variant="outline" onClick={() => setConceptToEdit(null)}>Cancelar</Button>
                        <Button type="submit" disabled={isEditing}>{isEditing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Guardar Cambios</Button>
                    </DialogFooter>
                </form>
            </Form>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
      
      <AlertDialog open={isConfirmBulkDeleteOpen} onOpenChange={setIsConfirmBulkDeleteOpen}>
          <AlertDialogContent>
              <AlertDialogHeader>
                  <AlertDialogTitle>¿Confirmar eliminación masiva?</AlertDialogTitle>
                  <AlertDialogDescription>Esta acción no se puede deshacer. Se eliminarán permanentemente <strong>{selectedIds.size}</strong> concepto(s) seleccionados.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleBulkDeleteConfirm} disabled={isBulkDeleting} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                      {isBulkDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Sí, eliminar seleccionados
                  </AlertDialogAction>
              </AlertDialogFooter>
          </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}


function ClientMultiSelectDialog({
  options,
  selected,
  onChange,
  placeholder,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filteredOptions = useMemo(() => {
    if (!search) return options;
    return options.filter((o) =>
      o.label.toLowerCase().includes(search.toLowerCase())
    );
  }, [search, options]);

  const handleSelect = (valueToToggle: string) => {
    const isTodos = valueToToggle === 'TODOS (Cualquier Cliente)';
    
    if (isTodos) {
      onChange(selected.includes(valueToToggle) ? [] : [valueToToggle]);
    } else {
      const newSelection = selected.includes(valueToToggle)
        ? selected.filter(s => s !== valueToToggle)
        : [...selected.filter(s => s !== 'TODOS (Cualquier Cliente)'), valueToToggle];
      onChange(newSelection);
    }
  };

  const getButtonLabel = () => {
    if (selected.length === 0) return placeholder;
    if (selected.length === 1) return selected[0];
    if (selected.length === options.length) return "Todos los clientes seleccionados";
    return `${selected.length} clientes seleccionados`;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between text-left font-normal"
        >
          <span className="truncate">{getButtonLabel()}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </DialogTrigger>
      <DialogContent className="p-0">
        <DialogHeader className="p-6 pb-2">
            <DialogTitle>Seleccionar Cliente(s)</DialogTitle>
            <DialogDescription>Seleccione los clientes para este concepto.</DialogDescription>
        </DialogHeader>
        <div className="p-6 pt-0">
            <Input
                placeholder="Buscar cliente..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="mb-4"
            />
            <ScrollArea className="h-60">
                <div className="space-y-1 pr-4">
                {filteredOptions.map((option) => (
                    <div
                        key={option.value}
                        className="flex items-center space-x-2 p-2 rounded-md hover:bg-accent"
                    >
                        <Checkbox
                            id={`client-${option.value}`}
                            checked={selected.includes(option.value)}
                            onCheckedChange={() => handleSelect(option.value)}
                        />
                        <Label
                            htmlFor={`client-${option.value}`}
                            className="w-full cursor-pointer"
                        >
                            {option.label}
                        </Label>
                    </div>
                ))}
                </div>
            </ScrollArea>
        </div>
        <DialogFooter className="p-6 pt-0">
            <Button onClick={() => setOpen(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


