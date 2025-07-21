
"use client";

import { useState } from 'react';
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
    type PerformanceStandard 
} from './actions';
import { getClients, type ClientInfo } from '@/app/actions/clients';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Loader2, TrendingUp, Save, ShieldAlert, PlusCircle, Edit, Trash2 } from 'lucide-react';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';


const standardSchema = z.object({
  description: z.string().min(3, "La descripción es requerida."),
  clientName: z.string().min(1, "El cliente es requerido."),
  operationType: z.enum(['recepcion', 'despacho', 'TODAS']),
  productType: z.enum(['fijo', 'variable', 'TODAS']),
  unitOfMeasure: z.enum(['PALETA', 'CAJA', 'SACO', 'CANASTILLA', 'TODAS']),
  minutesPerTon: z.coerce.number().min(1, "Debe ser mayor a 0."),
});

type StandardFormValues = z.infer<typeof standardSchema>;

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

  const form = useForm<StandardFormValues>({
    resolver: zodResolver(standardSchema),
  });

  const openDialog = (standard: PerformanceStandard | null = null) => {
    setEditingStandard(standard);
    if (standard) {
      form.reset({
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
        clientName: 'TODOS',
        operationType: 'TODAS',
        productType: 'TODAS',
        unitOfMeasure: 'TODAS',
        minutesPerTon: 25,
      });
    }
    setIsDialogOpen(true);
  };

  const onSubmit: SubmitHandler<StandardFormValues> = async (data) => {
    setIsSubmitting(true);
    try {
      if (editingStandard) {
        const result = await updatePerformanceStandard(editingStandard.id, data as Omit<PerformanceStandard, 'id'>);
        if (result.success) {
          setStandards(prev => {
              const updated = prev.map(s => s.id === editingStandard.id ? { id: s.id, ...data } as PerformanceStandard : s);
              return updated.sort((a,b) => a.clientName.localeCompare(b.clientName) || a.operationType.localeCompare(b.operationType));
          });
          toast({ title: 'Éxito', description: 'Estándar actualizado.' });
        } else {
          throw new Error(result.message);
        }
      } else {
        const result = await addPerformanceStandard(data as Omit<PerformanceStandard, 'id'>);
        if (result.success) {
          // A full refresh is easier than trying to patch the state with potentially multiple new standards
          const allStandards = await getPerformanceStandards();
          setStandards(allStandards);
          toast({ title: 'Éxito', description: result.message });
        } else {
          throw new Error(result.message);
        }
      }
      setIsDialogOpen(false);
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


  if (authLoading) {
      return (
           <div className="flex min-h-screen w-full items-center justify-center">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
           </div>
      )
  }

  if (!permissions.canManageArticles) { // Reuse permission for now
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
                <h1 className="text-xl md:text-2xl font-bold text-primary">Gestión de Estándares de Rendimiento</h1>
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
                    <DialogTitle>{editingStandard ? 'Editar' : 'Crear'} Estándar de Rendimiento</DialogTitle>
                    <DialogDescription>
                        Defina los criterios para este estándar. Use 'TODOS' o ingrese clientes separados por comas.
                    </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormField control={form.control} name="description" render={({ field }) => (
                            <FormItem><FormLabel>Descripción</FormLabel><FormControl><Input placeholder="Ej: Recepción Furgón cajas" {...field} /></FormControl><FormMessage /></FormItem>
                        )}/>
                        <FormField control={form.control} name="clientName" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Cliente(s)</FormLabel>
                                <FormControl><Input placeholder="TODOS, o Cliente A, Cliente B..." {...field} /></FormControl>
                                <FormDescription>
                                    Use 'TODOS' o escriba nombres de clientes separados por comas.
                                </FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}/>
                        <div className="grid grid-cols-2 gap-4">
                            <FormField control={form.control} name="operationType" render={({ field }) => (
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
                            <FormField control={form.control} name="productType" render={({ field }) => (
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
                        <FormField control={form.control} name="unitOfMeasure" render={({ field }) => (
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
                        <FormField control={form.control} name="minutesPerTon" render={({ field }) => (
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
