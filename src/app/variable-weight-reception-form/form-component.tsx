
"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useForm, useFieldArray, useWatch, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import Image from "next/image";
import { useAuth } from "@/hooks/use-auth";
import { getClients, type ClientInfo } from "@/app/actions/clients";
import { getArticulosByClients } from "@/app/actions/articulos";
import { useFormPersistence } from "@/hooks/use-form-persistence";
import { saveForm } from "@/app/actions/save-form";
import { storage } from "@/lib/firebase";
import { ref, uploadString, getDownloadURL } from "firebase/storage";
import { optimizeImage } from "@/lib/image-optimizer";
import { getSubmissionById, type SubmissionResult } from "@/app/actions/consultar-formatos";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
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
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
    ArrowLeft,
    Trash2,
    PlusCircle,
    UploadCloud,
    Camera,
    Send,
    RotateCcw,
    FileText,
    Edit2,
    ChevronsUpDown,
    Loader2,
} from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RestoreDialog } from "@/components/app/restore-dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription as AlertDialogDesc, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";


const itemSchema = z.object({
    paleta: z.preprocess(
      (val) => (val === "" || val == null ? null : val),
      z.coerce.number({ required_error: "La paleta es requerida.", invalid_type_error: "La paleta es requerida."}).int().min(1, "El número de paleta debe ser 1 o mayor.").nullable()
    ),
    descripcion: z.string().min(1, "La descripción es requerida."),
    lote: z.string().min(1, "El lote es requerido.").max(15, "Máx 15 caracteres"),
    presentacion: z.string().min(1, "La presentación es requerida."),
    cantidadPorPaleta: z.preprocess(
      (val) => (val === "" || val == null ? null : val),
      z.coerce.number({ required_error: "La cantidad es requerida.", invalid_type_error: "La cantidad es requerida." }).int().min(0, "Debe ser un número no negativo.").nullable()
    ),
    pesoBruto: z.preprocess(
      (val) => (val === "" || val == null ? null : val),
      z.coerce.number({ required_error: "El peso bruto es requerido.", invalid_type_error: "El peso bruto es requerido." }).min(0, "Debe ser un número no negativo.").nullable()
    ),
    taraEstiba: z.preprocess(
      (val) => (val === "" || val == null ? null : val),
      z.coerce.number({ required_error: "La tara estiba es requerida.", invalid_type_error: "La tara estiba es requerida." }).min(0, "Debe ser un número no negativo.").nullable()
    ),
    taraCaja: z.preprocess(
      (val) => (val === "" || val == null ? null : val),
      z.coerce.number({ required_error: "La tara caja es requerida.", invalid_type_error: "La tara caja es requerida." }).min(0, "Debe ser un número no negativo.").nullable()
    ),
    totalTaraCaja: z.coerce.number().nullable(), 
    pesoNeto: z.coerce.number().nullable(), 
});
  
const tempSchema = z.preprocess(
    (val) => (val === "" || val === null ? null : val),
    z.coerce.number({ invalid_type_error: "Temperatura debe ser un número."})
      .min(-99, "El valor debe estar entre -99 y 99.")
      .max(99, "El valor debe estar entre -99 y 99.")
      .nullable()
);

const summaryItemSchema = z.object({
  descripcion: z.string(),
  temperatura1: tempSchema,
  temperatura2: tempSchema,
  temperatura3: tempSchema,
  totalPeso: z.number(),
  totalCantidad: z.number(),
  totalPaletas: z.number(),
});

const formSchema = z.object({
    pedidoSislog: z.string()
      .min(1, "El pedido SISLOG es obligatorio.")
      .max(15, "El pedido SISLOG no puede exceder los 15 caracteres."),
    cliente: z.string().min(1, "Seleccione un cliente."),
    fecha: z.date({ required_error: "La fecha es obligatoria." }),
    conductor: z.string()
      .min(1, "El nombre del conductor es obligatorio."),
    cedulaConductor: z.string()
      .min(1, "La cédula del conductor es obligatoria.").regex(/^[0-9]*$/, "La cédula solo puede contener números."),
    placa: z.string()
      .min(1, "La placa es obligatoria.")
      .regex(/^[A-Z]{3}[0-9]{3}$/, "Formato inválido. Deben ser 3 letras y 3 números (ej: ABC123)."),
    precinto: z.string().min(1, "El precinto es obligatorio."),
    setPoint: z.preprocess(
      (val) => (val === "" || val === null ? null : val),
      z.coerce.number({ invalid_type_error: "Set Point debe ser un número."})
        .min(-99, "El valor debe estar entre -99 y 99.").max(99, "El valor debe estar entre -99 y 99.").nullable()
    ),
    contenedor: z.string().min(1, "El contenedor es obligatorio.").max(20, "Máximo 20 caracteres."),
    items: z.array(itemSchema).min(1, "Debe agregar al menos un item."),
    summary: z.array(summaryItemSchema).nullable(),
    horaInicio: z.string().min(1, "La hora de inicio es obligatoria.").regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Formato de hora inválido (HH:MM)."),
    horaFin: z.string().min(1, "La hora de fin es obligatoria.").regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Formato de hora inválido (HH:MM)."),
    observaciones: z.string().max(250, "Máximo 250 caracteres.").nullable(),
    coordinador: z.string().min(1, "Seleccione un coordinador."),
}).refine((data) => {
    return data.horaInicio !== data.horaFin;
}, {
    message: "La hora de fin no puede ser igual a la de inicio.",
    path: ["horaFin"],
});

type FormValues = z.infer<typeof formSchema>;

const originalDefaultValues: FormValues = {
  pedidoSislog: "",
  cliente: "",
  fecha: new Date(),
  cedulaConductor: "",
  conductor: "",
  placa: "",
  precinto: "",
  setPoint: null,
  contenedor: "",
  items: [{ paleta: null, descripcion: "", lote: "", presentacion: "", cantidadPorPaleta: null, pesoBruto: null, taraEstiba: null, taraCaja: null, totalTaraCaja: null, pesoNeto: null }],
  summary: [],
  horaInicio: "",
  horaFin: "",
  observaciones: "",
  coordinador: "",
};


// Mock Data
const coordinadores = ["Cristian Acuña", "Sergio Padilla"];
const presentaciones = ["Cajas", "Sacos", "Canastillas"];

// Attachment Constants
const MAX_ATTACHMENTS = 30;
const MAX_TOTAL_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

function getByteSizeFromBase64(base64: string): number {
    // This is an approximation
    return base64.length * (3 / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
}


export default function VariableWeightReceptionFormComponent() {
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

  const [isProductDialogOpen, setProductDialogOpen] = useState(false);
  const [productDialogIndex, setProductDialogIndex] = useState<number | null>(null);

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
    name: "items",
  });
  
  const watchedItems = useWatch({ control: form.control, name: "items" });

  const isClientChangeDisabled = useMemo(() => {
    return watchedItems.length > 1 || (watchedItems.length === 1 && !!watchedItems[0].descripcion);
  }, [watchedItems]);
  
  useEffect(() => {
    if (!watchedItems) return;

    watchedItems.forEach((item, index) => {
        const cantidadPorPaleta = Number(item.cantidadPorPaleta) || 0;
        const taraCaja = Number(item.taraCaja) || 0;
        const pesoBruto = Number(item.pesoBruto) || 0;
        const taraEstiba = Number(item.taraEstiba) || 0;

        const calculatedTotalTaraCaja = cantidadPorPaleta * taraCaja;
        const calculatedPesoNeto = pesoBruto - taraEstiba - calculatedTotalTaraCaja;
      
        if (item.totalTaraCaja !== calculatedTotalTaraCaja) {
            form.setValue(`items.${index}.totalTaraCaja`, calculatedTotalTaraCaja, { shouldValidate: false });
        }
        if (item.pesoNeto !== calculatedPesoNeto) {
            form.setValue(`items.${index}.pesoNeto`, calculatedPesoNeto, { shouldValidate: false });
        }
    });
  }, [watchedItems, form]);

  const { fields: summaryFields } = useFieldArray({
    control: form.control,
    name: "summary"
  });

  const formIdentifier = submissionId ? `variable-weight-reception-edit-${submissionId}` : `variable-weight-${operation}`;
  const { isRestoreDialogOpen, onRestore, onDiscard: onDiscardFromHook, onOpenChange, clearDraft } = useFormPersistence(formIdentifier, form, originalDefaultValues, attachments, setAttachments, !!submissionId);

  const handleDiscard = () => {
    onDiscardFromHook(); // Clears storage via hook
    if (submissionId && originalSubmission) {
        // In edit mode, reset to the original data loaded from the DB
        const formData = originalSubmission.formData;
        if (formData.fecha && typeof formData.fecha === 'string') {
            formData.fecha = new Date(formData.fecha);
        }
        form.reset(formData);
        setAttachments(originalSubmission.attachmentUrls);
    } else {
        // In new form mode, reset to blank
        form.reset(originalDefaultValues);
        setAttachments([]);
    }
    setDiscardAlertOpen(false);
  };


  const calculatedSummaryForDisplay = useMemo(() => {
    const grouped = (watchedItems || []).reduce((acc, item) => {
        if (!item?.descripcion?.trim()) return acc;
        const desc = item.descripcion.trim();

        const cantidad = Number(item.cantidadPorPaleta) || 0;
        const pesoNeto = Number(item.pesoNeto) || 0;
        const paleta = Number(item.paleta);

        if (!acc[desc]) {
            acc[desc] = {
                descripcion: desc,
                totalPeso: 0,
                totalCantidad: 0,
                paletas: new Set<number>(),
            };
        }

        acc[desc].totalPeso += isNaN(pesoNeto) ? 0 : pesoNeto;
        acc[desc].totalCantidad += cantidad;
        if (!isNaN(paleta) && paleta > 0) {
            acc[desc].paletas.add(paleta);
        }
        
        return acc;
    }, {} as Record<string, { descripcion: string; totalPeso: number; totalCantidad: number; paletas: Set<number> }>);

    return Object.values(grouped).map(group => ({
        descripcion: group.descripcion,
        totalPeso: group.totalPeso,
        totalCantidad: group.totalCantidad,
        totalPaletas: group.paletas.size,
    }));
  }, [watchedItems]);

  useEffect(() => {
      const currentSummaryInForm = form.getValues('summary') || [];
      const newSummaryState = calculatedSummaryForDisplay.map(newItem => {
          const existingItem = currentSummaryInForm.find(oldItem => oldItem.descripcion === newItem.descripcion);
          return {
              ...newItem,
              temperatura1: existingItem?.temperatura1 ?? null,
              temperatura2: existingItem?.temperatura2 ?? null,
              temperatura3: existingItem?.temperatura3 ?? null,
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
        paleta: null,
        descripcion: lastItem?.descripcion || '',
        lote: lastItem?.lote || '',
        presentacion: lastItem?.presentacion || '',
        cantidadPorPaleta: lastItem?.cantidadPorPaleta || null,
        pesoBruto: null,
        taraEstiba: null,
        taraCaja: lastItem?.taraCaja || null,
        totalTaraCaja: null,
        pesoNeto: null,
    });
  };

  useEffect(() => {
    const fetchClients = async () => {
        const clientList = await getClients();
        setClientes(clientList);
    };
    fetchClients();
    if (!submissionId) {
        form.reset(originalDefaultValues);
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
          let formData = submission.formData;
          
          // Ensure all optional fields have a default value to prevent uncontrolled -> controlled error
          const sanitizedFormData = {
              ...originalDefaultValues,
              ...formData,
              observaciones: formData.observaciones ?? null,
              setPoint: formData.setPoint ?? null,
              summary: (formData.summary || []).map((s: any) => ({
                  ...s,
                  temperatura1: s.temperatura1 ?? s.temperatura ?? null,
                  temperatura2: s.temperatura2 ?? null,
                  temperatura3: s.temperatura3 ?? null,
              })),
              items: (formData.items || []).map((item: any) => ({
                  ...originalDefaultValues.items[0],
                  ...item,
                  paleta: item.paleta ?? null,
                  lote: item.lote ?? '',
                  presentacion: item.presentacion ?? '',
                  cantidadPorPaleta: item.cantidadPorPaleta ?? null,
                  pesoBruto: item.pesoBruto ?? null,
                  taraEstiba: item.taraEstiba ?? null,
                  taraCaja: item.taraCaja ?? null,
                  totalTaraCaja: item.totalTaraCaja ?? null,
                  pesoNeto: item.pesoNeto ?? null,
              }))
          };

          // Convert date string back to Date object for the form
          if (sanitizedFormData.fecha && typeof sanitizedFormData.fecha === 'string') {
            sanitizedFormData.fecha = new Date(sanitizedFormData.fecha);
          }
          form.reset(sanitizedFormData);
          // Set attachments, which are URLs in this case
          setAttachments(submission.attachmentUrls);

          // Pre-load articulos for the client
          if (sanitizedFormData.cliente) {
            setIsLoadingArticulos(true);
            const fetchedArticulos = await getArticulosByClients([sanitizedFormData.cliente]);
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
        toast({ variant: "destructive", title: "Error", description: "Debe iniciar sesión para guardar el formulario." });
        return;
    }
    setIsSubmitting(true);
    try {
        const finalSummary = calculatedSummaryForDisplay.map(summaryItem => {
            const formItem = (data.summary || []).find(s => s.descripcion === summaryItem.descripcion);
            return {
                ...summaryItem,
                temperatura1: formItem?.temperatura1 ?? null,
                temperatura2: formItem?.temperatura2 ?? null,
                temperatura3: formItem?.temperatura3 ?? null,
            }
        });
        const dataWithFinalSummary = { ...data, summary: finalSummary };

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
            formType: `variable-weight-reception`,
            formData: dataWithFinalSummary,
            attachmentUrls: finalAttachmentUrls,
            createdAt: originalSubmission?.createdAt,
        };

        const result = await saveForm(submissionData, submissionId ?? undefined);

        if (result.success) {
            toast({ title: "Formulario Guardado", description: `La recepción de peso variable ha sido ${submissionId ? 'actualizada' : 'guardada'}.` });
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
  
  const title = `${submissionId ? 'Editando' : 'Formato de'} Recepción - Peso Variable`;

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
            clientSelected={!!form.getValues('cliente')}
            onSelect={(articulo) => {
                if (productDialogIndex !== null) {
                    form.setValue(`items.${productDialogIndex}.descripcion`, articulo.label);
                }
            }}
            productDialogIndex={productDialogIndex}
        />
        <div className="max-w-6xl mx-auto">
          <header className="mb-8">
            <div className="relative flex items-center justify-center text-center">
              <Button variant="ghost" size="icon" className="absolute left-0 top-1/2 -translate-y-1/2" onClick={() => router.push(submissionId ? '/consultar-formatos' : '/')}>
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
                <Card>
                  <CardHeader>
                      <CardTitle>Información General</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <FormField control={form.control} name="pedidoSislog" render={({ field }) => (
                            <FormItem className="md:col-span-3">
                              <FormLabel>Pedido SISLOG</FormLabel>
                              <FormControl><Input placeholder="Máximo 15 caracteres" {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                        )}/>
                        <FormField
                          control={form.control}
                          name="cliente"
                          render={({ field }) => (
                              <FormItem className="flex flex-col">
                                  <FormLabel>Cliente</FormLabel>
                                  <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Dialog open={isClientDialogOpen} onOpenChange={(isOpen) => {
                                              if (!isOpen) setClientSearch('');
                                              setClientDialogOpen(isOpen);
                                          }}>
                                              <DialogTrigger asChild>
                                                  <FormControl>
                                                      <Button
                                                        variant="outline"
                                                        role="combobox"
                                                        className="w-full justify-between text-left font-normal"
                                                        disabled={isClientChangeDisabled}
                                                      >
                                                          {field.value || "Seleccione un cliente..."}
                                                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                      </Button>
                                                  </FormControl>
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
                                                                      onClick={async () => {
                                                                          field.onChange(cliente.razonSocial);
                                                                          setClientDialogOpen(false);
                                                                          setClientSearch('');
                                                                          
                                                                          form.setValue('items', [{ paleta: null, descripcion: "", lote: "", presentacion: "", cantidadPorPaleta: null, pesoBruto: null, taraEstiba: null, taraCaja: null, totalTaraCaja: null, pesoNeto: null }]);
                                                                          setArticulos([]);
                                                                          setIsLoadingArticulos(true);
                                                                          try {
                                                                              const fetchedArticulos = await getArticulosByClients([cliente.razonSocial]);
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
                                        </TooltipTrigger>
                                        {isClientChangeDisabled && (
                                          <TooltipContent>
                                            <p>Para cambiar de cliente, primero elimine todos los ítems.</p>
                                          </TooltipContent>
                                        )}
                                      </Tooltip>
                                  </TooltipProvider>
                                  <FormMessage />
                              </FormItem>
                          )}
                          />
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
                              <FormControl><Input placeholder="Número de cédula" {...field} inputMode="numeric" pattern="[0-9]*" /></FormControl>
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
                                <FormControl><Input type="text" inputMode="decimal" placeholder="0" {...field} onChange={e => field.onChange(e.target.value === '' ? null : e.target.value)} value={field.value ?? ''} /></FormControl>
                                <FormMessage />
                            </FormItem>
                        )}/>
                         <FormField control={form.control} name="contenedor" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Contenedor</FormLabel>
                                <FormControl><Input placeholder="Número de contenedor" {...field} /></FormControl>
                                <FormMessage />
                            </FormItem>
                        )}/>
                    </div>
                  </CardContent>
                </Card>
              
                <Card>
                  <CardHeader><CardTitle>Detalle de la Recepción</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                      <div className="space-y-4">
                        {fields.map((field, index) => {
                             const itemData = watchedItems?.[index];
                             const totalTaraCaja = itemData?.totalTaraCaja;
                             const pesoNeto = itemData?.pesoNeto;
                            
                             return (
                            <div key={field.id} className="p-4 border rounded-lg relative bg-white space-y-4">
                                <div className="flex justify-between items-center">
                                    <h4 className="font-semibold text-lg">Ítem #{index + 1}</h4>
                                    <Button type="button" variant="ghost" size="icon" className="text-destructive" onClick={() => remove(index)}><Trash2 className="h-4 w-4" /></Button>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <FormField control={form.control} name={`items.${index}.paleta`} render={({ field }) => (
                                        <FormItem><FormLabel>Paleta</FormLabel><FormControl><Input type="text" inputMode="numeric" placeholder="Número de paleta" {...field} onChange={e => field.onChange(e.target.value === '' ? null : e.target.value)} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                                    )}/>
                                    <FormField control={form.control} name={`items.${index}.descripcion`} render={({ field: controllerField }) => (
                                        <FormItem className="md:col-span-2">
                                            <FormLabel>Descripción del Producto</FormLabel>
                                             <Button
                                                  type="button"
                                                  variant="outline"
                                                  className="w-full justify-between text-left font-normal h-10"
                                                  onClick={() => {
                                                    setProductDialogIndex(index);
                                                    setProductDialogOpen(true);
                                                  }}
                                                >
                                                  <span className="truncate">{controllerField.value || "Seleccionar producto..."}</span>
                                                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                            </Button>
                                            <FormMessage />
                                        </FormItem>
                                    )}/>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <FormField control={form.control} name={`items.${index}.lote`} render={({ field }) => (
                                        <FormItem><FormLabel>Lote</FormLabel><FormControl><Input placeholder="Lote (máx. 15 caracteres)" {...field} value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value.toUpperCase())} /></FormControl><FormMessage /></FormItem>
                                    )}/>
                                    <FormField control={form.control} name={`items.${index}.presentacion`} render={({ field }) => (
                                        <FormItem><FormLabel>Presentación</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Seleccione presentación" /></SelectTrigger></FormControl><SelectContent>{presentaciones.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                                    )}/>
                                    <FormField control={form.control} name={`items.${index}.cantidadPorPaleta`} render={({ field }) => (
                                        <FormItem><FormLabel>Cantidad Por Paleta</FormLabel><FormControl><Input type="text" inputMode="numeric" placeholder="0" {...field} onChange={e => field.onChange(e.target.value === '' ? null : e.target.value)} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                                    )}/>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
                                    <FormField control={form.control} name={`items.${index}.pesoBruto`} render={({ field }) => (
                                        <FormItem><FormLabel>Peso Bruto (kg)</FormLabel><FormControl><Input type="text" inputMode="decimal" step="0.01" placeholder="0.00" {...field} onChange={e => field.onChange(e.target.value === '' ? null : e.target.value)} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                                    )}/>
                                    <FormField control={form.control} name={`items.${index}.taraEstiba`} render={({ field }) => (
                                        <FormItem><FormLabel>Tara Estiba (kg)</FormLabel><FormControl><Input type="text" inputMode="decimal" step="0.01" placeholder="0.00" {...field} onChange={e => field.onChange(e.target.value === '' ? null : e.target.value)} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                                    )}/>
                                    <FormField control={form.control} name={`items.${index}.taraCaja`} render={({ field }) => (
                                        <FormItem><FormLabel>Tara Caja (kg)</FormLabel><FormControl><Input type="text" inputMode="decimal" step="0.01" placeholder="0.00" {...field} onChange={e => field.onChange(e.target.value === '' ? null : e.target.value)} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                                    )}/>
                                    <FormItem><FormLabel>Total Tara Caja (kg)</FormLabel><FormControl><Input disabled readOnly value={totalTaraCaja != null && !isNaN(totalTaraCaja) ? totalTaraCaja.toFixed(2) : '0.00'} /></FormControl></FormItem>
                                    <FormItem><FormLabel>Peso Neto (kg)</FormLabel><FormControl><Input disabled readOnly value={pesoNeto != null && !isNaN(pesoNeto) ? pesoNeto.toFixed(2) : '0.00'} /></FormControl></FormItem>
                                </div>
                            </div>
                        )})}
                      </div>
                      <Button type="button" variant="outline" onClick={handleAddItem}><PlusCircle className="mr-2 h-4 w-4" />Agregar Item</Button>
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
                                        <TableHead className="w-[240px]">Temperaturas (°C)</TableHead>
                                        <TableHead>Producto</TableHead>
                                        <TableHead className="text-right">Total Paletas</TableHead>
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
                                                      <div className="flex items-center gap-1">
                                                          <FormField
                                                              control={form.control}
                                                              name={`summary.${summaryIndex}.temperatura1`}
                                                              render={({ field }) => (
                                                                <FormItem>
                                                                  <FormControl><Input type="text" inputMode="decimal" placeholder="T1" {...field} 
                                                                          onChange={e => field.onChange(e.target.value === '' ? null : e.target.value)} 
                                                                          value={field.value ?? ''}
                                                                      className="w-20 h-9 text-center" /></FormControl>
                                                                  <FormMessage className="text-xs"/>
                                                                </FormItem>
                                                              )} />
                                                          <FormField
                                                              control={form.control}
                                                              name={`summary.${summaryIndex}.temperatura2`}
                                                              render={({ field }) => (
                                                                <FormItem>
                                                                  <FormControl><Input type="text" inputMode="decimal" placeholder="T2" {...field} onChange={e => field.onChange(e.target.value === '' ? null : e.target.value)} value={field.value ?? ''} className="w-20 h-9 text-center" /></FormControl>
                                                                  <FormMessage className="text-xs"/>
                                                                </FormItem>
                                                              )} />
                                                          <FormField
                                                              control={form.control}
                                                              name={`summary.${summaryIndex}.temperatura3`}
                                                              render={({ field }) => (
                                                                <FormItem>
                                                                  <FormControl><Input type="text" inputMode="decimal" placeholder="T3" {...field} onChange={e => field.onChange(e.target.value === '' ? null : e.target.value)} value={field.value ?? ''} className="w-20 h-9 text-center" /></FormControl>
                                                                  <FormMessage className="text-xs"/>
                                                                </FormItem>
                                                              )} />
                                                      </div>
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
                                                    {summaryItem.totalPaletas || 0}
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
                                            <TableCell colSpan={5} className="h-24 text-center">
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
              
                <Card>
                  <CardHeader>
                      <CardTitle>Tiempo y Observaciones de la Operación</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField control={form.control} name="horaInicio" render={({ field }) => (
                      <FormItem>
                          <FormLabel>Hora Inicio</FormLabel>
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
                              <FormControl><Textarea placeholder="Observaciones (opcional)" {...field} value={field.value ?? ''} className="pr-10" /></FormControl>
                              <Edit2 className="absolute right-3 bottom-3 h-4 w-4 text-muted-foreground" />
                              <FormMessage />
                          </FormItem>
                      )}/>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle>Responsables de la Operación</CardTitle></CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField control={form.control} name="coordinador" render={({ field }) => (
                          <FormItem><FormLabel>Coordinador Responsable</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Seleccione un coordinador" /></SelectTrigger></FormControl><SelectContent>{coordinadores.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                      )}/>
                       <FormItem>
                          <FormLabel>Operario Responsable (Creador)</FormLabel>
                          <FormControl><Input disabled value={submissionId ? originalSubmission?.userDisplayName : displayName || ''} /></FormControl>
                      </FormItem>
                      {submissionId && (
                          <FormItem>
                            <FormLabel>Usuario (Editor)</FormLabel>
                            <FormControl><Input disabled value={displayName || ''} /></FormControl>
                          </FormItem>
                      )}
                  </CardContent>
                </Card>

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

                <footer className="flex items-center justify-end gap-4 pt-4">
                    <Button type="button" variant="outline" onClick={() => setDiscardAlertOpen(true)}><RotateCcw className="mr-2 h-4 w-4"/>Limpiar Formato</Button>
                    <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4"/>}
                        {isSubmitting ? 'Guardando...' : 'Guardar y Enviar'}
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

// Component for the product selector dialog
function ProductSelectorDialog({
    open,
    onOpenChange,
    articulos,
    isLoading,
    clientSelected,
    onSelect,
    productDialogIndex
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    articulos: { value: string; label: string }[];
    isLoading: boolean;
    clientSelected: boolean;
    onSelect: (articulo: { value: string; label: string }) => void;
    productDialogIndex: number | null;
}) {
    const [search, setSearch] = useState("");

    const filteredArticulos = useMemo(() => {
        if (!search) return articulos;
        return articulos.filter(a => a.label.toLowerCase().includes(search.toLowerCase()));
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
                            placeholder="Buscar producto..."
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
                                        key={`${p.value}-${i}`}
                                        variant="ghost"
                                        className="w-full justify-start h-auto text-wrap"
                                        onClick={() => {
                                            onSelect(p);
                                            onOpenChange(false);
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
    );
}
