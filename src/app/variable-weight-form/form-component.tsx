
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
import { getArticulosByClients, type ArticuloInfo } from "@/app/actions/articulos";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription as AlertDialogDesc, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";


const itemSchema = z.object({
    codigo: z.string().min(1, "El código es requerido."),
    paleta: z.preprocess(
      (val) => (val === "" || val === null ? null : val),
      z.coerce.number({
          required_error: "La paleta es requerida.",
          invalid_type_error: "La paleta es requerida.",
      }).int({ message: "La paleta debe ser un número entero." }).min(0, "Debe ser un número no negativo.")
    ),
    descripcion: z.string().min(1, "La descripción es requerida."),
    lote: z.string().max(15, "Máximo 15 caracteres").nullable(),
    presentacion: z.string().min(1, "Seleccione una presentación."),
    // Conditional fields for individual pallets (paleta > 0)
    cantidadPorPaleta: z.preprocess(
        (val) => (val === "" || val === null ? null : val),
        z.coerce.number({ invalid_type_error: "La cantidad debe ser un número." })
          .int({ message: "La cantidad debe ser un número entero." }).min(0, "Debe ser un número no negativo.").nullable()
    ),
    pesoBruto: z.preprocess(
        (val) => (val === "" || val === null ? null : val),
        z.coerce.number({ invalid_type_error: "El peso bruto debe ser un número." })
          .min(0, "Debe ser un número no negativo.").nullable()
    ),
    taraEstiba: z.preprocess(
        (val) => (val === "" || val === null ? null : val),
        z.coerce.number({ invalid_type_error: "La tara estiba debe ser un número." })
          .min(0, "Debe ser un número no negativo.").nullable()
    ),
    taraCaja: z.preprocess(
        (val) => (val === "" || val === null ? null : val),
        z.coerce.number({ invalid_type_error: "La tara caja debe ser un número." })
          .min(0, "Debe ser un número no negativo.").nullable()
    ),
    // Calculated fields
    totalTaraCaja: z.number().nullable(),
    pesoNeto: z.number().nullable(),
    // Conditional fields for summary row (paleta === 0)
    totalCantidad: z.preprocess(
        (val) => (val === "" || val === null ? null : val),
        z.coerce.number({ invalid_type_error: "El total de cantidad debe ser un número." })
          .int({ message: "El total de cantidad debe ser un número entero." }).min(0, "Debe ser un número no negativo.").nullable()
    ),
    totalPaletas: z.preprocess(
        (val) => (val === "" || val === null ? null : val),
        z.coerce.number({ required_error: "El total de paletas es requerido.", invalid_type_error: "El total de paletas debe ser requerido." })
          .int("El Total Paletas debe ser un número entero.").min(0, "Debe ser un número no negativo.").nullable()
    ),
    totalPesoNeto: z.preprocess(
        (val) => (val === "" || val === null ? null : val),
        z.coerce.number({ invalid_type_error: "El total de peso neto debe ser un número." })
          .min(0, "Debe ser un número no negativo.").nullable()
    ),
  }).superRefine((data, ctx) => {
    // Paleta is always required.
    if (data.paleta === null || data.paleta === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La paleta es requerida.", path: ["paleta"] });
        return;
    }
    
    // If it's a summary row (paleta is exactly 0)
    if (data.paleta === 0) {
      if (data.totalCantidad === undefined || data.totalCantidad === null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "El Total Cantidad es requerido.", path: ["totalCantidad"] });
      }
      if (data.totalPaletas === undefined || data.totalPaletas === null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "El Total Paletas es requerido.", path: ["totalPaletas"] });
      }
      if (data.totalPesoNeto === undefined || data.totalPesoNeto === null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "El Total Peso Neto es requerido.", path: ["totalPesoNeto"] });
      }
    } 
    // Otherwise, it's an individual pallet row
    else {
      if (data.cantidadPorPaleta === undefined || data.cantidadPorPaleta === null) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La Cantidad Por Paleta es requerida.", path: ["cantidadPorPaleta"] });
      }
      if (data.pesoBruto === undefined || data.pesoBruto === null) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "El Peso Bruto es requerido.", path: ["pesoBruto"] });
      }
      if (data.taraEstiba === undefined || data.taraEstiba === null) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La Tara Estiba es requerida.", path: ["taraEstiba"] });
      }
      if (data.taraCaja === undefined || data.taraCaja === null) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La Tara Caja es requerida.", path: ["taraCaja"] });
      }
    }
});

const summaryItemSchema = z.object({
    descripcion: z.string(),
    temperatura: z.preprocess(
      (val) => (val === "" || val === null ? null : val),
      z.coerce.number({ 
          required_error: "La temperatura es requerida.", 
          invalid_type_error: "La temperatura es requerida." 
      }).min(-99, "El valor debe estar entre -99 y 99.").max(99, "El valor debe estar entre -99 y 99.")
    ),
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
  items: [{
    codigo: '',
    paleta: null,
    descripcion: '', 
    lote: '', 
    presentacion: '', 
    cantidadPorPaleta: null, 
    pesoBruto: null,
    taraEstiba: null,
    taraCaja: null,
    totalTaraCaja: null,
    pesoNeto: null,
    totalCantidad: null, 
    totalPaletas: null, 
    totalPesoNeto: null 
  }],
  summary: [],
  horaInicio: "",
  horaFin: "",
  observaciones: "",
  coordinador: "",
};

// Mock data
const coordinadores = ["Cristian Acuña", "Sergio Padilla"];
const presentaciones = ["Cajas", "Sacos", "Canastillas"];

// Attachment Constants
const MAX_ATTACHMENTS = 30;
const MAX_TOTAL_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

function getByteSizeFromBase64(base64: string): number {
    // This is an approximation
    return base64.length * (3 / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
}

// Sub-component for a single item row to handle its own state and logic
const FormItemRow = ({ index, control, remove, handleProductDialogOpening }: { index: number, control: any, remove: (index: number) => void, handleProductDialogOpening: (index: number) => void }) => {
    const paletaValue = useWatch({ control, name: `items.${index}.paleta` });
    const watchedItem = useWatch({ control, name: `items.${index}` });
    
    const isSummaryRow = paletaValue === 0;
    const pesoNeto = watchedItem?.pesoNeto;

    return (
        <div className="p-4 border rounded-lg relative bg-white space-y-4">
            <div className="flex justify-between items-center">
                <h4 className="text-lg font-semibold md:text-base">Ítem #{index + 1}</h4>
                <Button type="button" variant="ghost" size="icon" className="text-destructive" onClick={() => remove(index)}><Trash2 className="h-4 w-4" /></Button>
            </div>
            <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField control={control} name={`items.${index}.codigo`} render={({ field }) => (
                        <FormItem>
                            <FormLabel>Código</FormLabel>
                            <Button
                                type="button"
                                variant="outline"
                                className="w-full justify-between h-10 text-left font-normal"
                                onClick={() => handleProductDialogOpening(index)}
                            >
                                <span className="truncate">{field.value || "Seleccionar código..."}</span>
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                            <FormMessage />
                        </FormItem>
                    )} />
                    <FormField control={control} name={`items.${index}.descripcion`} render={({ field: controllerField }) => (
                        <FormItem className="md:col-span-2">
                            <FormLabel>Descripción del Producto</FormLabel>
                            <Button
                                type="button"
                                variant="outline"
                                className="w-full justify-between h-10 text-left font-normal"
                                onClick={() => handleProductDialogOpening(index)}
                            >
                                <span className="truncate">{controllerField.value || "Seleccionar producto..."}</span>
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                            <FormMessage />
                        </FormItem>
                    )} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField control={control} name={`items.${index}.paleta`} render={({ field }) => (
                        <FormItem>
                            <FormLabel>Paleta</FormLabel>
                            <FormControl>
                                <Input 
                                    type="text" 
                                    inputMode="numeric" 
                                    placeholder="0 (para resumen)" 
                                    {...field} 
                                    onChange={e => {
                                        const value = e.target.value;
                                        const numericValue = value.replace(/[^0-9]/g, '');
                                        field.onChange(numericValue === '' ? null : Number(numericValue));
                                    }} 
                                    value={field.value ?? ''} 
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                    <FormField control={control} name={`items.${index}.lote`} render={({ field }) => (
                        <FormItem>
                            <FormLabel>Lote</FormLabel>
                            <FormControl><Input placeholder="Lote (máx. 15 caracteres)" {...field} value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value.toUpperCase())} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                    <FormField control={control} name={`items.${index}.presentacion`} render={({ field }) => (
                        <FormItem>
                            <FormLabel>Presentación</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                    <SelectTrigger><SelectValue placeholder="Seleccione presentación" /></SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {presentaciones.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )} />
                </div>
                {isSummaryRow ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <FormField control={control} name={`items.${index}.totalCantidad`} render={({ field }) => (
                            <FormItem><FormLabel>Total Cantidad</FormLabel><FormControl><Input type="text" inputMode="numeric" pattern="[0-9]*" placeholder="0" {...field} onChange={e => field.onChange(e.target.value === '' ? null : e.target.value)} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <FormField control={control} name={`items.${index}.totalPaletas`} render={({ field }) => (
                            <FormItem><FormLabel>Total Paletas</FormLabel><FormControl><Input type="text" inputMode="numeric" min="0" placeholder="0" {...field} onChange={e => field.onChange(e.target.value === '' ? null : e.target.value)} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <FormField control={control} name={`items.${index}.totalPesoNeto`} render={({ field }) => (
                            <FormItem><FormLabel>Total Peso Neto (kg)</FormLabel><FormControl><Input type="text" inputMode="decimal" placeholder="0.00" {...field} onChange={e => field.onChange(e.target.value === '' ? null : e.target.value)} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                        )} />
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
                        <FormField control={control} name={`items.${index}.cantidadPorPaleta`} render={({ field }) => (
                            <FormItem>
                                <FormLabel>Cantidad Por Paleta</FormLabel>
                                <FormControl><Input type="text" inputMode="numeric" min="0" placeholder="0" {...field} onChange={e => field.onChange(e.target.value === '' ? null : e.target.value)} value={field.value ?? ''} /></FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />
                        <FormField control={control} name={`items.${index}.pesoBruto`} render={({ field }) => (
                            <FormItem><FormLabel>Peso Bruto (kg)</FormLabel><FormControl><Input type="text" inputMode="decimal" min="0" step="0.01" placeholder="0.00" {...field} onChange={e => field.onChange(e.target.value === '' ? null : e.target.value)} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <FormField control={control} name={`items.${index}.taraEstiba`} render={({ field }) => (
                            <FormItem><FormLabel>Tara Estiba (kg)</FormLabel><FormControl><Input type="text" inputMode="decimal" min="0" step="0.01" placeholder="0.00" {...field} onChange={e => field.onChange(e.target.value === '' ? null : e.target.value)} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <FormField control={control} name={`items.${index}.taraCaja`} render={({ field }) => (
                            <FormItem><FormLabel>Tara Caja (kg)</FormLabel><FormControl><Input type="text" inputMode="decimal" min="0" step="0.01" placeholder="0.00" {...field} onChange={e => field.onChange(e.target.value === '' ? null : e.target.value)} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <FormItem>
                            <FormLabel>Peso Neto (kg)</FormLabel>
                            <FormControl><Input disabled readOnly value={pesoNeto != null && !isNaN(pesoNeto) ? pesoNeto.toFixed(2) : '0.00'} /></FormControl>
                        </FormItem>
                    </div>
                )}
            </div>
        </div>
    );
};


export default function VariableWeightFormComponent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const operation = searchParams.get("operation") || "operación";
  const submissionId = searchParams.get("id");

  const { toast } = useToast();
  const { user, displayName } = useAuth();
  
  const [clientes, setClientes] = useState<ClientInfo[]>([]);
  
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
  const [isMixErrorDialogOpen, setMixErrorDialogOpen] = useState(false);


  const filteredClients = useMemo(() => {
    if (!clientSearch) return clientes;
    return clientes.filter(c => c.razonSocial.toLowerCase().includes(clientSearch.toLowerCase()));
  }, [clientSearch, clientes]);
  
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: originalDefaultValues,
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

  const isClientChangeDisabled = useMemo(() => {
    return watchedItems.length > 1 || (watchedItems.length === 1 && !!watchedItems[0].descripcion);
  }, [watchedItems]);
  
  useEffect(() => {
    if (!watchedItems) return;

    watchedItems.forEach((item, index) => {
        // Run calculations for any row that is NOT a summary row (where paleta is 0).
        if (item && item.paleta !== 0) {
            const cantidad = Number(item.cantidadPorPaleta) || 0;
            const taraCaja = Number(item.taraCaja) || 0;
            const pesoBruto = Number(item.pesoBruto) || 0;
            const taraEstiba = Number(item.taraEstiba) || 0;

            const newTotalTaraCaja = cantidad * taraCaja;
            const newPesoNeto = pesoBruto - taraEstiba - newTotalTaraCaja;

            // Only update if the calculated values are different to avoid re-renders
            if (item.totalTaraCaja !== newTotalTaraCaja || item.pesoNeto !== newPesoNeto) {
                form.setValue(`items.${index}.totalTaraCaja`, newTotalTaraCaja, { shouldValidate: false });
                form.setValue(`items.${index}.pesoNeto`, newPesoNeto, { shouldValidate: false });
            }
        }
    });
  }, [watchedItems, form]);


  const calculatedSummaryForDisplay = useMemo(() => {
    const groupedByDesc = (watchedItems || []).reduce((acc, item) => {
        if (!item?.descripcion?.trim()) return acc;
        const desc = item.descripcion.trim();
        if (!acc[desc]) {
            acc[desc] = [];
        }
        acc[desc].push(item);
        return acc;
    }, {} as Record<string, typeof watchedItems>);

    return Object.values(groupedByDesc).map(itemsInGroup => {
        const isGroupInSummaryMode = itemsInGroup.some(item => Number(item.paleta) === 0);
        
        let totalPeso = 0;
        let totalCantidad = 0;
        let totalPaletas = 0;

        itemsInGroup.forEach(item => {
            totalPeso += (Number(item.paleta) === 0 ? Number(item.totalPesoNeto) : Number(item.pesoNeto)) || 0;
            totalCantidad += (Number(item.paleta) === 0 ? Number(item.totalCantidad) : Number(item.cantidadPorPaleta)) || 0;

            if (isGroupInSummaryMode) {
                if (Number(item.paleta) === 0) {
                    totalPaletas += Number(item.totalPaletas) || 0;
                }
            } else {
                totalPaletas += 1;
            }
        });

        return {
            descripcion: itemsInGroup[0].descripcion,
            totalPeso,
            totalCantidad,
            totalPaletas,
        };
    });
  }, [watchedItems]);


  const formIdentifier = submissionId ? `variable-weight-edit-${submissionId}` : `variable-weight-${operation}`;
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

    if (!lastItem) {
        append(originalDefaultValues.items[0]);
        return;
    }
    
    // Check if the last item was explicitly a summary row (paleta === 0)
    if (lastItem.paleta === 0) {
        // Add a new summary row, copying relevant data.
        append({
            codigo: lastItem.codigo,
            paleta: 0,
            descripcion: lastItem.descripcion,
            lote: lastItem.lote,
            presentacion: lastItem.presentacion,
            totalCantidad: null, 
            totalPaletas: null, 
            totalPesoNeto: null, 
            cantidadPorPaleta: null,
            pesoBruto: null,
            taraEstiba: null,
            taraCaja: null,
            totalTaraCaja: null,
            pesoNeto: null,
        });
    } else {
        // Add a new individual pallet row.
        append({
            codigo: lastItem.codigo,
            paleta: null, // New pallet number should be entered by user
            descripcion: lastItem.descripcion,
            lote: lastItem.lote,
            presentacion: lastItem.presentacion,
            cantidadPorPaleta: lastItem.cantidadPorPaleta,
            pesoBruto: null,
            taraEstiba: lastItem.taraEstiba,
            taraCaja: lastItem.taraCaja,
            totalTaraCaja: null,
            pesoNeto: null,
            totalCantidad: null,
            totalPaletas: null,
            totalPesoNeto: null,
        });
    }
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

          // Sanitize top-level fields
          const sanitizedFormData = {
              ...originalDefaultValues,
              ...formData,
              lote: formData.lote ?? null,
              observaciones: formData.observaciones ?? null,
              summary: (formData.summary || []).map((s: any) => ({
                ...s,
                temperatura: s.temperatura ?? null
              })),
              items: (formData.items || []).map((item: any) => ({
                  ...originalDefaultValues.items[0],
                  ...item,
                  paleta: item.paleta ?? null,
                  lote: item.lote ?? null,
                  cantidadPorPaleta: item.cantidadPorPaleta ?? null,
                  pesoBruto: item.pesoBruto ?? null,
                  taraEstiba: item.taraEstiba ?? null,
                  taraCaja: item.taraCaja ?? null,
                  totalTaraCaja: item.totalTaraCaja ?? null,
                  pesoNeto: item.pesoNeto ?? null,
                  totalCantidad: item.totalCantidad ?? null,
                  totalPaletas: item.totalPaletas ?? null,
                  totalPesoNeto: item.totalPesoNeto ?? null,
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
        toast({ variant: "destructive", title: "Error", description: "Debe iniciar sesión para guardar el formato." });
        return;
    }

    const hasSummaryRow = data.items.some(item => Number(item.paleta) === 0);
    const hasDetailRow = data.items.some(item => Number(item.paleta) > 0);

    if (hasSummaryRow && hasDetailRow) {
        setMixErrorDialogOpen(true);
        return;
    }

    setIsSubmitting(true);
    try {
        const finalSummary = calculatedSummaryForDisplay.map(summaryItem => {
            const formItem = (data.summary || []).find(s => s.descripcion === summaryItem.descripcion);
            return {
                ...summaryItem,
                temperatura: formItem?.temperatura ?? null, // Ensure temperature is saved
            };
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
            formType: `variable-weight-${operation}`,
            formData: dataWithFinalSummary,
            attachmentUrls: finalAttachmentUrls,
            createdAt: originalSubmission?.createdAt, // Pass original createdAt for updates
        };

        const result = await saveForm(submissionData, submissionId ?? undefined);

        if (result.success) {
            toast({ title: "Formulario Guardado", description: `El formato de ${operation} ha sido ${submissionId ? 'actualizado' : 'guardado'} correctamente.` });
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
    form.setValue('cliente', clientName);
    setClientDialogOpen(false);
    setClientSearch('');
  
    // Reset dependent fields
    form.setValue('items', [{ codigo: '', paleta: null, descripcion: '', lote: '', presentacion: '', cantidadPorPaleta: null, pesoBruto: null, taraEstiba: null, taraCaja: null, totalTaraCaja: null, pesoNeto: null, totalCantidad: null, totalPaletas: null, totalPesoNeto: null }]);
    setArticulos([]);
  };

  const handleProductDialogOpening = async (index: number) => {
      setProductDialogIndex(index);
      const clientName = form.getValues('cliente');
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


  const title = `${submissionId ? 'Editando' : 'Formato de'} ${operation.charAt(0).toUpperCase() + operation.slice(1)} - Peso Variable`;

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
                form.setValue(`items.${productDialogIndex}.descripcion`, articulo.denominacionArticulo);
                form.setValue(`items.${productDialogIndex}.codigo`, articulo.codigoProducto);
            }
        }}
      />
      <div className="mx-auto max-w-6xl">
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
                        <FileText className="h-7 w-7 text-primary md:h-8 md:w-8"/>
                        <h1 className="text-xl font-bold text-primary md:text-2xl">{title}</h1>
                    </div>
                    <p className="text-xs text-gray-500 md:text-sm">Complete todos los campos requeridos para registrar la operación.</p>
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
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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

            {/* Product Characteristics Card */}
            <Card>
              <CardHeader>
                <CardTitle>Detalle del Despacho</CardTitle>
                <FormField
                  control={form.control}
                  name="items"
                  render={({ fieldState }) => (
                    fieldState.error?.message && <p className="text-sm font-medium text-destructive">{fieldState.error.message}</p>
                  )}
                />
              </CardHeader>
              <CardContent className="space-y-4">
                {fields.map((field, index) => (
                    <FormItemRow
                        key={field.id}
                        index={index}
                        control={form.control}
                        remove={remove}
                        handleProductDialogOpening={handleProductDialogOpening}
                    />
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
                                      <TableHead className="text-right">Total Cantidad</TableHead>
                                      <TableHead className="text-right">Total Paletas</TableHead>
                                      <TableHead className="text-right">Total Peso (kg)</TableHead>
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
                                                                      <Input type="text" inputMode="decimal" placeholder="0" {...field} 
                                                                          onChange={e => field.onChange(e.target.value === '' ? null : e.target.value)} 
                                                                          value={field.value ?? ''}
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
                                                <div className="flex h-10 items-center rounded-md bg-muted/50 p-2">
                                                  {summaryItem.descripcion}
                                                </div>
                                              </TableCell>
                                              <TableCell className="text-right">
                                                  <div className="flex h-10 items-center justify-end rounded-md bg-muted/50 p-2">
                                                    {summaryItem.totalCantidad || 0}
                                                  </div>
                                              </TableCell>
                                              <TableCell className="text-right">
                                                  <div className="flex h-10 items-center justify-end rounded-md bg-muted/50 p-2">
                                                    {summaryItem.totalPaletas || 0}
                                                  </div>
                                              </TableCell>
                                              <TableCell className="text-right">
                                                <div className="flex h-10 items-center justify-end rounded-md bg-muted/50 p-2">
                                                  {(summaryItem.totalPeso || 0).toFixed(2)}
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

            {/* Time and Observations Card */}
            <Card>
                <CardHeader>
                    <CardTitle>Tiempo y Observaciones de la Operación</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                        <FormItem className="relative md:col-span-2">
                            <FormLabel>Observaciones</FormLabel>
                            <FormControl><Textarea placeholder="Observaciones (opcional)" {...field} value={field.value ?? ''} className="pr-10" /></FormControl>
                            <Edit2 className="absolute bottom-3 right-3 h-4 w-4 text-muted-foreground" />
                            <FormMessage />
                        </FormItem>
                    )}/>
                </CardContent>
            </Card>

             {/* Responsible Person Card */}
             <Card>
                <CardHeader><CardTitle>Responsables de la Operación</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <FormField control={form.control} name="coordinador" render={({ field }) => (
                        <FormItem><FormLabel>Coordinador Responsable</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Seleccione un coordinador" /></SelectTrigger></FormControl><SelectContent>{coordinadores.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                    )}/>
                    <FormItem>
                        <FormLabel>Operario Responsable</FormLabel>
                        <FormControl><Input disabled value={submissionId ? originalSubmission?.userDisplayName : displayName || ''} /></FormControl>
                    </FormItem>
                </CardContent>
             </Card>

             {/* Attachments Card */}
             <Card>
                <CardHeader><CardTitle>Anexos</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div 
                            className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 hover:bg-gray-100"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <UploadCloud className="mb-2 h-10 w-10 text-gray-400"/>
                            <p className="text-sm font-semibold text-gray-600">Subir archivos o arrastre y suelte</p>
                            <p className="text-xs text-gray-500">Max. de 30 imágenes / 10MB Total</p>
                            <Input type="file" ref={fileInputRef} className="hidden" multiple accept="image/*" onChange={handleFileChange} />
                        </div>
                        <div 
                            className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 hover:bg-gray-100"
                            onClick={handleOpenCamera}
                        >
                            <Camera className="mb-2 h-10 w-10 text-gray-400"/>
                            <p className="text-sm font-semibold text-gray-600">Tomar Foto</p>
                            <p className="text-xs text-gray-500">Usar la cámara del dispositivo</p>
                        </div>
                    </div>
                    {attachments.length > 0 && (
                        <div>
                            <div className="mb-2 flex items-center justify-between">
                                <h4 className="text-sm font-medium">Archivos Adjuntos ({attachments.length}/{MAX_ATTACHMENTS}):</h4>
                                <AlertDialog open={isDeleteAllAlertOpen} onOpenChange={setDeleteAllAlertOpen}>
                                    <AlertDialogTrigger asChild>
                                        <Button type="button" variant="outline" size="sm" className="border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive">
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
                            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                                {attachments.map((src, index) => (
                                    <div key={index} className="group relative aspect-square">
                                        <Image src={src} alt={`Anexo ${index + 1}`} fill className="rounded-md object-cover" />
                                        <Button
                                            type="button"
                                            variant="destructive"
                                            size="icon"
                                            className="absolute right-1 top-1 h-6 w-6"
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
            
            <footer className="flex flex-col items-center justify-end gap-4 pt-4 sm:flex-row">
                <Button type="button" variant="outline" onClick={() => setDiscardAlertOpen(true)} className="w-full sm:w-auto">
                    <RotateCcw className="mr-2 h-4 w-4"/>
                    Limpiar Formato
                </Button>
                 <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
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

      <AlertDialog open={isMixErrorDialogOpen} onOpenChange={setMixErrorDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Error de Validación</AlertDialogTitle>
            <AlertDialogDesc>
              No se pueden mezclar ítems de resumen (Paleta 0) con ítems de paletas individuales. Por favor, use solo un método.
            </AlertDialogDesc>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setMixErrorDialogOpen(false)}>Entendido</AlertDialogAction>
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
