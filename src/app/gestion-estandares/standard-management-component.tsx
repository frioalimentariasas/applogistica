
"use client";

import { useState, useMemo } from 'react';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';

import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { 
    addPerformanceStandard, 
    updatePerformanceStandard, 
    deletePerformanceStandard, 
    type PerformanceStandard,
    type PerformanceStandardFormValues,
    getPerformanceStandards
} from './actions';
import type { ClientInfo } from '@/app/actions/clients';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Loader2, TrendingUp, Save, ShieldAlert, PlusCircle, Edit, Trash2, ChevronsUpDown } from 'lucide-react';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';

const standardSchema = z.object({
  description: z.string().min(3, "La descripción es requerida."),
  clientNames: z.array(z.string()).min(1, "Debe seleccionar al menos un cliente."),
  operationType: z.enum(['recepcion', 'despacho', 'TODAS']),
  productType: z.enum(['fijo', 'variable', 'TODAS']),
  unitOfMeasure: z.enum(['PALETA', 'CAJA', 'SACO', 'CANASTILLA', 'TODAS']),
  minutesPerTon: z.coerce.number().min(1, "Debe ser mayor a 0."),
});

const editStandardSchema = standardSchema.omit({ clientNames: true }).extend({
    clientName: z.string()
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

export default function StandardManagementComponent({ initialStandards, clients }: { initialStandards: PerformanceStandard[], clients: ClientInfo[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const { permissions, loading: authLoading } = useAuth();
  
  const [standards, setStandards] = useState<PerformanceStandard[]>(initialStandards);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingStandard, setEditingStandard] = useState<PerformanceStandard | null>(null);
  const [deletingStandard, setDeletingStandard] = useState<PerformanceStandard | null>(null);
  const [isClientListOpen, setIsClientListOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  
  const clientOptions = [{ value: 'TODOS', label: 'TODOS (Estándar General)' }, ...clients.map(c => ({ value: c.razonSocial, label: c.razonSocial }))];

  const form = useForm<PerformanceStandardFormValues>({
    resolver: zodResolver(standardSchema),
  });
  
  const editForm = useForm<EditStandardFormValues>({
      resolver: zodResolver(editStandardSchema),
  });

  const openDialog = (standard: PerformanceStandard | null = null) => {
    setEditingStandard(standard);
    if (standard) {
        editForm.reset({
            description: standard.description,
            clientName: standard.clientName,
            operationType: standard.operationType,
            productType: standard.productType,
            unitOfMeasure: standard.unitOfMeasure,
            minutesPerTon: standard.minutesPerTon,
        });
    } else {
        form.reset({
            description: '',
            clientNames: [],
            operationType: 'TODAS',
            productType: 'TODAS',
            unitOfMeasure: 'TODAS',
            minutesPerTon: 25,
      });
    }
    setIsDialogOpen(true);
  };

  const onAddSubmit: SubmitHandler<PerformanceStandardFormValues> = async (data) => {
    setIsSubmitting(true);
    try {
      const result = await addPerformanceStandard(data);
      if (result.success) {
        const allStandards = await getPerformanceStandards();
        setStandards(allStandards);
        toast({ title: 'Éxito', description: result.message });
        setIsDialogOpen(false);
      } else {
        throw new Error(result.message);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Ocurrió un error inesperado.";
      toast({ variant: 'destructive', title: 'Error', description: msg });
    } finally {
      setIsSubmitting(false);
    }
  };

  const onEditSubmit: SubmitHandler<EditStandardFormValues> = async (data) => {
      if (!editingStandard) return;
      setIsSubmitting(true);
      try {
          const result = await updatePerformanceStandard(editingStandard.id, data);
          if (result.success) {
              setStandards(prev => {
                  const updated = prev.map(s => s.id === editingStandard.id ? { id: s.id, ...data } as PerformanceStandard : s);
                  return updated.sort((a,b) => a.clientName.localeCompare(b.clientName) || a.operationType.localeCompare(b.operationType));
              });
              toast({ title: 'Éxito', description: 'Estándar actualizado.' });
              setIsDialogOpen(false);
          } else {
              throw new Error(result.message);
          }
      } catch (error) {
          const msg = error instanceof Error ? error.message : "Ocurrió un error inesperado.";
          toast({ variant: 'destructive', title: 'Error', description: msg });
      } finally {
        setIsSubmitting(false);
      }
  };

  const handleDelete = async () => {
    if (!deletingStandard) return;
    setIsSubmitting(true);
    try {
        const result = await deletePerformanceStandard(deletingStandard.id);
        if(result.success) {
            setStandards(prev => prev.filter(s => s.id !== deletingStandard.id));
            toast({ title: 'Éxito', description: 'Estándar eliminado.' });
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Ocurrió un error inesperado.";
      toast({ variant: 'destructive', title: 'Error', description: msg });
    } finally {
      setDeletingStandard(null);
      setIsSubmitting(false);
    }
  }

  const filteredClients = useMemo(() => {
    if (!clientSearch) return clientOptions;
    return clientOptions.filter(c => c.label.toLowerCase().includes(clientSearch.toLowerCase()));
  }, [clientSearch, clientOptions]);


  if (authLoading) {
      return (
           <div className="flex min-h-screen w-full items-center justify-center">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
           </div>
      )
  }

  if (!permissions.canManageStandards) {
      return (
          <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8 flex items-center justify-center">
              <div className="max-w-xl mx-auto text-center">
                  <AccessDenied />
                   <Button onClick={() => router.push('/')} className="mt-6">
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      Volver al Inicio
                  </Button>
              </div>
          </div>
      );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-6 md:mb-8">
          <div className="relative flex items-center justify-center text-center">
            <Button variant="ghost" size="icon" className="absolute left-0 top-1/2 -translate-y-1/2" onClick={() => router.push('/')}>
              <ArrowLeft className="h-6 w-6" />
            </Button>
            <div>
              <div className="flex items-center justify-center gap-2">
                <TrendingUp className="h-7 w-7 md:h-8 md:w-8 text-primary" />
                <h1 className="text-xl md:text-2xl font-bold text-primary">Gestión de Estándares de Productividad</h1>
              </div>
              <p className="text-xs md:text-sm text-gray-500">Defina los minutos estándar por tonelada para cada tipo de operación de cuadrilla.</p>
            </div>
          </div>
        </header>

        <Card>
            <CardHeader>
                <div className="flex justify-between items-center">
                    <div>
                        <CardTitle>Listado de Estándares</CardTitle>
                        <CardDescription>Cree y edite los estándares de rendimiento para las operaciones.</CardDescription>
                    </div>
                    <Button onClick={() => openDialog()}>
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Crear Estándar
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Descripción</TableHead>
                                <TableHead>Cliente</TableHead>
                                <TableHead>Tipo Op.</TableHead>
                                <TableHead>Tipo Prod.</TableHead>
                                <TableHead>Unidad Medida</TableHead>
                                <TableHead className="text-right">Minutos/Tonelada</TableHead>
                                <TableHead className="text-right">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {standards.length > 0 ? (
                                standards.map(standard => (
                                    <TableRow key={standard.id}>
                                        <TableCell>{standard.description}</TableCell>
                                        <TableCell>{standard.clientName}</TableCell>
                                        <TableCell>{standard.operationType}</TableCell>
                                        <TableCell>{standard.productType}</TableCell>
                                        <TableCell>{standard.unitOfMeasure}</TableCell>
                                        <TableCell className="text-right font-mono">{standard.minutesPerTon}</TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="icon" onClick={() => openDialog(standard)}><Edit className="h-4 w-4" /></Button>
                                            <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setDeletingStandard(standard)}><Trash2 className="h-4 w-4" /></Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center h-24">No hay estándares definidos.</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{editingStandard ? 'Editar' : 'Crear'} Estándar de Productividad</DialogTitle>
                    <DialogDescription>
                        {editingStandard 
                          ? 'Modifique los detalles del estándar.' 
                          : "Defina los criterios para este estándar. Puede seleccionar uno o varios clientes."
                        }
                    </DialogDescription>
                </DialogHeader>
                 <Form {...(editingStandard ? editForm : form)}>
                    <form onSubmit={editingStandard ? editForm.handleSubmit(onEditSubmit) : form.handleSubmit(onAddSubmit)} className="space-y-4">
                        <FormField control={editingStandard ? editForm.control : form.control} name="description" render={({ field }) => (
                            <FormItem><FormLabel>Descripción</FormLabel><FormControl><Input placeholder="Ej: Recepción Furgón cajas" {...field} /></FormControl><FormMessage /></FormItem>
                        )}/>
                        
                        {editingStandard ? (
                            <FormField control={editForm.control} name="clientName" render={({ field }) => (
                                <FormItem><FormLabel>Cliente</FormLabel><FormControl><Input {...field} disabled /></FormControl></FormItem>
                            )}/>
                        ) : (
                           <FormField
                                control={form.control}
                                name="clientNames"
                                render={({ field }) => {
                                    const selectedCount = field.value?.length || 0;
                                    let buttonText = 'Seleccione uno o más clientes...';
                                    if (selectedCount === 1 && field.value?.[0] === 'TODOS') {
                                        buttonText = 'TODOS (Estándar General)';
                                    } else if (selectedCount > 0) {
                                        buttonText = `${selectedCount} cliente(s) seleccionado(s)`;
                                    }

                                    return (
                                        <FormItem>
                                            <FormLabel>Cliente(s)</FormLabel>
                                            <Dialog open={isClientListOpen} onOpenChange={setIsClientListOpen}>
                                                <DialogTrigger asChild>
                                                    <Button variant="outline" className="w-full justify-between text-left font-normal">
                                                        <span className="truncate">{buttonText}</span>
                                                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                    </Button>
                                                </DialogTrigger>
                                                <DialogContent>
                                                    <DialogHeader>
                                                        <DialogTitle>Seleccionar Cliente(s)</DialogTitle>
                                                        <DialogDescription>Seleccione los clientes para este estándar.</DialogDescription>
                                                    </DialogHeader>
                                                    <Input
                                                        placeholder="Buscar cliente..."
                                                        value={clientSearch}
                                                        onChange={(e) => setClientSearch(e.target.value)}
                                                        className="my-4"
                                                    />
                                                    <ScrollArea className="h-72">
                                                        <div className="space-y-1">
                                                            {filteredClients.map((option) => (
                                                                <div key={option.value} className="flex items-center space-x-2 rounded-md p-2 hover:bg-accent">
                                                                    <Checkbox
                                                                        id={`client-${option.value}`}
                                                                        checked={field.value?.includes(option.value)}
                                                                        onCheckedChange={(checked) => {
                                                                            return checked
                                                                                ? field.onChange([...(field.value || []), option.value])
                                                                                : field.onChange(field.value?.filter((v) => v !== option.value));
                                                                        }}
                                                                    />
                                                                    <Label htmlFor={`client-${option.value}`} className="w-full cursor-pointer">{option.label}</Label>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </ScrollArea>
                                                    <DialogFooter>
                                                        <Button type="button" onClick={() => setIsClientListOpen(false)}>Cerrar</Button>
                                                    </DialogFooter>
                                                </DialogContent>
                                            </Dialog>
                                            <FormMessage />
                                        </FormItem>
                                    );
                                }}
                            />
                        )}
                        
                        <div className="grid grid-cols-2 gap-4">
                            <FormField control={editingStandard ? editForm.control : form.control} name="operationType" render={({ field }) => (
                                <FormItem><FormLabel>Tipo de Operación</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                        <SelectContent>
                                            <SelectItem value="TODAS">TODAS</SelectItem>
                                            <SelectItem value="recepcion">Recepción</SelectItem>
                                            <SelectItem value="despacho">Despacho</SelectItem>
                                        </SelectContent>
                                    </Select><FormMessage />
                                </FormItem>
                            )}/>
                            <FormField control={editingStandard ? editForm.control : form.control} name="productType" render={({ field }) => (
                                <FormItem><FormLabel>Tipo de Producto</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                        <SelectContent>
                                            <SelectItem value="TODAS">TODAS</SelectItem>
                                            <SelectItem value="fijo">Peso Fijo</SelectItem>
                                            <SelectItem value="variable">Peso Variable</SelectItem>
                                        </SelectContent>
                                    </Select><FormMessage />
                                </FormItem>
                            )}/>
                        </div>
                        <FormField control={editingStandard ? editForm.control : form.control} name="unitOfMeasure" render={({ field }) => (
                            <FormItem><FormLabel>Unidad de Medida</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                    <SelectContent>
                                        <SelectItem value="TODAS">TODAS</SelectItem>
                                        <SelectItem value="PALETA">Por Paleta</SelectItem>
                                        <SelectItem value="CAJA">Por Caja</SelectItem>
                                        <SelectItem value="SACO">Por Saco</SelectItem>
                                        <SelectItem value="CANASTILLA">Por Canastilla</SelectItem>
                                    </SelectContent>
                                </Select><FormMessage />
                            </FormItem>
                        )}/>
                        <FormField control={editingStandard ? editForm.control : form.control} name="minutesPerTon" render={({ field }) => (
                            <FormItem><FormLabel>Minutos por Tonelada</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                        )}/>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                Guardar Estándar
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
        
        <AlertDialog open={!!deletingStandard} onOpenChange={() => setDeletingStandard(null)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>¿Está seguro?</AlertDialogTitle>
                    <AlertDialogDescription>
                       Esta acción eliminará permanentemente el estándar: <strong>{deletingStandard?.description}</strong>.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                        {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Eliminar
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

      </div>
    </div>
  );
}
