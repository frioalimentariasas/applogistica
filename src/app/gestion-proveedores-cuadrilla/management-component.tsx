"use client";

import { useState, useMemo } from 'react';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';

import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { addCrewProvider, updateCrewProvider, deleteCrewProvider, type CrewProvider } from './actions';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Loader2, PlusCircle, Edit, Trash2, ShieldAlert, HardHat, Home } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ScrollArea } from '@/components/ui/scroll-area';

const formSchema = z.object({
  name: z.string().min(3, { message: 'El nombre debe tener al menos 3 caracteres.' }),
});
type FormValues = z.infer<typeof formSchema>;

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

export default function ProviderManagementComponent({ initialProviders }: { initialProviders: CrewProvider[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const { permissions, loading: authLoading } = useAuth();
  
  const [providers, setProviders] = useState<CrewProvider[]>(initialProviders);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [providerToEdit, setProviderToEdit] = useState<CrewProvider | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [providerToDelete, setProviderToDelete] = useState<CrewProvider | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: '' },
  });

  const editForm = useForm<FormValues>({
    resolver: zodResolver(formSchema),
  });

  const onAddSubmit: SubmitHandler<FormValues> = async (data) => {
    setIsSubmitting(true);
    const result = await addCrewProvider(data.name);
    if (result.success && result.newProvider) {
      toast({ title: 'Éxito', description: result.message });
      setProviders(prev => [...prev, result.newProvider!].sort((a,b) => a.name.localeCompare(b.name)));
      form.reset();
    } else {
      toast({ variant: 'destructive', title: 'Error', description: result.message });
    }
    setIsSubmitting(false);
  };

  const onEditSubmit: SubmitHandler<FormValues> = async (data) => {
    if (!providerToEdit) return;
    setIsEditing(true);
    const result = await updateCrewProvider(providerToEdit.id, data.name);
    if (result.success) {
      toast({ title: 'Éxito', description: result.message });
      setProviders(prev => prev.map(p => p.id === providerToEdit.id ? { ...p, name: data.name.toUpperCase() } : p).sort((a,b) => a.name.localeCompare(b.name)));
      setProviderToEdit(null);
    } else {
      toast({ variant: 'destructive', title: 'Error', description: result.message });
    }
    setIsEditing(false);
  };

  const handleDeleteConfirm = async () => {
    if (!providerToDelete) return;
    setIsDeleting(true);
    const result = await deleteCrewProvider(providerToDelete.id);
    if (result.success) {
      toast({ title: 'Éxito', description: result.message });
      setProviders(prev => prev.filter(p => p.id !== providerToDelete.id));
    } else {
      toast({ variant: 'destructive', title: 'Error', description: result.message });
    }
    setProviderToDelete(null);
    setIsDeleting(false);
  };

  const openEditDialog = (provider: CrewProvider) => {
    setProviderToEdit(provider);
    editForm.reset({ name: provider.name });
  };
  
  const filteredProviders = useMemo(() => {
    return providers.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [providers, searchTerm]);

  if (authLoading) {
      return <div className="flex min-h-screen w-full items-center justify-center"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>
  }

  if (!permissions.canManageCrewProviders) {
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
      <div className="max-w-6xl mx-auto">
        <header className="mb-8">
          <div className="relative flex items-center justify-center text-center">
            <Button variant="ghost" size="icon" className="absolute left-0 top-1/2 -translate-y-1/2" onClick={() => router.push('/')}>
              <Home className="h-6 w-6" />
            </Button>
            <div>
              <div className="flex items-center justify-center gap-2">
                <HardHat className="h-8 w-8 text-primary" />
                <h1 className="text-2xl font-bold text-primary">Gestión de Proveedores de Cuadrilla</h1>
              </div>
              <p className="text-sm text-gray-500">Agregue y administre las empresas que proveen servicios de cuadrilla.</p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><PlusCircle /> Agregar Nuevo Proveedor</CardTitle>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onAddSubmit)} className="space-y-4">
                  <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre del Proveedor</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="EJ: GRUPO ROSALES LOGISTICA 24/7 SAS" 
                          {...field} 
                          onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <Button type="submit" disabled={isSubmitting} className="w-full">
                    {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                    Guardar Proveedor
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Proveedores Existentes</CardTitle>
              <CardDescription>Lista de proveedores de cuadrilla registrados.</CardDescription>
            </CardHeader>
            <CardContent>
              <Input placeholder="Buscar proveedor..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="mb-4" />
              <ScrollArea className="h-72">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProviders.length > 0 ? (
                      filteredProviders.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell>{p.name}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" title="Editar" onClick={() => openEditDialog(p)}><Edit className="h-4 w-4 text-blue-600" /></Button>
                            <Button variant="ghost" size="icon" title="Eliminar" onClick={() => setProviderToDelete(p)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow><TableCell colSpan={2} className="h-24 text-center text-muted-foreground">No se encontraron proveedores.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
      
      <Dialog open={!!providerToEdit} onOpenChange={(isOpen) => !isOpen && setProviderToEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Proveedor</DialogTitle>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4 pt-4">
              <FormField control={editForm.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre del Proveedor</FormLabel>
                   <FormControl>
                        <Input {...field} onChange={(e) => field.onChange(e.target.value.toUpperCase())} />
                    </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setProviderToEdit(null)}>Cancelar</Button>
                <Button type="submit" disabled={isEditing}>
                  {isEditing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Guardar Cambios
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      
      <AlertDialog open={!!providerToDelete} onOpenChange={(open) => !open && setProviderToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Está seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará permanentemente el proveedor: <strong>{providerToDelete?.name}</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} disabled={isDeleting} className="bg-destructive hover:bg-destructive/90">
              {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
