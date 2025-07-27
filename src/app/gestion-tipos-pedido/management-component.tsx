
"use client";

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';

import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { addPedidoType, updatePedidoType, deletePedidoType, type PedidoType } from './actions';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Loader2, PlusCircle, Edit, Trash2, ShieldAlert, ListTodo } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

const formSchema = z.object({
  name: z.string().min(3, { message: "El nombre debe tener al menos 3 caracteres." }),
  appliesTo: z.array(z.string()).refine((value) => value.some((item) => item), {
    message: "Debe seleccionar al menos un formato.",
  }),
});

type FormValues = z.infer<typeof formSchema>;

const formTypes = [
  { id: 'fixed-weight-reception', label: 'Recepción Peso Fijo' },
  { id: 'fixed-weight-despacho', label: 'Despacho Peso Fijo' },
  { id: 'variable-weight-reception', label: 'Recepción Peso Variable' },
  { id: 'variable-weight-despacho', label: 'Despacho Peso Variable' },
] as const;

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

export function PedidoTypeManagementComponent({ initialTypes }: { initialTypes: PedidoType[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const { permissions, loading: authLoading } = useAuth();
  const [types, setTypes] = useState(initialTypes);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [typeToEdit, setTypeToEdit] = useState<PedidoType | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [typeToDelete, setTypeToDelete] = useState<PedidoType | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: '', appliesTo: [] },
  });

  const editForm = useForm<FormValues>({
    resolver: zodResolver(formSchema),
  });

  const onAddSubmit = async (data: FormValues) => {
    setIsSubmitting(true);
    const result = await addPedidoType(data as Omit<PedidoType, 'id'>);
    if (result.success && result.newType) {
      toast({ title: 'Éxito', description: result.message });
      setTypes(prev => [...prev, result.newType!].sort((a,b) => a.name.localeCompare(b.name)));
      form.reset();
    } else {
      toast({ variant: 'destructive', title: 'Error', description: result.message });
    }
    setIsSubmitting(false);
  };

  const onEditSubmit = async (data: FormValues) => {
    if (!typeToEdit) return;
    setIsEditing(true);
    const result = await updatePedidoType(typeToEdit.id, data as Omit<PedidoType, 'id'>);
    if (result.success) {
      toast({ title: 'Éxito', description: result.message });
      setTypes(prev => prev.map(t => t.id === typeToEdit.id ? { ...t, ...data } : t).sort((a,b) => a.name.localeCompare(b.name)));
      setTypeToEdit(null);
    } else {
      toast({ variant: 'destructive', title: 'Error', description: result.message });
    }
    setIsEditing(false);
  };

  const handleDeleteConfirm = async () => {
    if (!typeToDelete) return;
    setIsDeleting(true);
    const result = await deletePedidoType(typeToDelete.id);
    if (result.success) {
      toast({ title: 'Éxito', description: result.message });
      setTypes(prev => prev.filter(t => t.id !== typeToDelete.id));
    } else {
      toast({ variant: 'destructive', title: 'Error', description: result.message });
    }
    setTypeToDelete(null);
    setIsDeleting(false);
  };

  const openEditDialog = (type: PedidoType) => {
    setTypeToEdit(type);
    editForm.reset({ name: type.name, appliesTo: type.appliesTo });
  };
  
  if (authLoading) {
      return <div className="flex min-h-screen w-full items-center justify-center"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>
  }

  if (!permissions.canManageArticles) { // Reuse permission
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
              <ArrowLeft className="h-6 w-6" />
            </Button>
            <div>
              <div className="flex items-center justify-center gap-2">
                <ListTodo className="h-8 w-8 text-primary" />
                <h1 className="text-2xl font-bold text-primary">Gestión de Tipos de Pedido</h1>
              </div>
              <p className="text-sm text-gray-500">Defina los tipos de pedido y a qué formularios se aplican.</p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><PlusCircle />Crear Nuevo Tipo de Pedido</CardTitle>
                    <CardDescription>Defina un nuevo tipo y asócielo a los formularios correspondientes.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onAddSubmit)} className="space-y-6">
                            <FormField control={form.control} name="name" render={({ field }) => (<FormItem><FormLabel>Nombre del Tipo de Pedido</FormLabel><FormControl><Input placeholder="EJ: VENTA NACIONAL" {...field} onChange={e => field.onChange(e.target.value.toUpperCase())} /></FormControl><FormMessage /></FormItem>)}/>
                            <FormField
                                control={form.control}
                                name="appliesTo"
                                render={() => (
                                    <FormItem>
                                        <div className="mb-4"><FormLabel className="text-base">Se aplica a los formatos:</FormLabel></div>
                                        {formTypes.map((item) => (
                                            <FormField key={item.id} control={form.control} name="appliesTo" render={({ field }) => (
                                                <FormItem key={item.id} className="flex flex-row items-start space-x-3 space-y-0">
                                                    <FormControl><Checkbox checked={field.value?.includes(item.id)} onCheckedChange={(checked) => {
                                                        return checked ? field.onChange([...field.value, item.id]) : field.onChange(field.value?.filter((value) => value !== item.id));
                                                    }}/></FormControl>
                                                    <FormLabel className="font-normal">{item.label}</FormLabel>
                                                </FormItem>
                                            )}/>
                                        ))}
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <Button type="submit" disabled={isSubmitting} className="w-full">
                                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                                Guardar Tipo de Pedido
                            </Button>
                        </form>
                    </Form>
                </CardContent>
            </Card>
            <Card>
                <CardHeader><CardTitle>Tipos de Pedido Actuales</CardTitle></CardHeader>
                <CardContent>
                    <ScrollArea className="h-96">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Nombre</TableHead>
                                    <TableHead>Aplica en</TableHead>
                                    <TableHead className="text-right">Acciones</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {types.map((type) => (
                                    <TableRow key={type.id}>
                                        <TableCell className="font-medium">{type.name}</TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap gap-1">
                                                {type.appliesTo.map(id => {
                                                    const form = formTypes.find(f => f.id === id);
                                                    return <Badge key={id} variant="secondary">{form?.label || id}</Badge>
                                                })}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="icon" onClick={() => openEditDialog(type)}><Edit className="h-4 w-4 text-blue-600"/></Button>
                                            <Button variant="ghost" size="icon" onClick={() => setTypeToDelete(type)}><Trash2 className="h-4 w-4 text-destructive"/></Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </ScrollArea>
                </CardContent>
            </Card>
        </div>
      </div>

       {/* Edit Dialog */}
      <Dialog open={!!typeToEdit} onOpenChange={(isOpen) => !isOpen && setTypeToEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Tipo de Pedido</DialogTitle>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4 pt-4">
              <FormField control={editForm.control} name="name" render={({ field }) => (<FormItem><FormLabel>Nombre</FormLabel><FormControl><Input {...field} onChange={e => field.onChange(e.target.value.toUpperCase())}/></FormControl><FormMessage /></FormItem>)}/>
              <FormField
                control={editForm.control}
                name="appliesTo"
                render={() => (
                  <FormItem>
                    <div className="mb-4"><FormLabel className="text-base">Se aplica a:</FormLabel></div>
                    {formTypes.map((item) => (
                      <FormField key={item.id} control={editForm.control} name="appliesTo" render={({ field }) => (
                        <FormItem key={item.id} className="flex flex-row items-start space-x-3 space-y-0">
                          <FormControl><Checkbox checked={field.value?.includes(item.id)} onCheckedChange={(checked) => {
                            return checked ? field.onChange([...field.value, item.id]) : field.onChange(field.value?.filter((value) => value !== item.id));
                          }}/></FormControl>
                          <FormLabel className="font-normal">{item.label}</FormLabel>
                        </FormItem>
                      )}/>
                    ))}
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setTypeToEdit(null)}>Cancelar</Button>
                <Button type="submit" disabled={isEditing}>{isEditing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Guardar Cambios</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      
      {/* Delete Alert Dialog */}
      <AlertDialog open={!!typeToDelete} onOpenChange={(open) => !open && setTypeToDelete(null)}>
          <AlertDialogContent>
              <AlertDialogHeader>
              <AlertDialogTitle>¿Está seguro?</AlertDialogTitle>
              <AlertDialogDescription>
                  Esta acción eliminará permanentemente el tipo de pedido: <strong>{typeToDelete?.name}</strong>.
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
