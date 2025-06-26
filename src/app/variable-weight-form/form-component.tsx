
"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useForm, useFieldArray, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import Image from "next/image";
import { useAuth } from "@/hooks/use-auth";
import { getClients } from "@/app/actions/clients";
import { getArticulosByClient, ArticuloInfo } from "@/app/actions/articulos";
import { useFormPersistence } from "@/hooks/use-form-persistence";
import { saveForm } from "@/app/actions/save-form";
import { storage } from "@/lib/firebase";
import { ref, uploadString, getDownloadURL } from "firebase/storage";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
    ArrowLeft,
    Trash2,
    PlusCircle,
    UploadCloud,
    Camera,
    Send,
    RotateCcw,
    ChevronsUpDown,
    FileText,
    Edit2,
    Loader2
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RestoreDialog } from "@/components/app/restore-dialog";


const itemSchema = z.object({
  paleta: z.coerce.number().int().min(0, "Debe ser un número no negativo."),
  descripcion: z.string().min(1, "La descripción es requerida."),
  lote: z.string().max(15, "Máximo 15 caracteres").optional(),
  presentacion: z.string().min(1, "Seleccione una presentación."),
  cantidadPorPaleta: z.coerce.number().int().min(0, "Debe ser un número no negativo."),
  pesoNeto: z.coerce.number().min(0, "Debe ser un número no negativo."),
});

const summaryItemSchema = z.object({
    descripcion: z.string(),
    temperatura: z.coerce.number({ required_error: "La temperatura es requerida.", invalid_type_error: "La temperatura es requerida." }),
    totalPeso: z.number(),
    totalCantidad: z.number(),
  });

const formSchema = z.object({
    pedidoSislog: z.string()
      .min(1, "El pedido SISLOG es obligatorio.")
      .max(10, "El número de pedido no puede exceder los 10 dígitos.")
      .regex(/^[0-9]*$/, "El pedido solo puede contener números."),
    cliente: z.string().min(1, "Seleccione un cliente."),
    fecha: z.date({ required_error: "La fecha es obligatoria." }),
    conductor: z.string()
      .min(1, "El nombre del conductor es obligatorio."),
    cedulaConductor: z.string()
      .min(1, "La cédula del conductor es obligatoria."),
    placa: z.string()
      .min(1, "La placa es obligatoria.")
      .regex(/^[A-Z]{3}[0-9]{3}$/, "Formato inválido. Deben ser 3 letras y 3 números (ej: ABC123)."),
    precinto: z.string().min(1, "El precinto es obligatorio."),
    setPoint: z.number({required_error: "El Set Point es requerido.", invalid_type_error: "El Set Point es requerido."}).min(-99, "El valor debe estar entre -99 y 99.").max(99, "El valor debe estar entre -99 y 99."),
    items: z.array(itemSchema).min(1, "Debe agregar al menos un item."),
    summary: z.array(summaryItemSchema).optional(),
    horaInicio: z.string().min(1, "La hora de inicio es obligatoria.").regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Formato de hora inválido (HH:MM)."),
    horaFin: z.string().min(1, "La hora de fin es obligatoria.").regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Formato de hora inválido (HH:MM)."),
    observaciones: z.string().max(250, "Máximo 250 caracteres.").optional(),
    coordinador: z.string().min(1, "Seleccione un coordinador."),
});


// Mock data
const coordinadores = ["Cristian Acuña", "Sergio Padilla"];
const presentaciones = ["Caja", "Bolsa", "Paquete"];


export default function VariableWeightFormComponent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const operation = searchParams.get("operation") || "operación";
  const { toast } = useToast();
  const { user, displayName } = useAuth();
  
  const [clientes, setClientes] = useState<string[]>([]);
  const [isClientDialogOpen, setClientDialogOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState("");

  const [articulos, setArticulos] = useState<{ value: string; label: string }[]>([]);
  const [isLoadingArticulos, setIsLoadingArticulos] = useState(false);
  const [productDialogIndex, setProductDialogIndex] = useState<number | null>(null);
  const [productSearch, setProductSearch] = useState("");

  const [attachments, setAttachments] = useState<string[]>([]);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredClients = useMemo(() => {
    if (!clientSearch) return clientes;
    return clientes.filter(c => c.toLowerCase().includes(clientSearch.toLowerCase()));
  }, [clientSearch, clientes]);
  
  const filteredArticulos = useMemo(() => {
    if (!productSearch) return articulos;
    return articulos.filter(a => a.label.toLowerCase().includes(productSearch.toLowerCase()));
  }, [productSearch, articulos]);


  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      pedidoSislog: "",
      cliente: "",
      fecha: new Date(),
      cedulaConductor: "",
      conductor: "",
      placa: "",
      precinto: "",
      setPoint: NaN,
      items: [{ paleta: NaN, descripcion: '', lote: '', presentacion: '', cantidadPorPaleta: NaN, pesoNeto: NaN }],
      summary: [],
      horaInicio: "",
      horaFin: "",
      observaciones: "",
      coordinador: "",
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const { fields: summaryFields } = useFieldArray({
    control: form.control,
    name: "summary"
  });

  const watchedItems = useWatch({ control: form.control, name: "items" });
  
  const calculatedSummaryForDisplay = useMemo(() => {
    const grouped = (watchedItems || []).reduce((acc, item) => {
        if (!item?.descripcion?.trim()) return acc;
        const desc = item.descripcion.trim();

        const cantidad = Number(item.cantidadPorPaleta) || 0;
        const pesoNeto = Number(item.pesoNeto) || 0;

        if (!acc[desc]) {
            acc[desc] = {
                descripcion: desc,
                totalPeso: 0,
                totalCantidad: 0,
            };
        }

        acc[desc].totalPeso += isNaN(pesoNeto) ? 0 : pesoNeto;
        acc[desc].totalCantidad += cantidad;
        
        return acc;
    }, {} as Record<string, { descripcion: string; totalPeso: number; totalCantidad: number }>);

    return Object.values(grouped);
  }, [watchedItems]);

  const formIdentifier = `variable-weight-${operation}`;
  const { isRestoreDialogOpen, onRestore, onDiscard, onOpenChange, clearDraft } = useFormPersistence(formIdentifier, form, attachments, setAttachments);

  useEffect(() => {
      const currentSummaryInForm = form.getValues('summary') || [];
      const newSummaryState = calculatedSummaryForDisplay.map(newItem => {
          const existingItem = currentSummaryInForm.find(oldItem => oldItem.descripcion === newItem.descripcion);
          return {
              ...newItem,
              temperatura: existingItem?.temperatura,
          };
      });
      if (JSON.stringify(newSummaryState) !== JSON.stringify(currentSummaryInForm)) {
        form.setValue('summary', newSummaryState, { shouldValidate: true });
      }
  }, [calculatedSummaryForDisplay, form]);

  const showSummary = (watchedItems || []).some(item => item && item.descripcion && item.descripcion.trim() !== '');


  const handleAddItem = () => {
    const items = form.getValues('items');
    const lastItem = items.length > 0 ? items[items.length - 1] : null;

    append({
        paleta: NaN,
        descripcion: lastItem?.descripcion || '',
        lote: lastItem?.lote || '',
        presentacion: lastItem?.presentacion || '',
        cantidadPorPaleta: NaN,
        pesoNeto: NaN
    });
  };

  useEffect(() => {
    const fetchClients = async () => {
        const clientList = await getClients();
        setClientes(clientList);
    };
    fetchClients();
    window.scrollTo(0, 0);
  }, []);
  
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
        const files = Array.from(event.target.files);
        const imageFiles = files.filter(file => file.type.startsWith('image/'));
        if (imageFiles.length !== files.length) {
            toast({
                variant: "destructive",
                title: "Archivos no válidos",
                description: "Por favor, seleccione solo archivos de imagen.",
            });
        }
        imageFiles.forEach(file => {
            const reader = new FileReader();
            reader.onloadend = () => {
                setAttachments(prev => [...prev, reader.result as string]);
            };
            reader.readAsDataURL(file);
        });
    }
  };

  const handleRemoveAttachment = (indexToRemove: number) => {
      setAttachments(prev => prev.filter((_, index) => index !== indexToRemove));
  };

  const handleOpenCamera = async () => {
      setIsCameraOpen(true);
  };
  
  const handleCapture = () => {
      if (videoRef.current && canvasRef.current) {
          const video = videoRef.current;
          const canvas = canvasRef.current;
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const context = canvas.getContext('2d');
          if (context) {
              context.drawImage(video, 0, 0, canvas.width, canvas.height);
              const dataUrl = canvas.toDataURL('image/jpeg');
              setAttachments(prev => [...prev, dataUrl]);
          }
          handleCloseCamera();
      }
  };

  const handleCloseCamera = () => {
      if (videoRef.current && videoRef.current.srcObject) {
          const stream = videoRef.current.srcObject as MediaStream;
          stream.getTracks().forEach(track => track.stop());
          videoRef.current.srcObject = null;
      }
      setIsCameraOpen(false);
  };

  useEffect(() => {
    let stream: MediaStream;
    const enableCamera = async () => {
        if (isCameraOpen) {
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                try {
                    stream = await navigator.mediaDevices.getUserMedia({ video: true });
                    if (videoRef.current) {
                        videoRef.current.srcObject = stream;
                    }
                } catch (err) {
                    console.error("Error accessing camera: ", err);
                    toast({
                        variant: 'destructive',
                        title: 'Acceso a la cámara denegado',
                        description: 'Por favor, habilite los permisos de la cámara en la configuración de su navegador.',
                    });
                    setIsCameraOpen(false);
                }
            } else {
                toast({
                    variant: 'destructive',
                    title: 'Cámara no disponible',
                    description: 'Su navegador no soporta el acceso a la cámara.',
                });
                setIsCameraOpen(false);
            }
        }
    };
    enableCamera();
    return () => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }
    }
  }, [isCameraOpen, toast]);


  async function onSubmit(data: z.infer<typeof formSchema>) {
    if (!user || !storage) {
        toast({ variant: "destructive", title: "Error", description: "Debe iniciar sesión para guardar el formulario." });
        return;
    }
    setIsSubmitting(true);
    try {
        const finalSummary = calculatedSummaryForDisplay.map(summaryItem => {
            const formItem = (data.summary || []).find(s => s.descripcion === summaryItem.descripcion);
            return {
                ...summaryItem,
                temperatura: formItem?.temperatura as number,
            }
        });
  
        const dataWithFinalSummary = { ...data, summary: finalSummary };

        const attachmentUrls: string[] = [];
        for (const attachment of attachments) {
            const fileName = `submission-${Date.now()}-${Math.random().toString(36).substring(2)}.jpg`;
            const storageRef = ref(storage, `attachments/${user.uid}/${fileName}`);
            const base64String = attachment.split(',')[1];
            const snapshot = await uploadString(storageRef, base64String, 'base64', { contentType: 'image/jpeg' });
            const downloadURL = await getDownloadURL(snapshot.ref);
            attachmentUrls.push(downloadURL);
        }

        const result = await saveForm({
            userId: user.uid,
            userDisplayName: displayName || 'N/A',
            formType: `variable-weight-${operation}`,
            formData: dataWithFinalSummary,
            attachmentUrls: attachmentUrls,
            createdAt: new Date().toISOString(),
        });

        if (result.success) {
            toast({ title: "Formulario Guardado", description: `El formato de ${operation} ha sido guardado y enviado correctamente.` });
            await clearDraft();
            router.push('/');
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        console.error("Submission error:", error);
        const errorMessage = error instanceof Error ? error.message : "No se pudo guardar el formulario.";
        toast({ variant: "destructive", title: "Error al Enviar", description: errorMessage });
    } finally {
        setIsSubmitting(false);
    }
  }

  const title = `Formato de ${operation.charAt(0).toUpperCase() + operation.slice(1)} - Peso Variable`;

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
      <RestoreDialog
        open={isRestoreDialogOpen}
        onOpenChange={onOpenChange}
        onRestore={onRestore}
        onDiscard={onDiscard}
      />
      <div className="max-w-6xl mx-auto">
        <header className="mb-8">
            <div className="relative flex items-center justify-center text-center">
                 <Button 
                    variant="ghost" 
                    size="icon" 
                    className="absolute left-0 top-1/2 -translate-y-1/2" 
                    onClick={() => router.push('/')}
                    aria-label="Volver a la página principal"
                >
                    <ArrowLeft className="h-6 w-6" />
                </Button>
                <div>
                    <div className="flex items-center justify-center gap-2">
                        <FileText className="h-8 w-8 text-primary"/>
                        <h1 className="text-2xl font-bold text-primary">{title}</h1>
                    </div>
                    <p className="text-sm text-gray-500">Complete todos los campos requeridos para registrar la operación.</p>
                </div>
            </div>
        </header>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Header Data Card */}
            <Card>
              <CardHeader>
                <CardTitle>Información General</CardTitle>
              </CardHeader>
              <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <FormField control={form.control} name="pedidoSislog" render={({ field }) => (
                          <FormItem className="md:col-span-3">
                            <FormLabel>Pedido SISLOG</FormLabel>
                            <FormControl><Input placeholder="Pedido SISLOG (máx. 10 dígitos)" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                      )}/>
                      <FormField
                          control={form.control}
                          name="cliente"
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
                                                    {filteredClients.map((cliente) => (
                                                        <Button
                                                            key={cliente}
                                                            variant="ghost"
                                                            className="w-full justify-start"
                                                            onClick={async () => {
                                                                form.setValue('cliente', cliente);
                                                                setClientDialogOpen(false);
                                                                setClientSearch('');
                                                                
                                                                form.setValue('items', [{ paleta: NaN, descripcion: '', lote: '', presentacion: '', cantidadPorPaleta: NaN, pesoNeto: NaN }]);
                                                                setArticulos([]);
                                                                setIsLoadingArticulos(true);
                                                                try {
                                                                    const fetchedArticulos = await getArticulosByClient(cliente);
                                                                    setArticulos(fetchedArticulos.map(a => ({
                                                                        value: a.codigoProducto,
                                                                        label: a.denominacionArticulo
                                                                    })));
                                                                } catch (error) {
                                                                    toast({ variant: "destructive", title: "Error", description: "No se pudieron cargar los productos." });
                                                                } finally {
                                                                    setIsLoadingArticulos(false);
                                                                }
                                                            }}
                                                        >
                                                            {cliente}
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
                      <FormItem>
                          <FormLabel>Operario Logístico</FormLabel>
                          <FormControl><Input disabled value={displayName || ''} /></FormControl>
                      </FormItem>
                      <FormField control={form.control} name="fecha" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Fecha</FormLabel>
                            <FormControl><Input disabled value={field.value ? format(field.value, "dd/MM/yyyy") : ""} /></FormControl>
                            <FormMessage />
                          </FormItem>
                      )}/>
                      <FormField control={form.control} name="conductor" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Conductor</FormLabel>
                            <FormControl><Input placeholder="Nombre del conductor" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                      )}/>
                      <FormField control={form.control} name="cedulaConductor" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Cédula Conductor</FormLabel>
                            <FormControl><Input placeholder="Número de cédula" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                      )}/>
                      <FormField control={form.control} name="placa" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Placa del vehículo</FormLabel>
                            <FormControl><Input placeholder="ABC123" {...field} onChange={(e) => field.onChange(e.target.value.toUpperCase())} maxLength={6} /></FormControl>
                            <FormMessage />
                          </FormItem>
                      )}/>
                      <FormField control={form.control} name="precinto" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Precinto</FormLabel>
                            <FormControl><Input placeholder="Precinto (máx. 50 caracteres)" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                      )}/>
                      <FormField control={form.control} name="setPoint" render={({ field }) => (
                          <FormItem>
                              <FormLabel>Set Point (°C)</FormLabel>
                              <FormControl><Input type="number" placeholder="0" {...field} onChange={e => field.onChange(e.target.valueAsNumber)} value={field.value == null || Number.isNaN(field.value) ? '' : field.value} /></FormControl>
                              <FormMessage />
                          </FormItem>
                      )}/>
                  </div>
                </CardContent>
            </Card>

            {/* Product Characteristics Card */}
            <Card>
              <CardHeader>
                <CardTitle>Detalle del Despacho</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {fields.map((item, index) => (
                    <div key={item.id} className="p-4 border rounded-md relative space-y-4">
                        <div className="flex justify-between items-center">
                            <h4 className="font-semibold">Item #{index + 1}</h4>
                            {fields.length > 1 && (
                                <Button type="button" variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" onClick={() => remove(index)}>
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            )}
                        </div>
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <FormField control={form.control} name={`items.${index}.paleta`} render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Paleta</FormLabel>
                                        <FormControl><Input type="number" min="0" placeholder="0" {...field} onChange={e => field.onChange(e.target.valueAsNumber)} value={field.value == null || Number.isNaN(field.value) ? '' : field.value} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}/>
                                <FormField control={form.control} name={`items.${index}.descripcion`} render={({ field }) => (
                                    <FormItem className="md:col-span-2">
                                    <FormLabel>Descripción del Producto</FormLabel>
                                        <Dialog open={productDialogIndex === index} onOpenChange={(isOpen) => setProductDialogIndex(isOpen ? index : null)}>
                                            <DialogTrigger asChild>
                                                <Button variant="outline" className="w-full justify-between text-left font-normal">
                                                    {field.value || "Seleccionar producto..."}
                                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                </Button>
                                            </DialogTrigger>
                                            <DialogContent>
                                                <DialogHeader>
                                                    <DialogTitle>Seleccionar Producto</DialogTitle>
                                                </DialogHeader>
                                                {!form.getValues('cliente') ? (
                                                    <div className="p-4 text-center text-muted-foreground">
                                                        Debe escoger primero un cliente.
                                                    </div>
                                                ) : (
                                                    <>
                                                        <Input
                                                            placeholder="Buscar producto..."
                                                            value={productSearch}
                                                            onChange={(e) => setProductSearch(e.target.value)}
                                                            className="mb-4"
                                                        />
                                                        <ScrollArea className="h-72">
                                                            <div className="space-y-1">
                                                                {isLoadingArticulos && <p className="text-center text-sm text-muted-foreground">Cargando...</p>}
                                                                {!isLoadingArticulos && filteredArticulos.length === 0 && <p className="text-center text-sm text-muted-foreground">No se encontraron productos.</p>}
                                                                {filteredArticulos.map((p, i) => (
                                                                    <Button
                                                                        key={`${p.value}-${i}`}
                                                                        variant="ghost"
                                                                        className="w-full justify-start h-auto text-wrap"
                                                                        onClick={() => {
                                                                            field.onChange(p.label);
                                                                            setProductDialogIndex(null);
                                                                            setProductSearch("");
                                                                        }}
                                                                    >
                                                                        {p.label}
                                                                    </Button>
                                                                ))}
                                                            </div>
                                                        </ScrollArea>
                                                    </>
                                                )}
                                            </DialogContent>
                                        </Dialog>
                                    <FormMessage />
                                    </FormItem>
                                )}/>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <FormField control={form.control} name={`items.${index}.lote`} render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Lote</FormLabel>
                                        <FormControl><Input placeholder="Lote (máx. 15 caracteres)" {...field} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}/>
                                <FormField control={form.control} name={`items.${index}.presentacion`} render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Presentación</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger><SelectValue placeholder="Seleccione presentación" /></SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {presentaciones.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                                        </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}/>
                                <FormField control={form.control} name={`items.${index}.cantidadPorPaleta`} render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Cantidad Por Paleta</FormLabel>
                                        <FormControl><Input type="number" min="0" placeholder="0" {...field} onChange={e => field.onChange(e.target.valueAsNumber)} value={field.value == null || Number.isNaN(field.value) ? '' : field.value} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}/>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <FormField control={form.control} name={`items.${index}.pesoNeto`} render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Peso Neto (kg)</FormLabel>
                                        <FormControl><Input type="number" placeholder="0" {...field} onChange={e => field.onChange(e.target.valueAsNumber)} value={field.value == null || Number.isNaN(field.value) ? '' : field.value} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}/>
                            </div>
                        </div>
                    </div>
                ))}
                <Button type="button" variant="outline" onClick={handleAddItem}>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Agregar Item
                </Button>
              </CardContent>
            </Card>

            {showSummary && (
                <Card>
                  <CardHeader>
                      <CardTitle>Resumen Agrupado de Productos</CardTitle>
                  </CardHeader>
                  <CardContent>
                      <div className="rounded-md border">
                          <Table>
                              <TableHeader>
                                  <TableRow>
                                      <TableHead className="w-[150px]">Temperatura (°C)</TableHead>
                                      <TableHead>Producto</TableHead>
                                      <TableHead className="text-right">Total Peso (kg)</TableHead>
                                      <TableHead className="text-right">Cantidad Total</TableHead>
                                  </TableRow>
                              </TableHeader>
                              <TableBody>
                                  {calculatedSummaryForDisplay.length > 0 ? (
                                      calculatedSummaryForDisplay.map((summaryItem) => {
                                          const summaryIndex = summaryFields.findIndex(f => f.descripcion === summaryItem.descripcion);
                                          return (
                                          <TableRow key={summaryItem.descripcion}>
                                              <TableCell>
                                                  { summaryIndex > -1 ? (
                                                      <FormField
                                                          control={form.control}
                                                          name={`summary.${summaryIndex}.temperatura`}
                                                          render={({ field }) => (
                                                              <FormItem>
                                                                  <FormControl>
                                                                      <Input type="number" placeholder="0" {...field} 
                                                                          onChange={e => field.onChange(e.target.valueAsNumber)} 
                                                                          value={field.value == null || Number.isNaN(field.value) ? '' : field.value}
                                                                      />
                                                                  </FormControl>
                                                                  <FormMessage />
                                                              </FormItem>
                                                          )}
                                                      />
                                                  ) : (
                                                    <div className="h-10 w-full" />
                                                  )}
                                              </TableCell>
                                              <TableCell className="font-medium">
                                                <div className="bg-muted/50 p-2 rounded-md flex items-center h-10">
                                                  {summaryItem.descripcion}
                                                </div>
                                              </TableCell>
                                              <TableCell className="text-right">
                                                <div className="bg-muted/50 p-2 rounded-md flex items-center justify-end h-10">
                                                  {(summaryItem.totalPeso || 0).toFixed(2)}
                                                </div>
                                              </TableCell>
                                              <TableCell className="text-right">
                                                <div className="bg-muted/50 p-2 rounded-md flex items-center justify-end h-10">
                                                  {summaryItem.totalCantidad || 0}
                                                </div>
                                              </TableCell>
                                          </TableRow>
                                      )})
                                  ) : (
                                      <TableRow>
                                          <TableCell colSpan={4} className="h-24 text-center">
                                              Agregue ítems para ver el resumen.
                                          </TableCell>
                                      </TableRow>
                                  )}
                              </TableBody>
                          </Table>
                      </div>
                  </CardContent>
                </Card>
              )}

            {/* Time and Observations Card */}
            <Card>
                <CardHeader>
                    <CardTitle>Tiempo y Observaciones de la Operación</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form.control} name="horaInicio" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Hora de Inicio</FormLabel>
                        <FormControl>
                            <Input type="time" placeholder="HH:MM" {...field} />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                    )}/>
                    <FormField control={form.control} name="horaFin" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Hora Fin</FormLabel>
                        <FormControl>
                            <Input type="time" placeholder="HH:MM" {...field} />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                    )}/>
                    <FormField control={form.control} name="observaciones" render={({ field }) => (
                        <FormItem className="md:col-span-2 relative">
                            <FormLabel>Observaciones</FormLabel>
                            <FormControl><Textarea placeholder="Observaciones (opcional)" {...field} className="pr-10" /></FormControl>
                            <Edit2 className="absolute right-3 bottom-3 h-4 w-4 text-muted-foreground" />
                            <FormMessage />
                        </FormItem>
                    )}/>
                </CardContent>
            </Card>

             {/* Responsible Person Card */}
             <Card>
                <CardHeader><CardTitle>Coordinador y Operario Responsables de la Operación</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form.control} name="coordinador" render={({ field }) => (
                        <FormItem><FormLabel>Coordinador Responsable de la Operación</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Seleccione un coordinador" /></SelectTrigger></FormControl><SelectContent>{coordinadores.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                    )}/>
                     <FormItem>
                        <FormLabel>Operario Logístico Responsable</FormLabel>
                        <FormControl><Input disabled value={displayName || ''} /></FormControl>
                    </FormItem>
                </CardContent>
             </Card>

             {/* Attachments Card */}
             <Card>
                <CardHeader><CardTitle>Anexos</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div 
                            className="flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg cursor-pointer hover:bg-gray-100"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <UploadCloud className="w-10 h-10 text-gray-400 mb-2"/>
                            <p className="text-sm text-gray-600 font-semibold">Subir archivos o arrastre y suelte</p>
                            <p className="text-xs text-gray-500">Max. de imágenes 30 / Cada imagen se optimizará a 1MB</p>
                            <Input type="file" ref={fileInputRef} className="hidden" multiple accept="image/*" onChange={handleFileChange} />
                        </div>
                        <div 
                            className="flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg cursor-pointer hover:bg-gray-100"
                            onClick={handleOpenCamera}
                        >
                            <Camera className="w-10 h-10 text-gray-400 mb-2"/>
                            <p className="text-sm text-gray-600 font-semibold">Tomar Foto</p>
                            <p className="text-xs text-gray-500">Usar la cámara del dispositivo</p>
                        </div>
                    </div>
                    {attachments.length > 0 && (
                        <div>
                            <h4 className="text-sm font-medium mb-2">Archivos Adjuntos:</h4>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                                {attachments.map((src, index) => (
                                    <div key={index} className="relative group aspect-square">
                                        <Image src={src} alt={`Anexo ${index + 1}`} fill className="rounded-md object-cover" />
                                        <Button
                                            type="button"
                                            variant="destructive"
                                            size="icon"
                                            className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                            onClick={() => handleRemoveAttachment(index)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                            <span className="sr-only">Eliminar imagen</span>
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
            
            <footer className="flex items-center justify-end gap-4 pt-4">
                <Button type="button" variant="outline" onClick={onDiscard}>
                    <RotateCcw className="mr-2 h-4 w-4"/>
                    Limpiar Formato
                </Button>
                 <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4"/>}
                    {isSubmitting ? 'Guardando...' : 'Guardar Formato y Enviar'}
                </Button>
            </footer>
          </form>
        </Form>
      </div>

      <Dialog open={isCameraOpen} onOpenChange={setIsCameraOpen}>
          <DialogContent className="max-w-3xl">
              <DialogHeader>
                  <DialogTitle>Tomar Foto</DialogTitle>
              </DialogHeader>
              <div className="relative">
                  <video ref={videoRef} className="w-full aspect-video rounded-md bg-black" autoPlay muted playsInline />
                  <canvas ref={canvasRef} className="hidden"></canvas>
              </div>
              <DialogFooter>
                  <Button variant="outline" onClick={handleCloseCamera}>Cancelar</Button>
                  <Button onClick={handleCapture}>
                      <Camera className="mr-2 h-4 w-4"/>
                      Capturar y Adjuntar
                  </Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>
    </div>
  );
}
