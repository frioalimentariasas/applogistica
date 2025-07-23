
"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useForm, useFieldArray, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import Image from "next/image";
import { useAuth } from "@/hooks/use-auth";
import { getClients, type ClientInfo } from "@/app/actions/clients";
import { getArticulosByClients, type ArticuloInfo } from "@/app/actions/articulos";
import { getUsersList, type UserInfo } from "@/app/actions/users";
import { useFormPersistence } from "@/hooks/use-form-persistence";
import { saveForm } from "@/app/actions/save-form";
import { storage } from "@/lib/firebase";
import { ref, uploadString, getDownloadURL } from "firebase/storage";
import { optimizeImage } from "@/lib/image-optimizer";
import { getSubmissionById, type SubmissionResult } from "@/app/actions/consultar-formatos";
import { getStandardObservations, type StandardObservation } from "@/app/gestion-observaciones/actions";

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
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
    Loader2,
    Check,
    CalendarIcon,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RestoreDialog } from "@/components/app/restore-dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription as AlertDialogDesc, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger, } from "@/components/ui/alert-dialog";
import { Calendar } from "@/components/ui/calendar";


const productSchema = z.object({
  codigo: z.string().min(1, "El código es requerido."),
  descripcion: z.string().min(1, "La descripción es requerida."),
  cajas: z.coerce.number({required_error: "El No. de cajas es requerido.", invalid_type_error: "El No. de cajas es requerido."}).int().min(0, "El No. de Cajas debe ser 0 o mayor."),
  totalPaletas: z.coerce.number({required_error: "El Total Paletas es requerido.", invalid_type_error: "El Total Paletas es requerido."}).int("El Total Paletas debe ser un número entero.").min(0, "El total de paletas no puede ser negativo."),
  pesoBrutoKg: z.coerce.number({ required_error: "El peso bruto es requerido.", invalid_type_error: "Peso Bruto (kg) debe ser un número."})
    .min(0, "Peso Bruto (kg) debe ser un número no negativo."),
  pesoNetoKg: z.coerce.number({ required_error: "El peso neto es requerido.", invalid_type_error: "Peso Neto (kg) debe ser un número."})
    .min(0, "Peso Neto (kg) debe ser un número no negativo."),
  temperatura: z.preprocess(
    (val) => (val === "" || val === null ? null : val),
    z.coerce.number({ 
        required_error: "La temperatura es requerida.", 
        invalid_type_error: "La temperatura es requerida." 
    }).min(-99, "El valor debe estar entre -99 y 99.").max(99, "El valor debe estar entre -99 y 99.")
  ),
});

const observationSchema = z.object({
  type: z.string().min(1, "Debe seleccionar un tipo de observación."),
  customType: z.string().optional(),
  quantity: z.coerce.number({invalid_type_error: "La cantidad debe ser un número."}).min(0, "La cantidad no puede ser negativa.").optional(),
  quantityType: z.string().optional(),
  executedByGrupoRosales: z.boolean().default(false),
}).refine(data => {
    if (data.type === 'OTRAS OBSERVACIONES' && !data.customType?.trim()) {
        return false;
    }
    return true;
}, {
    message: "La descripción para 'OTRAS OBSERVACIONES' es obligatoria.",
    path: ['customType']
});

const formSchema = z.object({
  pedidoSislog: z.string()
    .min(1, "El pedido SISLOG es obligatorio.")
    .max(15, "El pedido SISLOG no puede exceder los 15 caracteres."),
  nombreCliente: z.string().min(1, "Seleccione un cliente."),
  fecha: z.date({ required_error: "La fecha es obligatoria." }),
  horaInicio: z.string().min(1, "La hora de inicio es obligatoria.").regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Formato de hora inválido (HH:MM)."),
  horaFin: z.string().min(1, "La hora de fin es obligatoria.").regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Formato de hora inválido (HH:MM)."),
  precinto: z.string()
    .min(1, "El precinto es obligatorio.")
    .max(40, "Máximo 40 caracteres."),
    documentoTransporte: z.string().max(15, "Máximo 15 caracteres.").optional(),
    facturaRemision: z.string().max(15, "Máximo 15 caracteres.").optional(),
  productos: z.array(productSchema).min(1, "Debe agregar al menos un producto."),
  nombreConductor: z.string().min(1, "El nombre del conductor es obligatorio."),
  cedulaConductor: z.string().min(1, "La cédula del conductor es obligatoria.").regex(/^[0-9]*$/, "La cédula solo puede contener números."),
  placa: z.string().min(1, "La placa es obligatoria.").regex(/^[A-Z]{3}[0-9]{3}$/, "Formato inválido. Deben ser 3 letras y 3 números (ej: ABC123)."),
  muelle: z.string().min(1, "Seleccione un muelle."),
  contenedor: z.string().min(1, "El contenedor es obligatorio.").refine(value => {
    const formatRegex = /^[A-Z]{4}[0-9]{7}$/;
    return value.toUpperCase() === 'N/A' || formatRegex.test(value.toUpperCase());
  }, {
    message: "Formato inválido. Debe ser 'N/A' o 4 letras y 7 números (ej: ABCD1234567)."
  }),
  setPoint: z.preprocess(
      (val) => (val === "" || val === null ? null : val),
      z.coerce.number({ invalid_type_error: "Set Point debe ser un número."})
        .min(-99, "El valor debe estar entre -99 y 99.").nullable()
  ),
  condicionesHigiene: z.enum(["limpio", "sucio"], { required_error: "Seleccione una condición." }),
  termoregistrador: z.enum(["si", "no"], { required_error: "Seleccione una opción." }),
  clienteRequiereTermoregistro: z.enum(["si", "no"], { required_error: "Seleccione una opción." }),
  observaciones: z.array(observationSchema).optional(),
  coordinador: z.string().min(1, "Seleccione un coordinador."),
  aplicaCuadrilla: z.enum(["si", "no"], { required_error: "Seleccione una opción para 'Operación Realizada por Cuadrilla'." }),
  operarioResponsable: z.string().optional(), // For admin editing
  tipoPedido: z.enum(['GENERICO', 'MAQUILA', 'TUNEL', 'INGRESO DE SALDO']).optional(),
  tipoEmpaqueMaquila: z.enum(['EMPAQUE DE SACOS', 'EMPAQUE DE CAJAS']).optional(),
  numeroOperariosCuadrilla: z.coerce.number().int().min(1, "Debe ser al menos 1.").optional(),
  unidadDeMedidaPrincipal: z.string().optional(),
}).refine((data) => {
    return data.horaInicio !== data.horaFin;
}, {
    message: "La hora de fin no puede ser igual a la hora de inicio.",
    path: ["horaFin"],
}).refine(data => {
    if (!data.tipoPedido) {
        return false;
    }
    return true;
}, {
    message: "El tipo de pedido es obligatorio.",
    path: ['tipoPedido'],
}).refine(data => {
    if (data.tipoPedido !== 'MAQUILA') return true;
    return !!data.tipoEmpaqueMaquila;
}, {
    message: "El tipo de empaque es obligatorio para maquila.",
    path: ['tipoEmpaqueMaquila'],
}).refine(data => {
    if (data.aplicaCuadrilla !== 'si' || data.tipoPedido !== 'MAQUILA') return true;
    return data.numeroOperariosCuadrilla !== undefined && data.numeroOperariosCuadrilla > 0;
}, {
    message: "El número de operarios es obligatorio.",
    path: ['numeroOperariosCuadrilla'],
});

type FormValues = z.infer<typeof formSchema>;

const originalDefaultValues: FormValues = {
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
  setPoint: null,
  condicionesHigiene: undefined,
  termoregistrador: undefined,
  clienteRequiereTermoregistro: undefined,
  observaciones: [],
  coordinador: "",
  aplicaCuadrilla: undefined,
  operarioResponsable: undefined,
  tipoPedido: undefined,
  tipoEmpaqueMaquila: undefined,
  numeroOperariosCuadrilla: undefined,
  unidadDeMedidaPrincipal: "PALETA",
};

// Mock data for selects
const muelles = ["Muelle 1", "Muelle 2", "Muelle 3", "Muelle 4", "Muelle 5", "Muelle 6"];
const coordinadores = ["Cristian Acuña", "Sergio Padilla"];


// Attachment Constants
const MAX_ATTACHMENTS = 30;
const MAX_TOTAL_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

function getByteSizeFromBase64(base64: string): number {
    return base64.length * (3 / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
}


export default function FixedWeightFormComponent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const operation = searchParams.get("operation") || "operación";
  const submissionId = searchParams.get("id");

  const { toast } = useToast();
  const { user, displayName, permissions } = useAuth();
  
  const [clientes, setClientes] = useState<ClientInfo[]>([]);
  const [allUsers, setAllUsers] = useState<UserInfo[]>([]);
  
  const [articulos, setArticulos] = useState<ArticuloInfo[]>([]);
  const [isLoadingArticulos, setIsLoadingArticulos] = useState(false);
  
  const [isProductDialogOpen, setProductDialogOpen] = useState(false);
  const [productDialogIndex, setProductDialogIndex] = useState<number | null>(null);
  const [isClientDialogOpen, setClientDialogOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState("");

  const [attachments, setAttachments] = useState<string[]>([]);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDeleteAllAlertOpen, setDeleteAllAlertOpen] = useState(false);
  const [isDiscardAlertOpen, setDiscardAlertOpen] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingForm, setIsLoadingForm] = useState(!!submissionId);
  const [originalSubmission, setOriginalSubmission] = useState<SubmissionResult | null>(null);
  const [standardObservations, setStandardObservations] = useState<StandardObservation[]>([]);
  const [isObservationDialogOpen, setObservationDialogOpen] = useState(false);
  const [observationDialogIndex, setObservationDialogIndex] = useState<number | null>(null);

  const isAdmin = permissions.canManageSessions;

  const filteredClients = useMemo(() => {
    if (!clientSearch) return clientes;
    return clientes.filter(c => c.razonSocial.toLowerCase().includes(clientSearch.toLowerCase()));
  }, [clientSearch, clientes]);
  
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: originalDefaultValues,
    mode: "onSubmit",
    reValidateMode: "onSubmit"
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "productos",
  });

  const { fields: observationFields, append: appendObservation, remove: removeObservation } = useFieldArray({
    control: form.control,
    name: "observaciones",
  });

  const productos = useWatch({
    control: form.control,
    name: 'productos',
    defaultValue: [],
  });
  
  const watchedTipoPedido = useWatch({ control: form.control, name: 'tipoPedido' });
  const watchedAplicaCuadrilla = useWatch({ control: form.control, name: 'aplicaCuadrilla' });
  const watchedObservations = useWatch({ control: form.control, name: 'observaciones' });


  const isClientChangeDisabled = useMemo(() => {
    return productos.length > 1 || (productos.length === 1 && !!productos[0].descripcion);
  }, [productos]);

  const totalCajas = useMemo(() => {
    return (productos || []).reduce((acc, p) => acc + (Number(p.cajas) || 0), 0);
  }, [productos]);

  const totalPaletas = useMemo(() => {
    return Math.floor((productos || []).reduce((acc, p) => acc + (Number(p.totalPaletas) || 0), 0));
  }, [productos]);
  
  const totalPesoNetoKg = useMemo(() => {
      return (productos || []).reduce((acc, p) => acc + (Number(p.pesoNetoKg) || 0), 0);
  }, [productos]);
  
  const totalPesoBrutoKg = useMemo(() => {
      return (productos || []).reduce((acc, p) => acc + (Number(p.pesoBrutoKg) || 0), 0);
  }, [productos]);


  const formIdentifier = submissionId ? `fixed-weight-edit-${submissionId}` : `fixed-weight-${operation}`;
  const { isRestoreDialogOpen, onRestore, onDiscard: onDiscardFromHook, onOpenChange, clearDraft } = useFormPersistence(formIdentifier, form, originalDefaultValues, attachments, setAttachments, !!submissionId);

  const handleDiscard = () => {
    onDiscardFromHook(); // Clears storage via hook
    if (submissionId && originalSubmission) {
        // In edit mode, reset to the original data loaded from the DB
        const formData = originalSubmission.formData;
        if (formData.fecha && typeof formData.fecha === 'string') {
            formData.fecha = new Date(formData.fecha);
        }
        form.reset({
            ...originalDefaultValues,
            ...formData,
        });
        setAttachments(originalSubmission.attachmentUrls);
    } else {
        // In new form mode, reset to blank
        form.reset(originalDefaultValues);
        setAttachments([]);
    }
    setDiscardAlertOpen(false);
  };


  useEffect(() => {
    const fetchInitialData = async () => {
      const [clientList, obsList, userList] = await Promise.all([
        getClients(),
        getStandardObservations(),
        isAdmin ? getUsersList() : Promise.resolve([])
      ]);
      setClientes(clientList);
      setStandardObservations(obsList);
      if (isAdmin) {
          setAllUsers(userList);
      }
    };
    fetchInitialData();

    if (!submissionId) {
        form.reset({
            ...originalDefaultValues,
            productos: [ // Start with one empty product
                { codigo: '', descripcion: '', cajas: 0, totalPaletas: 0, pesoBrutoKg: 0, pesoNetoKg: 0, temperatura: null }
            ]
        });
    }
    window.scrollTo(0, 0);
  }, [submissionId, form, isAdmin]);

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
          let formData = submission.formData;
          
          // Ensure all optional fields have a default value to prevent uncontrolled -> controlled error
          const sanitizedFormData = {
              ...originalDefaultValues,
              ...formData,
              documentoTransporte: formData.documentoTransporte ?? "",
              facturaRemision: formData.facturaRemision ?? "",
              contenedor: formData.contenedor ?? '',
              setPoint: formData.setPoint ?? null,
              observaciones: formData.observaciones ?? [],
              aplicaCuadrilla: formData.aplicaCuadrilla ?? undefined,
              tipoPedido: formData.tipoPedido ?? undefined,
              tipoEmpaqueMaquila: formData.tipoEmpaqueMaquila ?? undefined,
              numeroOperariosCuadrilla: formData.numeroOperariosCuadrilla ?? undefined,
              operarioResponsable: submission.userId, // Default to original user
              unidadDeMedidaPrincipal: formData.unidadDeMedidaPrincipal ?? 'PALETA',
              productos: (formData.productos || []).map((p: any) => ({
                  ...originalDefaultValues.productos[0],
                  ...p,
                  // Handle old 'cantidadKg' field for backward compatibility
                  pesoNetoKg: p.pesoNetoKg ?? p.cantidadKg ?? 0,
                  pesoBrutoKg: p.pesoBrutoKg ?? 0,
                  temperatura: p.temperatura ?? null,
              })),
          };

          // Convert date string back to Date object for the form
          if (sanitizedFormData.fecha && typeof sanitizedFormData.fecha === 'string') {
            sanitizedFormData.fecha = new Date(sanitizedFormData.fecha);
          }
          form.reset(sanitizedFormData);
          // Set attachments, which are URLs in this case
          setAttachments(submission.attachmentUrls);

          // Pre-load articulos for the client
          if (sanitizedFormData.nombreCliente) {
            setIsLoadingArticulos(true);
            const fetchedArticulos = await getArticulosByClients([sanitizedFormData.nombreCliente]);
            setArticulos(fetchedArticulos);
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
  }, [submissionId, form, router, toast]);

  
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
        const files = Array.from(event.target.files);
        const imageFiles = files.filter(file => file.type.startsWith('image/'));
        
        if (imageFiles.length === 0) return;

        if (imageFiles.length !== files.length) {
            toast({
                variant: "destructive",
                title: "Archivos no válidos",
                description: "Por favor, seleccione solo archivos de imagen.",
            });
        }
        
        if (attachments.length + imageFiles.length > MAX_ATTACHMENTS) {
            toast({
                variant: "destructive",
                title: "Límite de archivos excedido",
                description: `No puede adjuntar más de ${MAX_ATTACHMENTS} archivos.`,
            });
            return;
        }

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
            
            const newImagesSize = optimizedImages.reduce((sum, base64) => sum + getByteSizeFromBase64(base64.split(',')[1]), 0);
            const existingImagesSize = attachments
                .filter(a => a.startsWith('data:image'))
                .reduce((sum, base64) => sum + getByteSizeFromBase64(base64.split(',')[1]), 0);

            if (existingImagesSize + newImagesSize > MAX_TOTAL_SIZE_BYTES) {
                 toast({
                    variant: "destructive",
                    title: "Límite de tamaño excedido",
                    description: `El tamaño total de los adjuntos no puede superar los ${MAX_TOTAL_SIZE_BYTES / 1024 / 1024} MB.`,
                });
                return;
            }
            
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
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        }
    }
  };

  const handleRemoveAttachment = (indexToRemove: number) => {
      setAttachments(prev => prev.filter((_, index) => index !== indexToRemove));
  };
  
  const handleRemoveAllAttachments = () => {
    setAttachments([]);
    setDeleteAllAlertOpen(false);
  };

  const handleOpenCamera = async () => {
      setIsCameraOpen(true);
  };
  
  const handleCapture = async () => {
    if (attachments.length >= MAX_ATTACHMENTS) {
        toast({
            variant: "destructive",
            title: "Límite de archivos excedido",
            description: `No puede adjuntar más de ${MAX_ATTACHMENTS} archivos.`,
        });
        handleCloseCamera();
        return;
    }

    if (videoRef.current && canvasRef.current) {
        const video = videoRef.current;
        const canvas = canvasRef.current;

        if (video.videoWidth === 0 || video.videoHeight === 0) {
            toast({
                variant: 'destructive',
                title: 'Error de Cámara',
                description: 'No se pudo obtener la imagen de la cámara. Por favor, intente de nuevo.',
            });
            handleCloseCamera();
            return;
        }

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

                const newImageSize = getByteSizeFromBase64(optimizedImage.split(',')[1]);
                const existingImagesSize = attachments
                    .filter(a => a.startsWith('data:image'))
                    .reduce((sum, base64) => sum + getByteSizeFromBase64(base64.split(',')[1]), 0);

                if (existingImagesSize + newImageSize > MAX_TOTAL_SIZE_BYTES) {
                    toast({
                        variant: "destructive",
                        title: "Límite de tamaño excedido",
                        description: `El tamaño total de los adjuntos no puede superar los ${MAX_TOTAL_SIZE_BYTES / 1024 / 1024} MB.`,
                    });
                    return;
                }

                setAttachments(prev => [...prev, ...optimizedImage]);
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
                const rearCameraConstraints = { video: { facingMode: { exact: "environment" } } };
                const anyCameraConstraints = { video: true };
                try {
                    stream = await navigator.mediaDevices.getUserMedia(rearCameraConstraints);
                    if (videoRef.current) {
                        videoRef.current.srcObject = stream;
                    }
                } catch (err) {
                    console.warn("Rear camera not available, trying any camera.", err);
                    try {
                       stream = await navigator.mediaDevices.getUserMedia(anyCameraConstraints);
                        if (videoRef.current) {
                            videoRef.current.srcObject = stream;
                        }
                    } catch (finalErr) {
                         console.error("Error accessing camera: ", finalErr);
                        toast({
                            variant: 'destructive',
                            title: 'Acceso a la cámara denegado',
                            description: 'Por favor, habilite los permisos de la cámara en la configuración de su navegador.',
                        });
                        setIsCameraOpen(false);
                    }
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


  async function onSubmit(data: FormValues) {
    if (!user || !storage) {
        toast({ variant: "destructive", title: "Error", description: "Debe iniciar sesión para guardar el formato." });
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

        const isUpdating = !!submissionId;
        
        // Define who the editor is (the person logged in)
        const editor = { id: user.uid, displayName: displayName || 'N/A' };

        // Define who the responsible user is
        let responsibleUser = { id: editor.id, displayName: editor.displayName };
        if (isUpdating && isAdmin && data.operarioResponsable) {
            const selectedUser = allUsers.find(u => u.uid === data.operarioResponsable);
            if (selectedUser) {
                responsibleUser = { id: selectedUser.uid, displayName: selectedUser.displayName };
            }
        } else if (isUpdating && originalSubmission) {
            responsibleUser = { id: originalSubmission.userId, displayName: originalSubmission.userDisplayName };
        }
        
        const result = await saveForm({
            formData: data,
            formType: `fixed-weight-${operation}`,
            attachmentUrls: finalAttachmentUrls,
            responsibleUser: responsibleUser,
            editor: editor,
            createdAt: originalSubmission?.createdAt,
        }, submissionId ?? undefined);

        if (result.success) {
            toast({ title: "Formato Guardado", description: `El formato ha sido ${submissionId ? 'actualizado' : 'guardado'} correctamente.` });
            await clearDraft(!!submissionId);
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
  
  const handleClientSelection = async (clientName: string) => {
      form.setValue('nombreCliente', clientName);
      setClientDialogOpen(false);
      setClientSearch('');
  
      // Reset dependent fields
      form.setValue('productos', [{ codigo: '', descripcion: '', cajas: 0, totalPaletas: 0, pesoBrutoKg: 0, pesoNetoKg: 0, temperatura: null }]);
      setArticulos([]);
  };

  const handleProductDialogOpening = async (index: number) => {
      setProductDialogIndex(index);
      const clientName = form.getValues('nombreCliente');
      if (!clientName) {
          toast({ variant: 'destructive', title: 'Error', description: 'Por favor, seleccione un cliente primero.' });
          return;
      }
      setIsLoadingArticulos(true);
      setProductDialogOpen(true);
      try {
          const fetchedArticulos = await getArticulosByClients([clientName]);
          setArticulos(fetchedArticulos);
      } catch (error) {
          toast({ variant: "destructive", title: "Error", description: "No se pudieron cargar los productos." });
          setProductDialogOpen(false);
      } finally {
          setIsLoadingArticulos(false);
      }
  };

  const handleObservationDialogOpening = (index: number) => {
    setObservationDialogIndex(index);
    setObservationDialogOpen(true);
  };


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
        onDiscard={handleDiscard}
      />
      <ProductSelectorDialog
        open={isProductDialogOpen}
        onOpenChange={setProductDialogOpen}
        articulos={articulos}
        isLoading={isLoadingArticulos}
        clientSelected={!!form.getValues('nombreCliente')}
        onSelect={(articulo) => {
            if (productDialogIndex !== null) {
                form.setValue(`productos.${productDialogIndex}.descripcion`, articulo.denominacionArticulo);
                form.setValue(`productos.${productDialogIndex}.codigo`, articulo.codigoProducto);
            }
        }}
      />
      <ObservationSelectorDialog
        open={isObservationDialogOpen}
        onOpenChange={setObservationDialogOpen}
        standardObservations={standardObservations}
        onSelect={(obs) => {
            if (observationDialogIndex !== null) {
                form.setValue(`observaciones.${observationDialogIndex}.type`, obs.name);
                form.setValue(`observaciones.${observationDialogIndex}.quantityType`, obs.quantityType);
            }
        }}
       />
      <div className="max-w-6xl mx-auto">
        <header className="mb-6 md:mb-8">
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
                        <FileText className="h-7 w-7 md:h-8 md:w-8 text-primary" />
                        <h1 className="text-xl md:text-2xl font-bold text-primary">{title}</h1>
                    </div>
                    <p className="text-xs md:text-sm text-gray-500">Complete todos los campos requeridos para registrar la operación.</p>
                </div>
            </div>
        </header>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="unidadDeMedidaPrincipal"
              render={({ field }) => <input type="hidden" {...field} />}
            />
            {/* General Info Card */}
            <Card>
              <CardHeader>
                <CardTitle>Información General</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <FormField control={form.control} name="pedidoSislog" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Pedido SISLOG</FormLabel>
                      <FormControl><Input placeholder="Máximo 15 caracteres" {...field} type="text" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}/>
                  <FormField
                      control={form.control}
                      name="nombreCliente"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>Nombre del Cliente</FormLabel>
                            <Dialog open={isClientDialogOpen} onOpenChange={(isOpen) => {
                                if (!isOpen) setClientSearch("");
                                setClientDialogOpen(isOpen);
                            }}>
                                <DialogTrigger asChild>
                                    <Button
                                        variant="outline"
                                        className="w-full justify-between text-left font-normal"
                                        disabled={isClientChangeDisabled}
                                    >
                                        {field.value || "Seleccione un cliente..."}
                                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-[425px]">
                                    <DialogHeader>
                                        <DialogTitle>Seleccionar Cliente</DialogTitle>
                                        <DialogDescription>Busque y seleccione un cliente de la lista. Esto cargará los productos asociados.</DialogDescription>
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
                                                        onClick={() => handleClientSelection(cliente.razonSocial)}
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
                             {isClientChangeDisabled && (
                                <FormDescription>
                                  Para cambiar de cliente, elimine todos los ítems.
                                </FormDescription>
                              )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="fecha"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Fecha</FormLabel>
                          {isAdmin ? (
                            <Popover>
                              <PopoverTrigger asChild>
                                <FormControl>
                                  <Button
                                    variant={"outline"}
                                    className={cn(
                                      "w-full pl-3 text-left font-normal",
                                      !field.value && "text-muted-foreground"
                                    )}
                                  >
                                    {field.value ? (
                                      format(field.value, "PPP", { locale: es })
                                    ) : (
                                      <span>Seleccione una fecha</span>
                                    )}
                                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                  </Button>
                                </FormControl>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                  mode="single"
                                  selected={field.value}
                                  onSelect={field.onChange}
                                  initialFocus
                                />
                              </PopoverContent>
                            </Popover>
                          ) : (
                            <FormControl>
                              <Input
                                disabled
                                value={field.value ? format(field.value, "dd/MM/yyyy") : ""}
                              />
                            </FormControl>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
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
                        <FormLabel>Doc. Transp.</FormLabel>
                        <FormControl><Input placeholder="Máx 15 caracteres" {...field} value={field.value ?? ''} /></FormControl>
                        <FormMessage />
                    </FormItem>
                    )}/>
                    
                    <FormField
                      control={form.control}
                      name="facturaRemision"
                      render={({ field }) => (
                        <FormItem
                          className={cn(
                            "lg:col-span-1"
                          )}
                        >
                          <FormLabel>Factura/Remisión</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Máx 15 caracteres"
                              {...field}
                              value={field.value ?? ''}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {operation === 'recepcion' ? (
                        <>
                            <FormField
                                control={form.control}
                                name="tipoPedido"
                                render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Tipo de Pedido</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value}>
                                    <FormControl>
                                        <SelectTrigger>
                                        <SelectValue placeholder="Seleccione un tipo de pedido" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="GENERICO">GENERICO</SelectItem>
                                        <SelectItem value="MAQUILA">MAQUILA</SelectItem>
                                        <SelectItem value="TUNEL">TUNEL</SelectItem>
                                        <SelectItem value="INGRESO DE SALDO">INGRESO DE SALDO</SelectItem>
                                    </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                                )}
                            />
                            {watchedTipoPedido === 'MAQUILA' && (
                                <FormField
                                control={form.control}
                                name="tipoEmpaqueMaquila"
                                render={({ field }) => (
                                    <FormItem>
                                    <FormLabel>Tipo de Empaque (Maquila)</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value}>
                                        <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Seleccione tipo de empaque" />
                                        </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                        <SelectItem value="EMPAQUE DE SACOS">EMPAQUE DE SACOS</SelectItem>
                                        <SelectItem value="EMPAQUE DE CAJAS">EMPAQUE DE CAJAS</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                    </FormItem>
                                )}
                                />
                            )}
                        </>
                    ) : (
                         <FormField
                            control={form.control}
                            name="tipoPedido"
                            render={({ field }) => (
                            <FormItem>
                                <FormLabel>Tipo de Pedido</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                    <SelectTrigger>
                                    <SelectValue placeholder="Seleccione un tipo de pedido" />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    <SelectItem value="GENERICO">GENERICO</SelectItem>
                                    <SelectItem value="MAQUILA">MAQUILA</SelectItem>
                                    <SelectItem value="TUNEL">TUNEL</SelectItem>
                                </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                            )}
                        />
                    )}
                     {operation === 'despacho' && watchedTipoPedido === 'MAQUILA' && (
                        <FormField
                        control={form.control}
                        name="tipoEmpaqueMaquila"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel>Tipo de Empaque (Maquila)</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                <SelectTrigger>
                                    <SelectValue placeholder="Seleccione tipo de empaque" />
                                </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                <SelectItem value="EMPAQUE DE SACOS">EMPAQUE DE SACOS</SelectItem>
                                <SelectItem value="EMPAQUE DE CAJAS">EMPAQUE DE CAJAS</SelectItem>
                                </SelectContent>
                            </Select>
                            <FormMessage />
                            </FormItem>
                        )}
                        />
                    )}
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
                            <Button type="button" variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" onClick={() => remove(index)}>
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <FormField control={form.control} name={`productos.${index}.codigo`} render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Código</FormLabel>
                                         <Button
                                          type="button"
                                          variant="outline"
                                          className="w-full justify-between text-left font-normal h-10"
                                          onClick={() => handleProductDialogOpening(index)}
                                        >
                                          <span className="truncate">{field.value || "Seleccionar código..."}</span>
                                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                        <FormMessage />
                                    </FormItem>
                                )}/>
                                <FormField control={form.control} name={`productos.${index}.descripcion`} render={({ field }) => (
                                    <FormItem className="md:col-span-2">
                                        <FormLabel>Descripción del Producto</FormLabel>
                                        <Button
                                          type="button"
                                          variant="outline"
                                          className="w-full justify-between text-left font-normal h-10"
                                          onClick={() => handleProductDialogOpening(index)}
                                        >
                                          <span className="truncate">{field.value || "Seleccionar producto..."}</span>
                                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                        <FormMessage />
                                    </FormItem>
                                )}/>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                <FormField control={form.control} name={`productos.${index}.cajas`} render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>No. de Cajas</FormLabel>
                                        <FormControl><Input type="text" inputMode="numeric" placeholder="0" {...field} onChange={e => field.onChange(e.target.value)} value={field.value ?? ''} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}/>
                                <FormField control={form.control} name={`productos.${index}.totalPaletas`} render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Total Paletas</FormLabel>
                                        <FormControl><Input type="text" inputMode="numeric" pattern="[0-9]*" min="0" placeholder="0" {...field} onChange={e => field.onChange(e.target.value)} value={field.value ?? ''} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}/>
                                <FormField control={form.control} name={`productos.${index}.pesoBrutoKg`} render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Peso Bruto (kg)</FormLabel>
                                        <FormControl><Input type="text" inputMode="decimal" step="0.01" min="0" placeholder="0.00" {...field} onChange={e => field.onChange(e.target.value === '' ? null : e.target.value)} value={field.value ?? ''} /></FormControl>
                                        <FormDescription>Si no aplica, ingrese 0.</FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}/>
                                <FormField control={form.control} name={`productos.${index}.pesoNetoKg`} render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Peso Neto (kg)</FormLabel>
                                        <FormControl><Input type="text" inputMode="decimal" step="0.01" min="0" placeholder="0.00" {...field} onChange={e => field.onChange(e.target.value === '' ? null : e.target.value)} value={field.value ?? ''} /></FormControl>
                                        <FormDescription>Si no aplica, ingrese 0.</FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}/>
                                <FormField control={form.control} name={`productos.${index}.temperatura`} render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Temperatura (°C)</FormLabel>
                                        <FormControl><Input type="text" inputMode="decimal" placeholder="0" {...field} onChange={e => field.onChange(e.target.value)} value={field.value ?? ''} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}/>
                            </div>
                        </div>
                    </div>
                ))}
                <Button type="button" variant="outline" onClick={() => append({ codigo: '', descripcion: '', cajas: 0, totalPaletas: 0, pesoBrutoKg: 0, pesoNetoKg: 0, temperatura: null })}>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Agregar Producto
                </Button>

                <Separator className="my-4" />

                <div className="flex justify-end gap-x-6 gap-y-4 flex-wrap">
                    <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">Totales Cajas</span>
                        <Input className="w-28" disabled value={totalCajas} />
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">Totales Paletas</span>
                        <Input className="w-28" disabled value={totalPaletas} />
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">Total Peso Bruto (kg)</span>
                        <Input className="w-28" disabled value={totalPesoBrutoKg % 1 === 0 ? totalPesoBrutoKg : totalPesoBrutoKg.toFixed(2)} />
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">Total Peso Neto (kg)</span>
                        <Input className="w-28" disabled value={totalPesoNetoKg % 1 === 0 ? totalPesoNetoKg : totalPesoNetoKg.toFixed(2)} />
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
                        <FormItem><FormLabel>Cédula Conductor</FormLabel><FormControl><Input placeholder="Cédula del conductor" {...field} type="text" inputMode="numeric" pattern="[0-9]*" /></FormControl><FormMessage /></FormItem>
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
                        <FormItem><FormLabel>Muelle</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Seleccione un muelle" /></SelectTrigger></FormControl><SelectContent>{muelles.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                    )}/>
                    <FormField control={form.control} name="contenedor" render={({ field }) => (
                        <FormItem><FormLabel>Contenedor</FormLabel><FormControl><Input
                                    placeholder="ABCD1234567 o N/A"
                                    {...field}
                                    onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                                    value={field.value ?? ''}
                                /></FormControl><FormMessage /></FormItem>
                    )}/>
                    <FormField control={form.control} name="setPoint" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Set Point (°C)</FormLabel>
                            <FormControl>
                                <Input type="text" inputMode="decimal" placeholder="0" {...field} onChange={e => field.onChange(e.target.value === '' ? null : e.target.value)} value={field.value ?? ''} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}/>
                    <FormField control={form.control} name="condicionesHigiene" render={({ field }) => (
                        <FormItem className="space-y-3"><FormLabel>Condiciones de Higiene</FormLabel><FormControl><RadioGroup onValueChange={field.onChange} value={field.value} className="flex gap-4"><FormItem className="flex items-center space-x-2"><RadioGroupItem value="limpio" id="limpio" /><Label htmlFor="limpio">Limpio</Label></FormItem><FormItem className="flex items-center space-x-2"><RadioGroupItem value="sucio" id="sucio" /><Label htmlFor="sucio">Sucio</Label></FormItem></RadioGroup></FormControl><FormMessage /></FormItem>
                    )}/>
                    <FormField control={form.control} name="termoregistrador" render={({ field }) => (
                        <FormItem className="space-y-3"><FormLabel>Termoregistrador</FormLabel><FormControl><RadioGroup onValueChange={field.onChange} value={field.value} className="flex gap-4"><FormItem className="flex items-center space-x-2"><RadioGroupItem value="si" id="termo-si" /><Label htmlFor="termo-si">Sí</Label></FormItem><FormItem className="flex items-center space-x-2"><RadioGroupItem value="no" id="termo-no" /><Label htmlFor="termo-no">No</Label></FormItem></RadioGroup></FormControl><FormMessage /></FormItem>
                    )}/>
                    <FormField control={form.control} name="clienteRequiereTermoregistro" render={({ field }) => (
                        <FormItem className="space-y-3"><FormLabel>Cliente Requiere Termoregistro</FormLabel><FormControl><RadioGroup onValueChange={field.onChange} value={field.value} className="flex gap-4"><FormItem className="flex items-center space-x-2"><RadioGroupItem value="si" id="req-termo-si" /><Label htmlFor="req-termo-si">Sí</Label></FormItem><FormItem className="flex items-center space-x-2"><RadioGroupItem value="no" id="req-termo-no" /><Label htmlFor="req-termo-no">No</Label></FormItem></RadioGroup></FormControl><FormMessage /></FormItem>
                    )}/>
                </CardContent>
            </Card>

             {/* Observations Card */}
            <Card>
                <CardHeader>
                    <CardTitle>Observaciones</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {observationFields.map((field, index) => {
                       const selectedObservation = watchedObservations?.[index];
                       const stdObsData = standardObservations.find(obs => obs.name === selectedObservation?.type);
                       const isOtherType = selectedObservation?.type === 'OTRAS OBSERVACIONES';
                       const isRestibado = selectedObservation?.type === 'RESTIBADO';
                       
                       return (
                        <div key={field.id} className="p-4 border rounded-lg relative bg-white space-y-4">
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="absolute top-2 right-2 text-destructive hover:bg-destructive/10"
                                onClick={() => removeObservation(index)}
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                                <FormField
                                    control={form.control}
                                    name={`observaciones.${index}.type`}
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>Tipo de Observación</FormLabel>
                                         <Button
                                            type="button"
                                            variant="outline"
                                            className="w-full justify-between text-left font-normal h-10"
                                            onClick={() => handleObservationDialogOpening(index)}
                                            >
                                            <span className="truncate">{field.value || "Seleccionar observación..."}</span>
                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                />
                                {isOtherType ? (
                                    <FormField
                                        control={form.control}
                                        name={`observaciones.${index}.customType`}
                                        render={({ field }) => (
                                            <FormItem className="lg:col-span-3">
                                                <FormLabel>Descripción</FormLabel>
                                                <FormControl>
                                                    <Textarea 
                                                        placeholder="Describa la observación" 
                                                        {...field}
                                                        onChange={(e) => field.onChange(e.target.value.toUpperCase())} 
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                ) : (
                                <>
                                    <FormField
                                        control={form.control}
                                        name={`observaciones.${index}.quantity`}
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Cantidad ({stdObsData?.quantityType || 'N/A'})</FormLabel>
                                                <FormControl>
                                                    <Input type="number" placeholder="0" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    {isRestibado && (
                                        <FormField
                                            control={form.control}
                                            name={`observaciones.${index}.executedByGrupoRosales`}
                                            render={({ field }) => (
                                                <FormItem className="flex flex-row items-end space-x-2 pb-2">
                                                    <FormControl>
                                                        <Checkbox
                                                            checked={field.value}
                                                            onCheckedChange={field.onChange}
                                                        />
                                                    </FormControl>
                                                    <div className="space-y-1 leading-none">
                                                        <FormLabel className="uppercase">
                                                            EJECUTADO POR CUADRILLA
                                                        </FormLabel>
                                                    </div>
                                                </FormItem>
                                            )}
                                        />
                                    )}
                                </>
                                )}
                            </div>
                        </div>
                       )
                    })}
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => appendObservation({ type: '', quantity: 0, executedByGrupoRosales: false, customType: '', quantityType: '' })}
                    >
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Agregar Observación
                    </Button>
                </CardContent>
            </Card>

             {/* Responsible Person Card */}
             <Card>
                <CardHeader><CardTitle>Responsables de la Operación</CardTitle></CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-10 gap-4 items-center">
                        <FormField control={form.control} name="coordinador" render={({ field }) => (
                            <FormItem className="lg:col-span-2"><FormLabel>Coordinador Responsable</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Seleccione un coordinador" /></SelectTrigger></FormControl><SelectContent>{coordinadores.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                        )}/>
                        
                        {submissionId && isAdmin ? (
                             <FormField control={form.control} name="operarioResponsable" render={({ field }) => (
                                <FormItem className="lg:col-span-2">
                                    <FormLabel>Operario Responsable</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value}>
                                        <FormControl><SelectTrigger><SelectValue placeholder="Seleccione un operario" /></SelectTrigger></FormControl>
                                        <SelectContent>
                                            {allUsers.map(u => <SelectItem key={u.uid} value={u.uid}>{u.displayName}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}/>
                        ) : (
                            <FormItem className="lg:col-span-2">
                                <FormLabel>Operario Responsable</FormLabel>
                                <FormControl><Input disabled value={submissionId ? originalSubmission?.userDisplayName : displayName || ''} /></FormControl>
                            </FormItem>
                        )}

                        <FormField
                            control={form.control}
                            name="aplicaCuadrilla"
                            render={({ field }) => (
                                <FormItem className="space-y-1 lg:col-span-4">
                                    <FormLabel>Operación Realizada por Cuadrilla</FormLabel>
                                    <FormControl>
                                        <RadioGroup onValueChange={field.onChange} value={field.value} className="flex gap-4 pt-2">
                                            <FormItem className="flex items-center space-x-2"><RadioGroupItem value="si" id="cuadrilla-si" /><Label htmlFor="cuadrilla-si">Sí</Label></FormItem>
                                            <FormItem className="flex items-center space-x-2"><RadioGroupItem value="no" id="cuadrilla-no" /><Label htmlFor="cuadrilla-no">No</Label></FormItem>
                                        </RadioGroup>
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        {watchedAplicaCuadrilla === 'si' && watchedTipoPedido === 'MAQUILA' && (
                            <FormField
                                control={form.control}
                                name="numeroOperariosCuadrilla"
                                render={({ field }) => (
                                    <FormItem className="lg:col-span-2">
                                    <FormLabel>No. de Operarios</FormLabel>
                                    <FormControl>
                                        <Input 
                                            type="number"
                                            min="1"
                                            placeholder="Ej: 3" 
                                            {...field} 
                                            value={field.value ?? ''}
                                            onChange={e => field.onChange(parseInt(e.target.value, 10) || undefined)}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                    </FormItem>
                                )}
                            />
                        )}
                    </div>
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
                            <p className="text-xs text-gray-500">Max. de 30 imágenes / 10MB Total</p>
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
                            <div className="flex justify-between items-center mb-2">
                                <h4 className="text-sm font-medium">Archivos Adjuntos ({attachments.length}/{MAX_ATTACHMENTS}):</h4>
                                <AlertDialog open={isDeleteAllAlertOpen} onOpenChange={setDeleteAllAlertOpen}>
                                    <AlertDialogTrigger asChild>
                                        <Button type="button" variant="outline" size="sm" className="text-destructive hover:text-destructive border-destructive/50 hover:bg-destructive/10">
                                            <Trash2 className="mr-2 h-3 w-3" />
                                            Eliminar Todos
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>¿Está seguro de eliminar todos los anexos?</AlertDialogTitle>
                                            <AlertDialogDesc>
                                                Esta acción no se puede deshacer. Se eliminarán permanentemente todos los archivos adjuntos.
                                            </AlertDialogDesc>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                            <AlertDialogAction onClick={handleRemoveAllAttachments} className="bg-destructive hover:bg-destructive/90">
                                                Eliminar Todos
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                                {attachments.map((src, index) => (
                                    <div key={index} className="relative group aspect-square">
                                        <Image src={src} alt={`Anexo ${index + 1}`} fill className="rounded-md object-cover" />
                                        <Button
                                            type="button"
                                            variant="destructive"
                                            size="icon"
                                            className="absolute top-1 right-1 h-6 w-6"
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
            
            <footer className="flex flex-col sm:flex-row items-center justify-end gap-4 pt-4">
                <Button type="button" variant="outline" onClick={() => setDiscardAlertOpen(true)} className="w-full sm:w-auto">
                    <RotateCcw className="mr-2 h-4 w-4"/>
                    Limpiar Formato
                </Button>
                <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
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
                  <DialogDescription>Apunte la cámara y capture una imagen para adjuntarla al formulario.</DialogDescription>
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
      
      <AlertDialog open={isDiscardAlertOpen} onOpenChange={setDiscardAlertOpen}>
          <AlertDialogContent>
              <AlertDialogHeader>
                  <AlertDialogTitle>¿Está seguro que desea limpiar el formato?</AlertDialogTitle>
                  <AlertDialogDesc>
                      Esta acción no se puede deshacer. Se eliminará toda la información que ha ingresado en el formato.
                  </AlertDialogDesc>
              </AlertDialogHeader>
              <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDiscard} className="bg-destructive hover:bg-destructive/90">Limpiar Formato</AlertDialogAction>
              </AlertDialogFooter>
          </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ObservationSelectorDialog({
    open,
    onOpenChange,
    standardObservations,
    onSelect,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    standardObservations: StandardObservation[];
    onSelect: (observation: { name: string, quantityType?: string }) => void;
}) {
    const [search, setSearch] = useState("");

    const allObservations = useMemo(() => [
        ...standardObservations,
        { id: 'OTRAS', name: 'OTRAS OBSERVACIONES', quantityType: '' }
    ], [standardObservations]);

    const filteredObservations = useMemo(() => {
        if (!search) return allObservations;
        return allObservations.filter(obs => obs.name.toLowerCase().includes(search.toLowerCase()));
    }, [search, allObservations]);

    useEffect(() => {
        if (!open) {
            setSearch("");
        }
    }, [open]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Seleccionar Tipo de Observación</DialogTitle>
                    <DialogDescription>Busque y seleccione un tipo de la lista.</DialogDescription>
                </DialogHeader>
                <Input
                    placeholder="Buscar observación..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="my-4"
                />
                <ScrollArea className="h-72">
                    <div className="space-y-1">
                        {filteredObservations.map((obs) => (
                            <Button
                                key={obs.id}
                                variant="ghost"
                                className="w-full justify-start"
                                onClick={() => {
                                    onSelect({ name: obs.name, quantityType: obs.quantityType });
                                    onOpenChange(false);
                                }}
                            >
                                {obs.name}
                            </Button>
                        ))}
                        {filteredObservations.length === 0 && <p className="text-center text-sm text-muted-foreground">No se encontró la observación.</p>}
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
}

// Component for the product selector dialog
function ProductSelectorDialog({
    open,
    onOpenChange,
    articulos,
    isLoading,
    clientSelected,
    onSelect,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    articulos: ArticuloInfo[];
    isLoading: boolean;
    clientSelected: boolean;
    onSelect: (articulo: ArticuloInfo) => void;
}) {
    const [search, setSearch] = useState("");

    const filteredArticulos = useMemo(() => {
        if (!search) return articulos;
        return articulos.filter(a => a.denominacionArticulo.toLowerCase().includes(search.toLowerCase()) || a.codigoProducto.toLowerCase().includes(search.toLowerCase()));
    }, [search, articulos]);
    
    useEffect(() => {
        if (!open) {
            setSearch("");
        }
    }, [open]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Seleccionar Producto</DialogTitle>
                    <DialogDescription>Busque y seleccione un producto de la lista del cliente.</DialogDescription>
                </DialogHeader>
                {!clientSelected ? (
                    <div className="p-4 text-center text-muted-foreground">Debe escoger primero un cliente.</div>
                ) : (
                    <>
                        <Input
                            placeholder="Buscar producto por código o descripción..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="mb-4"
                        />
                        <ScrollArea className="h-72">
                            <div className="space-y-1">
                                {isLoading && <p className="text-center text-sm text-muted-foreground">Cargando...</p>}
                                {!isLoading && filteredArticulos.length === 0 && <p className="text-center text-sm text-muted-foreground">No se encontraron productos.</p>}
                                {filteredArticulos.map((p, i) => (
                                    <Button
                                        key={`${p.id}-${i}`}
                                        variant="ghost"
                                        className="w-full justify-start h-auto text-wrap"
                                        onClick={() => {
                                            onSelect(p);
                                            onOpenChange(false);
                                        }}
                                    >
                                        <div className="flex flex-col items-start">
                                            <span>{p.denominacionArticulo}</span>
                                            <span className="text-xs text-muted-foreground">{p.codigoProducto}</span>
                                        </div>
                                    </Button>
                                ))}
                            </div>
                        </ScrollArea>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
