

"use client";

import { useState, useEffect, useMemo, useRef } from 'react';
import { useForm, SubmitHandler, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';

import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { addPerformanceStandard, updatePerformanceStandard, deleteMultipleStandards, type PerformanceStandard } from './actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Loader2, PlusCircle, Edit, Trash2, ChevronsUpDown, ShieldAlert, Settings, Download } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
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


const tonnageRangeSchema = z.object({
  minTons: z.coerce.number({invalid_type_error: "Debe ser un número"}).min(0, "Debe ser 0 o mayor."),
  maxTons: z.coerce.number({invalid_type_error: "Debe ser un número"}).min(0, "Debe ser 0 o mayor."),
  baseMinutes: z.coerce.number({invalid_type_error: "Debe ser un número"}).int().min(1, "Debe ser al menos 1."),
}).refine(data => data.maxTons > data.minTons, {
    message: "Max. debe ser mayor que Min.",
    path: ['maxTons'],
});

const standardSchema = z.object({
  clientName: z.string().min(1, { message: 'Debe seleccionar un cliente o "TODOS".' }),
  operationType: z.enum(['recepcion', 'despacho', 'TODAS'], { required_error: 'Debe seleccionar un tipo de operación.' }),
  productType: z.enum(['fijo', 'variable', 'TODOS'], { required_error: 'Debe seleccionar un tipo de producto.' }),
  ranges: z.array(tonnageRangeSchema).min(1, 'Debe agregar al menos un rango.'),
});

type StandardFormValues = z.infer<typeof standardSchema>;

const editStandardSchema = z.object({
  clientName: z.string().min(1, { message: 'Debe seleccionar un cliente o "TODOS".' }),
  operationType: z.enum(['recepcion', 'despacho', 'TODAS'], { required_error: 'Debe seleccionar un tipo de operación.' }),
  productType: z.enum(['fijo', 'variable', 'TODOS'], { required_error: 'Debe seleccionar un tipo de producto.' }),
  minTons: z.coerce.number({invalid_type_error: "Debe ser un número"}).min(0, "Debe ser 0 o mayor."),
  maxTons: z.coerce.number({invalid_type_error: "Debe ser un número"}).min(0, "Debe ser 0 o mayor."),
  baseMinutes: z.coerce.number({invalid_type_error: "Debe ser un número"}).int().min(1, "Debe ser al menos 1."),
}).refine(data => data.maxTons > data.minTons, {
    message: "Las toneladas máximas deben ser mayores a las mínimas.",
    path: ['maxTons'],
});

type EditStandardFormValues = z.infer<typeof editStandardSchema>;


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

export default function StandardManagementComponent({ initialClients, initialStandards }: { initialClients: ClientInfo[], initialStandards: PerformanceStandard[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const { permissions, loading: authLoading } = useAuth();
  
  const [standards, setStandards] = useState<PerformanceStandard[]>(initialStandards);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClientDialogOpen, setClientDialogOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  
  const [standardToEdit, setStandardToEdit] = useState<PerformanceStandard | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isConfirmBulkDeleteOpen, setIsConfirmBulkDeleteOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  
  const form = useForm<StandardFormValues>({
    resolver: zodResolver(standardSchema),
    defaultValues: {
      clientName: 'TODOS',
      operationType: 'TODAS',
      productType: 'TODOS',
      ranges: [{ minTons: 0, maxTons: 0, baseMinutes: 0 }]
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "ranges"
  });

  const editForm = useForm<EditStandardFormValues>({
    resolver: zodResolver(editStandardSchema),
  });
  
  const clientOptions = useMemo(() => [{ id: 'TODOS', razonSocial: 'TODOS (Cualquier Cliente)' }, ...initialClients], [initialClients]);
  
  const filteredClients = useMemo(() => {
    if (!clientSearch) return clientOptions;
    return clientOptions.filter(c => c.razonSocial.toLowerCase().includes(clientSearch.toLowerCase()));
  }, [clientSearch, clientOptions]);

  const onAddSubmit: SubmitHandler<StandardFormValues> = async (data) => {
    setIsSubmitting(true);
    const result = await addPerformanceStandard(data);
    if (result.success && result.newStandards) {
      toast({ title: 'Éxito', description: result.message });
      setStandards(prev => [...prev, ...result.newStandards!].sort((a,b) => a.clientName.localeCompare(b.clientName)));
      form.reset({
        clientName: data.clientName,
        operationType: data.operationType,
        productType: data.productType,
        ranges: [{ minTons: 0, maxTons: 0, baseMinutes: 0 }]
      });
      remove(0); // clear the field array
      append({ minTons: 0, maxTons: 0, baseMinutes: 0 }); // add a fresh one
    } else {
      toast({ variant: 'destructive', title: 'Error', description: result.message });
    }
    setIsSubmitting(false);
  };
  
  const onEditSubmit: SubmitHandler<EditStandardFormValues> = async (data) => {
    if (!standardToEdit) return;
    setIsEditing(true);
    const result = await updatePerformanceStandard(standardToEdit.id, data);
    if (result.success) {
      toast({ title: 'Éxito', description: result.message });
      setStandards(prev => prev.map(s => s.id === standardToEdit.id ? { ...data, id: s.id } : s));
      setStandardToEdit(null);
    } else {
      toast({ variant: 'destructive', title: 'Error', description: result.message });
    }
    setIsEditing(false);
  };

  const handleBulkDeleteConfirm = async () => {
    if (selectedIds.size === 0) return;
    setIsBulkDeleting(true);
    const idsToDelete = Array.from(selectedIds);
    const result = await deleteMultipleStandards(idsToDelete);
    if (result.success) {
      toast({ title: 'Éxito', description: result.message });
      setStandards(prev => prev.filter(s => !selectedIds.has(s.id)));
      setSelectedIds(new Set());
    } else {
      toast({ variant: 'destructive', title: 'Error', description: result.message });
    }
    setIsConfirmBulkDeleteOpen(false);
    setIsBulkDeleting(false);
  };

  const openEditDialog = (standard: PerformanceStandard) => {
    setStandardToEdit(standard);
    editForm.reset(standard);
  };

  const handleRowSelect = (id: string, checked: boolean) => {
    const newSet = new Set(selectedIds);
    if (checked) newSet.add(id); else newSet.delete(id);
    setSelectedIds(newSet);
  };

  const isAllSelected = useMemo(() => {
    if (standards.length === 0) return false;
    return standards.every(s => selectedIds.has(s.id));
  }, [selectedIds, standards]);
  
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(standards.map(s => s.id)));
    } else {
      setSelectedIds(new Set());
    }
  };


  if (authLoading) {
      return <div className="flex min-h-screen w-full items-center justify-center"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>
  }

  if (!permissions.canManageStandards) {
      return (
          <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8 flex items-center justify-center">
              <div className="max-w-xl mx-auto text-center">
                  <AccessDenied />
                  <Button onClick={() => router.push('/')} className="mt-6"><ArrowLeft className="mr-2 h-4 w-4" />Volver al Inicio</Button>
              </div>
          </div>
      );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <div className="relative flex items-center justify-center text-center">
            <Button variant="ghost" size="icon" className="absolute left-0 top-1/2 -translate-y-1/2" onClick={() => router.push('/crew-performance-report')}>
              <ArrowLeft className="h-6 w-6" />
            </Button>
            <div>
              <div className="flex items-center justify-center gap-2">
                <Settings className="h-8 w-8 text-primary" />
                <h1 className="text-2xl font-bold text-primary">Gestión de Estándares de Productividad</h1>
              </div>
              <p className="text-sm text-gray-500">Defina los tiempos estándar para las operaciones de la cuadrilla.</p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-8">
            <Card>
                <CardHeader>
                    <CardTitle>Nuevo Estándar</CardTitle>
                    <CardDescription>Cree una o más reglas de tiempo para una combinación de operación.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onAddSubmit)} className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <FormField
                                    control={form.control}
                                    name="clientName"
                                    render={({ field }) => (
                                        <FormItem className="flex flex-col">
                                        <FormLabel>Cliente</FormLabel>
                                            <Dialog open={isClientDialogOpen} onOpenChange={setClientDialogOpen}>
                                                <DialogTrigger asChild>
                                                    <Button variant="outline" className="w-full justify-between text-left font-normal">
                                                        {field.value || "Seleccione..."}
                                                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                    </Button>
                                                </DialogTrigger>
                                                <DialogContent>
                                                    <DialogHeader><DialogTitle>Seleccionar Cliente</DialogTitle></DialogHeader>
                                                    <Input placeholder="Buscar..." value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} className="mb-4" />
                                                    <ScrollArea className="h-72"><div className="space-y-1">
                                                        {filteredClients.map((client) => (
                                                            <Button key={client.id} variant="ghost" className="w-full justify-start" onClick={() => { field.onChange(client.razonSocial); setClientDialogOpen(false); }}>{client.razonSocial}</Button>
                                                        ))}
                                                    </div></ScrollArea>
                                                </DialogContent>
                                            </Dialog>
                                        <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="operationType"
                                    render={({ field }) => (
                                        <FormItem><FormLabel>Tipo de Operación</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent><SelectItem value="TODAS">TODAS (Cualquier Operación)</SelectItem><SelectItem value="recepcion">Recepción</SelectItem><SelectItem value="despacho">Despacho</SelectItem></SelectContent></Select><FormMessage /></FormItem>
                                    )}
                                />
                                 <FormField
                                    control={form.control}
                                    name="productType"
                                    render={({ field }) => (
                                        <FormItem><FormLabel>Tipo de Producto</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent><SelectItem value="TODOS">TODOS (Cualquier Producto)</SelectItem><SelectItem value="fijo">Peso Fijo</SelectItem><SelectItem value="variable">Peso Variable</SelectItem></SelectContent></Select><FormMessage /></FormItem>
                                    )}
                                />
                            </div>

                            <div className="space-y-4">
                                <FormLabel>Rangos de Toneladas y Tiempos</FormLabel>
                                {fields.map((field, index) => (
                                    <div key={field.id} className="grid grid-cols-1 md:grid-cols-7 gap-2 items-end border p-4 rounded-md relative">
                                        <FormField control={form.control} name={`ranges.${index}.minTons`} render={({ field }) => (<FormItem className="md:col-span-2"><FormLabel>Min. Toneladas</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                                        <FormField control={form.control} name={`ranges.${index}.maxTons`} render={({ field }) => (<FormItem className="md:col-span-2"><FormLabel>Max. Toneladas</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                                        <FormField control={form.control} name={`ranges.${index}.baseMinutes`} render={({ field }) => (<FormItem className="md:col-span-2"><FormLabel>Minutos Base</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                                        <Button type="button" variant="ghost" size="icon" className="text-destructive" onClick={() => remove(index)}>
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ))}
                                <Button type="button" variant="outline" size="sm" onClick={() => append({ minTons: 0, maxTons: 0, baseMinutes: 0 })}>
                                    <PlusCircle className="mr-2 h-4 w-4" />
                                    Agregar Rango
                                </Button>
                            </div>

                            <Button type="submit" disabled={isSubmitting} className="w-full">
                                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                                Guardar Estándar(es)
                            </Button>
                        </form>
                    </Form>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <CardTitle>Estándares Actuales</CardTitle>
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
                        <ScrollArea className="h-[500px]">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-12"><Checkbox checked={isAllSelected} onCheckedChange={(checked) => handleSelectAll(checked === true)} /></TableHead>
                                        <TableHead>Cliente</TableHead>
                                        <TableHead>Tipo Op.</TableHead>
                                        <TableHead>Tipo Prod.</TableHead>
                                        <TableHead>Rango Ton.</TableHead>
                                        <TableHead>Tiempo Base</TableHead>
                                        <TableHead className="text-right">Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {standards.length > 0 ? (
                                        standards.map((s) => (
                                        <TableRow key={s.id} data-state={selectedIds.has(s.id) && "selected"}>
                                            <TableCell><Checkbox checked={selectedIds.has(s.id)} onCheckedChange={(checked) => handleRowSelect(s.id, checked === true)} /></TableCell>
                                            <TableCell>{s.clientName}</TableCell>
                                            <TableCell className='capitalize'>{s.operationType}</TableCell>
                                            <TableCell className='capitalize'>{s.productType}</TableCell>
                                            <TableCell>{s.minTons} - {s.maxTons}</TableCell>
                                            <TableCell>{s.baseMinutes} min</TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="ghost" size="icon" onClick={() => openEditDialog(s)}><Edit className="h-4 w-4 text-blue-600" /></Button>
                                            </TableCell>
                                        </TableRow>
                                        ))
                                    ) : (
                                        <TableRow><TableCell colSpan={7} className="h-24 text-center">No hay estándares definidos.</TableCell></TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </ScrollArea>
                    </div>
                </CardContent>
            </Card>
        </div>
      </div>
      
      <Dialog open={!!standardToEdit} onOpenChange={(isOpen) => !isOpen && setStandardToEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Estándar</DialogTitle></DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4 pt-4">
                <FormField
                    control={editForm.control}
                    name="clientName"
                    render={({ field }) => (
                        <FormItem><FormLabel>Cliente</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent>{clientOptions.map(c => <SelectItem key={c.id} value={c.razonSocial}>{c.razonSocial}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                    )}
                />
                <FormField
                    control={editForm.control}
                    name="operationType"
                    render={({ field }) => (
                        <FormItem><FormLabel>Tipo de Operación</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent><SelectItem value="TODAS">TODAS</SelectItem><SelectItem value="recepcion">Recepción</SelectItem><SelectItem value="despacho">Despacho</SelectItem></SelectContent></Select><FormMessage /></FormItem>
                    )}
                />
                 <FormField
                    control={editForm.control}
                    name="productType"
                    render={({ field }) => (
                        <FormItem><FormLabel>Tipo de Producto</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent><SelectItem value="TODOS">TODOS</SelectItem><SelectItem value="fijo">Peso Fijo</SelectItem><SelectItem value="variable">Peso Variable</SelectItem></SelectContent></Select><FormMessage /></FormItem>
                    )}
                />
                <div className="grid grid-cols-2 gap-4">
                    <FormField control={editForm.control} name="minTons" render={({ field }) => (<FormItem><FormLabel>Min. Toneladas</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                    <FormField control={editForm.control} name="maxTons" render={({ field }) => (<FormItem><FormLabel>Max. Toneladas</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                </div>
                <FormField control={editForm.control} name="baseMinutes" render={({ field }) => (<FormItem><FormLabel>Minutos Base</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>)}/>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setStandardToEdit(null)}>Cancelar</Button>
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
                  <AlertDialogDescription>Esta acción no se puede deshacer. Se eliminarán permanentemente <strong>{selectedIds.size}</strong> estándar(es) seleccionados.</AlertDialogDescription>
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

