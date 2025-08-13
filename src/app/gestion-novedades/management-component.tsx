
"use client";

import { useState, useMemo } from 'react';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';

import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { addStandardNoveltyType, deleteStandardNoveltyType, type StandardNoveltyType } from './actions';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Loader2, PlusCircle, Trash2, ShieldAlert, ListPlus } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
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

export function NoveltyManagementComponent({ initialNovelties }: { initialNovelties: StandardNoveltyType[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const { permissions, loading: authLoading } = useAuth();
  
  const [novelties, setNovelties] = useState<StandardNoveltyType[]>(initialNovelties);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [noveltyToDelete, setNoveltyToDelete] = useState<StandardNoveltyType | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: '' },
  });

  const onAddSubmit: SubmitHandler<FormValues> = async (data) => {
    setIsSubmitting(true);
    const result = await addStandardNoveltyType(data.name);
    if (result.success && result.newNovelty) {
      toast({ title: 'Éxito', description: result.message });
      setNovelties(prev => [...prev, result.newNovelty!].sort((a, b) => a.name.localeCompare(b.name)));
      form.reset();
    } else {
      toast({ variant: 'destructive', title: 'Error', description: result.message });
    }
    setIsSubmitting(false);
  };

  const handleDeleteConfirm = async () => {
    if (!noveltyToDelete) return;
    setIsDeleting(true);
    const result = await deleteStandardNoveltyType(noveltyToDelete.id);
    if (result.success) {
      toast({ title: 'Éxito', description: result.message });
      setNovelties(prev => prev.filter(n => n.id !== noveltyToDelete.id));
    } else {
      toast({ variant: 'destructive', title: 'Error', description: result.message });
    }
    setNoveltyToDelete(null);
    setIsDeleting(false);
  };

  const filteredNovelties = useMemo(() => {
    return novelties.filter(n => n.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [novelties, searchTerm]);

  if (authLoading) {
      return (
           <div className="flex min-h-screen w-full items-center justify-center">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
           </div>
      )
  }

  if (!permissions.canManageArticles) { // Reuse permission
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
                <ListPlus className="h-7 w-7 md:h-8 md:w-8 text-primary" />
                <h1 className="text-xl md:text-2xl font-bold text-primary">Gestión de Novedades</h1>
              </div>
              <p className="text-xs md:text-sm text-gray-500">Cree, consulte y elimine los tipos de novedades estándar.</p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><PlusCircle /> Crear Nueva Novedad</CardTitle>
              <CardDescription>Defina un nuevo tipo de novedad estándar.</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onAddSubmit)} className="space-y-4">
                  <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre de la Novedad</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="EJ: DAÑO TRILATERAL" 
                          {...field} 
                          onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <Button type="submit" disabled={isSubmitting} className="w-full">
                    {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                    Guardar Novedad
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Novedades Existentes</CardTitle>
              <CardDescription>Lista de todas las novedades estándar registradas.</CardDescription>
            </CardHeader>
            <CardContent>
              <Input placeholder="Buscar novedad..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="mb-4" />
              <ScrollArea className="h-72">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredNovelties.length > 0 ? (
                      filteredNovelties.map((n) => (
                        <TableRow key={n.id}>
                          <TableCell>{n.name}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" title="Eliminar" onClick={() => setNoveltyToDelete(n)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow><TableCell colSpan={2} className="h-24 text-center text-muted-foreground">No se encontraron novedades.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
      
      <AlertDialog open={!!noveltyToDelete} onOpenChange={(open) => !open && setNoveltyToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Está seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará permanentemente la novedad: <strong>{noveltyToDelete?.name}</strong>.
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
