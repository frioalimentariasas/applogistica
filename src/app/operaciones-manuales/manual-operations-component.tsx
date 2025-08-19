
"use client";

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

import { addManualOperation, updateManualOperation, deleteManualOperation, getAllManualOperations, type ManualOperationData } from '@/app/crew-performance-report/actions';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import type { ClientInfo } from '@/app/actions/clients';
import type { BillingConcept } from '@/app/gestion-conceptos-liquidacion/actions';

import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { ArrowLeft, Loader2, CalendarIcon, PlusCircle, X, Edit2, Trash2, Edit, Search, XCircle, FolderSearch } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription as AlertDialogDesc, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';


const manualOperationSchema = z.object({
    clientName: z.string().optional(),
    operationDate: z.date({ required_error: 'La fecha es obligatoria.' }),
    startTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Formato HH:MM requerido.'),
    endTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Formato HH:MM requerido.'),
    plate: z.string().optional(),
    concept: z.string().min(1, 'El concepto es obligatorio.'),
    quantity: z.coerce.number().min(0.001, 'La cantidad debe ser mayor a 0.'),
}).refine(data => {
    if (data.concept !== 'APOYO DE MONTACARGAS' && !data.clientName) {
        return false;
    }
    return true;
}, {
    message: 'El cliente es obligatorio para este concepto.',
    path: ['clientName'],
}).refine(data => data.startTime !== data.endTime, {
    message: "La hora de inicio no puede ser igual a la de fin.",
    path: ["endTime"],
});

type ManualOperationValues = z.infer<typeof manualOperationSchema>;

interface ManualOperationsComponentProps {
    clients: ClientInfo[];
    billingConcepts: BillingConcept[];
}

export default function ManualOperationsComponent({ clients, billingConcepts }: ManualOperationsComponentProps) {
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
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [opToEdit, setOpToEdit] = useState<any | null>(null);
    const [opToDelete, setOpToDelete] = useState<any | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const form = useForm<ManualOperationValues>({
        resolver: zodResolver(manualOperationSchema),
    });
    
    const watchedConcept = form.watch('concept');

    const fetchAllOperations = useCallback(async () => {
        setIsLoading(true);
        try {
            const data = await getAllManualOperations();
            setAllOperations(data);
        } catch (error) {
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar las operaciones.' });
        } finally {
            setIsLoading(false);
        }
    }, [toast]);
    
    useEffect(() => {
        fetchAllOperations();
    }, [fetchAllOperations]);
    
    const handleSearch = () => {
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
    };
    
    const handleClearFilters = () => {
        setSelectedDate(undefined);
        setSelectedClient('all');
        setSelectedConcept('all');
        setFilteredOperations([]);
        setSearched(false);
    };

    const openDialog = (op?: any) => {
        if (op) {
            setOpToEdit(op);
            form.reset({
                clientName: op.clientName || '',
                operationDate: parseISO(op.operationDate),
                startTime: op.startTime,
                endTime: op.endTime,
                plate: op.plate || '',
                concept: op.concept,
                quantity: op.quantity,
            });
        } else {
            setOpToEdit(null);
            form.reset({
                operationDate: new Date(),
                startTime: '00:00',
                endTime: '00:00',
                quantity: 0,
                plate: "",
                clientName: "",
                concept: "",
            });
        }
        setIsDialogOpen(true);
    };

    const onSubmit: SubmitHandler<ManualOperationValues> = async (data) => {
        if (!user) return;
        setIsSubmitting(true);
        
        const payload: ManualOperationData = {
            ...data,
            operationDate: data.operationDate.toISOString(),
            clientName: data.clientName || undefined,
            createdBy: {
                uid: user.uid,
                displayName: displayName || user.email!,
            }
        };

        let result;
        if (opToEdit) {
            result = await updateManualOperation(opToEdit.id, payload);
        } else {
            result = await addManualOperation(payload);
        }
        
        if (result.success) {
            toast({ title: 'Éxito', description: result.message });
            setIsDialogOpen(false);
            setOpToEdit(null);
            form.reset();
            await fetchAllOperations();
            handleSearch();
        } else {
            toast({ variant: "destructive", title: "Error", description: result.message });
        }
        setIsSubmitting(false);
    };

    const handleDeleteConfirm = async () => {
        if (!opToDelete) return;
        setIsDeleting(true);
        const result = await deleteManualOperation(opToDelete.id);
        if (result.success) {
            toast({ title: 'Éxito', description: result.message });
            await fetchAllOperations();
            handleSearch();
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.message });
        }
        setOpToDelete(null);
        setIsDeleting(false);
    };

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
                                <h1 className="text-2xl font-bold text-primary">Registro de Operaciones Manuales</h1>
                            </div>
                             <p className="text-sm text-gray-500">Agregue, edite o elimine operaciones manuales.</p>
                        </div>
                    </div>
                </header>
                
                <Card>
                    <CardHeader>
                        <div className="flex justify-between items-center">
                            <CardTitle>Operaciones Registradas</CardTitle>
                            <Button onClick={() => openDialog()}>
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
                                                     <Button variant="ghost" size="icon" title="Editar" onClick={() => openDialog(op)}>
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

                <Dialog open={isDialogOpen} onOpenChange={(isOpen) => { if (!isOpen) setOpToEdit(null); setIsDialogOpen(isOpen); }}>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle>{opToEdit ? 'Editar' : 'Registrar'} Operación Manual</DialogTitle>
                            <DialogDescription>{opToEdit ? 'Modifique los datos de la operación.' : 'Ingrese los datos para registrar una operación.'}</DialogDescription>
                        </DialogHeader>
                        <ScrollArea className="max-h-[70vh]">
                            <div className="p-4">
                                <Form {...form}>
                                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                                        <FormField control={form.control} name="concept" render={({ field }) => ( <FormItem><FormLabel>Concepto de Liquidación</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Seleccione un concepto" /></SelectTrigger></FormControl><SelectContent><ScrollArea className="h-60">{[...new Set(billingConcepts.map(c => c.conceptName))].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</ScrollArea></SelectContent></Select><FormMessage /></FormItem> )}/>
                                        {watchedConcept !== 'APOYO DE MONTACARGAS' && (
                                            <FormField control={form.control} name="clientName" render={({ field }) => ( <FormItem><FormLabel>Cliente</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Seleccione un cliente" /></SelectTrigger></FormControl><SelectContent><ScrollArea className="h-60">{clients.map(c => <SelectItem key={c.id} value={c.razonSocial}>{c.razonSocial}</SelectItem>)}</ScrollArea></SelectContent></Select><FormMessage /></FormItem> )}/>
                                        )}
                                        <FormField control={form.control} name="operationDate" render={({ field }) => ( <FormItem className="flex flex-col"><FormLabel>Fecha de Operación</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4 opacity-50" />{field.value ? format(field.value, "PPP", { locale: es }) : <span>Seleccione una fecha</span>}</Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus /></PopoverContent></Popover><FormMessage /></FormItem> )} />
                                        <div className="grid grid-cols-2 gap-4">
                                            <FormField control={form.control} name="startTime" render={({ field }) => (<FormItem><FormLabel>Hora Inicio</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>)} />
                                            <FormField control={form.control} name="endTime" render={({ field }) => (<FormItem><FormLabel>Hora Fin</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>)} />
                                        </div>
                                        <FormField control={form.control} name="plate" render={({ field }) => (<FormItem><FormLabel>Placa (Opcional)</FormLabel><FormControl><Input placeholder="ABC123" {...field} onChange={e => field.onChange(e.target.value.toUpperCase())} /></FormControl><FormMessage /></FormItem>)} />
                                        <FormField control={form.control} name="quantity" render={({ field }) => (<FormItem><FormLabel>Cantidad</FormLabel><FormControl><Input type="number" step="0.001" placeholder="Ej: 1.5" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                                        <DialogFooter>
                                            <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                                            <Button type="submit" disabled={isSubmitting}>{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}Guardar</Button>
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
                            <AlertDialogAction onClick={handleDeleteConfirm} disabled={isDeleting} className={buttonVariants({ variant: 'destructive' })}>
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
