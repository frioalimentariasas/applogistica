
"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useForm, useFieldArray, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import Image from "next/image";
import { useAuth } from "@/hooks/use-auth";
import { getClients, type ClientInfo } from "@/app/actions/clients";
import { getArticulosByClient, ArticuloInfo } from "@/app/actions/articulos";
import { useFormPersistence } from "@/hooks/use-form-persistence";
import { saveForm } from "@/app/actions/save-form";
import { storage } from "@/lib/firebase";
import { ref, uploadString, getDownloadURL } from "firebase/storage";
import { optimizeImage } from "@/lib/image-optimizer";
import { getSubmissionById, SubmissionResult } from "@/app/actions/consultar-formatos";
import { getImageAsBase64 } from "@/app/actions/image-proxy";

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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
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
    Loader2
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RestoreDialog } from "@/components/app/restore-dialog";


const productSchema = z.object({
  codigo: z.string().optional(),
  descripcion: z.string().min(1, "La descripción es requerida."),
  cajas: z.number({required_error: "El No. de cajas es requerido.", invalid_type_error: "El No. de cajas es requerido."}).int().positive("El No. de Cajas debe ser mayor a 0."),
  paletas: z.number({required_error: "El Total Paletas/Cantidad es requerido.", invalid_type_error: "El Total Paletas/Cantidad es requerido."}).positive("El Total Paletas/Cantidad debe ser un número positivo."),
  temperatura: z.number({ required_error: "La temperatura es requerida.", invalid_type_error: "La temperatura es requerida." }).min(-99, "El valor debe estar entre -99 y 99.").max(99, "El valor debe estar entre -99 y 99."),
});

const formSchema = z.object({
    pedidoSislog: z.string()
    .min(1, "El pedido SISLOG es obligatorio.")
    .max(10, "El número de pedido no puede exceder los 10 dígitos.")
    .regex(/^[0-9]*$/, "El pedido solo puede contener números."),
  nombreCliente: z.string().min(1, "Seleccione un cliente."),
  fecha: z.date({ required_error: "La fecha es obligatoria." }),
  horaInicio: z.string().min(1, "La hora de inicio es obligatoria."),
  horaFin: z.string().min(1, "La hora de fin es obligatoria."),
  precinto: z.string()
    .min(1, "El precinto es obligatorio.")
    .max(40, "Máximo 40 caracteres."),
    documentoTransporte: z.string().max(15, "Máximo 15 caracteres.").optional(),
    facturaRemision: z.string().max(15, "Máximo 15 caracteres.").optional(),
  productos: z.array(productSchema).min(1, "Debe agregar al menos un producto."),
  nombreConductor: z.string().min(1, "El nombre del conductor es obligatorio."),
  cedulaConductor: z.string().min(1, "La cédula del conductor es obligatoria."),
  placa: z.string().min(1, "La placa es obligatoria.").regex(/^[A-Z]{3}[0-9]{3}$/, "Formato inválido. Deben ser 3 letras y 3 números (ej: ABC123)."),
  muelle: z.string().min(1, "Seleccione un muelle."),
  contenedor: z.string().optional(),
  setPoint: z.number({required_error: "El Set Point es requerido.", invalid_type_error: "El Set Point es requerido."}).min(-99, "El valor debe estar entre -99 y 99.").max(99, "El valor debe estar entre -99 y 99."),
  condicionesHigiene: z.enum(["limpio", "sucio"], { required_error: "Seleccione una condición." }),
  termoregistrador: z.enum(["si", "no"], { required_error: "Seleccione una opción." }),
  clienteRequiereTermoregistro: z.enum(["si", "no"], { required_error: "Seleccione una opción." }),
  observaciones: z.string().max(150, "Máximo 150 caracteres.").optional(),
  coordinador: z.string().min(1, "Seleccione un coordinador."),
});


// Mock data for selects
const muelles = ["Muelle 1", "Muelle 2", "Muelle 3", "Muelle 4", "Muelle 5", "Muelle 6"];
const coordinadores = ["Cristian Acuña", "Sergio Padilla"];

export default function FixedWeightFormComponent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const operation = searchParams.get("operation") || "operación";
  const submissionId = searchParams.get("id");

  const { toast } = useToast();
  const { user, displayName } = useAuth();
  
  const [clientes, setClientes] = useState<ClientInfo[]>([]);
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
  const [isLoadingForm, setIsLoadingForm] = useState(!!submissionId);
  const [originalSubmission, setOriginalSubmission] = useState<SubmissionResult | null>(null);


  const filteredClients = useMemo(() => {
    if (!clientSearch) return clientes;
    return clientes.filter(c => c.razonSocial.toLowerCase().includes(clientSearch.toLowerCase()));
  }, [clientSearch, clientes]);
  
  const filteredArticulos = useMemo(() => {
    if (!productSearch) return articulos;
    return articulos.filter(a => a.label.toLowerCase().includes(productSearch.toLowerCase()));
  }, [productSearch, articulos]);


  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      pedidoSislog: "",
      nombreCliente: "",
      fecha: new Date(),
      horaInicio: "",
      horaFin: "",
      precinto: "",
      documentoTransporte: "",
      facturaRemision: "",
      productos: [],
      nombreConductor: "",
      cedulaConductor: "",
      placa: "",
      muelle: "",
      contenedor: "",
      setPoint: NaN,
      condicionesHigiene: undefined,
      termoregistrador: undefined,
      clienteRequiereTermoregistro: undefined,
      observaciones: "",
      coordinador: "",
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "productos",
  });

  const productos = useWatch({
    control: form.control,
    name: 'productos',
    defaultValue: [],
  });

  const totalCajas = useMemo(() => {
    return (productos || []).reduce((acc, p) => acc + (Number(p.cajas) || 0), 0);
  }, [productos]);

  const totalPaletas = useMemo(() => {
    return (productos || []).reduce((acc, p) => acc + (Number(p.paletas) || 0), 0);
  }, [productos]);

  const formIdentifier = `fixed-weight-${operation}`;
  const { isRestoreDialogOpen, onRestore, onDiscard, onOpenChange, clearDraft } = useFormPersistence(formIdentifier, form, attachments, setAttachments, !!submissionId);


  useEffect(() => {
    const fetchClients = async () => {
      const clientList = await getClients();
      setClientes(clientList);
    };
    fetchClients();
    if (!submissionId) {
        form.reset({ ...form.getValues(), productos: [{ codigo: '', descripcion: '', cajas: NaN, paletas: NaN, temperatura: NaN }]});
    }
    window.scrollTo(0, 0);
  }, [submissionId, form]);

  useEffect(() => {
    const loadSubmissionData = async () => {
      if (!submissionId) {
        setIsLoadingForm(false);
        return;
      }
      setIsLoadingForm(true);
      try {
        const submission = await getSubmissionById(submissionId);
        if (submission) {
          setOriginalSubmission(submission);
          const formData = submission.formData;
          // Convert date string back to Date object for the form
          if (formData.fecha && typeof formData.fecha === 'string') {
            formData.fecha = new Date(formData.fecha);
          }
          form.reset(formData);
          // Set attachments, which are URLs in this case
          setAttachments(submission.attachmentUrls);

          // Pre-load articulos for the client
          if (formData.nombreCliente) {
            setIsLoadingArticulos(true);
            const fetchedArticulos = await getArticulosByClient(formData.nombreCliente);
            setArticulos(fetchedArticulos.map(a => ({ value: a.codigoProducto, label: a.denominacionArticulo })));
            setIsLoadingArticulos(false);
          }
        } else {
          toast({ variant: 'destructive', title: 'Error', description: 'No se encontró el formulario para editar.' });
          router.push('/consultar-formatos');
        }
      } catch (error) {
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo cargar el formulario.' });
      } finally {
        setIsLoadingForm(false);
      }
    };
    loadSubmissionData();
  }, [submissionId, form, router, toast, setAttachments]);

  
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
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
        
        if (imageFiles.length === 0) return;

        const processingToast = toast({
            title: "Optimizando imágenes...",
            description: `Procesando ${imageFiles.length} imagen(es). Por favor espere.`,
        });

        try {
            const optimizedImages = await Promise.all(imageFiles.map(file => {
                return new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        optimizeImage(reader.result as string)
                            .then(resolve)
                            .catch(reject);
                    };
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });
            }));
            
            setAttachments(prev => [...prev, ...optimizedImages]);
        } catch (error) {
            console.error("Image optimization error:", error);
            toast({
                variant: "destructive",
                title: "Error de optimización",
                description: "No se pudo optimizar una o más imágenes.",
            });
        } finally {
            processingToast.dismiss();
        }
    }
  };

  const handleRemoveAttachment = (indexToRemove: number) => {
      setAttachments(prev => prev.filter((_, index) => index !== indexToRemove));
  };

  const handleOpenCamera = async () => {
      setIsCameraOpen(true);
  };
  
  const handleCapture = async () => {
    if (videoRef.current && canvasRef.current) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext('2d');
        if (context) {
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg');
            
            handleCloseCamera(); // Close camera UI immediately

            const processingToast = toast({
              title: "Optimizando imagen...",
              description: "Por favor espere un momento.",
            });
          
            try {
                const optimizedImage = await optimizeImage(dataUrl);
                setAttachments(prev => [...prev, optimizedImage]);
            } catch (error) {
                 console.error("Image optimization error:", error);
                 toast({
                    variant: "destructive",
                    title: "Error de optimización",
                    description: "No se pudo optimizar la imagen capturada.",
                 });
            } finally {
                processingToast.dismiss();
            }
        } else {
          // Make sure camera is closed even if context is not available
          handleCloseCamera();
        }
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
        const newAttachmentsBase64 = attachments.filter(a => a.startsWith('data:image'));
        const existingAttachmentUrls = attachments.filter(a => a.startsWith('http'));

        const uploadedUrls = await Promise.all(
            newAttachmentsBase64.map(async (base64) => {
                const fileName = `submission-${Date.now()}-${Math.random().toString(36).substring(2)}.jpg`;
                const storageRef = ref(storage, `attachments/${user.uid}/${fileName}`);
                const base64String = base64.split(',')[1];
                const snapshot = await uploadString(storageRef, base64String, 'base64', { contentType: 'image/jpeg' });
                return getDownloadURL(snapshot.ref);
            })
        );
        
        const finalAttachmentUrls = [...existingAttachmentUrls, ...uploadedUrls];

        const submissionData = {
            userId: user.uid,
            userDisplayName: displayName || 'N/A',
            formType: `fixed-weight-${operation}`,
            formData: data,
            attachmentUrls: finalAttachmentUrls,
            createdAt: originalSubmission?.createdAt, // Pass original createdAt for updates
        };
        
        const result = await saveForm(submissionData, submissionId ?? undefined);

        if (result.success) {
            toast({ title: "Formulario Guardado", description: `El formato ha sido ${submissionId ? 'actualizado' : 'guardado'} correctamente.` });
            if (!submissionId) { // Only clear draft for new forms
                await clearDraft();
            }
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

  const title = `${submissionId ? 'Editando' : 'Formato de'} ${operation.charAt(0).toUpperCase() + operation.slice(1)} - Peso Fijo`;

  if (isLoadingForm) {
      return (
          <div className="flex min-h-screen w-full items-center justify-center">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="ml-4 text-lg">Cargando formulario...</p>
          </div>
      );
  }

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
                    onClick={() => router.push(submissionId ? '/consultar-formatos' : '/')}
                    aria-label="Volver"
                >
                    <ArrowLeft className="h-6 w-6" />
                </Button>
                <div>
                    <div className="flex items-center justify-center gap-2">
                        <FileText className="h-8 w-8 text-primary" />
                        <h1 className="text-2xl font-bold text-primary">{title}</h1>
                    </div>
                    <p className="text-sm text-gray-500">Complete todos los campos requeridos para registrar la operación.</p>
                </div>
            </div>
        </header>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* General Info Card */}
            <Card>
              <CardHeader>
                <CardTitle>Información General</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <FormField control={form.control} name="pedidoSislog" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Pedido SISLOG</FormLabel>
                      <FormControl><Input placeholder="Máximo 10 dígitos" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}/>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="nombreCliente"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>Nombre del Cliente</FormLabel>
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
                                                        key={cliente.id}
                                                        variant="ghost"
                                                        className="w-full justify-start"
                                                        onClick={async () => {
                                                            field.onChange(cliente.razonSocial);
                                                            setClientDialogOpen(false);
                                                            setClientSearch('');
                                                            
                                                            form.setValue('productos', [{ codigo: '', descripcion: '', cajas: NaN, paletas: NaN, temperatura: NaN }]);
                                                            setArticulos([]);
                                                            setIsLoadingArticulos(true);
                                                            try {
                                                                const fetchedArticulos = await getArticulosByClient(cliente.razonSocial);
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
                                                        {cliente.razonSocial}
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
                    <FormField control={form.control} name="fecha" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Fecha</FormLabel>
                        <FormControl>
                            <Input
                                disabled
                                value={field.value ? format(field.value, "dd/MM/yyyy") : ""}
                            />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}/>
                    <FormField control={form.control} name="horaInicio" render={({ field }) => (
                    <FormItem>
                        <FormLabel>{operation === 'recepcion' ? 'Hora Inicio Descargue' : 'Hora de Inicio Cargue'}</FormLabel>
                        <FormControl>
                            <Input type="time" placeholder="HH:MM" {...field} />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                    )}/>
                    <FormField control={form.control} name="horaFin" render={({ field }) => (
                    <FormItem>
                        <FormLabel>{operation === 'recepcion' ? 'Hora Fin Descargue' : 'Hora Fin Cargue'}</FormLabel>
                        <FormControl>
                            <Input type="time" placeholder="HH:MM" {...field} />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                    )}/>
                    <FormField control={form.control} name="precinto" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Precinto/Sello de Seguridad</FormLabel>
                        <FormControl><Input placeholder="Precinto/sello (máx. 40)" {...field} /></FormControl>
                        <FormMessage />
                    </FormItem>
                    )}/>
                    <FormField control={form.control} name="documentoTransporte" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Documento de Transporte</FormLabel>
                        <FormControl><Input placeholder="Máx 15 caracteres" {...field} /></FormControl>
                        <FormMessage />
                    </FormItem>
                    )}/>
                    <FormItem>
                        <FormLabel>Operario Logístico</FormLabel>
                        <FormControl><Input disabled value={displayName || ''} /></FormControl>
                    </FormItem>
                    <FormField control={form.control} name="facturaRemision" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Factura/Remisión</FormLabel>
                        <FormControl><Input placeholder="Máx 15 caracteres" {...field} /></FormControl>
                        <FormMessage />
                    </FormItem>
                    )}/>
                </div>
              </CardContent>
            </Card>

            {/* Product Characteristics Card */}
            <Card>
              <CardHeader>
                <CardTitle>Características del Producto</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {fields.map((item, index) => (
                    <div key={item.id} className="p-4 border rounded-md relative space-y-4">
                        <div className="flex justify-between items-center">
                            <h4 className="font-semibold">Producto #{index + 1}</h4>
                            {fields.length > 1 && (
                            <Button type="button" variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" onClick={() => remove(index)}>
                                <Trash2 className="h-4 w-4" />
                            </Button>
                            )}
                        </div>
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <FormField control={form.control} name={`productos.${index}.codigo`} render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Código</FormLabel>
                                        <FormControl><Input placeholder="Código del producto" {...field} readOnly /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}/>
                                <FormField control={form.control} name={`productos.${index}.descripcion`} render={({ field }) => (
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
                                                {!form.getValues('nombreCliente') ? (
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
                                                                            form.setValue(`productos.${index}.descripcion`, p.label)
                                                                            form.setValue(`productos.${index}.codigo`, p.value)
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
                                <FormField control={form.control} name={`productos.${index}.cajas`} render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>No. de Cajas</FormLabel>
                                        <FormControl><Input type="number" min="1" placeholder="0" {...field} onChange={e => field.onChange(e.target.valueAsNumber)} value={field.value == null || Number.isNaN(field.value) ? '' : field.value} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}/>
                                <FormField control={form.control} name={`productos.${index}.paletas`} render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Total Paletas/Cantidad</FormLabel>
                                        <FormControl><Input type="number" step="0.01" min="0.01" placeholder="0.00" {...field} onChange={e => field.onChange(e.target.valueAsNumber)} value={field.value == null || Number.isNaN(field.value) ? '' : field.value} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}/>
                                <FormField control={form.control} name={`productos.${index}.temperatura`} render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Temperatura (°C)</FormLabel>
                                        <FormControl><Input type="number" placeholder="0" {...field} onChange={e => field.onChange(e.target.valueAsNumber)} value={field.value == null || Number.isNaN(field.value) ? '' : field.value} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}/>
                            </div>
                        </div>
                    </div>
                ))}
                <Button type="button" variant="outline" onClick={() => append({ codigo: '', descripcion: '', cajas: NaN, paletas: NaN, temperatura: NaN })}>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Agregar Producto
                </Button>

                <Separator className="my-4" />

                <div className="flex justify-end gap-6">
                    <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">Totales Cajas</span>
                        <Input className="w-28" disabled value={totalCajas} />
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">Totales Paletas/Cantidad</span>
                        <Input className="w-28" disabled value={totalPaletas % 1 === 0 ? totalPaletas : totalPaletas.toFixed(2)} />
                    </div>
                </div>
              </CardContent>
            </Card>

            {/* Vehicle Info Card */}
            <Card>
                <CardHeader><CardTitle>Información del Vehículo</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-x-4 gap-y-6">
                    <FormField control={form.control} name="nombreConductor" render={({ field }) => (
                        <FormItem><FormLabel>Nombre Conductor</FormLabel><FormControl><Input placeholder="Nombre del conductor" {...field} /></FormControl><FormMessage /></FormItem>
                    )}/>
                    <FormField control={form.control} name="cedulaConductor" render={({ field }) => (
                        <FormItem><FormLabel>Cédula Conductor</FormLabel><FormControl><Input placeholder="Cédula del conductor" {...field} /></FormControl><FormMessage /></FormItem>
                    )}/>
                    <FormField control={form.control} name="placa" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Placa</FormLabel>
                            <FormControl>
                                <Input
                                    placeholder="ABC123"
                                    {...field}
                                    onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                                    maxLength={6}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}/>
                    <FormField control={form.control} name="muelle" render={({ field }) => (
                        <FormItem><FormLabel>Muelle</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Seleccione un muelle" /></SelectTrigger></FormControl><SelectContent>{muelles.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                    )}/>
                    <FormField control={form.control} name="contenedor" render={({ field }) => (
                        <FormItem><FormLabel>Contenedor</FormLabel><FormControl><Input placeholder="Número de contenedor" {...field} /></FormControl><FormMessage /></FormItem>
                    )}/>
                    <FormField control={form.control} name="setPoint" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Set Point (°C)</FormLabel>
                            <FormControl>
                                <Input type="number" placeholder="0" {...field} onChange={e => field.onChange(e.target.valueAsNumber)} value={field.value == null || Number.isNaN(field.value) ? '' : field.value} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}/>
                    <FormField control={form.control} name="condicionesHigiene" render={({ field }) => (
                        <FormItem className="space-y-3"><FormLabel>Condiciones de Higiene</FormLabel><FormControl><RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex gap-4"><FormItem className="flex items-center space-x-2"><RadioGroupItem value="limpio" id="limpio" /><Label htmlFor="limpio">Limpio</Label></FormItem><FormItem className="flex items-center space-x-2"><RadioGroupItem value="sucio" id="sucio" /><Label htmlFor="sucio">Sucio</Label></FormItem></RadioGroup></FormControl><FormMessage /></FormItem>
                    )}/>
                    <FormField control={form.control} name="termoregistrador" render={({ field }) => (
                        <FormItem className="space-y-3"><FormLabel>Termoregistrador</FormLabel><FormControl><RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex gap-4"><FormItem className="flex items-center space-x-2"><RadioGroupItem value="si" id="termo-si" /><Label htmlFor="termo-si">Sí</Label></FormItem><FormItem className="flex items-center space-x-2"><RadioGroupItem value="no" id="termo-no" /><Label htmlFor="termo-no">No</Label></FormItem></RadioGroup></FormControl><FormMessage /></FormItem>
                    )}/>
                    <FormField control={form.control} name="clienteRequiereTermoregistro" render={({ field }) => (
                        <FormItem className="space-y-3"><FormLabel>Cliente Requiere Termoregistro</FormLabel><FormControl><RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex gap-4"><FormItem className="flex items-center space-x-2"><RadioGroupItem value="si" id="req-termo-si" /><Label htmlFor="req-termo-si">Sí</Label></FormItem><FormItem className="flex items-center space-x-2"><RadioGroupItem value="no" id="req-termo-no" /><Label htmlFor="req-termo-no">No</Label></FormItem></RadioGroup></FormControl><FormMessage /></FormItem>
                    )}/>
                    <FormField control={form.control} name="observaciones" render={({ field }) => (
                        <FormItem className="md:col-span-3"><FormLabel>Observaciones</FormLabel><FormControl><Textarea placeholder="Observaciones Generales del Pedido (opcional, máx. 150 caracteres)" {...field} /></FormControl><FormMessage /></FormItem>
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
