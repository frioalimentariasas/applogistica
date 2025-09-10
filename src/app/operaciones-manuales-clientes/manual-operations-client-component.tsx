

"use client";

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { format, parseISO, differenceInMinutes, parse } from 'date-fns';
import { es } from 'date-fns/locale';

import { addManualClientOperation, updateManualClientOperation, deleteManualClientOperation } from './actions';
import { getAllManualClientOperations } from '@/app/billing-reports/actions/generate-client-settlement';
import type { ManualClientOperationData } from './actions';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import type { ClientInfo } from '@/app/actions/clients';
import type { ClientBillingConcept } from '@/app/gestion-conceptos-liquidacion-clientes/actions';

import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { ArrowLeft, Loader2, CalendarIcon, PlusCircle, X, Edit2, Trash2, Edit, Search, XCircle, FolderSearch, Eye, Clock, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription as AlertDialogDesc, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

const manualOperationSchema = z.object({
  clientName: z.string().min(1, 'El cliente es obligatorio.'),
  operationDate: z.date({ required_error: 'La fecha es obligatoria.' }),
  concept: z.string().min(1, 'El concepto es obligatorio.'),
  quantity: z.coerce.number().min(0, 'La cantidad debe ser 0 o mayor.'),
  details: z.object({
      startTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Formato HH:MM requerido.').optional().or(z.literal('')),
      endTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Formato HH:MM requerido.').optional().or(z.literal('')),
      plate: z.string().optional(),
      container: z.string().optional(),
      totalPallets: z.coerce.number().int().min(0, 'Debe ser un número positivo.').optional().nullable(),
      arin: z.string().optional(),
  }).optional(),
}).superRefine((data, ctx) => {
    if(data.details?.startTime && data.details?.endTime && data.details.startTime === data.details.endTime) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "La hora de inicio no puede ser igual a la de fin.",
            path: ["details", "endTime"],
        });
    }

    if (data.concept === 'INSPECCIÓN ZFPC') {
        if (!data.details?.container?.trim()) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "El contenedor es obligatorio para este concepto.", path: ["details", "container"] });
        }
        if (!data.details?.arin?.trim()) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "El ARIN es obligatorio para este concepto.", path: ["details", "arin"] });
        }
        if (!data.details?.startTime?.trim()) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La hora de inicio es obligatoria.", path: ["details", "startTime"] });
        }
        if (!data.details?.endTime?.trim()) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La hora de fin es obligatoria.", path: ["details", "endTime"] });
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
    
    const [selectedDate, setSelectedDate] = useState<Date | undefined>();
    const [selectedClient, setSelectedClient] = useState<string>('all');
    const [selectedConcept, setSelectedConcept] = useState<string>('all');

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [dialogMode, setDialogMode] = useState<DialogMode>('add');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [opToManage, setOpToManage] = useState<any | null>(null);
    const [opToDelete, setOpToDelete] = useState<any | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const form = useForm<ManualOperationValues>({
        resolver: zodResolver(manualOperationSchema),
        defaultValues: {
            clientName: "",
            concept: "",
            operationDate: new Date(),
            quantity: 1,
            details: {
                startTime: '',
                endTime: '',
                plate: '',
                container: '',
                totalPallets: null,
                arin: '',
            }
        }
    });
    
    const watchedConcept = form.watch('concept');
    const watchedStartTime = form.watch('details.startTime');
    const watchedEndTime = form.watch('details.endTime');

    useEffect(() => {
        if (watchedConcept === 'INSPECCIÓN ZFPC' && watchedStartTime && watchedEndTime) {
            try {
                const start = parse(watchedStartTime, 'HH:mm', new Date());
                const end = parse(watchedEndTime, 'HH:mm', new Date());
                if (end < start) {
                    end.setDate(end.getDate() + 1); // Handle overnight
                }
                
                const diffMinutes = differenceInMinutes(end, start);
                if (diffMinutes < 0) {
                    form.setValue('quantity', 0);
                    return;
                }
                
                const hours = Math.floor(diffMinutes / 60);
                const remainingMinutes = diffMinutes % 60;
                
                let calculatedQuantity = hours;
                if (remainingMinutes > 9) {
                    calculatedQuantity += 1;
                } else if (hours === 0 && remainingMinutes > 0) {
                    // If less than an hour but more than 0, it's at least 1 hour
                    calculatedQuantity = 1;
                }

                form.setValue('quantity', calculatedQuantity, { shouldValidate: true });

            } catch (e) {
                // Invalid time format, do nothing
                form.setValue('quantity', 0);
            }
        }
    }, [watchedConcept, watchedStartTime, watchedEndTime, form]);

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
    
    const handleSearch = useCallback(() => {
        if (!selectedDate) {
            toast({
                variant: 'destructive',
                title: 'Fecha Requerida',
                description: 'Por favor, seleccione una fecha para realizar la consulta.'
            });
            return;
        }

        let results = allOperations;

        results = results.filter(op => format(new Date(op.operationDate), 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd'));

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
    }, [allOperations, selectedClient, selectedConcept, selectedDate, toast]);
    
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
            form.reset({
                clientName: op.clientName || '',
                operationDate: parseISO(op.operationDate),
                concept: op.concept,
                quantity: op.quantity,
                details: {
                    startTime: op.details?.startTime || '',
                    endTime: op.details?.endTime || '',
                    plate: op.details?.plate || '',
                    container: op.details?.container || '',
                    totalPallets: op.details?.totalPallets ?? null,
                    arin: op.details?.arin || '',
                }
            });
        } else {
             form.reset({
                operationDate: new Date(),
                quantity: 1,
                clientName: "",
                concept: "",
                details: {
                    startTime: '',
                    endTime: '',
                    plate: '',
                    container: '',
                    totalPallets: null,
                    arin: '',
                }
            });
        }
        setIsDialogOpen(true);
    };

    const onSubmit: SubmitHandler<ManualOperationValues> = async (data) => {
        if (!user) return;
        setIsSubmitting(true);
        
        const payload: ManualClientOperationData = {
            ...data,
            operationDate: data.operationDate.toISOString(),
            details: data.details || {},
            createdBy: {
                uid: user.uid,
                displayName: displayName || user.email!,
            }
        };

        let result;
        try {
            if (dialogMode === 'edit' && opToManage) {
                result = await updateManualClientOperation(opToManage.id, payload as Omit<ManualClientOperationData, 'createdAt' | 'createdBy'>);
            } else {
                result = await addManualClientOperation(payload);
            }
            
            if (result.success) {
                toast({ title: 'Éxito', description: result.message });
                setIsDialogOpen(false);
                form.reset();
                const updatedOps = await fetchAllOperations();
                 if (searched) {
                    setAllOperations(updatedOps);
                    handleSearch();
                }
            } else {
                toast({ variant: "destructive", title: "Error", description: result.message });
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
            if (searched) {
                setAllOperations(updatedOps);
                handleSearch();
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

    const showAdvancedFields = ['TOMA DE PESOS POR ETIQUETA HRS', 'MOVIMIENTO ENTRADA PRODUCTOS PALLET', 'MOVIMIENTO SALIDA PRODUCTOS PALLET', 'INSPECCIÓN ZFPC'].includes(watchedConcept);
    const showInspectionFields = watchedConcept === 'INSPECCIÓN ZFPC';

    return (
        <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
            <div className="max-w-4xl mx-auto">
                <header className="mb-8">
                    <div className="relative flex items-center justify-center text-center">
                         <Button variant="ghost" size="icon" className="absolute left-0 top-1/2 -translate-y-1/2" onClick={() => router.push('/')}>
                            <ArrowLeft className="h-6 w-6" />
                        </Button>
                        <div>
                            <div className="flex items-center justify-center gap-2">
                                <Edit className="h-8 w-8 text-primary" />
                                <h1 className="text-2xl font-bold text-primary">Registro de Operaciones Manuales Clientes</h1>
                            </div>
                             <p className="text-sm text-gray-500">Agregue, edite o elimine operaciones manuales para facturar a clientes.</p>
                        </div>
                         <Button onClick={() => router.push('/billing-reports')} className="absolute right-0 top-1/2 -translate-y-1/2">
                            <DollarSign className="mr-2 h-4 w-4" />
                            Ir a Liquidación
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
                                <Select value={selectedClient} onValueChange={setSelectedClient}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos los Clientes</SelectItem>{clients.map(c => <SelectItem key={c.id} value={c.razonSocial}>{c.razonSocial}</SelectItem>)}</SelectContent></Select>
                            </div>
                             <div className="space-y-2">
                                <Label>Concepto</Label>
                                <Select value={selectedConcept} onValueChange={setSelectedConcept}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos los Conceptos</SelectItem>{[...new Set(allOperations.map(op => op.concept))].sort((a,b) => a.localeCompare(b)).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
                            </div>
                            <div className="flex items-end gap-2 xl:col-span-2">
                                <Button onClick={handleSearch} disabled={!selectedDate || isLoading} className="w-full">
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
                                                <TableCell>{format(new Date(op.operationDate), 'dd/MM/yyyy')}</TableCell>
                                                <TableCell>{op.concept}</TableCell>
                                                <TableCell>{op.clientName || 'N/A'}</TableCell>
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
                    <DialogContent className="sm:max-w-md">
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
                                        <FormField control={form.control} name="concept" render={({ field }) => ( <FormItem><FormLabel>Concepto de Liquidación</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={dialogMode === 'view'}><FormControl><SelectTrigger><SelectValue placeholder="Seleccione un concepto" /></SelectTrigger></FormControl><SelectContent><ScrollArea className="h-60">{billingConcepts.filter(c => c.calculationType === 'MANUAL').map(c => <SelectItem key={c.id} value={c.conceptName}>{c.conceptName}</SelectItem>)}</ScrollArea></SelectContent></Select><FormMessage /></FormItem> )}/>
                                        <FormField control={form.control} name="clientName" render={({ field }) => ( <FormItem><FormLabel>Cliente</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={dialogMode === 'view'}><FormControl><SelectTrigger><SelectValue placeholder="Seleccione un cliente" /></SelectTrigger></FormControl><SelectContent><ScrollArea className="h-60">{clients.map(c => <SelectItem key={c.id} value={c.razonSocial}>{c.razonSocial}</SelectItem>)}</ScrollArea></SelectContent></Select><FormMessage /></FormItem> )}/>
                                        <FormField control={form.control} name="operationDate" render={({ field }) => ( <FormItem className="flex flex-col"><FormLabel>Fecha de Operación</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} disabled={dialogMode === 'view'} className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4 opacity-50" />{field.value ? format(field.value, "PPP", { locale: es }) : <span>Seleccione una fecha</span>}</Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={field.value} onSelect={field.onChange} disabled={dialogMode === 'view'} initialFocus /></PopoverContent></Popover><FormMessage /></FormItem> )} />
                                        
                                        {watchedConcept === 'INSPECCIÓN ZFPC' && (
                                            <div className="grid grid-cols-2 gap-4">
                                                <FormField control={form.control} name="details.startTime" render={({ field }) => (<FormItem><FormLabel>Hora Inicio <span className="text-destructive">*</span></FormLabel><div className="flex items-center gap-2"><FormControl><Input type="time" {...field} value={field.value ?? ''} disabled={dialogMode === 'view'} className="flex-grow" /></FormControl>{dialogMode !== 'view' && (<Button type="button" variant="outline" size="icon" onClick={() => handleCaptureTime('details.startTime')}><Clock className="h-4 w-4" /></Button>)}</div><FormMessage /></FormItem>)} />
                                                <FormField control={form.control} name="details.endTime" render={({ field }) => (<FormItem><FormLabel>Hora Fin <span className="text-destructive">*</span></FormLabel><div className="flex items-center gap-2"><FormControl><Input type="time" {...field} value={field.value ?? ''} disabled={dialogMode === 'view'} className="flex-grow" /></FormControl>{dialogMode !== 'view' && (<Button type="button" variant="outline" size="icon" onClick={() => handleCaptureTime('details.endTime')}><Clock className="h-4 w-4" /></Button>)}</div><FormMessage /></FormItem>)} />
                                            </div>
                                        )}

                                        <FormField control={form.control} name="quantity" render={({ field }) => (<FormItem><FormLabel>Cantidad</FormLabel><FormControl><Input type="number" step="0.001" placeholder="Ej: 1.5" {...field} value={field.value ?? ''} disabled={dialogMode === 'view' || watchedConcept === 'INSPECCIÓN ZFPC'} /></FormControl><FormMessage /></FormItem>)}/>
                                        
                                        {showAdvancedFields && (
                                            <>
                                                <Separator />
                                                <p className="text-sm font-medium text-muted-foreground">Detalles Adicionales</p>
                                                {showInspectionFields ? (
                                                    <>
                                                        <FormField control={form.control} name="details.container" render={({ field }) => (<FormItem><FormLabel>Contenedor <span className="text-destructive">*</span></FormLabel><FormControl><Input placeholder="Contenedor" {...field} value={field.value ?? ''} disabled={dialogMode === 'view'} onChange={e => field.onChange(e.target.value.toUpperCase())} /></FormControl><FormMessage /></FormItem>)} />
                                                        <FormField control={form.control} name="details.arin" render={({ field }) => (<FormItem><FormLabel>ARIN <span className="text-destructive">*</span></FormLabel><FormControl><Input placeholder="Número de ARIN" {...field} value={field.value ?? ''} disabled={dialogMode === 'view'} /></FormControl><FormMessage /></FormItem>)} />
                                                    </>
                                                ) : (
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <FormField control={form.control} name="details.startTime" render={({ field }) => (<FormItem><FormLabel>Hora Inicio</FormLabel><div className="flex items-center gap-2"><FormControl><Input type="time" {...field} value={field.value ?? ''} disabled={dialogMode === 'view'} className="flex-grow" /></FormControl>{dialogMode !== 'view' && (<Button type="button" variant="outline" size="icon" onClick={() => handleCaptureTime('details.startTime')}><Clock className="h-4 w-4" /></Button>)}</div><FormMessage /></FormItem>)} />
                                                        <FormField control={form.control} name="details.endTime" render={({ field }) => (<FormItem><FormLabel>Hora Fin</FormLabel><div className="flex items-center gap-2"><FormControl><Input type="time" {...field} value={field.value ?? ''} disabled={dialogMode === 'view'} className="flex-grow" /></FormControl>{dialogMode !== 'view' && (<Button type="button" variant="outline" size="icon" onClick={() => handleCaptureTime('details.endTime')}><Clock className="h-4 w-4" /></Button>)}</div><FormMessage /></FormItem>)} />
                                                    </div>
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

