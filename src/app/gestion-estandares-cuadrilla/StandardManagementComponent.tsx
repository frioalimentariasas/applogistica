

"use client";

import { useState, useEffect, useMemo, useRef } from 'react';
import { useForm, SubmitHandler, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';

import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { addPerformanceStandard, updatePerformanceStandard, deleteMultipleStandards, updateMultipleStandards, type PerformanceStandard, type BulkUpdateData } from './actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Loader2, PlusCircle, Edit, Trash2, ChevronsUpDown, ShieldAlert, Settings, Search, Copy } from 'lucide-react';
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
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';


const tonnageRangeSchema = z.object({
  minTons: z.coerce.number({invalid_type_error: "Debe ser un número"}).min(0, "Debe ser 0 o mayor."),
  maxTons: z.coerce.number({invalid_type_error: "Debe ser un número"}).min(0, "Debe ser 0 o mayor."),
  baseMinutes: z.coerce.number({invalid_type_error: "Debe ser un número"}).int().min(1, "Debe ser al menos 1."),
}).refine(data => data.maxTons > data.minTons, {
    message: "Max. debe ser mayor que Min.",
    path: ['maxTons'],
});

const standardSchema = z.object({
  clientNames: z.array(z.string()).min(1, { message: 'Debe seleccionar al menos un cliente.' }),
  operationType: z.enum(['recepcion', 'despacho', 'TODAS'], { required_error: 'Debe seleccionar un tipo de operación.' }),
  productType: z.enum(['fijo', 'variable', 'TODOS'], { required_error: 'Debe seleccionar un tipo de producto.' }),
  description: z.string().min(3, { message: "La descripción es requerida (mín. 3 caracteres)."}),
  ranges: z.array(tonnageRangeSchema).min(1, 'Debe agregar al menos un rango.'),
});

type StandardFormValues = z.infer<typeof standardSchema>;

const editStandardSchema = z.object({
  clientName: z.string().min(1, { message: 'Debe seleccionar un cliente o "TODOS".' }),
  operationType: z.enum(['recepcion', 'despacho', 'TODAS'], { required_error: 'Debe seleccionar un tipo de operación.' }),
  productType: z.enum(['fijo', 'variable', 'TODOS'], { required_error: 'Debe seleccionar un tipo de producto.' }),
  description: z.string().min(3, { message: "La descripción es requerida (mín. 3 caracteres)."}),
  minTons: z.coerce.number({invalid_type_error: "Debe ser un número"}).min(0, "Debe ser 0 o mayor."),
  maxTons: z.coerce.number({invalid_type_error: "Debe ser un número"}).min(0, "Debe ser 0 o mayor."),
  baseMinutes: z.coerce.number({invalid_type_error: "Debe ser un número"}).int().min(1, "Debe ser al menos 1."),
}).refine(data => data.maxTons > data.minTons, {
    message: "Las toneladas máximas deben ser mayores a las mínimas.",
    path: ['maxTons'],
});

type EditStandardFormValues = z.infer<typeof editStandardSchema>;

const bulkEditSchema = z.object({
    clientName: z.string().optional(),
    operationType: z.enum(['recepcion', 'despacho', 'TODAS']).optional(),
    productType: z.enum(['fijo', 'variable', 'TODOS']).optional(),
    description: z.string().optional(),
    baseMinutes: z.coerce.number().int().min(1, "Debe ser al menos 1.").optional(),
});

type BulkEditFormValues = z.infer<typeof bulkEditSchema>;

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
  const [filteredStandards, setFilteredStandards] = useState<PerformanceStandard[]>(initialStandards);
  const [clientFilter, setClientFilter] = useState('');
  const [descriptionFilter, setDescriptionFilter] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [standardToEdit, setStandardToEdit] = useState<PerformanceStandard | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const [isBulkEditing, setIsBulkEditing] = useState(false);
  
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isConfirmBulkDeleteOpen, setIsConfirmBulkDeleteOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  
  const [isClientDialogOpen, setClientDialogOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const formCardRef = useRef<HTMLDivElement>(null);


  const form = useForm<StandardFormValues>({
    resolver: zodResolver(standardSchema),
    defaultValues: {
      clientNames: [],
      operationType: 'TODAS',
      productType: 'TODOS',
      description: '',
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

  const bulkEditForm = useForm<BulkEditFormValues>({
      resolver: zodResolver(bulkEditSchema),
      defaultValues: {
          clientName: undefined,
          operationType: undefined,
          productType: undefined,
          description: undefined,
          baseMinutes: undefined
      }
  });

  const clientsWithStandards = useMemo(() => {
    return new Set(standards.map(s => s.clientName));
  }, [standards]);
  
  const clientOptions: ClientInfo[] = useMemo(() => [
    { id: 'TODOS', razonSocial: 'TODOS (Cualquier Cliente)' }, 
    ...initialClients
  ], [initialClients]);
  
  const filteredClients = useMemo(() => {
    if (!clientSearch) return clientOptions;
    return clientOptions.filter(c => c.razonSocial.toLowerCase().includes(clientSearch.toLowerCase()));
  }, [clientSearch, clientOptions]);

  useEffect(() => {
    const results = standards.filter(s => {
        const clientMatch = clientFilter ? s.clientName.toLowerCase().includes(clientFilter.toLowerCase()) : true;
        const descriptionMatch = descriptionFilter ? s.description.toLowerCase().includes(descriptionFilter.toLowerCase()) : true;
        return clientMatch && descriptionMatch;
    });
    setFilteredStandards(results);
  }, [clientFilter, descriptionFilter, standards]);


  const onAddSubmit: SubmitHandler<StandardFormValues> = async (data) => {
    setIsSubmitting(true);
    const result = await addPerformanceStandard(data);
    if (result.success && result.newStandards) {
      toast({ title: 'Éxito', description: result.message });
      setStandards(prev => [...prev, ...result.newStandards!].sort((a,b) => a.clientName.localeCompare(b.clientName)));
      form.reset({
        clientNames: [],
        operationType: 'TODAS',
        productType: 'TODOS',
        description: '',
        ranges: [{ minTons: 0, maxTons: 0, baseMinutes: 0 }]
      });
      remove(0); 
      append({ minTons: 0, maxTons: 0, baseMinutes: 0 });
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

   const onBulkEditSubmit: SubmitHandler<BulkEditFormValues> = async (data) => {
        if (selectedIds.size === 0) return;

        const updateData: BulkUpdateData = {};
        if (data.clientName) updateData.clientName = data.clientName;
        if (data.operationType) updateData.operationType = data.operationType;
        if (data.productType) updateData.productType = data.productType;
        if (data.description) updateData.description = data.description;
        if (data.baseMinutes !== undefined && !isNaN(data.baseMinutes)) {
            updateData.baseMinutes = data.baseMinutes;
        }

        if (Object.keys(updateData).length === 0) {
            toast({ variant: 'destructive', title: 'Sin cambios', description: 'No se especificaron cambios para aplicar.' });
            return;
        }
        
        setIsBulkEditing(true);
        const result = await updateMultipleStandards(Array.from(selectedIds), updateData);
        if (result.success) {
            toast({ title: 'Éxito', description: result.message });
            setStandards(prev => prev.map(s => selectedIds.has(s.id) ? { ...s, ...updateData, id: s.id } : s));
            setIsBulkEditOpen(false);
            setSelectedIds(new Set());
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.message });
        }
        setIsBulkEditing(false);
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

  const handleClone = (standard: PerformanceStandard) => {
    form.reset({
      clientNames: [],
      operationType: standard.operationType,
      productType: standard.productType,
      description: standard.description,
      ranges: standard.minTons && standard.maxTons && standard.baseMinutes
        ? [{ minTons: standard.minTons, maxTons: standard.maxTons, baseMinutes: standard.baseMinutes }]
        : [],
    });
    toast({
      title: 'Registro Clonado',
      description: 'Datos cargados en el formulario. Seleccione un nuevo cliente.',
    });
    formCardRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleRowSelect = (id: string, checked: boolean) => {
    const newSet = new Set(selectedIds);
    if (checked) newSet.add(id); else newSet.delete(id);
    setSelectedIds(newSet);
  };

  const isAllSelected = useMemo(() => {
    if (filteredStandards.length === 0) return false;
    return filteredStandards.every(s => selectedIds.has(s.id));
  }, [selectedIds, filteredStandards]);
  
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(filteredStandards.map(s => s.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const getSelectedClientsText = () => {
    const selected = form.watch('clientNames');
    if (selected.length === 0) return "Seleccione cliente(s)...";
    if (selected.length === 1) return selected[0];
    return `${selected.length} clientes seleccionados`;
  };


  if (authLoading) {
      return <div className="flex min-h-screen w-full items-center justify-center"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>
  }

  if (!permissions.canManageStandards) {
      return (
          <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8 flex items-center justify-center">
              <div className="max-w-xl mx-auto text-center">
                  <AccessDenied />
                  <Button onClick={() => router.push('/crew-performance-report')} className="mt-6"><ArrowLeft className="mr-2 h-4 w-4" />Volver al Inicio</Button>
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
                <h1 className="text-2xl font-bold text-primary">Gestión de Estándares de Productividad Cuadrilla</h1>
              </div>
              <p className="text-sm text-gray-500">Defina los tiempos estándar para las operaciones de la cuadrilla.</p>
            </div>
          </div>
        </header>

        <div className="space-y-8">
             <Card ref={formCardRef}>
                <CardHeader>
                    <CardTitle>Nuevo Estándar</CardTitle>
                    <CardDescription>Cree una o más reglas de tiempo para una combinación de operación.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onAddSubmit)} className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                <FormField
                                    control={form.control}
                                    name="clientNames"
                                    render={({ field }) => (
                                        <FormItem className="flex flex-col">
                                        <FormLabel>Cliente(s)</FormLabel>
                                            <Dialog open={isClientDialogOpen} onOpenChange={setClientDialogOpen}>
                                                <DialogTrigger asChild>
                                                    <Button variant="outline" className="w-full justify-between font-normal">
                                                        <span className="truncate">{getSelectedClientsText()}</span>
                                                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                    </Button>
                                                </DialogTrigger>
                                                <DialogContent className="sm:max-w-md">
                                                    <DialogHeader>
                                                        <DialogTitle>Seleccionar Cliente(s)</DialogTitle>
                                                        <DialogDescription>
                                                          Seleccione los clientes para este estándar. Los clientes sin estándares configurados se muestran en naranja.
                                                        </DialogDescription>
                                                    </DialogHeader>
                                                    <Input
                                                        placeholder="Buscar cliente..."
                                                        value={clientSearch}
                                                        onChange={(e) => setClientSearch(e.target.value)}
                                                        className="my-4"
                                                    />
                                                    <ScrollArea className="h-72">
                                                        <div className="space-y-1">
                                                             <div className="flex items-center space-x-2 rounded-md p-2 hover:bg-accent">
                                                                <Checkbox
                                                                id="select-all-add"
                                                                checked={field.value.includes('TODOS (Cualquier Cliente)')}
                                                                onCheckedChange={(checked) => {
                                                                    field.onChange(checked ? ['TODOS (Cualquier Cliente)'] : []);
                                                                }}
                                                                />
                                                                <Label htmlFor="select-all-add" className="w-full cursor-pointer font-semibold">TODOS (Cualquier Cliente)</Label>
                                                            </div>
                                                            {filteredClients.filter(c => c.id !== 'TODOS').map((client) => (
                                                                <div key={client.id} className="flex items-center space-x-2 rounded-md p-2 hover:bg-accent">
                                                                    <Checkbox
                                                                        id={`client-${client.id}`}
                                                                        checked={field.value.includes(client.razonSocial)}
                                                                        onCheckedChange={(checked) => {
                                                                            const updatedValue = checked
                                                                                ? [...field.value.filter(v => v !== 'TODOS (Cualquier Cliente)'), client.razonSocial]
                                                                                : field.value.filter(v => v !== client.razonSocial);
                                                                            field.onChange(updatedValue);
                                                                        }}
                                                                         disabled={field.value.includes('TODOS (Cualquier Cliente)')}
                                                                    />
                                                                    <Label htmlFor={`client-${client.id}`} className={cn("w-full cursor-pointer", !clientsWithStandards.has(client.razonSocial) && "text-orange-600 font-medium")}>{client.razonSocial}</Label>
                                                                    {!clientsWithStandards.has(client.razonSocial) && <Badge variant="outline" className="text-orange-600 border-orange-400">Nuevo</Badge>}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </ScrollArea>
                                                    <DialogFooter>
                                                        <Button onClick={() => setClientDialogOpen(false)}>Cerrar</Button>
                                                    </DialogFooter>
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
                                <FormField
                                    control={form.control}
                                    name="description"
                                    render={({ field }) => (
                                        <FormItem><FormLabel>Descripción</FormLabel><FormControl><Input placeholder="Ej: Cargue de pollo entero" {...field} /></FormControl><FormMessage /></FormItem>
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
                        <div className="flex gap-2">
                             {selectedIds.size > 0 && (
                                <>
                                <Button onClick={() => setIsBulkEditOpen(true)} variant="outline" size="sm" disabled={isBulkEditing}>
                                    <Edit className="mr-2 h-4 w-4" />
                                    Editar Selección ({selectedIds.size})
                                </Button>
                                <Button onClick={() => setIsConfirmBulkDeleteOpen(true)} variant="destructive" size="sm" disabled={isBulkDeleting}>
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Eliminar ({selectedIds.size})
                                </Button>
                                </>
                            )}
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <Input placeholder="Filtrar por cliente..." value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} />
                        <Input placeholder="Filtrar por descripción..." value={descriptionFilter} onChange={(e) => setDescriptionFilter(e.target.value)} />
                    </div>
                    <div className="rounded-md border">
                        <ScrollArea className="h-[500px]">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-12"><Checkbox checked={isAllSelected} onCheckedChange={(checked) => handleSelectAll(checked === true)} /></TableHead>
                                        <TableHead>Cliente</TableHead>
                                        <TableHead>Descripción</TableHead>
                                        <TableHead>Tipo Op.</TableHead>
                                        <TableHead>Tipo Prod.</TableHead>
                                        <TableHead>Rango Ton.</TableHead>
                                        <TableHead>Tiempo Base</TableHead>
                                        <TableHead className="text-right">Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredStandards.length > 0 ? (
                                        filteredStandards.map((s) => (
                                        <TableRow key={s.id} data-state={selectedIds.has(s.id) && "selected"}>
                                            <TableCell><Checkbox checked={selectedIds.has(s.id)} onCheckedChange={(checked) => handleRowSelect(s.id, checked === true)} /></TableCell>
                                            <TableCell>{s.clientName}</TableCell>
                                            <TableCell className='max-w-[200px] truncate' title={s.description}>{s.description}</TableCell>
                                            <TableCell className='capitalize'>{s.operationType}</TableCell>
                                            <TableCell className='capitalize'>{s.productType}</TableCell>
                                            <TableCell>{s.minTons} - {s.maxTons}</TableCell>
                                            <TableCell>{s.baseMinutes} min</TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <Button variant="ghost" size="icon" title="Clonar" onClick={() => handleClone(s)}><Copy className="h-4 w-4 text-gray-600" /></Button>
                                                    <Button variant="ghost" size="icon" title="Editar" onClick={() => openEditDialog(s)}><Edit className="h-4 w-4 text-blue-600" /></Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                        ))
                                    ) : (
                                        <TableRow><TableCell colSpan={8} className="h-24 text-center">No hay estándares que coincidan con los filtros.</TableCell></TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </ScrollArea>
                    </div>
                </CardContent>
            </Card>
        </div>
      </div>
      
      {/* Edit Dialog */}
      <Dialog open={!!standardToEdit} onOpenChange={(isOpen) => !isOpen && setStandardToEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Estándar</DialogTitle></DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4 pt-4">
                <FormField
                    control={editForm.control}
                    name="clientName"
                    render={({ field }) => (
                        <FormItem><FormLabel>Cliente</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl>
                            <SelectContent>
                                {clientOptions.map(c => <SelectItem key={c.id} value={c.razonSocial}>{c.razonSocial}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <FormMessage /></FormItem>
                    )}
                />
                <FormField
                    control={editForm.control}
                    name="description"
                    render={({ field }) => (
                        <FormItem><FormLabel>Descripción</FormLabel><FormControl><Input placeholder="Ej: Cargue de pollo entero" {...field} /></FormControl><FormMessage /></FormItem>
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
      
      {/* Bulk Edit Dialog */}
        <Dialog open={isBulkEditOpen} onOpenChange={setIsBulkEditOpen}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Editar {selectedIds.size} Estándares</DialogTitle>
                    <DialogDescription>
                        Los campos que modifique aquí se aplicarán a todos los estándares seleccionados. Deje un campo en blanco para no alterarlo.
                    </DialogDescription>
                </DialogHeader>
                <Form {...bulkEditForm}>
                    <form onSubmit={bulkEditForm.handleSubmit(onBulkEditSubmit)} className="space-y-4 pt-4">
                        <FormField control={bulkEditForm.control} name="clientName" render={({ field }) => (
                            <FormItem><FormLabel>Cliente</FormLabel>
                                <Select onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue placeholder="No cambiar" /></SelectTrigger></FormControl>
                                    <SelectContent>{clientOptions.map(c => <SelectItem key={c.id} value={c.razonSocial}>{c.razonSocial}</SelectItem>)}</SelectContent>
                                </Select>
                            <FormMessage /></FormItem>
                        )}/>
                        <FormField control={bulkEditForm.control} name="description" render={({ field }) => (
                            <FormItem><FormLabel>Descripción</FormLabel><FormControl><Input placeholder="No cambiar" {...field} /></FormControl><FormMessage /></FormItem>
                        )}/>
                        <FormField control={bulkEditForm.control} name="operationType" render={({ field }) => (
                            <FormItem><FormLabel>Tipo de Operación</FormLabel>
                                <Select onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue placeholder="No cambiar" /></SelectTrigger></FormControl>
                                    <SelectContent><SelectItem value="TODAS">TODAS</SelectItem><SelectItem value="recepcion">Recepción</SelectItem><SelectItem value="despacho">Despacho</SelectItem></SelectContent>
                                </Select>
                            <FormMessage /></FormItem>
                        )}/>
                        <FormField control={bulkEditForm.control} name="productType" render={({ field }) => (
                            <FormItem><FormLabel>Tipo de Producto</FormLabel>
                                <Select onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue placeholder="No cambiar" /></SelectTrigger></FormControl>
                                    <SelectContent><SelectItem value="TODOS">TODOS</SelectItem><SelectItem value="fijo">Peso Fijo</SelectItem><SelectItem value="variable">Peso Variable</SelectItem></SelectContent>
                                </Select>
                            <FormMessage /></FormItem>
                        )}/>
                        <FormField control={bulkEditForm.control} name="baseMinutes" render={({ field }) => (
                            <FormItem><FormLabel>Minutos Base</FormLabel>
                                <FormControl><Input type="number" placeholder="No cambiar" {...field} onChange={e => field.onChange(parseInt(e.target.value, 10))} /></FormControl>
                            <FormMessage /></FormItem>
                        )}/>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setIsBulkEditOpen(false)}>Cancelar</Button>
                            <Button type="submit" disabled={isBulkEditing}>{isBulkEditing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Aplicar Cambios</Button>
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

