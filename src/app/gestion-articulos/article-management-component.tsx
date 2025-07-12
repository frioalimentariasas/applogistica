
"use client";

import { useState, useEffect, useMemo, useRef } from 'react';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';

import { useToast } from '@/hooks/use-toast';
import { addArticle, updateArticle, deleteArticle, deleteMultipleArticles } from './actions';
import { getArticulosByClients, ArticuloInfo } from '@/app/actions/articulos';
import { uploadArticulos, type UploadResult } from '../upload-articulos/actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Loader2, Box, PlusCircle, Edit, Trash2, ChevronsUpDown, FileUp, Download, Search, XCircle, X } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Label } from '@/components/ui/label';
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import type { ClientInfo } from '@/app/actions/clients';


const articleSchema = z.object({
  razonSocial: z.string().min(1, { message: 'Debe seleccionar un cliente.' }),
  codigoProducto: z.string().min(1, { message: 'El código es obligatorio.' }),
  denominacionArticulo: z.string().min(3, { message: 'La descripción es obligatoria.' }),
  sesion: z.enum(['CO', 'RE', 'SE'], { required_error: 'Debe seleccionar una sesión.' }),
});
type ArticleFormValues = z.infer<typeof articleSchema>;

const editArticleSchema = z.object({
  codigoProducto: z.string().min(1, { message: 'El código es obligatorio.' }),
  denominacionArticulo: z.string().min(3, { message: 'La descripción es obligatoria.' }),
  sesion: z.enum(['CO', 'RE', 'SE'], { required_error: 'Debe seleccionar una sesión.' }),
});
type EditArticleFormValues = z.infer<typeof editArticleSchema>;


interface ArticleManagementComponentProps {
  clients: ClientInfo[];
}

export default function ArticleManagementComponent({ clients }: ArticleManagementComponentProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // State for article consultation
  const [selectedClients, setSelectedClients] = useState<string[]>([]);
  const [articles, setArticles] = useState<ArticuloInfo[]>([]);
  const [displayedArticles, setDisplayedArticles] = useState<ArticuloInfo[]>([]);
  const [isLoadingArticles, setIsLoadingArticles] = useState(false);
  const [searched, setSearched] = useState(false);

  // Filter states
  const [filterCode, setFilterCode] = useState('');
  const [filterDescription, setFilterDescription] = useState('');
  const [filterSession, setFilterSession] = useState('all');
  const [selectedArticleIds, setSelectedArticleIds] = useState<Set<string>>(new Set());

  // State for edit and delete operations
  const [articleToEdit, setArticleToEdit] = useState<ArticuloInfo | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [articleToDelete, setArticleToDelete] = useState<ArticuloInfo | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isConfirmBulkDeleteOpen, setIsConfirmBulkDeleteOpen] = useState(false);

  // State for add form client dialog
  const [isClientDialogOpen, setClientDialogOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  
  // State for consult client dialog
  const [isConsultClientDialogOpen, setConsultClientDialogOpen] = useState(false);
  const [consultClientSearch, setConsultClientSearch] = useState('');

  // State for upload form
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const uploadFormRef = useRef<HTMLFormElement>(null);
  const isCancelledRef = useRef(false);

  const addForm = useForm<ArticleFormValues>({
    resolver: zodResolver(articleSchema),
    defaultValues: {
      razonSocial: '',
      codigoProducto: '',
      denominacionArticulo: '',
      sesion: undefined
    },
  });

  const editForm = useForm<EditArticleFormValues>({
    resolver: zodResolver(editArticleSchema),
    defaultValues: {
      codigoProducto: '',
      denominacionArticulo: '',
      sesion: undefined,
    },
  });

  useEffect(() => {
    const fetchArticles = async () => {
      if (selectedClients.length > 0) {
        setIsLoadingArticles(true);
        setDisplayedArticles([]); // Clear previous results when clients change
        setSearched(false);
        const fetchedArticles = await getArticulosByClients(selectedClients);
        setArticles(fetchedArticles);
        setIsLoadingArticles(false);
        setSelectedArticleIds(new Set());
      } else {
        setArticles([]);
        setDisplayedArticles([]);
        setSearched(false);
        setSelectedArticleIds(new Set());
      }
    };
    fetchArticles();
  }, [selectedClients]);

  const handleSearch = () => {
      if (selectedClients.length === 0) {
          toast({ variant: 'destructive', title: 'Error', description: 'Debe seleccionar al menos un cliente para buscar.' });
          return;
      }
      setSearched(true);
      const results = articles.filter(article => {
        const codeMatch = filterCode ? article.codigoProducto.toLowerCase().includes(filterCode.toLowerCase()) : true;
        const descriptionMatch = filterDescription ? article.denominacionArticulo.toLowerCase().includes(filterDescription.toLowerCase()) : true;
        const sessionMatch = filterSession !== 'all' ? article.sesion === filterSession : true;
        return codeMatch && descriptionMatch && sessionMatch;
      });
      setDisplayedArticles(results);
      setSelectedArticleIds(new Set()); // Clear selection on new search
  };
  
  const handleClearFilters = () => {
      setFilterCode('');
      setFilterDescription('');
      setFilterSession('all');
      setDisplayedArticles([]);
      setSearched(false);
      setSelectedArticleIds(new Set());
  };

  const filteredClients = useMemo(() => {
    if (!clientSearch) return clients;
    return clients.filter(c => c.razonSocial.toLowerCase().includes(clientSearch.toLowerCase()));
  }, [clientSearch, clients]);
  
  const filteredConsultClients = useMemo(() => {
    if (!consultClientSearch) return clients;
    return clients.filter(c => c.razonSocial.toLowerCase().includes(consultClientSearch.toLowerCase()));
  }, [consultClientSearch, clients]);


  const onAddSubmit: SubmitHandler<ArticleFormValues> = async (data) => {
    setIsSubmitting(true);
    const result = await addArticle(data);
    if (result.success) {
      toast({ title: 'Éxito', description: result.message });
      addForm.reset();
      // If the new article belongs to the currently viewed client, refresh the list
      if (selectedClients.includes(data.razonSocial)) {
        setIsLoadingArticles(true);
        const fetchedArticles = await getArticulosByClients(selectedClients);
        setArticles(fetchedArticles);
        setIsLoadingArticles(false);
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
      setIsLoadingArticles(true);
      const fetchedArticles = await getArticulosByClients(selectedClients);
      setArticles(fetchedArticles);
      setDisplayedArticles(prev => {
        const newDisplayed = prev.map(a => a.id === articleToEdit.id ? { ...a, ...data } : a);
        return newDisplayed.filter(article => {
          const codeMatch = filterCode ? article.codigoProducto.toLowerCase().includes(filterCode.toLowerCase()) : true;
          const descriptionMatch = filterDescription ? article.denominacionArticulo.toLowerCase().includes(filterDescription.toLowerCase()) : true;
          const sessionMatch = filterSession !== 'all' ? article.sesion === filterSession : true;
          return codeMatch && descriptionMatch && sessionMatch;
        });
      });
      setIsLoadingArticles(false);
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
      setDisplayedArticles(prev => prev.filter(a => a.id !== articleToDelete.id));
    } else {
      toast({ variant: 'destructive', title: 'Error', description: result.message });
    }
    setArticleToDelete(null); // Close dialog
    setIsDeleting(false);
  };

  const handleBulkDeleteConfirm = async () => {
    if (selectedArticleIds.size === 0) return;
    
    setIsBulkDeleting(true);
    const idsToDelete = Array.from(selectedArticleIds);
    const result = await deleteMultipleArticles(idsToDelete);

    if (result.success) {
      toast({ title: 'Éxito', description: result.message });
      // Remove deleted items from local state
      setArticles(prev => prev.filter(a => !selectedArticleIds.has(a.id)));
      setDisplayedArticles(prev => prev.filter(a => !selectedArticleIds.has(a.id)));
      setSelectedArticleIds(new Set()); // Clear selection
    } else {
      toast({ variant: 'destructive', title: 'Error', description: result.message });
    }
    setIsConfirmBulkDeleteOpen(false);
    setIsBulkDeleting(false);
  };

  const openEditDialog = (article: ArticuloInfo) => {
    setArticleToEdit(article);
    editForm.reset({
      codigoProducto: article.codigoProducto,
      denominacionArticulo: article.denominacionArticulo,
      sesion: article.sesion,
    });
  };

  const handleUploadFormAction = async (formData: FormData) => {
    const file = formData.get('file') as File;
    if (!file || file.size === 0) {
      toast({ variant: 'destructive', title: 'Error', description: 'Por favor, seleccione un archivo para cargar.' });
      return;
    }
  
    setIsUploading(true);
    setUploadProgress(0);
    isCancelledRef.current = false;
    let totalErrors = 0;
  
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const jsonFromSheet: any[] = XLSX.utils.sheet_to_json(sheet);
  
      if (jsonFromSheet.length === 0) {
        throw new Error("El archivo está vacío o no tiene un formato válido.");
      }
      
      const rows = jsonFromSheet.map(row => ({
        'Razón Social': row['Razón Social'],
        'Codigo Producto': row['Codigo Producto'],
        'Denominación articulo': row['Denominación articulo'],
        'Sesion': row['Sesion']
      }));
  
      const chunkSize = 50; 
      for (let i = 0; i < rows.length; i += chunkSize) {
        if (isCancelledRef.current) {
          toast({ title: 'Carga Cancelada', description: 'La carga de archivos ha sido cancelada por el usuario.' });
          break;
        }

        const chunk = rows.slice(i, i + chunkSize);
        const result = await uploadArticulos(chunk);
  
        if (!result.success) {
          totalErrors += result.errorCount || chunk.length;
          if (result.errors) {
            console.error("Errores de carga:", result.errors.join('\n'));
          }
        }
  
        const progress = ((i + chunkSize) / rows.length) * 100;
        setUploadProgress(Math.min(progress, 100));
      }
      
      if (!isCancelledRef.current) {
        if (totalErrors > 0) {
          toast({
            variant: 'destructive',
            title: 'Carga Completada con Errores',
            description: `Se procesaron ${rows.length} filas con un total de ${totalErrors} errores.`,
            duration: 9000,
          });
        } else {
          toast({
            title: 'Carga Exitosa',
            description: `Se procesaron ${rows.length} artículos con éxito.`,
          });
        }
      }
      
      if (selectedClients.length > 0) {
        const fetchedArticles = await getArticulosByClients(selectedClients);
        setArticles(fetchedArticles);
        handleSearch();
      }
  
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Error desconocido al procesar el archivo.";
      toast({ variant: 'destructive', title: 'Error Crítico', description: msg });
    } finally {
      if (uploadFormRef.current) {
        uploadFormRef.current.reset();
      }
      setIsUploading(false);
    }
  };

  const handleCancelUpload = () => {
    isCancelledRef.current = true;
    setIsUploading(false);
  };
  
  const getSelectedClientsText = () => {
    if (selectedClients.length === 0) return "Seleccione uno o más clientes...";
    if (selectedClients.length === clients.length) return "Todos los clientes seleccionados";
    if (selectedClients.length === 1) return selectedClients[0];
    return `${selectedClients.length} clientes seleccionados`;
  };

  const handleExportArticles = () => {
    if (displayedArticles.length === 0) return;

    const dataToExport = displayedArticles.map(article => ({
      'Razón Social': article.razonSocial,
      'Código Producto': article.codigoProducto,
      'Descripción Artículo': article.denominacionArticulo,
      'Sesión': article.sesion,
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Artículos');
    XLSX.writeFile(workbook, 'Maestro_Articulos.xlsx');
  };

  const isAllSelected = useMemo(() => {
    return displayedArticles.length > 0 && selectedArticleIds.size === displayedArticles.length;
  }, [selectedArticleIds, displayedArticles]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedArticleIds(new Set(displayedArticles.map(a => a.id)));
    } else {
      setSelectedArticleIds(new Set());
    }
  };

  const handleRowSelect = (id: string, checked: boolean) => {
    const newSet = new Set(selectedArticleIds);
    if (checked) {
      newSet.add(id);
    } else {
      newSet.delete(id);
    }
    setSelectedArticleIds(newSet);
  };


  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
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

        <div className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
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
                                <FormItem className="flex flex-col">
                                <FormLabel>Cliente</FormLabel>
                                    <Dialog open={isClientDialogOpen} onOpenChange={setClientDialogOpen}>
                                        <DialogTrigger asChild>
                                            <Button variant="outline" className="w-full justify-between text-left font-normal">
                                                {field.value || "Seleccione un cliente..."}
                                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent className="sm:max-w-[425px]">
                                            <DialogHeader>
                                                <DialogTitle>Seleccionar Cliente</DialogTitle>
                                                <DialogDescription>Busque y seleccione el cliente al que pertenecerá el nuevo artículo.</DialogDescription>
                                            </DialogHeader>
                                            <div className="p-4">
                                                <Input
                                                    placeholder="Buscar cliente..."
                                                    value={clientSearch}
                                                    onChange={(e) => setClientSearch(e.target.value)}
                                                    className="mb-4"
                                                />
                                                <ScrollArea className="h-72">
                                                    <div className="space-y-1">
                                                        {filteredClients.map((client) => (
                                                            <Button
                                                                key={client.id}
                                                                variant="ghost"
                                                                className="w-full justify-start"
                                                                onClick={() => {
                                                                    field.onChange(client.razonSocial);
                                                                    setClientDialogOpen(false);
                                                                    setClientSearch('');
                                                                }}
                                                            >
                                                                {client.razonSocial}
                                                            </Button>
                                                        ))}
                                                        {filteredClients.length === 0 && <p className="text-center text-sm text-muted-foreground">No se encontraron clientes.</p>}
                                                    </div>
                                                </ScrollArea>
                                            </div>
                                        </DialogContent>
                                    </Dialog>
                                <FormMessage />
                                </FormItem>
                            )}
                            />
                            <FormField
                                control={addForm.control}
                                name="sesion"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Sesión</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Seleccione una sesión" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="CO">CO - Congelados</SelectItem>
                                                <SelectItem value="RE">RE - Refrigerado</SelectItem>
                                                <SelectItem value="SE">SE - Seco</SelectItem>
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

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><FileUp /> Cargar Artículos desde Excel</CardTitle>
                        <CardDescription>Suba un archivo (.xlsx, .xls) para agregar o actualizar múltiples artículos.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Alert className="mb-4 border-blue-500 bg-blue-50 text-blue-800 [&>svg]:text-blue-600">
                            <AlertTitle className="text-blue-700">Formato del Archivo</AlertTitle>
                            <AlertDescription>
                                El archivo debe tener las columnas: <strong>Razón Social</strong>, <strong>Codigo Producto</strong>, <strong>Denominación articulo</strong> y <strong>Sesion</strong>.
                            </AlertDescription>
                        </Alert>
                        <form onSubmit={(e) => { e.preventDefault(); handleUploadFormAction(new FormData(e.currentTarget)); }} ref={uploadFormRef}>
                          <div className="space-y-4">
                              <div className="space-y-1">
                                  <Label htmlFor="file-upload">Archivo Excel</Label>
                                  <Input 
                                      id="file-upload" 
                                      name="file" 
                                      type="file" 
                                      required 
                                      accept=".xlsx, .xls"
                                      disabled={isUploading}
                                      className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                                  />
                              </div>
                              <Button type="submit" disabled={isUploading} className="w-full">
                                <FileUp className="mr-2 h-4 w-4" />
                                Cargar Archivo
                              </Button>
                              {isUploading && (
                                <div className="mt-4 space-y-2">
                                    <Progress value={uploadProgress} className="w-full" />
                                    <div className="flex justify-between items-center">
                                      <p className="text-sm text-center text-muted-foreground">Procesando... {Math.round(uploadProgress)}%</p>
                                      <Button type="button" variant="ghost" size="sm" onClick={handleCancelUpload}>
                                        <X className="mr-2 h-4 w-4" />
                                        Cancelar
                                      </Button>
                                    </div>
                                </div>
                              )}
                          </div>
                        </form>
                    </CardContent>
                </Card>
            </div>
            
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center gap-4 flex-wrap">
                    <div>
                        <CardTitle>Consultar Artículos por Cliente</CardTitle>
                        <CardDescription>
                            {searched 
                                ? `Se encontraron ${displayedArticles.length} artículos para los filtros seleccionados.`
                                : "Seleccione clientes y filtre para ver y gestionar sus artículos."
                            }
                        </CardDescription>
                    </div>
                     <div className="flex gap-2">
                        {selectedArticleIds.size > 0 && (
                            <Button onClick={() => setIsConfirmBulkDeleteOpen(true)} variant="destructive" size="sm" disabled={isBulkDeleting}>
                                <Trash2 className="mr-2 h-4 w-4" />
                                Eliminar ({selectedArticleIds.size})
                            </Button>
                        )}
                        <Button onClick={handleExportArticles} variant="outline" size="sm" disabled={displayedArticles.length === 0}>
                            <Download className="mr-2 h-4 w-4" />
                            Exportar
                        </Button>
                    </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="mb-4">
                    <Label>Cliente(s)</Label>
                    <Dialog open={isConsultClientDialogOpen} onOpenChange={setConsultClientDialogOpen}>
                        <DialogTrigger asChild>
                            <Button variant="outline" className="w-full justify-between text-left font-normal">
                                <span className="truncate">{getSelectedClientsText()}</span>
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[425px]">
                            <DialogHeader>
                                <DialogTitle>Seleccionar Cliente(s)</DialogTitle>
                                <DialogDescription>Busque y seleccione los clientes a consultar.</DialogDescription>
                            </DialogHeader>
                            <div className="p-4">
                                <Input
                                    placeholder="Buscar cliente..."
                                    value={consultClientSearch}
                                    onChange={(e) => setConsultClientSearch(e.target.value)}
                                    className="mb-4"
                                />
                                <ScrollArea className="h-72">
                                    <div className="space-y-1">
                                      <div className="flex items-center space-x-2 rounded-md p-2 hover:bg-accent">
                                        <Checkbox
                                          id="select-all-clients"
                                          checked={selectedClients.length === clients.length}
                                          onCheckedChange={(checked) => {
                                            setSelectedClients(checked ? clients.map(c => c.razonSocial) : []);
                                          }}
                                        />
                                        <Label htmlFor="select-all-clients" className="w-full cursor-pointer font-semibold">Seleccionar Todos</Label>
                                      </div>
                                      {filteredConsultClients.map((client) => (
                                        <div key={client.id} className="flex items-center space-x-2 rounded-md p-2 hover:bg-accent">
                                          <Checkbox
                                            id={`client-${client.id}`}
                                            checked={selectedClients.includes(client.razonSocial)}
                                            onCheckedChange={(checked) => {
                                              setSelectedClients(prev => 
                                                checked 
                                                  ? [...prev, client.razonSocial] 
                                                  : prev.filter(c => c !== client.razonSocial)
                                              );
                                            }}
                                          />
                                          <Label htmlFor={`client-${client.id}`} className="w-full cursor-pointer">{client.razonSocial}</Label>
                                        </div>
                                      ))}
                                    </div>
                                </ScrollArea>
                            </div>
                            <DialogFooter>
                              <Button onClick={() => setConsultClientDialogOpen(false)}>Cerrar</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                    <div className="space-y-1">
                        <Label htmlFor="filter-code">Buscar por Código</Label>
                        <Input id="filter-code" placeholder="Filtrar por código..." value={filterCode} onChange={(e) => setFilterCode(e.target.value)} />
                    </div>
                     <div className="space-y-1">
                        <Label htmlFor="filter-description">Buscar por Descripción</Label>
                        <Input id="filter-description" placeholder="Filtrar por descripción..." value={filterDescription} onChange={(e) => setFilterDescription(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="filter-session">Filtrar por Sesión</Label>
                        <Select value={filterSession} onValueChange={setFilterSession}>
                            <SelectTrigger id="filter-session">
                                <SelectValue placeholder="Todas las sesiones" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todas las sesiones</SelectItem>
                                <SelectItem value="CO">CO - Congelados</SelectItem>
                                <SelectItem value="RE">RE - Refrigerado</SelectItem>
                                <SelectItem value="SE">SE - Seco</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                     <div className="flex items-end gap-2 lg:col-span-3">
                        <Button onClick={handleSearch} className="w-full" disabled={selectedClients.length === 0}>
                            <Search className="mr-2 h-4 w-4" />
                            Buscar
                        </Button>
                        <Button onClick={handleClearFilters} variant="outline" className="w-full">
                            <XCircle className="mr-2 h-4 w-4" />
                            Limpiar Filtros
                        </Button>
                    </div>
                </div>

                <ScrollArea className="h-96">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">
                          <Checkbox
                              checked={isAllSelected}
                              onCheckedChange={(checked) => handleSelectAll(checked === true)}
                              aria-label="Seleccionar todas las filas"
                              disabled={displayedArticles.length === 0}
                          />
                        </TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Código</TableHead>
                        <TableHead>Descripción del Artículo</TableHead>
                        <TableHead>Sesión</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoadingArticles ? (
                        <TableRow>
                          <TableCell colSpan={6} className="h-24 text-center">
                            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                            <p className="text-muted-foreground">Cargando artículos...</p>
                          </TableCell>
                        </TableRow>
                      ) : displayedArticles.length > 0 ? (
                        displayedArticles.map((article) => (
                          <TableRow key={article.id} data-state={selectedArticleIds.has(article.id) && "selected"}>
                            <TableCell>
                                <Checkbox
                                    checked={selectedArticleIds.has(article.id)}
                                    onCheckedChange={(checked) => handleRowSelect(article.id, checked === true)}
                                    aria-label={`Seleccionar fila ${article.codigoProducto}`}
                                />
                            </TableCell>
                            <TableCell>{article.razonSocial}</TableCell>
                            <TableCell className="font-mono">{article.codigoProducto}</TableCell>
                            <TableCell>{article.denominacionArticulo}</TableCell>
                            <TableCell>{article.sesion}</TableCell>
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
                          <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                            {selectedClients.length === 0 
                                ? "Seleccione uno o más clientes para ver sus artículos." 
                                : searched 
                                ? "No se encontraron artículos para los filtros seleccionados."
                                : "Haga clic en 'Buscar' para mostrar los artículos."}
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
                  name="sesion"
                  render={({ field }) => (
                      <FormItem>
                          <FormLabel>Sesión</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                  <SelectTrigger>
                                      <SelectValue placeholder="Seleccione una sesión" />
                                  </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                  <SelectItem value="CO">CO - Congelados</SelectItem>
                                  <SelectItem value="RE">RE - Refrigerado</SelectItem>
                                  <SelectItem value="SE">SE - Seco</SelectItem>
                              </SelectContent>
                          </Select>
                          <FormMessage />
                      </FormItem>
                  )}
              />
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

      {/* Bulk Delete Alert Dialog */}
      <AlertDialog open={isConfirmBulkDeleteOpen} onOpenChange={setIsConfirmBulkDeleteOpen}>
          <AlertDialogContent>
              <AlertDialogHeader>
                  <AlertDialogTitle>¿Confirmar eliminación masiva?</AlertDialogTitle>
                  <AlertDialogDescription>
                      Esta acción no se puede deshacer. Se eliminarán permanentemente <strong>{selectedArticleIds.size}</strong> artículo(s) seleccionados.
                  </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction 
                      onClick={handleBulkDeleteConfirm} 
                      disabled={isBulkDeleting}
                      className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                  >
                      {isBulkDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Sí, eliminar seleccionados
                  </AlertDialogAction>
              </AlertDialogFooter>
          </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
