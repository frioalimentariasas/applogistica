
"use client";

import { useState, useEffect } from 'react';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { addArticle, updateArticle, deleteArticle } from './actions';
import { getArticulosByClient, ArticuloInfo } from '@/app/actions/articulos';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Loader2, Box, PlusCircle, Edit, Trash2 } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
import type { ClientInfo } from '@/app/actions/clients';


const articleSchema = z.object({
  razonSocial: z.string().min(1, { message: 'Debe seleccionar un cliente.' }),
  codigoProducto: z.string().min(1, { message: 'El código es obligatorio.' }),
  denominacionArticulo: z.string().min(3, { message: 'La descripción es obligatoria.' }),
});
type ArticleFormValues = z.infer<typeof articleSchema>;

const editArticleSchema = z.object({
  codigoProducto: z.string().min(1, { message: 'El código es obligatorio.' }),
  denominacionArticulo: z.string().min(3, { message: 'La descripción es obligatoria.' }),
});
type EditArticleFormValues = z.infer<typeof editArticleSchema>;


interface ArticleManagementComponentProps {
  clients: ClientInfo[];
}

export default function ArticleManagementComponent({ clients }: ArticleManagementComponentProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedClient, setSelectedClient] = useState('');
  const [articles, setArticles] = useState<ArticuloInfo[]>([]);
  const [isLoadingArticles, setIsLoadingArticles] = useState(false);

  // State for edit and delete operations
  const [articleToEdit, setArticleToEdit] = useState<ArticuloInfo | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [articleToDelete, setArticleToDelete] = useState<ArticuloInfo | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const addForm = useForm<ArticleFormValues>({
    resolver: zodResolver(articleSchema),
    defaultValues: {
      razonSocial: '',
      codigoProducto: '',
      denominacionArticulo: '',
    },
  });

  const editForm = useForm<EditArticleFormValues>({
    resolver: zodResolver(editArticleSchema),
    defaultValues: {
      codigoProducto: '',
      denominacionArticulo: '',
    },
  });


  const onAddSubmit: SubmitHandler<ArticleFormValues> = async (data) => {
    setIsSubmitting(true);
    const result = await addArticle(data);
    if (result.success) {
      toast({ title: 'Éxito', description: result.message });
      addForm.reset();
      // If the new article belongs to the currently viewed client, refresh the list
      if (data.razonSocial === selectedClient) {
        handleClientSelect(data.razonSocial);
      }
    } else {
      toast({ variant: 'destructive', title: 'Error', description: result.message });
    }
    setIsSubmitting(false);
  };

  const onEditSubmit: SubmitHandler<EditArticleFormValues> = async (data) => {
    if (!articleToEdit) return;

    setIsEditing(true);
    const result = await updateArticle(articleToEdit.id, data);

    if (result.success) {
      toast({ title: 'Éxito', description: result.message });
      setArticleToEdit(null); // Close dialog on success
      handleClientSelect(selectedClient); // Refresh the list for the current client
    } else {
      toast({ variant: 'destructive', title: 'Error', description: result.message });
    }
    setIsEditing(false);
  };

  const handleDeleteConfirm = async () => {
    if (!articleToDelete) return;

    setIsDeleting(true);
    const result = await deleteArticle(articleToDelete.id);

    if (result.success) {
      toast({ title: 'Éxito', description: result.message });
      setArticles(prev => prev.filter(a => a.id !== articleToDelete.id)); // Optimistic UI update
    } else {
      toast({ variant: 'destructive', title: 'Error', description: result.message });
    }
    setArticleToDelete(null); // Close dialog
    setIsDeleting(false);
  };

  const handleClientSelect = async (clientName: string) => {
    setSelectedClient(clientName);
    if (clientName) {
      setIsLoadingArticles(true);
      const fetchedArticles = await getArticulosByClient(clientName);
      setArticles(fetchedArticles);
      setIsLoadingArticles(false);
    } else {
      setArticles([]);
    }
  };

  const openEditDialog = (article: ArticuloInfo) => {
    setArticleToEdit(article);
    editForm.reset({
      codigoProducto: article.codigoProducto,
      denominacionArticulo: article.denominacionArticulo,
    });
  };

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
                <Box className="h-8 w-8 text-primary" />
                <h1 className="text-2xl font-bold text-primary">Gestión de Artículos</h1>
              </div>
              <p className="text-sm text-gray-500">Agregue nuevos artículos y asócielos a un cliente.</p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><PlusCircle /> Agregar Nuevo Artículo</CardTitle>
                <CardDescription>Complete el formulario para añadir un nuevo artículo a un cliente.</CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...addForm}>
                  <form onSubmit={addForm.handleSubmit(onAddSubmit)} className="space-y-4">
                    <FormField
                      control={addForm.control}
                      name="razonSocial"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Cliente</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Seleccione un cliente" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {clients.map(client => (
                                <SelectItem key={client.id} value={client.razonSocial}>{client.razonSocial}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={addForm.control}
                      name="codigoProducto"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Código del Producto</FormLabel>
                          <FormControl><Input placeholder="Colocar Cod. Externo de SISLOG" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={addForm.control}
                      name="denominacionArticulo"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Descripción del Artículo</FormLabel>
                          <FormControl><Input placeholder="Colocar Descripción de Artículo SISLOG" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button type="submit" disabled={isSubmitting} className="w-full">
                      {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                      Agregar Artículo
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </div>
          
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Consultar Artículos por Cliente</CardTitle>
                <CardDescription>Seleccione un cliente para ver sus artículos asociados.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-4 mb-4">
                    <Select onValueChange={handleClientSelect} value={selectedClient}>
                        <SelectTrigger className="w-full">
                            <SelectValue placeholder="Seleccione un cliente para consultar..." />
                        </SelectTrigger>
                        <SelectContent>
                            {clients.map(client => (
                            <SelectItem key={client.id} value={client.razonSocial}>{client.razonSocial}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <ScrollArea className="h-96">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Código</TableHead>
                        <TableHead>Descripción del Artículo</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoadingArticles ? (
                        <TableRow>
                          <TableCell colSpan={3} className="h-24 text-center">
                            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                            <p className="text-muted-foreground">Buscando artículos...</p>
                          </TableCell>
                        </TableRow>
                      ) : articles.length > 0 ? (
                        articles.map((article) => (
                          <TableRow key={article.id}>
                            <TableCell className="font-mono">{article.codigoProducto}</TableCell>
                            <TableCell>{article.denominacionArticulo}</TableCell>
                            <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-2">
                                    <Button variant="ghost" size="icon" title="Editar" onClick={() => openEditDialog(article)}>
                                        <Edit className="h-4 w-4 text-blue-600" />
                                    </Button>
                                    <Button variant="ghost" size="icon" title="Eliminar" onClick={() => setArticleToDelete(article)}>
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                </div>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                            {selectedClient ? "Este cliente no tiene artículos registrados." : "Seleccione un cliente para ver sus artículos."}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      
      {/* Edit Dialog */}
      <Dialog open={!!articleToEdit} onOpenChange={(isOpen) => !isOpen && setArticleToEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Artículo</DialogTitle>
            <DialogDescription>
              Modifique los detalles del artículo y guarde los cambios.
            </DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4 pt-4">
              <FormField
                control={editForm.control}
                name="codigoProducto"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Código del Producto</FormLabel>
                    <FormControl><Input placeholder="Colocar Cod. Externo de SISLOG" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="denominacionArticulo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descripción del Artículo</FormLabel>
                    <FormControl><Input placeholder="Colocar Descripción de Artículo SISLOG" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setArticleToEdit(null)}>Cancelar</Button>
                <Button type="submit" disabled={isEditing}>
                  {isEditing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Guardar Cambios
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      
      {/* Delete Alert Dialog */}
       <AlertDialog open={!!articleToDelete} onOpenChange={(open) => !open && setArticleToDelete(null)}>
          <AlertDialogContent>
              <AlertDialogHeader>
              <AlertDialogTitle>¿Está seguro?</AlertDialogTitle>
              <AlertDialogDescription>
                  Esta acción no se puede deshacer. Se eliminará permanentemente el artículo:
                  <div className="mt-2 p-2 bg-muted rounded-md">
                    <strong>Código:</strong> {articleToDelete?.codigoProducto}<br />
                    <strong>Descripción:</strong> {articleToDelete?.denominacionArticulo}
                  </div>
              </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setArticleToDelete(null)}>Cancelar</AlertDialogCancel>
              <AlertDialogAction 
                  onClick={handleDeleteConfirm} 
                  disabled={isDeleting}
                  className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              >
                  {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Eliminar
              </AlertDialogAction>
              </AlertDialogFooter>
          </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
