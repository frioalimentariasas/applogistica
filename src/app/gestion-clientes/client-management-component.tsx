
"use client";

import { useState, useMemo, useEffect, useRef } from 'react';
import { useForm, SubmitHandler, useFieldArray } from 'react-hook-form';
import { useFormStatus } from 'react-dom';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import * as ExcelJS from 'exceljs';
import { format, parse } from 'date-fns';
import { es } from 'date-fns/locale';

import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { addClient, updateClient, deleteClient } from './actions';
import { getClients } from '@/app/actions/clients';
import { uploadClientes } from '../upload-clientes/actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Loader2, Users2, UserPlus, Edit, Trash2, FileUp, Download, ShieldAlert, Search, CalendarIcon, PlusCircle } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Label } from '@/components/ui/label';
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
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { ClientInfo } from '@/app/actions/clients';
import { Separator } from '@/components/ui/separator';
import { DatePickerDialog } from '@/components/ui/date-picker-dialog';


// Custom validation schema for payment term
const paymentTermSchema = z.string().optional().refine((val) => {
    if (val === undefined || val.trim() === '') return true; // Allow empty
    if (val.toLowerCase() === 'contado') return true; // Allow "Contado"
    const num = Number(val);
    return !isNaN(num) && Number.isInteger(num) && num >= 0; // Allow non-negative integers
}, {
    message: "Debe ser un número entero no negativo o la palabra 'Contado'.",
});

const addClientSchema = z.object({
  razonSocial: z.string().min(3, { message: 'El nombre debe tener al menos 3 caracteres.' }),
  paymentTermDays: paymentTermSchema,
});
type AddClientFormValues = z.infer<typeof addClientSchema>;

const editClientSchema = z.object({
    razonSocial: z.string().min(3, { message: 'El nombre debe tener al menos 3 caracteres.' }),
    paymentTermDays: paymentTermSchema,
    posicionesFijasHistory: z.array(z.object({
        date: z.date({ required_error: 'La fecha es obligatoria.' }),
        positions: z.coerce.number().int().min(0, "Debe ser un número positivo.")
    })).optional(),
});
type EditClientFormValues = z.infer<typeof editClientSchema>;


interface ClientManagementComponentProps {
}

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

function UploadSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Cargando...
        </>
      ) : (
        <>
          <FileUp className="mr-2 h-4 w-4" />
          Cargar y Procesar Archivo
        </>
      )}
    </Button>
  );
}

export default function ClientManagementComponent({ }: ClientManagementComponentProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { permissions, loading: authLoading } = useAuth();
  const [clients, setClients] = useState<ClientInfo[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [searched, setSearched] = useState(false);

  // Add state
  const [isSubmittingAdd, setIsSubmittingAdd] = useState(false);
  
  // Edit state
  const [clientToEdit, setClientToEdit] = useState<ClientInfo | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  
  // Delete state
  const [clientToDelete, setClientToDelete] = useState<ClientInfo | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Upload state
  const [fileName, setFileName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Forms
  const addForm = useForm<AddClientFormValues>({
    resolver: zodResolver(addClientSchema),
    defaultValues: { razonSocial: '', paymentTermDays: '' },
  });

  const editForm = useForm<EditClientFormValues>({
    resolver: zodResolver(editClientSchema),
  });

  const { fields, append, remove } = useFieldArray({
    control: editForm.control,
    name: "posicionesFijasHistory"
  });


  // Handlers
  const handleSearch = async () => {
    setIsLoading(true);
    setSearched(true);
    try {
        const fetchedClients = await getClients();
        setClients(fetchedClients);
        if(fetchedClients.length === 0) {
            toast({ title: "Sin Resultados", description: "No se encontraron clientes registrados."});
        }
    } catch (error) {
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar los clientes.' });
    } finally {
        setIsLoading(false);
    }
  };
  
  // Fetch clients on initial load
  useEffect(() => {
      handleSearch();
  }, []);


  const onAddSubmit: SubmitHandler<AddClientFormValues> = async (data) => {
    setIsSubmittingAdd(true);
    const paymentTerm = data.paymentTermDays?.toLowerCase() === 'contado' ? 'Contado' : data.paymentTermDays ? Number(data.paymentTermDays) : undefined;
    const result = await addClient(data.razonSocial, paymentTerm);
    if (result.success && result.newClient) {
      toast({ title: 'Éxito', description: result.message });
      setClients(prev => [...prev, result.newClient!].sort((a, b) => a.razonSocial.localeCompare(b.razonSocial)));
      addForm.reset();
    } else {
      toast({ variant: 'destructive', title: 'Error', description: result.message });
    }
    setIsSubmittingAdd(false);
  };

  const onEditSubmit: SubmitHandler<EditClientFormValues> = async (data) => {
    if (!clientToEdit) return;
    setIsEditing(true);
    const paymentTerm = data.paymentTermDays?.toLowerCase() === 'contado' ? 'Contado' : data.paymentTermDays ? Number(data.paymentTermDays) : undefined;
    
    const historyData = data.posicionesFijasHistory?.map(h => ({
      ...h,
      date: format(h.date, 'yyyy-MM-dd')
    }));

    const result = await updateClient(clientToEdit.id, data.razonSocial, paymentTerm, historyData);
    if (result.success) {
      toast({ title: 'Éxito', description: result.message });
      setClients(prev => prev.map(c => c.id === clientToEdit.id ? { ...c, razonSocial: data.razonSocial, paymentTermDays: paymentTerm, posicionesFijasHistory: historyData } : c).sort((a, b) => a.razonSocial.localeCompare(b.razonSocial)));
      setClientToEdit(null);
    } else {
      toast({ variant: 'destructive', title: 'Error', description: result.message });
    }
    setIsEditing(false);
  };
  
  const handleDeleteConfirm = async () => {
    if (!clientToDelete) return;
    setIsDeleting(true);
    const result = await deleteClient(clientToDelete.id);
    if (result.success) {
      toast({ title: 'Éxito', description: result.message });
      setClients(prev => prev.filter(c => c.id !== clientToDelete.id));
    } else {
      toast({ variant: 'destructive', title: 'Error', description: result.message });
    }
    setClientToDelete(null);
    setIsDeleting(false);
  };

  const openEditDialog = (client: ClientInfo) => {
    setClientToEdit(client);
    editForm.reset({ 
        razonSocial: client.razonSocial, 
        paymentTermDays: client.paymentTermDays?.toString() ?? '',
        posicionesFijasHistory: (client.posicionesFijasHistory || []).map(h => ({
            ...h,
            date: parse(h.date, 'yyyy-MM-dd', new Date())
        })).sort((a,b) => b.date.getTime() - a.date.getTime())
    });
  };
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFileName(file.name);
      setFormError(null);
    } else {
      setFileName('');
    }
  };

  async function handleUploadFormAction(formData: FormData) {
    const file = formData.get('file') as File;
    if (!file || file.size === 0) {
        setFormError('Por favor, seleccione un archivo para cargar.');
      return;
    }

    const result = await uploadClientes(formData);

    if (result.success) {
      toast({
        title: "¡Éxito!",
        description: `${result.message} La lista de clientes se está actualizando.`,
      });
      setFileName('');
      const form = document.getElementById('upload-clients-form') as HTMLFormElement;
      form?.reset();
      // Refresh the list
      await handleSearch();
    } else {
      toast({
        variant: "destructive",
        title: "Error en la Carga",
        description: result.message,
      });
    }
  }

  const handleExportClients = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Clientes');

    worksheet.columns = [
        { header: 'Razón Social', key: 'razonSocial', width: 50 },
    ];
    
    clients.forEach(client => {
        worksheet.addRow({ razonSocial: client.razonSocial });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = 'Maestro_Clientes.xlsx';
    link.click();
  };

  const filteredClients = clients.filter(client => 
    client.razonSocial.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  if (authLoading) {
      return (
           <div className="flex min-h-screen w-full items-center justify-center">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
           </div>
      )
  }

  if (!permissions.canManageClients) {
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
        {/* Header */}
        <header className="mb-6 md:mb-8">
          <div className="relative flex items-center justify-center text-center">
            <Button variant="ghost" size="icon" className="absolute left-0 top-1/2 -translate-y-1/2" onClick={() => router.push('/')}>
              <ArrowLeft className="h-6 w-6" />
            </Button>
            <div>
              <div className="flex items-center justify-center gap-2">
                <Users2 className="h-7 w-7 md:h-8 md:w-8 text-primary" />
                <h1 className="text-xl md:text-2xl font-bold text-primary">Gestión de Clientes</h1>
              </div>
              <p className="text-xs md:text-sm text-gray-500">Agregue nuevos clientes, cargue desde un archivo, o consulte los existentes.</p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg"><UserPlus />Agregar Nuevo Cliente</CardTitle>
                <CardDescription>Ingrese la razón social para crear un nuevo cliente.</CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...addForm}>
                  <form onSubmit={addForm.handleSubmit(onAddSubmit)} className="space-y-4">
                    <FormField
                      control={addForm.control}
                      name="razonSocial"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Razón Social</FormLabel>
                          <FormControl>
                            <Input placeholder="Colocar nombre Propietario SISLOG" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={addForm.control}
                      name="paymentTermDays"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Plazo de Vencimiento</FormLabel>
                          <FormControl>
                            <Input type="text" placeholder="Ej: 30 o Contado" {...field} />
                          </FormControl>
                           <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button type="submit" disabled={isSubmittingAdd} className="w-full">
                      {isSubmittingAdd ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                      Agregar Cliente
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg"><FileUp />Cargar Clientes desde Excel</CardTitle>
                <CardDescription>Suba un archivo (.xlsx, .xls) para agregar múltiples clientes de una vez.</CardDescription>
              </CardHeader>
              <CardContent>
                <Alert className="mb-4 border-blue-500 bg-blue-50 text-blue-800 [&>svg]:text-blue-600">
                    <AlertTitle className="text-blue-700">Formato del Archivo</AlertTitle>
                    <AlertDescription>
                        El archivo debe tener una única columna con el encabezado: <strong>Razón Social</strong>.
                    </AlertDescription>
                </Alert>
                <form id="upload-clients-form" action={handleUploadFormAction} className="space-y-4">
                    <div className="space-y-1">
                        <Label htmlFor="file-upload-clients">Archivo Excel</Label>
                        <Input 
                            id="file-upload-clients" 
                            name="file" 
                            type="file" 
                            required 
                            accept=".xlsx, .xls, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                            onChange={handleFileChange}
                            className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                        />
                        {fileName && <p className="text-xs text-muted-foreground">Archivo seleccionado: {fileName}</p>}
                        {formError && <p className="text-sm font-medium text-destructive">{formError}</p>}
                    </div>
                    <UploadSubmitButton />
                </form>
              </CardContent>
            </Card>

          </div>
          
          <Card>
            <CardHeader>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                    <div>
                        <CardTitle className="text-lg">Listado de Clientes</CardTitle>
                        <CardDescription>Clientes actualmente registrados en el sistema.</CardDescription>
                    </div>
                    <Button onClick={handleExportClients} variant="outline" size="sm" disabled={clients.length === 0}>
                        <Download className="mr-2 h-4 w-4" />
                        Exportar
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                <div className="flex flex-col sm:flex-row gap-2 mb-4">
                    <Input 
                        placeholder="Buscar en la lista..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        disabled={!searched || clients.length === 0}
                    />
                     <Button onClick={handleSearch} disabled={isLoading} className="w-full sm:w-auto">
                        {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                        {searched ? "Refrescar" : "Buscar Todos"}
                    </Button>
                </div>
  
                <ScrollArea className="h-96">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Razón Social</TableHead>
                        <TableHead>Plazo de Vencimiento</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoading ? (
                           <TableRow>
                              <TableCell colSpan={3} className="h-24 text-center">
                                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
                                  <p className="text-muted-foreground">Cargando...</p>
                              </TableCell>
                          </TableRow>
                      ) : searched && filteredClients.length > 0 ? (
                        filteredClients.map((client) => (
                          <TableRow key={client.id}>
                            <TableCell>{client.razonSocial}</TableCell>
                            <TableCell>
                              {client.paymentTermDays != null 
                                ? (typeof client.paymentTermDays === 'number' ? `${client.paymentTermDays} días` : client.paymentTermDays) 
                                : 'No definido'}
                            </TableCell>
                            <TableCell className="text-right">
                                  <div className="flex items-center justify-end gap-2">
                                      <Button variant="ghost" size="icon" title="Editar" onClick={() => openEditDialog(client)}>
                                          <Edit className="h-4 w-4 text-blue-600" />
                                      </Button>
                                      <Button variant="ghost" size="icon" title="Eliminar" onClick={() => setClientToDelete(client)}>
                                          <Trash2 className="h-4 w-4 text-destructive" />
                                      </Button>
                                  </div>
                              </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                            {searched ? "No se encontraron clientes." : "Haga clic en 'Buscar' para ver los clientes."}
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
        <Dialog open={!!clientToEdit} onOpenChange={(isOpen) => !isOpen && setClientToEdit(null)}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Editar Cliente</DialogTitle>
              <DialogDescription>
                Modifique la razón social, el plazo de pago y el historial de posiciones fijas del cliente.
              </DialogDescription>
            </DialogHeader>
            <Form {...editForm}>
              <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4 pt-4">
                <FormField
                  control={editForm.control}
                  name="razonSocial"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Razón Social</FormLabel>
                      <FormControl><Input placeholder="Colocar nombre Propietario SISLOG" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="paymentTermDays"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Plazo de Vencimiento</FormLabel>
                      <FormControl>
                        <Input type="text" placeholder="Ej: 30 o Contado" {...field} value={field.value ?? ''}/>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Separator />
                 <div>
                  <Label className="text-base font-semibold">Historial de Posiciones Fijas (Congelados)</Label>
                  <p className="text-sm text-muted-foreground">Solo aplica para clientes con esta configuración especial, como GRUPO ATLANTIC.</p>
                </div>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                  {fields.map((field, index) => (
                    <div key={field.id} className="flex items-end gap-2 p-2 border rounded-md">
                      <FormField
                        control={editForm.control}
                        name={`posicionesFijasHistory.${index}.date`}
                        render={({ field }) => (
                          <FormItem className="flex-grow">
                            <FormLabel>Fecha de Inicio</FormLabel>
                            <DatePickerDialog
                              value={field.value}
                              onChange={field.onChange}
                            />
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={editForm.control}
                        name={`posicionesFijasHistory.${index}.positions`}
                        render={({ field }) => (
                          <FormItem className="flex-grow">
                            <FormLabel>Posiciones</FormLabel>
                            <FormControl>
                              <Input type="number" min="0" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} className="shrink-0 text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => append({ date: new Date(), positions: 0 })}>
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Agregar Valor Histórico
                </Button>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setClientToEdit(null)}>Cancelar</Button>
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
         <AlertDialog open={!!clientToDelete} onOpenChange={(open) => !open && setClientToDelete(null)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                <AlertDialogTitle>¿Está seguro?</AlertDialogTitle>
                <AlertDialogDescription>
                    Esta acción no se puede deshacer. Se eliminará permanentemente el cliente:
                    <div className="mt-2 p-2 bg-muted rounded-md">
                      <strong>{clientToDelete?.razonSocial}</strong>
                    </div>
                </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setClientToDelete(null)}>Cancelar</AlertDialogCancel>
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
    </div>
  );
}
