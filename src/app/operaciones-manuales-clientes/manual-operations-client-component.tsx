
"use client";

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, SubmitHandler, useFieldArray, useWatch, FieldErrors, useFormContext } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { format, parseISO, addDays, getDaysInMonth, getDay, isSaturday, isSunday, isWithinInterval, startOfDay } from 'date-fns';
import { DateRange } from 'react-day-picker';
import { es } from 'date-fns/locale';

import { addManualClientOperation, updateManualClientOperation, deleteManualClientOperation, addBulkManualClientOperation } from './actions';
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


const specificTariffEntrySchema = z.object({
    tariffId: z.string(),
    quantity: z.coerce.number().min(0, "Debe ser >= 0"),
});

const bulkRoleSchema = z.object({
  roleName: z.string(),
  diurnaId: z.string(),
  nocturnaId: z.string(),
  diurnaLabel: z.string(),
  nocturnaLabel: z.string(),
  diurnaValue: z.number(),
  nocturnaValue: z.number(),
  numPersonas: z.coerce.number().int().min(0, "Debe ser un número positivo.").default(0),
});

const excedentSchema = z.object({
    date: z.string(),
    hours: z.coerce.number().min(0, "Debe ser un número positivo"),
});

const manualOperationSchema = z.object({
  clientName: z.string().min(1, 'El cliente es obligatorio.'),
  operationDate: z.date({ required_error: 'La fecha es obligatoria.' }).optional(),
  
  dateRange: z.custom<DateRange>(v => v instanceof Object && 'from' in v, {
    message: "El rango de fechas es obligatorio para la liquidación en lote.",
  }).optional(),
  bulkRoles: z.array(bulkRoleSchema).optional(),
  excedentes: z.array(excedentSchema).optional(),

  concept: z.string().min(1, 'El concepto es obligatorio.'),
  specificTariffs: z.array(specificTariffEntrySchema).optional(),
  quantity: z.coerce.number().min(0, 'La cantidad debe ser 0 o mayor.').optional(),
  numeroPersonas: z.coerce.number().int().min(1, "Debe ser al menos 1.").optional(),
  numeroPosiciones: z.coerce.number().int().min(1, 'Debe ingresar al menos una posición.').optional(),
  details: z.object({
      startTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Formato HH:MM requerido.').optional().or(z.literal('')),
      endTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Formato HH:MM requerido.').optional().or(z.literal('')),
      plate: z.string().optional(),
      container: z.string().optional(),
      totalPallets: z.coerce.number().int().min(0, 'Debe ser un número positivo.').optional().nullable(),
      arin: z.string().optional(),
  }).optional(),
}).superRefine((data, ctx) => {
    const isBulkMode = data.concept === 'TIEMPO EXTRA FRIOAL (FIJO)';
    const isPositionMode = data.concept === 'POSICIONES FIJAS CÁMARA CONGELADOS';
    const isFixedMonthlyService = isPositionMode || data.concept === 'IN-HOUSE INSPECTOR ZFPC' || data.concept === 'ALQUILER IMPRESORA ETIQUETADO';


    if (isBulkMode) {
      if (!data.dateRange?.from || !data.dateRange?.to) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "El rango de fechas es obligatorio.", path: ["dateRange"] });
      }
      if (!data.bulkRoles || data.bulkRoles.every(r => r.numPersonas === 0)) {
           ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Debe ingresar al menos una persona en algún rol.", path: ["bulkRoles"] });
      }
    } else if (isFixedMonthlyService) {
        if (!data.operationDate) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La fecha de liquidación es obligatoria.", path: ["operationDate"] });
        }
        if (isPositionMode && (!data.specificTariffs || data.specificTariffs.length === 0)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Debe seleccionar al menos una tarifa.", path: ["specificTariffs"] });
        } else if (isPositionMode) {
            const excessTariff = data.specificTariffs?.find(t => t.tariffId.includes('EXCESO'));
            if (excessTariff && (excessTariff.quantity === undefined || excessTariff.quantity <= 0)) {
                 ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La cantidad para la tarifa de exceso es requerida.", path: [`specificTariffs.${data.specificTariffs?.indexOf(excessTariff)}.quantity`] });
            }
        }
    } else {
       if (!data.operationDate) {
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

    const specialConcepts = ['INSPECCIÓN ZFPC', 'TIEMPO EXTRA ZFPC'];
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
    
    const [selectedDate, setSelectedDate] = useState<Date | undefined>();
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
            details: {
                startTime: '',
                endTime: '',
                plate: '',
                container: '',
                totalPallets: null,
                arin: '',
            },
            bulkRoles: [],
            excedentes: [],
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
    
    const watchedConcept = form.watch('concept');
    const watchedOperationDate = form.watch('operationDate');
    const selectedConceptInfo = useMemo(() => billingConcepts.find(c => c.conceptName === watchedConcept), [watchedConcept, billingConcepts]);
    
    const isBulkMode = watchedConcept === 'TIEMPO EXTRA FRIOAL (FIJO)';
    const isPositionMode = watchedConcept === 'POSICIONES FIJAS CÁMARA CONGELADOS';
    const isFixedMonthlyService = isPositionMode || watchedConcept === 'IN-HOUSE INSPECTOR ZFPC' || watchedConcept === 'ALQUILER IMPRESORA ETIQUETADO';
    const showNumeroPersonas = selectedConceptInfo?.tariffType === 'ESPECIFICA' && !isBulkMode && !isPositionMode;


    useEffect(() => {
        if (selectedConceptInfo?.tariffType !== 'ESPECIFICA') {
            form.setValue('specificTariffs', []);
        } else if (isBulkMode && selectedConceptInfo?.specificTariffs) {
            const roles = [
                { role: "SUPERVISOR", diurna: "HORA EXTRA DIURNA", nocturna: "HORA EXTRA NOCTURNA" },
                { role: "MONTACARGUISTA TRILATERAL", diurna: "HORA EXTRA DIURNA", nocturna: "HORA EXTRA NOCTURNA" },
                { role: "MONTACARGUISTA NORMAL", diurna: "HORA EXTRA DIURNA", nocturna: "HORA EXTRA NOCTURNA" },
                { role: "OPERARIO", diurna: "HORA EXTRA DIURNA", nocturna: "HORA EXTRA NOCTURNA" },
            ];

            const bulkRoles = roles.map(r => {
                const diurnaTariff = selectedConceptInfo.specificTariffs?.find(t => t.name.includes(r.role) && t.name.includes(r.diurna));
                const nocturnaTariff = selectedConceptInfo.specificTariffs?.find(t => t.name.includes(r.role) && t.name.includes(r.nocturna));
                
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
            }).filter(r => r.diurnaId && r.nocturnaId);

            form.setValue('bulkRoles', bulkRoles);
            
        } else {
             form.setValue('quantity', undefined);
             form.setValue('bulkRoles', []);
        }

        if (selectedConceptInfo?.tariffType !== 'ESPECIFICA' && !isPositionMode) {
            form.setValue('numeroPersonas', undefined);
        } else if(showNumeroPersonas) {
             form.setValue('numeroPersonas', form.getValues('numeroPersonas') || 1);
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
        if (!selectedDate) {
            toast({
                variant: 'destructive',
                title: 'Fecha Requerida',
                description: 'Por favor, seleccione una fecha para realizar la consulta.'
            });
            return;
        }

        let results = operations;
        results = results.filter(op => {
            const opDate = op.startDate ? new Date(op.startDate) : parseISO(op.operationDate);
            return format(opDate, 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd');
        });

        if (selectedClient !== 'all') {
            results = results.filter(op => op.clientName === selectedClient);
        }
        if (selectedConcept !== 'all') {
            results = results.filter(op => op.concept === selectedConcept);
        }
        
        setSearched(true);
        setFilteredOperations(results);
        
        if (results.length === 0) {
            toast({
                title: "Sin resultados",
                description: "No se encontraron operaciones con los filtros seleccionados."
            });
        }
    }, [selectedClient, selectedConcept, selectedDate, toast]);
    
    const handleClearFilters = () => {
        setSelectedDate(undefined);
        setSelectedClient('all');
        setSelectedConcept('all');
        setFilteredOperations([]);
        setSearched(false);
    };

    const openDialog = (mode: DialogMode, op?: any) => {
        setDialogMode(mode);
        setOpToManage(op || null);
    
        if (op) {
             const opDate = op.startDate ? parseISO(op.startDate) : parseISO(op.operationDate);
            form.reset({
                clientName: op.clientName || '',
                operationDate: opDate,
                concept: op.concept,
                quantity: op.quantity,
                specificTariffs: op.specificTariffs || [],
                numeroPersonas: op.numeroPersonas || undefined,
                details: op.details || {},
                dateRange: op.startDate && op.endDate
                    ? { from: parseISO(op.startDate), to: parseISO(op.endDate) }
                    : undefined,
                bulkRoles: op.bulkRoles || [],
                excedentes: op.excedentes || [],
            });
        } else {
            form.reset({
                clientName: "",
                concept: "",
                operationDate: new Date(),
                quantity: 1,
                specificTariffs: [],
                numeroPersonas: 1,
                details: { startTime: '', endTime: '', plate: '', container: '', totalPallets: null, arin: '' },
                bulkRoles: [],
                excedentes: [],
            });
        }
        setIsDialogOpen(true);
    };

    const onSubmit: SubmitHandler<ManualOperationValues> = async (data) => {
        if (!user) return;
        setIsSubmitting(true);
        
        try {
            if (isBulkMode && dialogMode === 'add') {
                const bulkData = {
                    clientName: data.clientName,
                    concept: data.concept,
                    startDate: data.dateRange!.from!.toISOString(),
                    endDate: data.dateRange!.to!.toISOString(),
                    roles: data.bulkRoles!.filter(r => r.numPersonas > 0),
                    excedentes: data.excedentes || [],
                    createdBy: { uid: user.uid, displayName: displayName || user.email! }
                };
                const result = await addBulkManualClientOperation(bulkData);
                if (!result.success) throw new Error(result.message);
                toast({ title: 'Éxito', description: result.message });
            } else {
                let payload: ManualClientOperationData = {
                    ...data,
                    operationDate: data.operationDate?.toISOString(),
                    details: data.details || {},
                    createdBy: {
                        uid: user.uid,
                        displayName: displayName || user.email!,
                    }
                };

                let result;
                if (dialogMode === 'edit' && opToManage) {
                    result = await updateManualClientOperation(opToManage.id, payload as Omit<ManualClientOperationData, 'createdAt' | 'createdBy'>);
                } else {
                    result = await addManualClientOperation(payload);
                }
                
                if (!result.success) throw new Error(result.message);
                toast({ title: 'Éxito', description: result.message });
            }
            
            setIsDialogOpen(false);
            form.reset();
            const updatedOps = await fetchAllOperations();
            if (searched && selectedDate) {
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
             if (searched && selectedDate) {
                handleSearch(updatedOps);
            }
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.message });
        }
        setOpToDelete(null);
        setIsDeleting(false);
    };

    const handleCaptureTime = (fieldName: 'details.startTime' | 'details.endTime') => {
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        form.setValue(fieldName, `${hours}:${minutes}`, { shouldValidate: true });
    };

    const showAdvancedFields = ['INSPECCIÓN ZFPC', 'TIEMPO EXTRA ZFPC'].includes(watchedConcept);
    const showInspectionFields = watchedConcept === 'INSPECCIÓN ZFPC';

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
                         <Button onClick={() => router.push('/gestion-conceptos-liquidacion-clientes')} className="absolute right-0 top-1/2 -translate-y-1/2">
                            <DollarSign className="mr-2 h-4 w-4" />
                            Gestionar Conceptos
                        </Button>
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
                                <Label>Fecha <span className="text-destructive">*</span></Label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !selectedDate && "text-muted-foreground")}>
                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                            {selectedDate ? format(selectedDate, "PPP", { locale: es }) : <span>Seleccione una fecha</span>}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={selectedDate} onSelect={setSelectedDate} initialFocus /></PopoverContent>
                                </Popover>
                            </div>
                             <div className="space-y-2">
                                <Label>Cliente</Label>
                                <Select value={selectedClient} onValueChange={setSelectedClient}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos los Clientes</SelectItem>{[...new Set(allOperations.map(op => op.clientName).filter(Boolean))].sort((a,b) => a.localeCompare(b)).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
                            </div>
                             <div className="space-y-2">
                                <Label>Concepto</Label>
                                <Select value={selectedConcept} onValueChange={setSelectedConcept}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos los Conceptos</SelectItem>{billingConcepts.filter(c => c.calculationType === 'MANUAL').map(c => <SelectItem key={c.id} value={c.conceptName}>{c.conceptName}</SelectItem>)}</SelectContent></Select>
                            </div>
                            <div className="flex items-end gap-2 xl:col-span-2">
                                <Button onClick={() => handleSearch(allOperations)} disabled={!selectedDate || isLoading} className="w-full">
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
                                                <TableCell>{op.startDate && op.endDate ? `${format(parseISO(op.startDate), 'dd/MM/yy')} - ${format(parseISO(op.endDate), 'dd/MM/yy')}` : format(parseISO(op.operationDate), 'dd/MM/yyyy')}</TableCell>
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
                                        <FormField control={form.control} name="clientName" render={({ field }) => ( <FormItem><FormLabel>Cliente <span className="text-destructive">*</span></FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={dialogMode === 'view'}><FormControl><SelectTrigger><SelectValue placeholder="Seleccione un cliente" /></SelectTrigger></FormControl><SelectContent><ScrollArea className="h-60">{clients.map(c => <SelectItem key={c.id} value={c.razonSocial}>{c.razonSocial}</SelectItem>)}</ScrollArea></SelectContent></Select><FormMessage /></FormItem> )}/>
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
                                                        disabled={dialogMode === 'view'}
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

                                        {isFixedMonthlyService ? (
                                            <FormField control={form.control} name="operationDate" render={({ field }) => ( <FormItem className="flex flex-col"><FormLabel>Fecha de Liquidación <span className="text-destructive">*</span></FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} disabled={dialogMode === 'view'} className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4" />{field.value ? format(field.value, "PPP", { locale: es }) : <span>Seleccione fecha</span>}</Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={field.value} onSelect={field.onChange} disabled={dialogMode === 'view'} initialFocus /></PopoverContent></Popover>
                                                {field.value && <FormDescription>Se liquidarán {getDaysInMonth(field.value)} días para el mes de {format(field.value, 'MMMM', {locale: es})}.</FormDescription>}
                                                <FormMessage /></FormItem> )} />
                                        ) : isBulkMode ? (
                                            <FormField
                                                control={form.control}
                                                name="dateRange"
                                                render={({ field }) => (
                                                <FormItem className="flex flex-col">
                                                    <FormLabel>Rango de Fechas de Liquidación</FormLabel>
                                                    <Popover>
                                                    <PopoverTrigger asChild>
                                                        <FormControl>
                                                            <Button
                                                                id="date"
                                                                variant={"outline"}
                                                                className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}
                                                                disabled={dialogMode === 'edit'}
                                                            >
                                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                                            {field.value?.from ? (
                                                                field.value.to ? (
                                                                <>
                                                                    {format(field.value.from, "LLL dd, y")} -{" "}
                                                                    {format(field.value.to, "LLL dd, y")}
                                                                </>
                                                                ) : (
                                                                format(field.value.from, "LLL dd, y")
                                                                )
                                                            ) : (
                                                                <span>Seleccione un rango</span>
                                                            )}
                                                            </Button>
                                                        </FormControl>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-auto p-0" align="start">
                                                        <Calendar
                                                            initialFocus
                                                            mode="range"
                                                            defaultMonth={field.value?.from}
                                                            selected={field.value}
                                                            onSelect={field.onChange}
                                                            numberOfMonths={2}
                                                            disabled={(date) => isSunday(date) || dialogMode === 'edit'}
                                                        />
                                                    </PopoverContent>
                                                    </Popover>
                                                    <FormMessage />
                                                </FormItem>
                                                )}
                                            />
                                        ) : (
                                          <FormField control={form.control} name="operationDate" render={({ field }) => ( <FormItem className="flex flex-col"><FormLabel>Fecha de Operación <span className="text-destructive">*</span></FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} disabled={dialogMode === 'view'} className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4 opacity-50" />{field.value ? format(field.value, "PPP", { locale: es }) : <span>Seleccione una fecha</span>}</Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={field.value} onSelect={field.onChange} disabled={dialogMode === 'view'} initialFocus /></PopoverContent></Popover><FormMessage /></FormItem> )} />
                                        )}

                                        {isPositionMode ? (
                                            <FormField control={form.control} name="specificTariffs" render={() => (
                                                <FormItem>
                                                    <div className="mb-4"><FormLabel className="text-base">Tarifas a Aplicar</FormLabel></div>
                                                    <div className="space-y-3">
                                                        {(selectedConceptInfo?.specificTariffs || []).map((tariff: SpecificTariff, index) => {
                                                            return (
                                                                <FormField key={tariff.id} control={form.control} name={`specificTariffs`}
                                                                    render={({ field }) => {
                                                                        const currentSelection = field.value?.find(v => v.tariffId === tariff.id);
                                                                        const isSelected = !!currentSelection;
                                                                        const isExcess = tariff.name.includes("EXCESO");
                                                                        return (
                                                                            <div className="flex flex-row items-start space-x-3 space-y-0">
                                                                                <FormControl>
                                                                                    <Checkbox checked={isSelected} onCheckedChange={(checked) => {
                                                                                            const newValue = checked ? [...(field.value || []), { tariffId: tariff.id, quantity: isExcess ? 0 : 1 }] : field.value?.filter((value) => value.tariffId !== tariff.id);
                                                                                            field.onChange(newValue);
                                                                                        }} disabled={dialogMode === 'view'}/>
                                                                                </FormControl>
                                                                                <div className="flex flex-col sm:flex-row justify-between w-full">
                                                                                    <FormLabel className="font-normal">{tariff.name}</FormLabel>
                                                                                    {isSelected && isExcess && (
                                                                                        <FormField control={form.control} name={`specificTariffs.${field.value?.findIndex(v => v.tariffId === tariff.id)}.quantity`}
                                                                                            render={({ field: qtyField }) => (
                                                                                                <FormItem>
                                                                                                    <div className="flex items-center gap-2">
                                                                                                        <FormLabel className="text-xs">Cant. Exceso:</FormLabel>
                                                                                                        <FormControl><Input type="number" min="1" step="1" className="h-7 w-24" {...qtyField} disabled={dialogMode === 'view'} /></FormControl>
                                                                                                    </div>
                                                                                                    <FormMessage className="text-xs" />
                                                                                                </FormItem>
                                                                                            )}
                                                                                        />
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    }}
                                                                />
                                                            );
                                                        })}
                                                    </div>
                                                    <FormMessage />
                                                </FormItem>
                                            )}/>
                                        ) : selectedConceptInfo?.tariffType === 'ESPECIFICA' && isBulkMode ? (
                                            <div className="space-y-4">
                                                <FormLabel className="text-base">Asignación de Personal</FormLabel>
                                                {bulkRoleFields.map((field, index) => (
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
                                                                    <Input id={`num-personas-${index}`} type="number" min="0" step="1" className="h-8 w-20" {...numField} />
                                                                </FormControl>
                                                            </div>
                                                        </FormItem>
                                                        )}
                                                    />
                                                </div>
                                                ))}
                                                <Separator />
                                                <ExcedentManager />
                                            </div>
                                        ) : selectedConceptInfo?.tariffType === 'ESPECIFICA' ? (
                                            <>
                                                {showNumeroPersonas && (
                                                    <FormField control={form.control} name="numeroPersonas" render={({ field }) => (<FormItem><FormLabel>No. Personas</FormLabel><FormControl><Input type="number" min="1" step="1" placeholder="1" {...field} onChange={e => field.onChange(parseInt(e.target.value, 10))} disabled={dialogMode === 'view'} /></FormControl><FormMessage /></FormItem>)} />
                                                )}
                                                <FormField control={form.control} name="specificTariffs" render={() => (
                                                        <FormItem>
                                                            <div className="mb-4"><FormLabel className="text-base">Tarifas a Aplicar</FormLabel></div>
                                                            <ScrollArea className="h-40 border rounded-md p-2">
                                                                <div className="space-y-3">
                                                                    {(selectedConceptInfo.specificTariffs || []).map((tariff: SpecificTariff, index) => {
                                                                        return (
                                                                            <FormField key={tariff.id} control={form.control} name={`specificTariffs`}
                                                                                render={({ field }) => {
                                                                                    const currentSelection = field.value?.find(v => v.tariffId === tariff.id);
                                                                                    const isSelected = !!currentSelection;
                                                                                    return (
                                                                                        <div className="flex flex-row items-start space-x-3 space-y-0">
                                                                                            <FormControl>
                                                                                                <Checkbox checked={isSelected} onCheckedChange={(checked) => {
                                                                                                        const newValue = checked ? [...(field.value || []), { tariffId: tariff.id, quantity: 1 }] : field.value?.filter((value) => value.tariffId !== tariff.id);
                                                                                                        field.onChange(newValue);
                                                                                                    }} disabled={dialogMode === 'view'}/>
                                                                                            </FormControl>
                                                                                            <div className="flex flex-col sm:flex-row justify-between w-full">
                                                                                                <FormLabel className="font-normal">{tariff.name}</FormLabel>
                                                                                                {isSelected && (
                                                                                                    <FormField control={form.control} name={`specificTariffs.${field.value?.findIndex(v => v.tariffId === tariff.id)}.quantity`}
                                                                                                        render={({ field: qtyField }) => (
                                                                                                            <FormItem>
                                                                                                                <div className="flex items-center gap-2">
                                                                                                                    <FormLabel className="text-xs">Cant:</FormLabel>
                                                                                                                    <FormControl><Input type="number" step="0.1" className="h-7 w-24" {...qtyField} disabled={dialogMode === 'view'} /></FormControl>
                                                                                                                </div>
                                                                                                                <FormMessage className="text-xs" />
                                                                                                            </FormItem>
                                                                                                        )}
                                                                                                    />
                                                                                                )}
                                                                                            </div>
                                                                                        </div>
                                                                                    );
                                                                                }}
                                                                            />
                                                                        );
                                                                    })}
                                                                </div>
                                                            </ScrollArea>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}/>
                                            </>
                                        ) : ( !isFixedMonthlyService && <FormField control={form.control} name="quantity" render={({ field }) => (<FormItem><FormLabel>Cantidad</FormLabel><FormControl><Input type="number" step="0.01" placeholder="Ej: 1.5" {...field} value={field.value ?? ''} disabled={dialogMode === 'view' || watchedConcept === 'INSPECCIÓN ZFPC'} /></FormControl><FormMessage /></FormItem>)}/>)}
                                        
                                        {(showAdvancedFields || dialogMode === 'view') && (
                                            <>
                                                <Separator />
                                                <p className="text-sm font-medium text-muted-foreground">Detalles Adicionales</p>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <FormField control={form.control} name="details.startTime" render={({ field }) => (<FormItem><FormLabel>Hora Inicio</FormLabel><div className="flex items-center gap-2"><FormControl><Input type="time" {...field} value={field.value ?? ''} disabled={dialogMode === 'view'} className="flex-grow" /></FormControl>{dialogMode !== 'view' && (<Button type="button" variant="outline" size="icon" onClick={() => handleCaptureTime('details.startTime')}><Clock className="h-4 w-4" /></Button>)}</div><FormMessage /></FormItem>)} />
                                                    <FormField control={form.control} name="details.endTime" render={({ field }) => (<FormItem><FormLabel>Hora Fin</FormLabel><div className="flex items-center gap-2"><FormControl><Input type="time" {...field} value={field.value ?? ''} disabled={dialogMode === 'view'} className="flex-grow" /></FormControl>{dialogMode !== 'view' && (<Button type="button" variant="outline" size="icon" onClick={() => handleCaptureTime('details.endTime')}><Clock className="h-4 w-4" /></Button>)}</div><FormMessage /></FormItem>)} />
                                                </div>
                                                <FormField control={form.control} name="details.container" render={({ field }) => (<FormItem><FormLabel>Contenedor {showInspectionFields && <span className="text-destructive">*</span>}</FormLabel><FormControl><Input placeholder="Contenedor" {...field} value={field.value ?? ''} disabled={dialogMode === 'view'} onChange={e => field.onChange(e.target.value.toUpperCase())} /></FormControl><FormMessage /></FormItem>)} />
                                                {showInspectionFields && (
                                                    <FormField control={form.control} name="details.arin" render={({ field }) => (<FormItem><FormLabel>ARIN <span className="text-destructive">*</span>}</FormLabel><FormControl><Input placeholder="Número de ARIN" {...field} value={field.value ?? ''} disabled={dialogMode === 'view'} /></FormControl><FormMessage /></FormItem>)} />
                                                )}
                                                <FormField control={form.control} name="details.plate" render={({ field }) => (<FormItem><FormLabel>Placa (Opcional)</FormLabel><FormControl><Input placeholder="ABC123" {...field} value={field.value ?? ''} disabled={dialogMode === 'view'} onChange={e => field.onChange(e.target.value.toUpperCase())} /></FormControl><FormMessage /></FormItem>)} />
                                                <FormField control={form.control} name="details.totalPallets" render={({ field }) => (<FormItem><FormLabel>Total Paletas</FormLabel><FormControl><Input type="number" step="1" placeholder="Ej: 10" {...field} value={field.value ?? ''} disabled={dialogMode === 'view'} onChange={e => field.onChange(e.target.value === '' ? null : parseInt(e.target.value, 10))}/></FormControl><FormMessage /></FormItem>)}/>
                                            </>
                                        )}
                                        
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

function ConceptSelectorDialog({ billingConcepts, onSelect }: { billingConcepts: ClientBillingConcept[], onSelect: (conceptName: string) => void }) {
    const [search, setSearch] = useState('');
    const filteredConcepts = useMemo(() => {
        const manualConcepts = billingConcepts.filter(c => c.calculationType === 'MANUAL');
        if (!search) return manualConcepts;
        return manualConcepts.filter(c => c.conceptName.toLowerCase().includes(search.toLowerCase()));
    }, [search, billingConcepts]);

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
                        <p className="text-center text-sm text-muted-foreground">No se encontraron conceptos.</p>
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}

const ExcedentManager = () => {
    const { control, watch } = useFormContext<ManualOperationValues>();
    const { fields, append, remove } = useFieldArray({ control, name: 'excedentes' });
    const [excedentDate, setExcedentDate] = useState<Date | undefined>();
    const [excedentHours, setExcedentHours] = useState('');
    
    const dateRange = watch('dateRange');

    const handleAddExcedent = () => {
        if (!excedentDate || !excedentHours) return;
        const dateStr = format(excedentDate, 'yyyy-MM-dd');
        const hours = parseFloat(excedentHours.replace(',', '.'));
        
        const existingIndex = fields.findIndex(f => f.date === dateStr);
        if (existingIndex > -1) {
            remove(existingIndex);
        }
        append({ date: dateStr, hours });
        setExcedentDate(undefined);
        setExcedentHours('');
    };

    const isDateValid = (date: Date) => {
        if (!dateRange?.from || !dateRange.to) return false;
        return isWithinInterval(date, { start: startOfDay(dateRange.from), end: startOfDay(dateRange.to) }) && !isSunday(date);
    };

    const dayType = excedentDate ? (isSaturday(excedentDate) ? 'Sábado (Diurnas)' : 'L-V (Nocturnas)') : 'Seleccione Fecha';

    return (
        <div className="space-y-3 p-3 border rounded-md">
            <h4 className="text-sm font-medium">Gestionar Horas Excedentes</h4>
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-end">
                <div className="space-y-1">
                    <Label>Fecha del Excedente</Label>
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !excedentDate && "text-muted-foreground")} disabled={!dateRange?.from || !dateRange.to}>
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {excedentDate ? format(excedentDate, "PPP", { locale: es }) : <span>Seleccione fecha</span>}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                            <Calendar
                                mode="single"
                                selected={excedentDate}
                                onSelect={setExcedentDate}
                                disabled={(date) => !isDateValid(date)}
                                initialFocus
                                month={dateRange?.from}
                            />
                        </PopoverContent>
                    </Popover>
                </div>
                <div className="flex items-end gap-2">
                    <div className="space-y-1 flex-grow">
                        <Label>Horas Excedentes</Label>
                        <Input
                            type="text"
                            inputMode="decimal"
                            placeholder={dayType}
                            value={excedentHours}
                            onChange={e => setExcedentHours(e.target.value)}
                            disabled={!excedentDate}
                        />
                    </div>
                    <Button type="button" size="sm" onClick={handleAddExcedent} disabled={!excedentDate || !excedentHours}>Agregar</Button>
                </div>
            </div>
             {fields.length > 0 && (
                <div className="space-y-2 mt-2">
                    <h5 className="text-xs font-semibold text-muted-foreground">Excedentes Registrados:</h5>
                     <ScrollArea className="h-24">
                        <div className="space-y-1 pr-2">
                            {fields.map((field, index) => {
                                const date = parseISO(field.date);
                                const dayType = isSaturday(date) ? 'Sáb' : 'L-V';
                                return (
                                    <div key={field.id} className="flex items-center justify-between text-sm p-1.5 bg-muted/50 rounded-md">
                                        <span>{format(date, "d MMM", { locale: es })} ({dayType})</span>
                                        <div className="flex items-center gap-2">
                                            <span className="font-mono">{field.hours.toLocaleString('es-CO')} hrs</span>
                                            <Button type="button" variant="ghost" size="icon" className="h-5 w-5 text-destructive" onClick={() => remove(index)}><X className="h-3 w-3" /></Button>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </ScrollArea>
                </div>
            )}
        </div>
    )
}
