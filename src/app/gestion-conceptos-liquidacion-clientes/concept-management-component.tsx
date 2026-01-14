

"use client";

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, SubmitHandler, useFieldArray, useWatch, FieldErrors, useFormContext, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { format, parseISO, addDays, getDaysInMonth, getDay, isSaturday, isSunday, isWithinInterval, startOfDay, endOfDay, differenceInMinutes, parse, differenceInHours } from 'date-fns';
import { es } from 'date-fns/locale';
import { DateRange } from 'react-day-picker';
import * as ExcelJS from 'exceljs';


import { addClientBillingConcept, updateClientBillingConcept, deleteMultipleClientBillingConcepts, toggleConceptStatus, type ClientBillingConcept } from './actions';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import type { ClientInfo } from '@/app/actions/clients';
import type { StandardObservation } from '@/app/gestion-observaciones/actions';
import type { PedidoType } from '@/app/gestion-tipos-pedido/actions';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Loader2, PlusCircle, Edit, Trash2, ShieldAlert, DollarSign, ChevronsUpDown, Check, Info, Calculator, ListChecks, Search, Eye, Warehouse, Sparkles, Download, Home } from 'lucide-react';
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
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { DateMultiSelector } from '@/components/app/date-multi-selector';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Switch } from '@/components/ui/switch';


const tariffRangeSchema = z.object({
  minTons: z.coerce.number({ invalid_type_error: "Debe ser un número" }).min(0, "Debe ser >= 0"),
  maxTons: z.coerce.number({ invalid_type_error: "Debe ser un número" }).min(0, "Debe ser >= 0"),
  vehicleType: z.string().min(1, "El tipo de vehículo es requerido."),
  dayTariff: z.coerce.number({ invalid_type_error: "Debe ser un número" }).min(0, "Debe ser >= 0"),
  nightTariff: z.coerce.number({ invalid_type_error: "Debe ser un número" }).min(0, "Debe ser >= 0"),
  extraTariff: z.coerce.number({ invalid_type_error: "Debe ser un número" }).min(0, "Debe ser >= 0"),
}).refine(data => data.maxTons > data.minTons, {
    message: "Max. debe ser mayor que Min.",
    path: ['maxTons'],
});

const temperatureTariffRangeSchema = z.object({
  minTemp: z.coerce.number({ invalid_type_error: "Debe ser un número." }),
  maxTemp: z.coerce.number({ invalid_type_error: "Debe ser un número." }),
  ratePerKg: z.coerce.number({ invalid_type_error: "Debe ser un número" }).min(0, "Debe ser >= 0"),
});

const specificTariffSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, "El nombre es requerido."),
  value: z.coerce.number({ invalid_type_error: "Debe ser un número."}).min(0, "Debe ser >= 0"),
  baseQuantity: z.coerce.number({ invalid_type_error: "Debe ser un número."}).min(0, "Debe ser >= 0").optional().default(0),
  unit: z.enum(['HORA', 'UNIDAD', 'DIA', 'VIAJE', 'ALIMENTACION', 'TRANSPORTE', 'HORA EXTRA DIURNA', 'HORA EXTRA NOCTURNA', 'HORA EXTRA DIURNA DOMINGO Y FESTIVO', 'HORA EXTRA NOCTURNA DOMINGO Y FESTIVO', 'TRANSPORTE EXTRAORDINARIO', 'TRANSPORTE DOMINICAL Y FESTIVO', 'POSICION/DIA', 'POSICIONES/MES'], { required_error: 'Debe seleccionar una unidad.' }),
});

const fixedTimeConfigSchema = z.object({
    weekdayStartTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Formato HH:MM requerido.').optional(),
    weekdayEndTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Formato HH:MM requerido.').optional(),
    saturdayStartTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Formato HH:MM requerido.').optional(),
    saturdayEndTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Formato HH:MM requerido.').optional(),
    sundayHolidayStartTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Formato HH:MM requerido.').optional(),
    sundayHolidayEndTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Formato HH:MM requerido.').optional(),
    dayShiftEndTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Formato HH:MM requerido.').optional(),
});


const conceptSchema = z.object({
  conceptName: z.string().min(3, { message: "El nombre del concepto es requerido (mín. 3 caracteres)."}),
  clientNames: z.array(z.string()).min(1, { message: 'Debe seleccionar al menos un cliente.' }),
  status: z.enum(['activo', 'inactivo']).default('activo'),
  unitOfMeasure: z.enum(['KILOGRAMOS', 'TONELADA', 'PALETA', 'ESTIBA', 'UNIDAD', 'CAJA', 'SACO', 'CANASTILLA', 'HORA', 'DIA', 'VIAJE', 'MES', 'CONTENEDOR', 'HORA EXTRA DIURNA', 'HORA EXTRA NOCTURNA', 'HORA EXTRA DIURNA DOMINGO Y FESTIVO', 'HORA EXTRA NOCTURNA DOMINGO Y FESTIVO', 'POSICION/DIA', 'POSICIONES', 'TIPO VEHÍCULO', 'TRACTOMULA', 'QUINCENA'], { required_error: 'Debe seleccionar una unidad de medida.'}),
  
  calculationType: z.enum(['REGLAS', 'OBSERVACION', 'MANUAL', 'SALDO_INVENTARIO', 'LÓGICA ESPECIAL', 'SALDO_CONTENEDOR'], { required_error: 'Debe seleccionar un tipo de cálculo.' }),
  
  // Calculation Rules (for REGLAS)
  calculationBase: z.enum(['TONELADAS', 'KILOGRAMOS', 'CANTIDAD_PALETAS', 'CANTIDAD_CAJAS', 'NUMERO_OPERACIONES', 'NUMERO_CONTENEDORES', 'PALETAS_SALIDA_MAQUILA_CONGELADOS', 'PALETAS_SALIDA_MAQUILA_SECO', 'CANTIDAD_SACOS_MAQUILA']).optional(),
  filterOperationType: z.enum(['recepcion', 'despacho', 'ambos']).optional(),
  filterProductType: z.enum(['fijo', 'variable', 'ambos']).optional(),
  filterSesion: z.enum(['CO', 'RE', 'SE', 'AMBOS']).optional(),
  filterPedidoTypes: z.array(z.string()).optional(),
  palletTypeFilter: z.enum(['completas', 'picking', 'ambas']).optional(), // NUEVO CAMPO
  
  // Observation Rule (for OBSERVACION)
  associatedObservation: z.string().optional(),

  // Inventory Rule (for SALDO_INVENTARIO or SALDO_CONTENEDOR)
  inventorySource: z.enum(['POSICIONES_ALMACENADAS']).optional(),
  inventorySesion: z.enum(['CO', 'RE', 'SE']).optional(),
  filterByArticleCodes: z.string().optional(),
  excludeArticleCodes: z.boolean().default(false),


  // Tariff Rules
  tariffType: z.enum(['UNICA', 'RANGOS', 'ESPECIFICA', 'POR_TEMPERATURA'], { required_error: "Debe seleccionar un tipo de tarifa."}),
  value: z.coerce.number({invalid_type_error: "Debe ser un número"}).min(0, "Debe ser >= 0").optional(),
  billingPeriod: z.enum(['DIARIO', 'QUINCENAL', 'MENSUAL']).optional(),
  
  weekdayDayShiftStart: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Formato HH:MM requerido.').optional(),
  weekdayDayShiftEnd: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Formato HH:MM requerido.').optional(),
  saturdayDayShiftStart: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Formato HH:MM requerido.').optional(),
  saturdayDayShiftEnd: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Formato HH:MM requerido.').optional(),

  tariffRanges: z.array(tariffRangeSchema).optional(),
  tariffRangesTemperature: z.array(temperatureTariffRangeSchema).optional(),
  specificTariffs: z.array(specificTariffSchema).optional(),
  fixedTimeConfig: fixedTimeConfigSchema.optional(),
}).superRefine((data, ctx) => {
    if (data.calculationType === 'REGLAS') {
        if (!data.calculationBase) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La base de cálculo es requerida.", path: ["calculationBase"] });
        if (!data.filterOperationType) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "El tipo de operación es requerido.", path: ["filterOperationType"] });
        if (!data.filterProductType) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "El tipo de producto es requerido.", path: ["filterProductType"] });
        if (!data.filterSesion) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La sesión es requerida.", path: ["filterSesion"] });
    }
    if (data.calculationType === 'OBSERVACION' && !data.associatedObservation) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Debe seleccionar una observación asociada.", path: ["associatedObservation"] });
    }
     if (data.calculationType === 'SALDO_INVENTARIO' || data.calculationType === 'SALDO_CONTENEDOR') {
        if (data.calculationType !== 'SALDO_CONTENEDOR') { // Source not needed for container balance yet
            if (!data.inventorySource) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La fuente del dato es requerida.", path: ["inventorySource"] });
        }
        if (!data.inventorySesion) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La sesión es requerida.", path: ["inventorySesion"] });
    }

    if (data.tariffType === 'UNICA' && (data.value === undefined || data.value === null)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La tarifa es obligatoria.", path: ["value"] });
    }
    if (data.tariffType === 'RANGOS') {
        if (!data.weekdayDayShiftStart) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La hora de inicio (L-V) es obligatoria.", path: ["weekdayDayShiftStart"] });
        if (!data.weekdayDayShiftEnd) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La hora de fin (L-V) es obligatoria.", path: ["weekdayDayShiftEnd"] });
        if (!data.saturdayDayShiftStart) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La hora de inicio (Sáb) es obligatoria.", path: ["saturdayDayShiftStart"] });
        if (!data.saturdayDayShiftEnd) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La hora de fin (Sáb) es obligatoria.", path: ["saturdayDayShiftEnd"] });
    }
    if (data.tariffType === 'POR_TEMPERATURA' && (!data.tariffRangesTemperature || data.tariffRangesTemperature.length === 0)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Debe definir al menos un rango de temperatura.", path: ["tariffRangesTemperature"] });
    }
    if (data.tariffType === 'ESPECIFICA' && (!data.specificTariffs || data.specificTariffs.length === 0)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Debe definir al menos una tarifa específica.", path: ["specificTariffs"] });
    }
    if (data.conceptName === 'TIEMPO EXTRA FRIOAL (FIJO)' || data.conceptName === 'TIEMPO EXTRA FRIOAL') {
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

const addFormDefaultValues: ConceptFormValues = {
  conceptName: '',
  clientNames: [],
  status: 'activo',
  unitOfMeasure: 'KILOGRAMOS',
  calculationType: 'REGLAS',
  calculationBase: undefined,
  filterOperationType: 'ambos',
  filterProductType: 'ambos',
  filterSesion: 'AMBOS',
  filterPedidoTypes: [],
  palletTypeFilter: 'ambas',
  associatedObservation: undefined,
  inventorySource: undefined,
  inventorySesion: undefined,
  filterByArticleCodes: '',
  excludeArticleCodes: false,
  tariffType: 'UNICA',
  value: 0,
  billingPeriod: 'DIARIO',
  weekdayDayShiftStart: '07:00',
  weekdayDayShiftEnd: '19:00',
  saturdayDayShiftStart: '07:00',
  saturdayDayShiftEnd: '13:00',
  tariffRanges: [],
  tariffRangesTemperature: [],
  specificTariffs: [],
  fixedTimeConfig: {
    weekdayStartTime: "17:00",
    weekdayEndTime: "22:00",
    saturdayStartTime: "12:00",
    saturdayEndTime: "17:00",
    sundayHolidayStartTime: "07:00",
    sundayHolidayEndTime: "13:00",
    dayShiftEndTime: "19:00",
  },
};

const GroupIcon = ({ type }: { type: string }) => {
    const iconMap: Record<string, React.ElementType> = {
      MANUAL: Edit,
      REGLAS: ListChecks,
      OBSERVACION: Eye,
      'SALDO_INVENTARIO': Warehouse,
      'LÓGICA ESPECIAL': Sparkles,
      'SALDO_CONTENEDOR': Warehouse,
    };
    const Icon = iconMap[type] || Calculator;
    return <Icon className="h-5 w-5 text-primary" />;
};

export default function ConceptManagementClientComponent({ initialClients, initialConcepts, standardObservations, pedidoTypes }: { initialClients: ClientInfo[], initialConcepts: ClientBillingConcept[], standardObservations: StandardObservation[], pedidoTypes: PedidoType[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const { permissions, loading: authLoading } = useAuth();
  
  const [concepts, setConcepts] = useState<ClientBillingConcept[]>(initialConcepts);
  const [searchTerm, setSearchTerm] = useState('');
  const [clientFilter, setClientFilter] = useState<string[]>([]);
  const [calculationTypeFilter, setCalculationTypeFilter] = useState('all');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [conceptToEdit, setConceptToEdit] = useState<ClientBillingConcept | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isConfirmBulkDeleteOpen, setIsConfirmBulkDeleteOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [togglingStatusId, setTogglingStatusId] = useState<string | null>(null);

  const addForm = useForm<ConceptFormValues>({
    resolver: zodResolver(conceptSchema),
    defaultValues: addFormDefaultValues,
  });

  const editForm = useForm<ConceptFormValues>({
    resolver: zodResolver(conceptSchema),
  });

  const clientOptions: ClientInfo[] = useMemo(() => [
    { id: 'TODOS', razonSocial: 'TODOS (Cualquier Cliente)' }, 
    ...initialClients
  ], [initialClients]);
  
  const filteredConcepts = useMemo(() => {
    return concepts.filter(c => {
        const searchTermMatch = searchTerm === '' || c.conceptName.toLowerCase().includes(searchTerm.toLowerCase());
        const clientMatch = clientFilter.length === 0 || c.clientNames.some(name => clientFilter.includes(name));
        const calculationTypeMatch = calculationTypeFilter === 'all' || c.calculationType === calculationTypeFilter;
        return searchTermMatch && clientMatch && calculationTypeMatch;
    }).sort((a, b) => a.conceptName.localeCompare(b.conceptName));
  }, [concepts, searchTerm, clientFilter, calculationTypeFilter]);
  
  const onAddSubmit: SubmitHandler<ConceptFormValues> = async (data) => {
    setIsSubmitting(true);
    const result = await addClientBillingConcept({
        ...data,
        conceptName: data.conceptName.toUpperCase().trim(),
    } as Omit<ClientBillingConcept, 'id'>);
    if (result.success && result.newConcept) {
      toast({ title: 'Éxito', description: result.message });
      setConcepts(prev => [...prev, result.newConcept!].sort((a,b) => a.conceptName.localeCompare(b.conceptName)));
      addForm.reset(addFormDefaultValues);
      setIsAddDialogOpen(false);
    } else {
      toast({ variant: 'destructive', title: 'Error', description: result.message });
    }
    setIsSubmitting(false);
  };
  
  const onEditSubmit: SubmitHandler<ConceptFormValues> = async (data) => {
    if (!conceptToEdit) return;
    setIsEditing(true);
    const result = await updateClientBillingConcept(conceptToEdit.id, {
        ...data,
        conceptName: data.conceptName.toUpperCase().trim(),
    } as Omit<ClientBillingConcept, 'id'>);
    if (result.success) {
      toast({ title: 'Éxito', description: result.message });
      setConcepts(prev => prev.map(s => s.id === conceptToEdit.id ? { ...data, conceptName: data.conceptName.toUpperCase().trim(), id: s.id } as ClientBillingConcept : s));
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
    const formValues: ConceptFormValues = {
        ...addFormDefaultValues, // Start with a fully defined structure
        ...concept,
        filterByArticleCodes: concept.filterByArticleCodes || '',
        weekdayDayShiftStart: concept.weekdayDayShiftStart || '07:00',
        weekdayDayShiftEnd: concept.weekdayDayShiftEnd || '19:00',
        saturdayDayShiftStart: concept.saturdayDayShiftStart || '07:00',
        saturdayDayShiftEnd: concept.saturdayDayShiftEnd || '13:00',
        fixedTimeConfig: {
          ...addFormDefaultValues.fixedTimeConfig,
          ...concept.fixedTimeConfig,
        }
    };
    editForm.reset(formValues);
  };

  const handleRowSelect = (id: string, checked: boolean) => {
    const newSet = new Set(selectedIds);
    if (checked) newSet.add(id); else newSet.delete(id);
    setSelectedIds(newSet);
  };

  const isAllSelected = useMemo(() => {
    if (filteredConcepts.length === 0) return false;
    return filteredConcepts.every(s => selectedIds.has(s.id));
  }, [selectedIds, filteredConcepts]);
  
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(filteredConcepts.map(s => s.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

   const handleToggleStatus = async (id: string, currentStatus: 'activo' | 'inactivo') => {
      setTogglingStatusId(id);
      const result = await toggleConceptStatus(id, currentStatus);
      if (result.success) {
          toast({ title: "Estado Actualizado", description: result.message });
          setConcepts(prev => prev.map(c => c.id === id ? { ...c, status: c.status === 'activo' ? 'inactivo' : 'activo' } : c));
      } else {
          toast({ variant: "destructive", title: "Error", description: result.message });
      }
      setTogglingStatusId(null);
  };

  const handleExportExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Frio Alimentaria App';
    workbook.created = new Date();

    const headerFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A90C8' } };
    const headerFont: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };

    const worksheet = workbook.addWorksheet('Conceptos Liquidacion Clientes');

    worksheet.columns = [
        { header: 'Concepto', key: 'conceptName', width: 40 },
        { header: 'Cliente(s)', key: 'clientNames', width: 40 },
        { header: 'Tipo Cálculo', key: 'calculationType', width: 20 },
        { header: 'Unidad Medida', key: 'unitOfMeasure', width: 20 },
        { header: 'Tipo Tarifa', key: 'tariffType', width: 15 },
        { header: 'Valor/Detalle', key: 'value', width: 50 },
        { header: 'Estado', key: 'status', width: 15 },
    ];
    
    const headerRow = worksheet.getRow(1);
    headerRow.values = (worksheet.columns as any[]).map(c => c.header);
    headerRow.eachCell(cell => {
      cell.fill = headerFill;
      cell.font = headerFont;
      cell.alignment = { horizontal: 'center' };
    });

    const sortedConcepts = [...concepts].sort((a,b) => {
        const clientA = a.clientNames.join(', ');
        const clientB = b.clientNames.join(', ');
        if (clientA < clientB) return -1;
        if (clientA > clientB) return 1;
        return a.calculationType.localeCompare(b.calculationType);
    });

    sortedConcepts.forEach(c => {
        let valueDetail = '';
        if (c.tariffType === 'UNICA') {
            valueDetail = `Tarifa: ${c.value?.toLocaleString('es-CO', {style: 'currency', currency: 'COP'}) || 'N/A'}`;
        } else if (c.tariffType === 'RANGOS' && c.tariffRanges) {
            valueDetail = c.tariffRanges.map(r => `[${r.minTons}-${r.maxTons} Ton] ${r.vehicleType}: D:$${r.dayTariff}, N:$${r.nightTariff}, E:$${r.extraTariff}`).join('; ');
        } else if (c.tariffType === 'ESPECIFICA' && c.specificTariffs) {
             valueDetail = c.specificTariffs.map(s => `${s.name}: $${s.value}/${s.unit}`).join('; ');
        } else if (c.tariffType === 'POR_TEMPERATURA' && c.tariffRangesTemperature) {
            valueDetail = c.tariffRangesTemperature.map(t => `[${t.minTemp}°C - ${t.maxTemp}°C]: $${t.ratePerKg}/Kg`).join('; ');
        }

        worksheet.addRow({
            conceptName: c.conceptName,
            clientNames: c.clientNames.join(', '),
            calculationType: c.calculationType,
            unitOfMeasure: c.unitOfMeasure,
            tariffType: c.tariffType,
            value: valueDetail,
            status: c.status
        });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Conceptos_Liquidacion_Clientes_${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
    link.click();
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

  const groupedConcepts = filteredConcepts.reduce((acc, concept) => {
    const type = concept.calculationType || 'REGLAS';
    if (!acc[type]) {
      acc[type] = [];
    }
    acc[type].push(concept);
    return acc;
  }, {} as Record<string, ClientBillingConcept[]>);

  const groupOrder: (keyof typeof groupedConcepts)[] = ['REGLAS', 'OBSERVACION', 'MANUAL', 'SALDO_INVENTARIO', 'SALDO_CONTENEDOR', 'LÓGICA ESPECIAL'];

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <div className="relative flex items-center justify-center text-center">
            <Button variant="ghost" size="icon" className="absolute left-0 top-1/2 -translate-y-1/2" onClick={() => router.back()}>
              <ArrowLeft className="h-6 w-6" />
            </Button>
            <div>
              <Button variant="ghost" className="mb-2" onClick={() => router.push('/')}>
                <Home className="mr-2 h-4 w-4" />
                Ir al Inicio
              </Button>
              <div className="flex items-center justify-center gap-2">
                <DollarSign className="h-8 w-8 text-primary" />
                <h1 className="text-2xl font-bold text-primary">Gestión de Conceptos de Liquidación Clientes</h1>
              </div>
              <p className="text-sm text-gray-500">Defina los conceptos y tarifas para la liquidación automática de servicios a clientes.</p>
            </div>
          </div>
        </header>

        <div className="space-y-8">
            <Card>
                <CardHeader>
                    <div className="flex justify-between items-center flex-wrap gap-4">
                        <CardTitle>Listado de Conceptos</CardTitle>
                        <div className="flex gap-2">
                            <Button onClick={() => handleExportExcel()} variant="outline"><Download className="mr-2 h-4 w-4"/>Exportar a Excel</Button>
                            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                                <DialogTrigger asChild>
                                    <Button><PlusCircle className="mr-2 h-4 w-4" /> Nuevo Concepto</Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-4xl flex flex-col max-h-[90vh]">
                                    <Form {...addForm}>
                                        <form onSubmit={addForm.handleSubmit(onAddSubmit)}>
                                            <DialogHeader>
                                                <DialogTitle>Nuevo Concepto de Liquidación</DialogTitle>
                                                <DialogDescription>Cree una regla de cobro para un servicio.</DialogDescription>
                                            </DialogHeader>
                                            <div className="flex-grow overflow-hidden">
                                                <ScrollArea className="h-[calc(80vh-120px)] p-1">
                                                    <div className="p-4">
                                                        <ConceptFormBody form={addForm} clientOptions={clientOptions} standardObservations={standardObservations} pedidoTypes={pedidoTypes} isEditMode={false} />
                                                    </div>
                                                </ScrollArea>
                                            </div>
                                            <DialogFooter className="flex-shrink-0">
                                                <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancelar</Button>
                                                <Button type="submit" disabled={isSubmitting}>
                                                    {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}Guardar Concepto
                                                </Button>
                                            </DialogFooter>
                                        </form>
                                    </Form>
                                </DialogContent>
                            </Dialog>
                            {selectedIds.size > 0 && (
                                <Button onClick={() => setIsConfirmBulkDeleteOpen(true)} variant="destructive" disabled={isBulkDeleting}>
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Eliminar ({selectedIds.size})
                                </Button>
                            )}
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        <Input placeholder="Buscar por nombre de concepto..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                        <ClientMultiSelectDialog
                            options={clientOptions.map(c => ({value: c.razonSocial, label: c.razonSocial}))}
                            selected={clientFilter}
                            onChange={setClientFilter}
                            placeholder="Filtrar por cliente..."
                        />
                        <Select value={calculationTypeFilter} onValueChange={setCalculationTypeFilter}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todos los Tipos de Cálculo</SelectItem>
                                <SelectItem value="REGLAS">Por Reglas</SelectItem>
                                <SelectItem value="OBSERVACION">Por Observación</SelectItem>
                                <SelectItem value="MANUAL">Op. Manual</SelectItem>
                                <SelectItem value="SALDO_INVENTARIO">Saldo Inventario</SelectItem>
                                <SelectItem value="SALDO_CONTENEDOR">Saldo por Contenedor</SelectItem>
                                <SelectItem value="LÓGICA ESPECIAL">Lógica Especial</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                     <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-12"><Checkbox checked={isAllSelected} onCheckedChange={(checked) => handleSelectAll(checked === true)} /></TableHead>
                                    <TableHead>Concepto</TableHead>
                                    <TableHead>Clientes</TableHead>
                                    <TableHead>Unidad</TableHead>
                                    <TableHead>Tarifa</TableHead>
                                    <TableHead>Estado</TableHead>
                                    <TableHead className="text-right">Acciones</TableHead>
                                </TableRow>
                            </TableHeader>
                        </Table>
                         <Accordion type="multiple" className="w-full">
                            {groupOrder.map(groupType => {
                                const groupConcepts = groupedConcepts[groupType];
                                if (!groupConcepts || groupConcepts.length === 0) return null;
                                
                                return (
                                <AccordionItem value={groupType} key={groupType}>
                                    <AccordionTrigger className="px-4 py-2 bg-muted/50 hover:bg-muted/80">
                                        <div className="flex items-center gap-2">
                                            <GroupIcon type={groupType} />
                                            <span className="font-semibold">{groupType.replace(/_/g, ' ')}</span>
                                            <Badge variant="secondary">{groupConcepts.length}</Badge>
                                        </div>
                                    </AccordionTrigger>
                                    <AccordionContent className="p-0">
                                        <Table>
                                            <TableBody>
                                            {groupConcepts.map((c) => (
                                                <TableRow key={c.id} data-state={selectedIds.has(c.id) && "selected"}>
                                                    <TableCell className="w-12"><Checkbox checked={selectedIds.has(c.id)} onCheckedChange={(checked) => handleRowSelect(c.id, checked === true)} /></TableCell>
                                                    <TableCell className="font-medium max-w-[200px] truncate" title={c.conceptName}>{c.conceptName}</TableCell>
                                                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" title={(c.clientNames || []).join(', ')}>
                                                        {(c.clientNames || []).includes('TODOS (Cualquier Cliente)') ? <Badge>TODOS</Badge> : (c.clientNames || []).join(', ')}
                                                    </TableCell>
                                                    <TableCell>{c.unitOfMeasure}</TableCell>
                                                    <TableCell>{c.tariffType === 'UNICA' ? c.value?.toLocaleString('es-CO', {style: 'currency', currency: 'COP'}) : <Badge variant="outline">{c.tariffType}</Badge>}</TableCell>
                                                    <TableCell>
                                                        <Switch
                                                            checked={c.status === 'activo'}
                                                            onCheckedChange={() => handleToggleStatus(c.id, c.status)}
                                                            disabled={togglingStatusId === c.id}
                                                            aria-label="Estado del concepto"
                                                        />
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <Button variant="ghost" size="icon" onClick={() => openEditDialog(c)}><Edit className="h-4 w-4 text-blue-600" /></Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                            </TableBody>
                                        </Table>
                                    </AccordionContent>
                                </AccordionItem>
                                );
                            })}
                         </Accordion>
                     </div>
                </CardContent>
              </Card>
        </div>
      </div>
      
      <Dialog open={!!conceptToEdit} onOpenChange={(isOpen) => { if (!isOpen) setConceptToEdit(null) }}>
        <DialogContent className="max-w-4xl flex flex-col max-h-[90vh]">
            <Form {...editForm}>
                <form onSubmit={editForm.handleSubmit(onEditSubmit)}>
                    <DialogHeader>
                        <DialogTitle>Editar Concepto de Liquidación</DialogTitle>
                    </DialogHeader>
                    <div className="flex-grow overflow-hidden">
                        <ScrollArea className="h-[calc(80vh-120px)] p-1">
                            <div className="p-4">
                                <ConceptFormBody
                                form={editForm}
                                clientOptions={clientOptions}
                                standardObservations={standardObservations}
                                pedidoTypes={pedidoTypes}
                                isEditMode={true}
                                />
                            </div>
                        </ScrollArea>
                    </div>
                    <DialogFooter className="flex-shrink-0">
                        <Button type="button" variant="outline" onClick={() => setConceptToEdit(null)}>Cancelar</Button>
                        <Button type="submit" disabled={isEditing}>{isEditing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Guardar Cambios</Button>
                    </DialogFooter>
                </form>
            </Form>
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

const unitOfMeasureOptions = ['KILOGRAMOS', 'TONELADA', 'PALETA', 'ESTIBA', 'UNIDAD', 'CAJA', 'SACO', 'CANASTILLA', 'HORA', 'DIA', 'VIAJE', 'MES', 'CONTENEDOR', 'HORA EXTRA DIURNA', 'HORA EXTRA NOCTURNA', 'HORA EXTRA DIURNA DOMINGO Y FESTIVO', 'HORA EXTRA NOCTURNA DOMINGO Y FESTIVO', 'POSICION/DIA', 'POSICIONES', 'TIPO VEHÍCULO', 'TRACTOMULA', 'QUINCENA'];
const specificUnitOptions = ['HORA', 'UNIDAD', 'DIA', 'VIAJE', 'ALIMENTACION', 'TRANSPORTE', 'HORA EXTRA DIURNA', 'HORA EXTRA NOCTURNA', 'HORA EXTRA DIURNA DOMINGO Y FESTIVO', 'HORA EXTRA NOCTURNA DOMINGO Y FESTIVO', 'TRANSPORTE EXTRAORDINARIO', 'TRANSPORTE DOMINICAL Y FESTIVO', 'POSICION/DIA', 'POSICIONES/MES'];

function ConceptFormBody(props: { form: any; clientOptions: ClientInfo[]; standardObservations: StandardObservation[]; pedidoTypes: PedidoType[], isEditMode: boolean; }) {
  const { form, clientOptions, standardObservations, pedidoTypes, isEditMode } = props;
  const { fields: tariffRangesFields, append: appendTariffRange, remove: removeTariffRange } = useFieldArray({ control: form.control, name: "tariffRanges" });
  const { fields: tempTariffFields, append: appendTempTariff, remove: removeTempTariff } = useFieldArray({ control: form.control, name: "tariffRangesTemperature" });
  const { fields: specificTariffsFields, append: appendSpecificTariff, remove: removeSpecificTariff } = useFieldArray({ control: form.control, name: "specificTariffs" });

  const watchedCalculationType = useWatch({ control: form.control, name: 'calculationType' });
  const watchedTariffType = useWatch({ control: form.control, name: 'tariffType' });
  const watchedConceptName = useWatch({ control: form.control, name: 'conceptName' });
  const watchedCalculationBase = useWatch({ control: form.control, name: "calculationBase" });
  
  return (
      <div className="space-y-4">
          <FormField control={form.control} name="conceptName" render={({ field }) => (<FormItem><FormLabel>Nombre del Concepto</FormLabel><FormControl><Input placeholder="Ej: ALMACENAMIENTO PALLET/DIA" {...field} onChange={e => field.onChange(e.target.value.toUpperCase())} /></FormControl><FormMessage /></FormItem>)}/>
          <FormField
            control={form.control}
            name="clientNames"
            render={({ field }) => (
              <FormItem>
                  <FormLabel>Aplicar a Cliente(s)</FormLabel>
                  <ClientMultiSelectDialog
                      options={clientOptions.map(c => ({value: c.razonSocial, label: c.razonSocial}))}
                      selected={field.value || []}
                      onChange={field.onChange}
                      placeholder="Seleccione clientes..."
                  />
                  <FormMessage />
              </FormItem>
            )}
          />
          <FormField control={form.control} name="unitOfMeasure" render={({ field }) => (<FormItem><FormLabel>Unidad de Medida (Para Reporte)</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Seleccione una unidad" /></SelectTrigger></FormControl><SelectContent><ScrollArea className="h-60">{unitOfMeasureOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</ScrollArea></SelectContent></Select><FormMessage /></FormItem>)}/>
          <Separator />
          <FormField control={form.control} name="calculationType" render={({ field }) => ( <FormItem className="space-y-3"><FormLabel>Tipo de Cálculo</FormLabel><FormControl><RadioGroup onValueChange={field.onChange} value={field.value} className="flex flex-wrap gap-4"><FormItem className="flex items-center space-x-2"><RadioGroupItem value="REGLAS" id={`type-reglas-${isEditMode}`} /><Label htmlFor={`type-reglas-${isEditMode}`}>Por Reglas</Label></FormItem><FormItem className="flex items-center space-x-2"><RadioGroupItem value="OBSERVACION" id={`type-obs-${isEditMode}`} /><Label htmlFor={`type-obs-${isEditMode}`}>Por Observación</Label></FormItem><FormItem className="flex items-center space-x-2"><RadioGroupItem value="MANUAL" id={`type-manual-${isEditMode}`} /><Label htmlFor={`type-manual-${isEditMode}`}>Op. Manual</Label></FormItem><FormItem className="flex items-center space-x-2"><RadioGroupItem value="SALDO_INVENTARIO" id={`type-saldo-${isEditMode}`} /><Label htmlFor={`type-saldo-${isEditMode}`}>Saldo Inventario</Label></FormItem><FormItem className="flex items-center space-x-2"><RadioGroupItem value="SALDO_CONTENEDOR" id={`type-saldo-cont-${isEditMode}`} /><Label htmlFor={`type-saldo-cont-${isEditMode}`}>Saldo por Contenedor</Label></FormItem><FormItem className="flex items-center space-x-2"><RadioGroupItem value="LÓGICA ESPECIAL" id={`type-logica-${isEditMode}`} /><Label htmlFor={`type-logica-${isEditMode}`}>Lógica Especial</Label></FormItem></RadioGroup></FormControl><FormMessage /></FormItem> )}/>
          
          {watchedCalculationType === 'REGLAS' && (
              <div className='space-y-4 p-4 border rounded-md bg-muted/20'>
                  <FormField control={form.control} name="calculationBase" render={({ field }) => (<FormItem><FormLabel>Calcular Usando</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Seleccione una base..." /></SelectTrigger></FormControl><SelectContent>
                      <SelectItem value="TONELADAS">TONELADAS</SelectItem>
                      <SelectItem value="KILOGRAMOS">KILOGRAMOS</SelectItem>
                      <SelectItem value="CANTIDAD_PALETAS">CANTIDAD DE PALETAS</SelectItem>
                      <SelectItem value="PALETAS_SALIDA_MAQUILA_CONGELADOS">PALETAS SALIDA MAQUILA (CONGELADOS)</SelectItem>
                      <SelectItem value="PALETAS_SALIDA_MAQUILA_SECO">PALETAS SALIDA MAQUILA (SECO)</SelectItem>
                      <SelectItem value="CANTIDAD_SACOS_MAQUILA">CANTIDAD SACOS MAQUILA</SelectItem>
                      <SelectItem value="CANTIDAD_CAJAS">CANTIDAD DE CAJAS/UNIDADES</SelectItem>
                      <SelectItem value="NUMERO_OPERACIONES">NÚMERO DE OPERACIONES</SelectItem>
                      <SelectItem value="NUMERO_CONTENEDORES">NÚMERO DE CONTENEDORES</SelectItem>
                  </SelectContent></Select><FormMessage /></FormItem>)}/>
                  {(watchedCalculationBase === 'CANTIDAD_PALETAS' || watchedCalculationBase === 'CANTIDAD_CAJAS') && (
                    <FormField
                      control={form.control}
                      name="palletTypeFilter"
                      render={({ field }) => (
                        <FormItem className="space-y-3 rounded-md border p-4">
                          <FormLabel>Contar Paletas</FormLabel>
                          <FormControl>
                            <RadioGroup
                              onValueChange={field.onChange}
                              defaultValue={field.value}
                              className="flex flex-col space-y-1"
                            >
                              <FormItem className="flex items-center space-x-3 space-y-0">
                                <FormControl><RadioGroupItem value="ambas" /></FormControl>
                                <FormLabel className="font-normal">Ambas (Completas y Picking)</FormLabel>
                              </FormItem>
                              <FormItem className="flex items-center space-x-3 space-y-0">
                                <FormControl><RadioGroupItem value="completas" /></FormControl>
                                <FormLabel className="font-normal">Solo Completas</FormLabel>
                              </FormItem>
                              <FormItem className="flex items-center space-x-3 space-y-0">
                                <FormControl><RadioGroupItem value="picking" /></FormControl>
                                <FormLabel className="font-normal">Solo Picking</FormLabel>
                              </FormItem>
                            </RadioGroup>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  <FormField control={form.control} name="filterOperationType" render={({ field }) => (<FormItem><FormLabel>Filtrar por Tipo de Operación</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent><SelectItem value="ambos">Ambos (Recepción y Despacho)</SelectItem><SelectItem value="recepcion">Recepción</SelectItem><SelectItem value="despacho">Despacho</SelectItem></SelectContent></Select><FormMessage /></FormItem>)}/>
                  <FormField control={form.control} name="filterProductType" render={({ field }) => (<FormItem><FormLabel>Filtrar por Tipo de Producto</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent><SelectItem value="ambos">Ambos (Peso Fijo y Variable)</SelectItem><SelectItem value="fijo">Peso Fijo</SelectItem><SelectItem value="variable">Peso Variable</SelectItem></SelectContent></Select><FormMessage /></FormItem>)}/>
                  <FormField control={form.control} name="filterSesion" render={({ field }) => (<FormItem><FormLabel>Filtrar por Sesión (Cámara)</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent><SelectItem value="AMBOS">Ambos (Cualquier Sesión)</SelectItem><SelectItem value="CO">Congelados (CO)</SelectItem><SelectItem value="RE">Refrigerado (RE)</SelectItem><SelectItem value="SE">Seco (SE)</SelectItem></SelectContent></Select><FormMessage /></FormItem>)}/>
                  <FormField
                    control={form.control}
                    name="filterPedidoTypes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Filtrar por Tipos de Pedido (Opcional)</FormLabel>
                        <PedidoTypeMultiSelect
                          options={pedidoTypes.map((pt) => ({ value: pt.name, label: pt.name }))}
                          selected={field.value || []}
                          onChange={field.onChange}
                          placeholder="Todos los tipos de pedido"
                        />
                        <FormMessage />
                      </FormItem>
                    )}
                  />
              </div>
          )}
          {watchedCalculationType === 'OBSERVACION' && (
               <div className='space-y-4 p-4 border rounded-md bg-muted/20'>
                  <FormField control={form.control} name="associatedObservation" render={({ field }) => (<FormItem><FormLabel>Observación Asociada</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Seleccione una observación..." /></SelectTrigger></FormControl><SelectContent><ScrollArea className="h-60">{standardObservations.map(obs => <SelectItem key={obs.id} value={obs.name}>{obs.name}</SelectItem>)}</ScrollArea></SelectContent></Select><FormDescription>El sistema buscará esta observación en los formularios.</FormDescription><FormMessage /></FormItem>)}/>
              </div>
          )}
          {(watchedCalculationType === 'SALDO_INVENTARIO' || watchedCalculationType === 'SALDO_CONTENEDOR') && (
              <div className='space-y-4 p-4 border rounded-md bg-muted/20'>
                  {watchedCalculationType !== 'SALDO_CONTENEDOR' && (
                    <FormField control={form.control} name="inventorySource" render={({ field }) => (<FormItem><FormLabel>Fuente del Dato</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Seleccione fuente..." /></SelectTrigger></FormControl><SelectContent><SelectItem value="POSICIONES_ALMACENADAS">Posiciones Almacenadas (Consolidado)</SelectItem></SelectContent></Select><FormMessage /></FormItem>)}/>
                  )}
                  <FormField control={form.control} name="inventorySesion" render={({ field }) => (<FormItem><FormLabel>Sesión de Inventario</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Seleccione sesión..." /></SelectTrigger></FormControl><SelectContent><SelectItem value="CO">Congelado (CO)</SelectItem><SelectItem value="RE">Refrigerado (RE)</SelectItem><SelectItem value="SE">Seco (SE)</SelectItem></SelectContent></Select><FormMessage /></FormItem>)}/>
                  
                  {watchedCalculationType === 'SALDO_INVENTARIO' && (
                    <>
                      <FormField control={form.control} name="filterByArticleCodes" render={({ field }) => (<FormItem>
                          <FormLabel>Filtrar por Códigos de Artículo (Opcional)</FormLabel>
                          <FormControl><Input placeholder="Ej: 03, 10-A, 25B" {...field} value={field.value ?? ''} /></FormControl>
                          <FormDescription>Separe múltiples códigos con comas.</FormDescription>
                          <FormMessage />
                      </FormItem>)}/>
                      <FormField
                          control={form.control}
                          name="excludeArticleCodes"
                          render={({ field }) => (
                          <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4">
                              <FormControl>
                              <Checkbox
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                              />
                              </FormControl>
                              <div className="space-y-1 leading-none">
                              <FormLabel>Excluir estos artículos</FormLabel>
                              <FormDescription>
                                  Si se marca, el cálculo aplicará a todos los artículos EXCEPTO los listados.
                              </FormDescription>
                              </div>
                          </FormItem>
                          )}
                      />
                    </>
                  )}
              </div>
          )}
          <Separator />
          <FormField control={form.control} name="tariffType" render={({ field }) => ( <FormItem className="space-y-3"><FormLabel>Tipo de Tarifa</FormLabel><FormControl><RadioGroup onValueChange={field.onChange} value={field.value} className="flex flex-wrap gap-4"><FormItem className="flex items-center space-x-2"><RadioGroupItem value="UNICA" id={`unica-${isEditMode}`} /><Label htmlFor={`unica-${isEditMode}`}>Única</Label></FormItem><FormItem className="flex items-center space-x-2"><RadioGroupItem value="RANGOS" id={`rangos-${isEditMode}`} /><Label htmlFor={`rangos-${isEditMode}`}>Rangos</Label></FormItem><FormItem className="flex items-center space-x-2"><RadioGroupItem value="ESPECIFICA" id={`especifica-${isEditMode}`} /><Label htmlFor={`especifica-${isEditMode}`}>Específica</Label></FormItem><FormItem className="flex items-center space-x-2"><RadioGroupItem value="POR_TEMPERATURA" id={`temperatura-${isEditMode}`} /><Label htmlFor={`temperatura-${isEditMode}`}>Por Temperatura</Label></FormItem></RadioGroup></FormControl><FormMessage /></FormItem> )}/>

          {watchedTariffType === 'UNICA' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField control={form.control} name="value" render={({ field }) => (<FormItem><FormLabel>Tarifa Única (COP)</FormLabel><FormControl><Input type="number" step="0.01" {...field} value={field.value ?? 0} /></FormControl><FormMessage /></FormItem>)}/>
                  {(watchedConceptName === 'IN-HOUSE INSPECTOR ZFPC' || watchedConceptName === 'ALQUILER IMPRESORA ETIQUETADO' || watchedConceptName === 'POSICIONES FIJAS CÁMARA CONGELADOS') && (
                      <FormField control={form.control} name="billingPeriod" render={({ field }) => (<FormItem><FormLabel>Período de Facturación</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="DIARIO">Diario</SelectItem><SelectItem value="QUINCENAL">Quincenal</SelectItem><SelectItem value="MENSUAL">Mensual</SelectItem></SelectContent></Select><FormMessage /></FormItem>)}/>
                  )}
              </div>
          )}
          
          {watchedTariffType === 'RANGOS' && (
              <div className='space-y-4 p-4 border rounded-md bg-muted/20'>
                  <div className="space-y-2">
                      <FormLabel>Definición de Turno Diurno</FormLabel>
                      <div className="grid grid-cols-2 gap-4 border-b pb-4">
                          <FormField control={form.control} name="weekdayDayShiftStart" render={({ field }) => (<FormItem><FormLabel>Inicio L-V</FormLabel><FormControl><Input type="time" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                          <FormField control={form.control} name="weekdayDayShiftEnd" render={({ field }) => (<FormItem><FormLabel>Fin L-V</FormLabel><FormControl><Input type="time" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                      </div>
                       <div className="grid grid-cols-2 gap-4 pt-2">
                          <FormField control={form.control} name="saturdayDayShiftStart" render={({ field }) => (<FormItem><FormLabel>Inicio Sáb</FormLabel><FormControl><Input type="time" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                          <FormField control={form.control} name="saturdayDayShiftEnd" render={({ field }) => (<FormItem><FormLabel>Fin Sáb</FormLabel><FormControl><Input type="time" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                      </div>
                      <FormDescription>Lo que esté fuera del rango de L-V será "Nocturno". Fuera del rango de Sábado o en Domingo será "Extra".</FormDescription>
                  </div>
                  <Separator />
                  <div className="space-y-2"><FormLabel>Rangos de Tarifas (Opcional)</FormLabel><FormDescription>Añada rangos si la tarifa varía por peso. Déjelo vacío para usar la misma tarifa sin importar el peso.</FormDescription></div>
                  <div className="space-y-4">
                      {tariffRangesFields.map((field, index) => (
                          <div key={field.id} className="grid grid-cols-1 gap-3 border p-3 rounded-md relative">
                              <div className="grid grid-cols-2 gap-2">
                                  <FormField control={form.control} name={`tariffRanges.${index}.minTons`} render={({ field }) => (<FormItem><FormLabel>Min. Ton.</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                                  <FormField control={form.control} name={`tariffRanges.${index}.maxTons`} render={({ field }) => (<FormItem><FormLabel>Max. Ton.</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                              </div>
                              <FormField control={form.control} name={`tariffRanges.${index}.vehicleType`} render={({ field }) => (<FormItem><FormLabel>Tipo Vehículo</FormLabel><FormControl><Input placeholder="EJ: TURBO" {...field} onChange={e => field.onChange(e.target.value.toUpperCase())} /></FormControl><FormMessage /></FormItem>)}/>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                  <FormField control={form.control} name={`tariffRanges.${index}.dayTariff`} render={({ field }) => (<FormItem><FormLabel>Tarifa Diurna</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                                  <FormField control={form.control} name={`tariffRanges.${index}.nightTariff`} render={({ field }) => (<FormItem><FormLabel>Tarifa Nocturna</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                                  <FormField control={form.control} name={`tariffRanges.${index}.extraTariff`} render={({ field }) => (<FormItem><FormLabel>Tarifa Extra</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                              </div>
                              <Button type="button" variant="ghost" size="icon" className="absolute top-1 right-1 text-destructive h-6 w-6" onClick={() => removeTariffRange(index)}>
                                  <Trash2 className="h-4 w-4" />
                              </Button>
                          </div>
                      ))}
                      <Button type="button" variant="outline" size="sm" onClick={() => appendTariffRange({ minTons: 0, maxTons: 999, vehicleType: '', dayTariff: 0, nightTariff: 0, extraTariff: 0 })}>
                          <PlusCircle className="mr-2 h-4 w-4" /> Agregar Rango
                      </Button>
                  </div>
              </div>
          )}

          {watchedTariffType === 'POR_TEMPERATURA' && (
              <div className='space-y-4 p-4 border rounded-md bg-muted/20'>
                  <div className="space-y-2"><FormLabel>Rangos de Temperatura</FormLabel><FormDescription>Defina tarifas por kilo según la temperatura máxima registrada en la recepción.</FormDescription></div>
                  <div className="space-y-4">
                      {tempTariffFields.map((field, index) => (
                         <TemperatureRangeFields key={field.id} control={form.control} remove={removeTempTariff} index={index} />
                      ))}
                      <Button type="button" variant="outline" size="sm" onClick={() => appendTempTariff({ minTemp: 0, maxTemp: 0, ratePerKg: 0 })}>
                          <PlusCircle className="mr-2 h-4 w-4" /> Agregar Rango de Temperatura
                      </Button>
                  </div>
              </div>
          )}
          
          {watchedTariffType === 'ESPECIFICA' && (
              <div className='space-y-4 p-4 border rounded-md bg-muted/20'>
                  {(watchedConceptName === 'TIEMPO EXTRA FRIOAL (FIJO)' || watchedConceptName === 'TIEMPO EXTRA FRIOAL') && (
                      <div className="space-y-4 mb-4 pb-4 border-b">
                          <FormLabel>Configuración de Horarios Fijos</FormLabel>
                          <div className="grid grid-cols-2 gap-4">
                              <FormField control={form.control} name="fixedTimeConfig.weekdayStartTime" render={({ field }) => (<FormItem><FormLabel>Inicio L-V</FormLabel><FormControl><Input type="time" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                              <FormField control={form.control} name="fixedTimeConfig.weekdayEndTime" render={({ field }) => (<FormItem><FormLabel>Fin L-V</FormLabel><FormControl><Input type="time" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                              <FormField control={form.control} name="fixedTimeConfig.saturdayStartTime" render={({ field }) => (<FormItem><FormLabel>Inicio Sáb.</FormLabel><FormControl><Input type="time" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                              <FormField control={form.control} name="fixedTimeConfig.saturdayEndTime" render={({ field }) => (<FormItem><FormLabel>Fin Sáb.</FormLabel><FormControl><Input type="time" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                              <FormField control={form.control} name="fixedTimeConfig.sundayHolidayStartTime" render={({ field }) => (<FormItem><FormLabel>Inicio Dom/Fes</FormLabel><FormControl><Input type="time" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                              <FormField control={form.control} name="fixedTimeConfig.sundayHolidayEndTime" render={({ field }) => (<FormItem><FormLabel>Fin Dom/Fes</FormLabel><FormControl><Input type="time" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                          </div>
                          <FormField control={form.control} name="fixedTimeConfig.dayShiftEndTime" render={({ field }) => (<FormItem><FormLabel>Hora Fin Turno Diurno</FormLabel><FormControl><Input type="time" {...field} value={field.value ?? ''} /></FormControl><FormDescription>Para calcular horas nocturnas.</FormDescription><FormMessage /></FormItem>)} />
                      </div>
                  )}
                  <FormLabel>Tarifas Específicas</FormLabel>
                  <ScrollArea className="h-40 pr-4">
                      <div className="space-y-4">
                          {specificTariffsFields.map((field, index) => (
                              <div key={field.id} className="grid grid-cols-1 sm:grid-cols-2 gap-3 border p-3 rounded-md relative">
                                  <FormField control={form.control} name={`specificTariffs.${index}.name`} render={({ field }) => (<FormItem><FormLabel>Nombre Tarifa</FormLabel><FormControl><Input placeholder="Ej: HORA EXTRA DIURNA" {...field} onChange={e => field.onChange(e.target.value.toUpperCase())} /></FormControl><FormMessage /></FormItem>)} />
                                  <FormField control={form.control} name={`specificTariffs.${index}.unit`} render={({ field }) => (<FormItem><FormLabel>Unidad</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent><ScrollArea className="h-48">{specificUnitOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</ScrollArea></SelectContent></Select><FormMessage /></FormItem>)}/>
                                  <FormField control={form.control} name={`specificTariffs.${index}.value`} render={({ field }) => (<FormItem><FormLabel>Valor (COP)</FormLabel><FormControl><Input type="number" step="0.01" {...field}/></FormControl><FormMessage /></FormItem>)}/>
                                  <FormField
                                      control={form.control}
                                      name={`specificTariffs.${index}.baseQuantity`}
                                      render={({ field }) => (
                                      <FormItem>
                                          <FormLabel>Cantidad Base</FormLabel>
                                          <FormControl>
                                          <Input
                                              type="number"
                                              step="1"
                                              {...field}
                                              onChange={(e) => field.onChange(e.target.value === '' ? 0 : parseInt(e.target.value, 10))}
                                              value={field.value ?? 0}
                                          />
                                          </FormControl>
                                          <FormDescription className="text-xs">Para Posiciones Fijas</FormDescription>
                                          <FormMessage />
                                      </FormItem>
                                      )}
                                  />
                                  <Button type="button" variant="ghost" size="icon" className="absolute top-1 right-1 text-destructive h-6 w-6" onClick={() => removeSpecificTariff(index)}><Trash2 className="h-4 w-4" /></Button>
                              </div>
                          ))}
                      </div>
                  </ScrollArea>
                  <Button type="button" variant="outline" size="sm" onClick={() => appendSpecificTariff({ id: `new_${Date.now()}`, name: '', value: 0, unit: 'UNIDAD', baseQuantity: 0 })}>
                      <PlusCircle className="mr-2 h-4 w-4" /> Agregar Tarifa
                  </Button>
              </div>
          )}
      </div>
    );
}

function TemperatureRangeFields({ control, remove, index }: { control: any, remove: (index: number) => void, index: number }) {
    const { formState: { errors } } = useFormContext();
    const fieldErrors = errors?.tariffRangesTemperature?.[index] as FieldErrors<z.infer<typeof temperatureTariffRangeSchema>> | undefined;

    return (
        <div className="grid grid-cols-1 gap-3 border p-3 rounded-md relative">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <FormField
                    control={control}
                    name={`tariffRangesTemperature.${index}.minTemp`}
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Temp. Mín (°C)</FormLabel>
                            <FormControl>
                                <Input type="number" step="0.1" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={control}
                    name={`tariffRangesTemperature.${index}.maxTemp`}
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Temp. Máx (°C)</FormLabel>
                            <FormControl>
                                <Input type="number" step="0.1" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                 <FormField
                    control={control}
                    name={`tariffRangesTemperature.${index}.ratePerKg`}
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Tarifa por Kilo</FormLabel>
                            <FormControl>
                                <Input type="number" step="0.01" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </div>
            <Button type="button" variant="ghost" size="icon" className="absolute top-1 right-1 text-destructive h-6 w-6" onClick={() => remove(index)}>
                <Trash2 className="h-4 w-4" />
            </Button>
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
    
    // If "TODOS" is clicked
    if (isTodos) {
      // If it's already selected, unselect it. Otherwise, select only it.
      onChange(selected.includes(valueToToggle) ? [] : [valueToToggle]);
    } else {
      // If a specific client is clicked
      const newSelection = selected.includes(valueToToggle)
        ? selected.filter(s => s !== valueToToggle) // Unselect it
        : [...selected.filter(s => s !== 'TODOS (Cualquier Cliente)'), valueToToggle]; // Select it and remove "TODOS"
      onChange(newSelection);
    }
  };

  const getButtonLabel = () => {
    if (selected.length === 0) return placeholder;
    if (selected.length === 1) return selected[0];
    if (selected.includes('TODOS (Cualquier Cliente)')) return 'TODOS (Cualquier Cliente)';
    if (selected.length === options.length - 1) return "Todos los clientes seleccionados"; // -1 for 'TODOS' option
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
                            id={`client-ms-${option.value}`}
                            checked={selected.includes(option.value)}
                            onCheckedChange={() => handleSelect(option.value)}
                        />
                        <Label
                            htmlFor={`client-ms-${option.value}`}
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

function PedidoTypeMultiSelect({
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
  const [search, setSearch] = useState('');

  const filteredOptions = useMemo(() => {
    if (!search) return options;
    return options.filter((o) =>
      o.label.toLowerCase().includes(search.toLowerCase())
    );
  }, [search, options]);

  const handleSelect = (valueToToggle: string) => {
    const newSelection = selected.includes(valueToToggle)
      ? selected.filter((s) => s !== valueToToggle)
      : [...selected, valueToToggle];
    onChange(newSelection);
  };

  const getButtonLabel = () => {
    if (selected.length === 0) return placeholder;
    if (selected.length === 1) return selected[0];
    if (selected.length === options.length) return "Todos los tipos seleccionados";
    return `${selected.length} tipos seleccionados`;
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Seleccionar Tipo(s) de Pedido</DialogTitle>
        </DialogHeader>
        <Input
          placeholder="Buscar..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="my-4"
        />
        <ScrollArea className="h-60">
          <div className="space-y-1">
            {filteredOptions.map((option) => (
              <div key={option.value} className="flex items-center space-x-2">
                <Checkbox
                  id={`pedido-type-${option.value}`}
                  checked={selected.includes(option.value)}
                  onCheckedChange={() => handleSelect(option.value)}
                />
                <Label
                  htmlFor={`pedido-type-${option.value}`}
                  className="font-normal"
                >
                  {option.label}
                </Label>
              </div>
            ))}
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button onClick={() => setOpen(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}




    




  