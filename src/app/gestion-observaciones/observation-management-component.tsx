
"use client";

import { useState, useMemo } from 'react';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';

import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { addStandardObservation, updateStandardObservation, deleteStandardObservation, type StandardObservation } from './actions';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Loader2, ClipboardList, PlusCircle, Edit, Trash2, ShieldAlert } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const observationSchema = z.object({
  name: z.string().min(3, { message: 'El nombre debe tener al menos 3 caracteres.' }),
  quantityType: z.enum(['TONELADA', 'PALETA', 'UNIDAD', 'CAJA', 'SACO', 'CANASTILLA'], { required_error: 'Debe seleccionar un tipo de cantidad.' }),
});

type ObservationFormValues = z.infer<typeof observationSchema>;

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

export default function ObservationManagementComponent({ initialObservations }: { initialObservations: StandardObservation[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const { permissions, loading: authLoading } = useAuth();
  
  const [observations, setObservations] = useState<StandardObservation[]>(initialObservations);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [observationToEdit, setObservationToEdit] = useState<StandardObservation | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [observationToDelete, setObservationToDelete] = useState<StandardObservation | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const form = useForm<ObservationFormValues>({
    resolver: zodResolver(observationSchema),
    defaultValues: { name: '', quantityType: undefined },
  });

  const editForm = useForm<ObservationFormValues>({
    resolver: zodResolver(observationSchema),
  });

  const onAddSubmit: SubmitHandler<ObservationFormValues> = async (data) => {
    setIsSubmitting(true);
    const result = await addStandardObservation({
      ...data,
      name: data.name.toUpperCase()
    });
    if (result.success && result.newObservation) {
      toast({ title: 'Éxito', description: result.message });
      setObservations(prev => [...prev, result.newObservation!].sort((a, b) => a.name.localeCompare(b.name)));
      form.reset();
    } else {
      toast({ variant: 'destructive', title: 'Error', description: result.message });
    }
    setIsSubmitting(false);
  };

  const onEditSubmit: SubmitHandler<ObservationFormValues> = async (data) => {
    if (!observationToEdit) return;
    setIsEditing(true);
    const result = await updateStandardObservation(observationToEdit.id, {
      ...data,
      name: data.name.toUpperCase()
    });
    if (result.success) {
      toast({ title: 'Éxito', description: result.message });
      setObservations(prev => prev.map(o => o.id === observationToEdit.id ? { ...o, ...data, name: data.name.toUpperCase() } : o).sort((a, b) => a.name.localeCompare(b.name)));
      setObservationToEdit(null);
    } else {
      toast({ variant: 'destructive', title: 'Error', description: result.message });
    }
    setIsEditing(false);
  };

  const handleDeleteConfirm = async () => {
    if (!observationToDelete) return;
    setIsDeleting(true);
    const result = await deleteStandardObservation(observationToDelete.id);
    if (result.success) {
      toast({ title: 'Éxito', description: result.message });
      setObservations(prev => prev.filter(o => o.id !== observationToDelete.id));
    } else {
      toast({ variant: 'destructive', title: 'Error', description: result.message });
    }
    setObservationToDelete(null);
    setIsDeleting(false);
  };

  const openEditDialog = (obs: StandardObservation) => {
    setObservationToEdit(obs);
    editForm.reset({ name: obs.name, quantityType: obs.quantityType });
  };
  
  const filteredObservations = useMemo(() => {
    return observations.filter(obs => obs.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [observations, searchTerm]);

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
                <ClipboardList className="h-7 w-7 md:h-8 md:w-8 text-primary" />
                <h1 className="text-xl md:text-2xl font-bold text-primary">Gestión de Observaciones</h1>
              </div>
              <p className="text-xs md:text-sm text-gray-500">Cree y administre las observaciones estándar para los formularios.</p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><PlusCircle /> Crear Nueva Observación</CardTitle>
              <CardDescription>Defina un nuevo tipo de observación estándar.</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onAddSubmit)} className="space-y-4">
                  <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre de la Observación</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="EJ: DESCRIPCIÓN DE LA OBSERVACIONES." 
                          {...field} 
                          onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                   <FormField control={form.control} name="quantityType" render={({ field }) => (
                    <FormItem>
                      <FormLabel>El campo de cantidad medirá...</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Seleccione un tipo" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="TONELADA">TONELADA</SelectItem>
                          <SelectItem value="PALETA">PALETA</SelectItem>
                          <SelectItem value="UNIDAD">UNIDAD</SelectItem>
                          <SelectItem value="CAJA">CAJA</SelectItem>
                          <SelectItem value="SACO">SACO</SelectItem>
                          <SelectItem value="CANASTILLA">CANASTILLA</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <Button type="submit" disabled={isSubmitting} className="w-full">
                    {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                    Guardar Observación
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Observaciones Existentes</CardTitle>
              <CardDescription>Lista de todas las observaciones estándar registradas.</CardDescription>
            </CardHeader>
            <CardContent>
              <Input placeholder="Buscar observación..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="mb-4" />
              <ScrollArea className="h-72">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Tipo de Cantidad</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredObservations.length > 0 ? (
                      filteredObservations.map((obs) => (
                        <TableRow key={obs.id}>
                          <TableCell>{obs.name}</TableCell>
                          <TableCell>{obs.quantityType}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button variant="ghost" size="icon" title="Editar" onClick={() => openEditDialog(obs)}><Edit className="h-4 w-4 text-blue-600" /></Button>
                              <Button variant="ghost" size="icon" title="Eliminar" onClick={() => setObservationToDelete(obs)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow><TableCell colSpan={3} className="h-24 text-center text-muted-foreground">No se encontraron observaciones.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
      
      <Dialog open={!!observationToEdit} onOpenChange={(isOpen) => !isOpen && setObservationToEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Observación</DialogTitle>
            <DialogDescription>Modifique los detalles de la observación estándar.</DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4 pt-4">
              <FormField control={editForm.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre de la Observación</FormLabel>
                   <FormControl>
                        <Input 
                          {...field} 
                          onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                        />
                      </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={editForm.control} name="quantityType" render={({ field }) => (
                <FormItem>
                  <FormLabel>El campo de cantidad medirá...</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                        <SelectItem value="TONELADA">TONELADA</SelectItem>
                        <SelectItem value="PALETA">PALETA</SelectItem>
                        <SelectItem value="UNIDAD">UNIDAD</SelectItem>
                        <SelectItem value="CAJA">CAJA</SelectItem>
                        <SelectItem value="SACO">SACO</SelectItem>
                        <SelectItem value="CANASTILLA">CANASTILLA</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setObservationToEdit(null)}>Cancelar</Button>
                <Button type="submit" disabled={isEditing}>
                  {isEditing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Guardar Cambios
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      
      <AlertDialog open={!!observationToDelete} onOpenChange={(open) => !open && setObservationToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Está seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará permanentemente la observación: <strong>{observationToDelete?.name}</strong>. No se podrá seleccionar en futuros formularios.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setObservationToDelete(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} disabled={isDeleting} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
              {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
