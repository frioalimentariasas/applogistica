
"use client";

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

import { addManualOperation, updateManualOperation, deleteManualOperation, getManualOperationsForUser, type ManualOperationData } from '@/app/crew-performance-report/actions';
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
import { ArrowLeft, Loader2, CalendarIcon, PlusCircle, X, Edit2, Trash2, Edit } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription as AlertDialogDesc, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ScrollArea } from '@/components/ui/scroll-area';

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
    
    const [operations, setOperations] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [opToEdit, setOpToEdit] = useState<any | null>(null);
    const [opToDelete, setOpToDelete] = useState<any | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const form = useForm<ManualOperationValues>({
        resolver: zodResolver(manualOperationSchema),
    });
    
    const watchedConcept = form.watch('concept');

    useEffect(() => {
        if (user) {
            setIsLoading(true);
            getManualOperationsForUser(user.uid)
                .then(data => setOperations(data))
                .catch(() => toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar las operaciones.' }))
                .finally(() => setIsLoading(false));
        }
    }, [user, toast]);

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
        setIsSubmitting(true);
        
        let result;
        const payload: ManualOperationData = {
            ...data,
            operationDate: data.operationDate.toISOString(),
            clientName: data.clientName || undefined,
            createdBy: {
                uid: user!.uid,
                displayName: displayName || user!.email!
            }
        };

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
            setIsLoading(true);
            await getManualOperationsForUser(user!.uid).then(setOperations).finally(() => setIsLoading(false));
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
            setOperations(prev => prev.filter(op => op.id !== opToDelete.id));
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
                            <CardTitle>Mis Operaciones Registradas</CardTitle>
                            <Button onClick={() => openDialog()}>
                                <PlusCircle className="mr-2 h-4 w-4" />
                                Nueva Operación
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <ScrollArea className="h-96">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Fecha</TableHead>
                                        <TableHead>Concepto</TableHead>
                                        <TableHead>Cliente</TableHead>
                                        <TableHead>Placa</TableHead>
                                        <TableHead className="text-right">Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading ? (
                                        <TableRow><TableCell colSpan={5} className="text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
                                    ) : operations.length > 0 ? (
                                        operations.map((op) => (
                                            <TableRow key={op.id}>
                                                <TableCell>{format(new Date(op.operationDate), 'dd/MM/yyyy')}</TableCell>
                                                <TableCell>{op.concept}</TableCell>
                                                <TableCell>{op.clientName || 'N/A'}</TableCell>
                                                <TableCell>{op.plate || 'N/A'}</TableCell>
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
                                        <TableRow><TableCell colSpan={5} className="text-center h-24">No ha registrado operaciones manuales.</TableCell></TableRow>
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

