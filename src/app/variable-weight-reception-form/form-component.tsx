

"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useForm, useFieldArray, useWatch, FormProvider, useFormContext, Controller } from "react-hook-form";
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
import { PedidoType } from "@/app/gestion-tipos-pedido/actions";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
    Check,
    CalendarIcon,
    Clock,
    Truck
} from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RestoreDialog } from "@/components/app/restore-dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription as AlertDialogDesc, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const itemSchema = z.object({
    codigo: z.string().min(1, "El código es requerido."),
    paleta: z.coerce.number().int().min(0).nullable().optional(),
    descripcion: z.string().min(1, "La descripción es requerida."),
    lote: z.string().max(15).optional(),
    presentacion: z.string().optional(),
    cantidadPorPaleta: z.preprocess((val) => (val === "" || val === null ? null : val), z.coerce.number().int().min(0).nullable().optional()),
    pesoBruto: z.preprocess((val) => (val === "" || val === null ? null : val), z.coerce.number().min(0).nullable().optional()),
    taraEstiba: z.preprocess((val) => (val === "" || val === null ? null : val), z.coerce.number().min(0).nullable().optional()),
    taraCaja: z.preprocess((val) => (val === "" || val === null ? null : val), z.coerce.number().min(0).nullable().optional()),
    totalTaraCaja: z.number().nullable().optional(),
    pesoNeto: z.number().nullable().optional(),
    totalCantidad: z.preprocess((val) => (val === "" || val === null ? null : val), z.coerce.number().int().min(0).nullable().optional()),
    totalPaletas: z.preprocess((val) => (val === "" || val === null ? null : val), z.coerce.number().int().min(0).nullable().optional()),
    totalPesoNeto: z.preprocess((val) => (val === "" || val === null ? null : val), z.coerce.number().min(0).nullable().optional()),
});

const placaSchema = z.object({
  numeroPlaca: z.string()
    .min(1, "El número de placa es obligatorio.")
    .regex(/^[A-Z]{3}[0-9]{3}$/, "Formato de placa inválido. Deben ser 3 letras y 3 números (ej: ABC123)."),
  conductor: z.string().min(1, "El nombre del conductor es obligatorio."),
  cedulaConductor: z.string().min(1, "La cédula del conductor es obligatoria.").regex(/^[0-9]*$/, "La cédula solo puede contener números."),
  items: z.array(itemSchema).min(1, "Debe agregar al menos un ítem a la placa."),
});

const requiredTempSchema = z.coerce.number({ required_error: "La temperatura es requerida.", invalid_type_error: "La temperatura debe ser un número." }).min(-99).max(99);

const optionalTempSchema = z.preprocess(
    (val) => (val === "" || val === null ? null : val),
    z.coerce.number({ invalid_type_error: "La temperatura debe ser un número." }).min(-99).max(99).nullable().optional()
);

const summaryItemSchema = z.object({
  descripcion: z.string().optional(),
  temperatura1: requiredTempSchema,
  temperatura2: optionalTempSchema,
  temperatura3: optionalTempSchema,
  totalPeso: z.number().optional(),
  totalCantidad: z.number().optional(),
  totalPaletas: z.number().optional(),
  placa: z.string().optional(),
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
    pedidoSislog: z.string().min(1, "El pedido SISLOG es obligatorio.").max(15, "El pedido SISLOG no puede exceder los 15 caracteres."),
    cliente: z.string().min(1, "Seleccione un cliente."),
    fecha: z.date({ required_error: "La fecha es obligatoria." }),
    conductor: z.string().optional(),
    cedulaConductor: z.string().optional(),
    placa: z.string().optional(),
    precinto: z.string().optional(),
    setPoint: z.preprocess((val) => (val === "" || val === null ? undefined : val), z.coerce.number({ required_error: "El Set Point es requerido." }).min(-99).max(99).nullable().optional()),
    contenedor: z.string().optional(),
    facturaRemision: z.string().max(15, "Máximo 15 caracteres.").nullable().optional(),
    
    recepcionPorPlaca: z.boolean().default(false),
    items: z.array(itemSchema).optional(),
    placas: z.array(placaSchema).optional(),
    totalPaletasTunel: z.coerce.number().int().min(0, "Debe ser un número no negativo.").optional(),
    
    summary: z.array(summaryItemSchema).nullable().optional(),
    horaInicio: z.string().min(1, "La hora de inicio es obligatoria.").regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Formato de hora inválido (HH:MM)."),
    horaFin: z.string().min(1, "La hora de fin es obligatoria.").regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Formato de hora inválido (HH:MM)."),
    observaciones: z.array(observationSchema).optional(),
    coordinador: z.string().min(1, "Seleccione un coordinador."),
    aplicaCuadrilla: z.enum(["si", "no"]).optional(),
    operarioResponsable: z.string().optional(),
    tipoPedido: z.string({required_error: "El tipo de pedido es obligatorio."}).min(1, "El tipo de pedido es obligatorio."),
    tipoEmpaqueMaquila: z.enum(['EMPAQUE DE SACOS', 'EMPAQUE DE CAJAS']).optional(),
    numeroOperariosCuadrilla: z.coerce.number().int().min(1, "Debe ser al menos 1.").optional(),
    unidadDeMedidaPrincipal: z.string().optional(),
}).superRefine((data, ctx) => {
      const isSpecialReception = data.tipoPedido === 'INGRESO DE SALDOS' || data.tipoPedido === 'TUNEL' || data.tipoPedido === 'TUNEL A CÁMARA CONGELADOS' || data.tipoPedido === 'MAQUILA' || data.tipoPedido === 'TUNEL DE CONGELACIÓN';
      const isTunelCongelacion = data.tipoPedido === 'TUNEL DE CONGELACIÓN';
      
      if (!isSpecialReception) {
        if (!data.conductor?.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'El nombre del conductor es obligatorio.', path: ['conductor'] });
        if (!data.cedulaConductor?.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'La cédula del conductor es obligatoria.', path: ['cedulaConductor'] });
        if (!data.placa?.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'La placa es obligatoria.', path: ['placa'] });
        if (!data.precinto?.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'El precinto es obligatorio.', path: ['precinto'] });
        if (!data.contenedor?.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'El contenedor es obligatorio.', path: ['contenedor'] });
        if (data.setPoint === null || data.setPoint === undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'El Set Point es obligatorio.', path: ['setPoint'] });
      } else {
        if (data.cedulaConductor && !isTunelCongelacion && !/^[0-9\/ ]*$/.test(data.cedulaConductor)) {
           ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'La cédula solo puede contener números y /', path: ['cedulaConductor'] });
        }
      }

      if (data.tipoPedido !== 'INGRESO DE SALDOS' && data.tipoPedido !== 'TUNEL A CÁMARA CONGELADOS' && !data.aplicaCuadrilla) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Seleccione una opción para 'Operación Realizada por Cuadrilla'.", path: ['aplicaCuadrilla'] });
      }

      if (data.tipoPedido === 'MAQUILA') {
          if (!data.tipoEmpaqueMaquila) {
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: "El tipo de empaque es obligatorio para maquila.", path: ['tipoEmpaqueMaquila'] });
          }
          if (data.aplicaCuadrilla === 'si' && (data.numeroOperariosCuadrilla === undefined || data.numeroOperariosCuadrilla <= 0)) {
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: "El número de operarios es obligatorio.", path: ['numeroOperariosCuadrilla'] });
          }
      }

      if (isTunelCongelacion && (data.totalPaletasTunel === undefined || data.totalPaletasTunel === null || data.totalPaletasTunel <= 0)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "El total de paletas es requerido para este tipo de pedido.", path: ['totalPaletasTunel'] });
      }

      if(data.tipoPedido === 'TUNEL' || data.tipoPedido === 'TUNEL DE CONGELACIÓN') {
        if (data.recepcionPorPlaca && (!data.placas || data.placas.length === 0)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Debe agregar al menos una placa.', path: ['placas'] });
        } else if (!data.recepcionPorPlaca && (!data.items || data.items.length === 0)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Debe agregar al menos un ítem.', path: ['items'] });
        }
      } else {
        if (!data.items || data.items.length === 0) {
           ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Debe agregar al menos un ítem.', path: ['items'] });
        }
      }

      if (data.horaInicio && data.horaFin && data.horaInicio === data.horaFin) {
          ctx.addIssue({
              message: "La hora de fin no puede ser igual a la de inicio.",
              path: ["horaFin"],
          });
      }
});


const ItemFields = ({ control, itemIndex, handleProductDialogOpening, remove, isTunel = false, placaIndex }: { control: any, itemIndex: number, handleProductDialogOpening: (context: { itemIndex: number, placaIndex?: number }) => void, remove?: (index: number) => void, isTunel?: boolean, placaIndex?: number }) => {
    const { getValues } = useFormContext();
    const basePath = isTunel ? `placas.${placaIndex}.items` : 'items';
    const watchedItem = useWatch({ control, name: `${basePath}.${itemIndex}` });
    const { setValue } = useFormContext();

    useEffect(() => {
        if (watchedItem && watchedItem.paleta !== 0) {
            const cantidadPorPaleta = Number(watchedItem.cantidadPorPaleta) || 0;
            const taraCaja = Number(watchedItem.taraCaja) || 0;
            const pesoBruto = Number(watchedItem.pesoBruto) || 0;
            const taraEstiba = Number(watchedItem.taraEstiba) || 0;

            const calculatedTotalTaraCaja = cantidadPorPaleta * taraCaja;
            const calculatedPesoNeto = pesoBruto - taraEstiba - calculatedTotalTaraCaja;

            if (watchedItem.totalTaraCaja !== calculatedTotalTaraCaja) {
                setValue(`${basePath}.${itemIndex}.totalTaraCaja`, calculatedTotalTaraCaja, { shouldValidate: false });
            }
            if (watchedItem.pesoNeto !== calculatedPesoNeto) {
                setValue(`${basePath}.${itemIndex}.pesoNeto`, calculatedPesoNeto, { shouldValidate: false });
            }
        }
    }, [watchedItem?.cantidadPorPaleta, watchedItem?.taraCaja, watchedItem?.pesoBruto, watchedItem?.taraEstiba, watchedItem?.paleta, basePath, itemIndex, setValue, watchedItem]);

    const isSummaryRow = watchedItem?.paleta === 0;
    const pesoNeto = watchedItem?.pesoNeto;
    
    return (
      <div className="p-4 border rounded-lg relative bg-white space-y-4">
         <div className="flex justify-between items-center">
            <h4 className="text-lg font-semibold md:text-base">Ítem #{itemIndex + 1}</h4>
            {remove && (
                <Button type="button" variant="ghost" size="icon" className="text-destructive" onClick={() => remove(itemIndex)}>
                    <Trash2 className="h-4 w-4" />
                </Button>
            )}
        </div>
        <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField control={control} name={`${basePath}.${itemIndex}.codigo`} render={({ field }) => (
                    <FormItem>
                        <FormLabel>Código <span className="text-destructive">*</span></FormLabel>
                        <Button type="button" variant="outline" className="w-full justify-between h-10 text-left font-normal" onClick={() => handleProductDialogOpening({ itemIndex, placaIndex })}>
                            <span className="truncate">{field.value || "Seleccionar código..."}</span>
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                        <FormMessage />
                    </FormItem>
                )} />
                <FormField control={control} name={`${basePath}.${itemIndex}.descripcion`} render={({ field }) => (
                    <FormItem className="md:col-span-2">
                        <FormLabel>Descripción <span className="text-destructive">*</span></FormLabel>
                        <Button type="button" variant="outline" className="w-full justify-between h-10 text-left font-normal" onClick={() => handleProductDialogOpening({ itemIndex, placaIndex })}>
                            <span className="truncate">{field.value || "Seleccionar producto..."}</span>
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                        <FormMessage />
                    </FormItem>
                )} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                 {!isTunel && (
                    <FormField control={control} name={`${basePath}.${itemIndex}.paleta`} render={({ field }) => (
                        <FormItem><FormLabel>Paleta <span className="text-destructive">*</span></FormLabel><FormControl><Input type="text" inputMode="numeric" placeholder="0 para resumen" {...field} onChange={e => field.onChange(e.target.value === '' ? null : Number(e.target.value))} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                    )} />
                )}
                <FormField control={control} name={`${basePath}.${itemIndex}.lote`} render={({ field }) => (
                    <FormItem><FormLabel>Lote</FormLabel><FormControl><Input placeholder="Lote (máx. 15)" {...field} value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value.toUpperCase())} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={control} name={`${basePath}.${itemIndex}.presentacion`} render={({ field }) => (
                    <FormItem><FormLabel>Presentación</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Seleccione" /></SelectTrigger></FormControl><SelectContent>{presentaciones.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                )} />
            </div>
            {isSummaryRow && !isTunel ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField control={control} name={`${basePath}.${itemIndex}.totalCantidad`} render={({ field }) => (
                        <FormItem><FormLabel>Total Cantidad <span className="text-destructive">*</span></FormLabel><FormControl><Input type="text" inputMode="numeric" pattern="[0-9]*" placeholder="0" {...field} onChange={e => field.onChange(e.target.value === '' ? null : e.target.value)} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={control} name={`${basePath}.${itemIndex}.totalPaletas`} render={({ field }) => (
                        <FormItem><FormLabel>Total Paletas</FormLabel><FormControl><Input type="text" inputMode="numeric" min="0" placeholder="0" {...field} onChange={e => field.onChange(e.target.value === '' ? null : e.target.value)} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={control} name={`${basePath}.${itemIndex}.totalPesoNeto`} render={({ field }) => (
                        <FormItem><FormLabel>Total Peso Neto (kg) <span className="text-destructive">*</span></FormLabel><FormControl><Input type="text" inputMode="decimal" placeholder="0.00" {...field} onChange={e => field.onChange(e.target.value === '' ? null : e.target.value)} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                    )} />
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
                    <FormField control={control} name={`${basePath}.${itemIndex}.cantidadPorPaleta`} render={({ field }) => (
                        <FormItem><FormLabel>Cant. Por Paleta <span className="text-destructive">*</span></FormLabel><FormControl><Input type="text" inputMode="numeric" min="0" placeholder="0" {...field} onChange={e => field.onChange(e.target.value === '' ? null : e.target.value)} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={control} name={`${basePath}.${itemIndex}.pesoBruto`} render={({ field }) => (
                        <FormItem><FormLabel>P. Bruto (kg) <span className="text-destructive">*</span></FormLabel><FormControl><Input type="text" inputMode="decimal" min="0" step="0.01" placeholder="0.00" {...field} onChange={e => field.onChange(e.target.value === '' ? null : e.target.value)} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={control} name={`${basePath}.${itemIndex}.taraEstiba`} render={({ field }) => (
                        <FormItem><FormLabel>T. Estiba (kg) <span className="text-destructive">*</span></FormLabel><FormControl><Input type="text" inputMode="decimal" min="0" step="0.01" placeholder="0.00" {...field} onChange={e => field.onChange(e.target.value === '' ? null : e.target.value)} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={control} name={`${basePath}.${itemIndex}.taraCaja`} render={({ field }) => (
                        <FormItem><FormLabel>T. Caja (kg) <span className="text-destructive">*</span></FormLabel><FormControl><Input type="text" inputMode="decimal" min="0" step="0.01" placeholder="0.00" {...field} onChange={e => field.onChange(e.target.value === '' ? null : e.target.value)} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormItem><FormLabel>Peso Neto (kg)</FormLabel><FormControl><Input disabled readOnly value={pesoNeto != null && !isNaN(pesoNeto) ? pesoNeto.toFixed(2) : '0.00'} /></FormControl></FormItem>
                </div>
            )}
        </>
      </div>
    );
};

const ItemsPorPlaca = ({ placaIndex, handleProductDialogOpening }: { placaIndex: number, handleProductDialogOpening: (context: { itemIndex: number, placaIndex: number }) => void }) => {
    const { control, getValues } = useFormContext();
    const { fields, append, remove } = useFieldArray({
        control,
        name: `placas.${placaIndex}.items`,
    });

    const handleAddItemToPlaca = () => {
        const items = getValues(`placas.${placaIndex}.items`);
        const lastItem = items.length > 0 ? items[items.length - 1] : null;

        const newItemPayload = lastItem ? {
            ...originalDefaultValues.items![0],
            codigo: lastItem.codigo,
            descripcion: lastItem.descripcion,
            lote: lastItem.lote,
            presentacion: lastItem.presentacion,
            paleta: isNaN(Number(lastItem.paleta)) ? null : Number(lastItem.paleta),
        } : { ...originalDefaultValues.items![0] };
        
        append(newItemPayload);
    };

    return (
        <div className="space-y-4">
            <h4 className="text-md font-semibold text-gray-600">Ítems de la Placa</h4>
            {fields.map((item, itemIndex) => (
                <ItemFields
                    key={item.id}
                    itemIndex={itemIndex}
                    control={control}
                    remove={remove}
                    handleProductDialogOpening={(ctx) => handleProductDialogOpening({ ...ctx, placaIndex })}
                    isTunel
                    placaIndex={placaIndex}
                />
            ))}
            <Button type="button" variant="outline" size="sm" onClick={handleAddItemToPlaca}>
                <PlusCircle className="mr-2 h-4 w-4" /> Agregar Ítem a Placa
            </Button>
        </div>
    );
};


type FormValues = z.infer<typeof formSchema>;

const originalDefaultValues: FormValues = {
  pedidoSislog: "",
  cliente: "",
  fecha: new Date(),
  cedulaConductor: "",
  conductor: "",
  placa: "",
  precinto: "",
  setPoint: undefined,
  contenedor: "",
  facturaRemision: "N/A",
  recepcionPorPlaca: false,
  items: [],
  placas: [],
  totalPaletasTunel: undefined,
  summary: [],
  horaInicio: "",
  horaFin: "",
  observaciones: [],
  coordinador: "",
  aplicaCuadrilla: undefined,
  operarioResponsable: undefined,
  tipoPedido: undefined,
  tipoEmpaqueMaquila: undefined,
  numeroOperariosCuadrilla: undefined,
  unidadDeMedidaPrincipal: "PALETA",
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


export default function VariableWeightReceptionFormComponent({ pedidoTypes }: { pedidoTypes: PedidoType[] }) {
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
  const [productDialogContext, setProductDialogContext] = useState<{placaIndex?: number, itemIndex: number} | null>(null);
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
  const [isMixErrorDialogOpen, setMixErrorDialogOpen] = useState(false);
  const [isPedidoTypeDialogOpen, setPedidoTypeDialogOpen] = useState(false);



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
  
  const watchedTipoPedido = useWatch({ control: form.control, name: 'tipoPedido' });
  const watchedRecepcionPorPlaca = useWatch({ control: form.control, name: 'recepcionPorPlaca' });
  const isTunelMode = watchedTipoPedido === 'TUNEL' || watchedTipoPedido === 'TUNEL DE CONGELACIÓN';
  const isTunelCongelacion = watchedTipoPedido === 'TUNEL DE CONGELACIÓN';
  const watchedAplicaCuadrilla = useWatch({ control: form.control, name: 'aplicaCuadrilla' });
  const watchedItems = useWatch({ control: form.control, name: "items" });
  const watchedPlacas = useWatch({ control: form.control, name: "placas" });
  const watchedObservations = useWatch({ control: form.control, name: "observaciones" });
  const isSpecialReception = watchedTipoPedido === 'INGRESO DE SALDOS' || watchedTipoPedido === 'TUNEL' || watchedTipoPedido === 'TUNEL A CÁMARA CONGELADOS' || watchedTipoPedido === 'MAQUILA' || watchedTipoPedido === 'TUNEL DE CONGELACIÓN';

  useEffect(() => {
    if (watchedTipoPedido === 'TUNEL DE CONGELACIÓN') {
        if (!form.getValues('recepcionPorPlaca')) {
            form.setValue('recepcionPorPlaca', true);
            form.setValue('items', []);
        }
    }
  }, [watchedTipoPedido, form]);

  useEffect(() => {
    if (isTunelMode && watchedRecepcionPorPlaca) {
        const placasData = watchedPlacas || [];
        
        const placaNumbers = placasData
            .map(p => p.numeroPlaca?.trim())
            .filter(Boolean)
            .join(' / ');
        
        const conductorNames = placasData
            .map(p => p.conductor?.trim())
            .filter(Boolean)
            .join(' / ');

        const conductorCedulas = placasData
            .map(p => p.cedulaConductor?.trim())
            .filter(Boolean)
            .join(' / ');

        if (form.getValues('placa') !== placaNumbers) {
            form.setValue('placa', placaNumbers, { shouldValidate: true });
        }
        if (form.getValues('conductor') !== conductorNames) {
            form.setValue('conductor', conductorNames, { shouldValidate: true });
        }
        if (form.getValues('cedulaConductor') !== conductorCedulas) {
            form.setValue('cedulaConductor', conductorCedulas, { shouldValidate: true });
        }
    }
  }, [watchedPlacas, isTunelMode, watchedRecepcionPorPlaca, form]);

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });
  const { fields: placaFields, append: appendPlaca, remove: removePlaca } = useFieldArray({ control: form.control, name: "placas" });
  const { fields: observationFields, append: appendObservation, remove: removeObservation } = useFieldArray({ control: form.control, name: "observaciones" });
  
  const formIdentifier = submissionId ? `variable-weight-reception-edit-${submissionId}` : `variable-weight-${operation}`;
  const { isRestoreDialogOpen, onOpenChange, onRestore, onDiscard: handleDiscardHook, clearDraft } = useFormPersistence(formIdentifier, form, originalDefaultValues, attachments, setAttachments, !!submissionId);
  
  const itemsForCalculation = useMemo(() => (isTunelMode && watchedRecepcionPorPlaca) ? (watchedPlacas || []).flatMap(p => p.items) : (watchedItems || []), [isTunelMode, watchedRecepcionPorPlaca, watchedPlacas, watchedItems]);

  const isClientChangeDisabled = useMemo(() => {
    return itemsForCalculation.length > 1 || (itemsForCalculation.length === 1 && !!itemsForCalculation[0]?.descripcion);
  }, [itemsForCalculation]);

  useEffect(() => {
    if (watchedTipoPedido === 'INGRESO DE SALDOS' || watchedTipoPedido === 'TUNEL A CÁMARA CONGELADOS') {
      if (form.getValues('aplicaCuadrilla') !== undefined) {
        form.setValue('aplicaCuadrilla', undefined);
      }
    }
  }, [watchedTipoPedido, form]);
  
  const handleDiscard = () => {
    handleDiscardHook();
    form.reset(originalDefaultValues);
    setAttachments([]);
    setDiscardAlertOpen(false);
  };
  
  const calculatedSummaryForDisplay = useMemo(() => {
    if (isTunelMode && watchedRecepcionPorPlaca) {
      const allItemsByPlaca = (watchedPlacas || []).flatMap(placa => 
          (placa.items || []).map(item => ({ ...item, placa: placa.numeroPlaca }))
      );

      const groupedByPlacaAndDesc = allItemsByPlaca.reduce((acc, item) => {
          if (!item?.descripcion?.trim() || !item?.placa?.trim()) return acc;
          const key = `${item.placa}|${item.descripcion}`;
          
          if (!acc[key]) {
              const summaryItem = form.getValues('summary')?.find((s: any) => s.descripcion === item.descripcion && s.placa === item.placa);
              acc[key] = {
                  placa: item.placa,
                  descripcion: item.descripcion,
                  totalPeso: 0,
                  totalCantidad: 0,
                  temperatura1: summaryItem?.temperatura1,
                  temperatura2: summaryItem?.temperatura2,
                  temperatura3: summaryItem?.temperatura3,
              };
          }
          acc[key].totalPeso += Number(item.pesoNeto) || 0;
          acc[key].totalCantidad += Number(item.cantidadPorPaleta) || 0;
          
          return acc;
      }, {} as Record<string, { placa: string; descripcion: string; totalPeso: number; totalCantidad: number; temperatura1: any; temperatura2: any; temperatura3: any; }>);
      
      return { items: Object.values(groupedByPlacaAndDesc), totalGeneralPaletas: form.getValues('totalPaletasTunel') || 0 };
    }

    const grouped = (itemsForCalculation || []).reduce((acc, item) => {
        if (!item?.descripcion?.trim()) return acc;
        const desc = item.descripcion.trim();

        if (!acc[desc]) {
            const summaryItem = form.getValues('summary')?.find((s: any) => s.descripcion === desc);
            acc[desc] = {
                descripcion: desc,
                totalPeso: 0,
                totalCantidad: 0,
                paletas: new Set<number>(),
                temperatura1: summaryItem?.temperatura1 ?? summaryItem?.temperatura,
                temperatura2: summaryItem?.temperatura2,
                temperatura3: summaryItem?.temperatura3,
            };
        }

        if (Number(item.paleta) === 0) {
            acc[desc].totalPeso += Number(item.totalPesoNeto) || 0;
            acc[desc].totalCantidad += Number(item.totalCantidad) || 0;
            acc[desc].paletas.add(0);
        } else {
            acc[desc].totalPeso += Number(item.pesoNeto) || 0;
            acc[desc].totalCantidad += Number(item.cantidadPorPaleta) || 0;
            const paleta = Number(item.paleta);
            if (!isNaN(paleta) && paleta > 0) {
                acc[desc].paletas.add(paleta);
            }
        }
        
        return acc;
    }, {} as Record<string, { descripcion: string; totalPeso: number; totalCantidad: number; paletas: Set<number>; temperatura1: any; temperatura2: any; temperatura3: any; }>);

    const items = Object.values(grouped).map(group => ({
        descripcion: group.descripcion,
        totalPeso: group.totalPeso,
        totalCantidad: group.totalCantidad,
        totalPaletas: group.paletas.has(0)
            ? (itemsForCalculation || []).filter(item => item.descripcion === group.descripcion && Number(item.paleta) === 0).reduce((sum, item) => sum + (Number(item.totalPaletas) || 0), 0)
            : group.paletas.size,
        temperatura1: group.temperatura1,
        temperatura2: group.temperatura2,
        temperatura3: group.temperatura3,
    }));
    
    const totalGeneralPaletas = items.reduce((acc, item) => acc + (item.totalPaletas || 0), 0);
    
    return { items, totalGeneralPaletas };

  }, [itemsForCalculation, isTunelMode, watchedRecepcionPorPlaca, watchedPlacas, form]);
  
    useEffect(() => {
        const currentSummaryInForm = form.getValues('summary') || [];
        const newSummaryState = calculatedSummaryForDisplay.items.map(newItem => {
            const existingItem = currentSummaryInForm.find(oldItem => 
                (isTunelMode && watchedRecepcionPorPlaca && oldItem.placa)
                ? oldItem.descripcion === newItem.descripcion && oldItem.placa === (newItem as any).placa
                : oldItem.descripcion === newItem.descripcion
            );
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
    }, [calculatedSummaryForDisplay.items, form, isTunelMode, watchedRecepcionPorPlaca]);

  const showSummary = (itemsForCalculation || []).some(item => item && (item.descripcion || (isTunelMode && (item as any).numeroPlaca)) && (item.descripcion?.trim() !== '' || (item as any).numeroPlaca?.trim() !== ''));

  useEffect(() => {
    const fetchClientsAndObs = async () => {
      const [clientList, obsList, userList] = await Promise.all([
        getClients(),
        getStandardObservations(),
        isAdmin ? getUsersList() : Promise.resolve([]),
      ]);
      setClientes(clientList);
      setStandardObservations(obsList);
      if (isAdmin) {
          setAllUsers(userList);
      }
    };
    fetchClientsAndObs();

    if (!submissionId) {
        form.reset(originalDefaultValues);
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
          
          const sanitizedFormData = {
              ...originalDefaultValues,
              ...formData,
              observaciones: formData.observaciones ?? [],
              setPoint: formData.setPoint ?? null,
              aplicaCuadrilla: formData.aplicaCuadrilla ?? undefined,
              tipoPedido: formData.tipoPedido ?? undefined,
              tipoEmpaqueMaquila: formData.tipoEmpaqueMaquila ?? undefined,
              numeroOperariosCuadrilla: formData.numeroOperariosCuadrilla ?? undefined,
              facturaRemision: formData.facturaRemision ?? "",
              operarioResponsable: submission.userId,
              unidadDeMedidaPrincipal: formData.unidadDeMedidaPrincipal ?? 'PALETA',
              recepcionPorPlaca: formData.recepcionPorPlaca ?? false,
              totalPaletasTunel: formData.totalPaletasTunel ?? undefined,
              summary: (formData.summary || []).map((s: any) => ({
                  ...s,
                  temperatura1: s.temperatura1 ?? s.temperatura ?? null,
                  temperatura2: s.temperatura2 ?? null,
                  temperatura3: s.temperatura3 ?? null,
              })),
              items: (formData.items || []).map((item: any) => ({
                  ...originalDefaultValues.items![0],
                  ...item,
                  paleta: item.paleta, // Keep 0 if it exists
                  lote: item.lote ?? '',
                  presentacion: item.presentacion ?? '',
                  cantidadPorPaleta: item.cantidadPorPaleta ?? null,
                  pesoBruto: item.pesoBruto ?? null,
                  taraEstiba: item.taraEstiba ?? null,
                  taraCaja: item.taraCaja ?? null,
                  totalTaraCaja: item.totalTaraCaja ?? null,
                  pesoNeto: item.pesoNeto ?? null,
                  totalCantidad: item.totalCantidad ?? null,
                  totalPaletas: item.totalPaletas ?? null,
                  totalPesoNeto: item.totalPesoNeto ?? null,
              })),
              placas: (formData.placas || []).map((placa: any) => ({
                ...placa,
                items: (placa.items || []).map((item: any) => ({
                    ...originalDefaultValues.items![0],
                    ...item
                }))
              }))
          };

          if (sanitizedFormData.fecha && typeof sanitizedFormData.fecha === 'string') {
            sanitizedFormData.fecha = new Date(sanitizedFormData.fecha);
          }
          
          form.reset(sanitizedFormData);
          
          setAttachments(submission.attachmentUrls);

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
        const finalSummary = calculatedSummaryForDisplay.items.map(summaryItem => {
            const formItem = (data.summary || []).find(s => 
              (isTunelMode && watchedRecepcionPorPlaca)
              ? s.descripcion === summaryItem.descripcion && s.placa === (summaryItem as any).placa
              : s.descripcion === summaryItem.descripcion
            );
            return {
                ...summaryItem,
                temperatura1: formItem?.temperatura1 ?? null,
                temperatura2: formItem?.temperatura2 ?? null,
                temperatura3: formItem?.temperatura3 ?? null,
            }
        });
        
        let dataWithFinalSummary = { ...data, summary: finalSummary };
        
        const isSpecialReception = data.tipoPedido === "TUNEL" || data.tipoPedido === "TUNEL DE CONGELACIÓN" || data.tipoPedido === "INGRESO DE SALDOS" || data.tipoPedido === "MAQUILA" || data.tipoPedido === "TUNEL A CÁMARA CONGELADOS";
        if(isSpecialReception) {
          dataWithFinalSummary = {
            ...dataWithFinalSummary,
            conductor: data.conductor?.trim() || 'N/A',
            cedulaConductor: data.cedulaConductor?.trim() || 'N/A',
            precinto: data.precinto?.trim() || 'N/A',
            setPoint: data.setPoint ?? null,
            contenedor: data.contenedor?.trim() || 'N/A',
            placa: data.placa?.trim() || 'N/A',
          };
        }


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
        
        const editor = { id: user.uid, displayName: displayName || 'N/A' };

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
            formData: dataWithFinalSummary,
            formType: `variable-weight-reception`,
            attachmentUrls: finalAttachmentUrls,
            responsibleUser: responsibleUser,
            editor: editor,
            createdAt: originalSubmission?.createdAt,
        }, submissionId ?? undefined);

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

  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    form.handleSubmit((data) => {
        const allItems = (isTunelMode && data.recepcionPorPlaca) ? (data.placas || []).flatMap(p => p.items || []) : (data.items || []);
        const hasSummaryRow = allItems.some(item => Number(item?.paleta) === 0);
        const hasDetailRow = allItems.some(item => Number(item?.paleta) > 0);

        if (hasSummaryRow && hasDetailRow) {
            setMixErrorDialogOpen(true);
            return;
        }
        
        onSubmit(data);
    }, (errors) => {
        console.log("Validation Errors:", errors);
        toast({
            variant: "destructive",
            title: "Error de Validación",
            description: "Por favor, revise los campos marcados en rojo.",
        });
    })(e);
  };
  
  const handleClientSelection = async (clientName: string) => {
    form.setValue('cliente', clientName);
    setClientDialogOpen(false);
    setClientSearch('');
  
    form.setValue('items', []);
    form.setValue('placas', []);
    setArticulos([]);
  };

  const handleProductDialogOpening = async (context: { itemIndex: number, placaIndex?: number }) => {
      setProductDialogContext(context);
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

  const handleObservationDialogOpening = (index: number) => {
    setObservationDialogIndex(index);
    setObservationDialogOpen(true);
  };
  
  const handleCaptureTime = (fieldName: 'horaInicio' | 'horaFin') => {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    form.setValue(fieldName, `${hours}:${minutes}`, { shouldValidate: true });
  };
  
  const title = `${submissionId ? 'Editando' : 'Formato de'} Recepción - Peso Variable`;

  const handleAddItem = () => {
    const items = form.getValues('items');
    const lastItem = items && items.length > 0 ? items[items.length - 1] : null;

    if (!lastItem) {
        append({ ...originalDefaultValues.items![0] });
        return;
    }
    
    if (lastItem.paleta === 0) {
        append({
            ...originalDefaultValues.items![0],
            codigo: lastItem.codigo,
            paleta: 0,
            descripcion: lastItem.descripcion,
            lote: lastItem.lote,
            presentacion: lastItem.presentacion,
        });
    } else {
        append({
            ...originalDefaultValues.items![0],
            codigo: lastItem.codigo,
            paleta: null,
            descripcion: lastItem.descripcion,
            lote: lastItem.lote,
            presentacion: lastItem.presentacion,
            cantidadPorPaleta: lastItem.cantidadPorPaleta,
            taraCaja: lastItem.taraCaja,
        });
    }
  };

  if (isLoadingForm) {
      return (
          <div className="flex min-h-screen w-full items-center justify-center">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="ml-4 text-lg">Cargando formulario...</p>
          </div>
      );
  }

  return (
    <FormProvider {...form}>
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
                if (productDialogContext) {
                    const { itemIndex, placaIndex } = productDialogContext;
                    const basePath = (isTunelMode && placaIndex !== undefined) ? `placas.${placaIndex}.items` : 'items';
                    form.setValue(`${basePath}.${itemIndex}.descripcion`, articulo.denominacionArticulo);
                    form.setValue(`${basePath}.${itemIndex}.codigo`, articulo.codigoProducto);
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
        <PedidoTypeSelectorDialog
            open={isPedidoTypeDialogOpen}
            onOpenChange={setPedidoTypeDialogOpen}
            pedidoTypes={pedidoTypes}
            onSelect={(pt) => {
                form.setValue('tipoPedido', pt.name);
                setPedidoTypeDialogOpen(false);
            }}
        />
        <div className="max-w-6xl mx-auto">
          <header className="mb-6 md:mb-8">
            <div className="relative flex items-center justify-center text-center">
              <Button variant="ghost" size="icon" className="absolute left-0 top-1/2 -translate-y-1/2" onClick={() => router.push(submissionId ? '/consultar-formatos' : '/')}>
                <ArrowLeft className="h-6 w-6" />
              </Button>
              <div>
                <div className="flex items-center justify-center gap-2">
                    <FileText className="h-7 w-7 md:h-8 md:w-8 text-primary"/>
                    <h1 className="text-xl md:text-2xl font-bold text-primary">{title}</h1>
                </div>
                <p className="text-xs md:text-sm text-gray-500">Complete todos los campos requeridos para registrar la operación.</p>
              </div>
            </div>
          </header>

          <Form {...form}>
            <form onSubmit={handleFormSubmit} className="space-y-6">
                <FormField
                  control={form.control}
                  name="unidadDeMedidaPrincipal"
                  render={({ field }) => <input type="hidden" {...field} />}
                />
                <Card>
                  <CardHeader>
                      <CardTitle>Información General</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                       <FormField
                            control={form.control}
                            name="tipoPedido"
                            render={({ field }) => (
                                <FormItem className="flex flex-col">
                                    <FormLabel>Tipo de Pedido <span className="text-destructive">*</span></FormLabel>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="w-full justify-between text-left font-normal"
                                        onClick={() => setPedidoTypeDialogOpen(true)}
                                    >
                                        {field.value || "Seleccione un tipo..."}
                                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
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
                                    <FormLabel>Tipo de Empaque (Maquila) <span className="text-destructive">*</span></FormLabel>
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
                        <FormField control={form.control} name="pedidoSislog" render={({ field }) => (
                            <FormItem>
                              <FormLabel>Pedido SISLOG <span className="text-destructive">*</span></FormLabel>
                              <FormControl><Input placeholder="Máximo 15 caracteres" {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                        )}/>
                        <FormField
                          control={form.control}
                          name="cliente"
                          render={({ field }) => (
                              <FormItem className="flex flex-col">
                                  <FormLabel>Cliente <span className="text-destructive">*</span></FormLabel>
                                  <Dialog open={isClientDialogOpen} onOpenChange={(isOpen) => {
                                      if (!isOpen) setClientSearch('');
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
                              <FormLabel>Fecha <span className="text-destructive">*</span></FormLabel>
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
                        <FormField control={form.control} name="conductor" render={({ field }) => (
                            <FormItem>
                              <FormLabel>Conductor {!isSpecialReception && <span className="text-destructive">*</span>}</FormLabel>
                              <FormControl><Input placeholder="Nombre del conductor" {...field} disabled={isTunelMode && watchedRecepcionPorPlaca} /></FormControl>
                              {isSpecialReception && <FormDescription>Si se deja vacío, se guardará como N/A.</FormDescription>}
                              <FormMessage />
                            </FormItem>
                        )}/>
                        <FormField control={form.control} name="cedulaConductor" render={({ field }) => (
                            <FormItem>
                              <FormLabel>Cédula Conductor {!isSpecialReception && <span className="text-destructive">*</span>}</FormLabel>
                              <FormControl><Input placeholder="Número de cédula" {...field} disabled={isTunelMode && watchedRecepcionPorPlaca} /></FormControl>
                              {isSpecialReception && <FormDescription>Si se deja vacío, se guardará como N/A.</FormDescription>}
                              <FormMessage />
                            </FormItem>
                        )}/>
                        <FormField control={form.control} name="placa" render={({ field }) => (
                            <FormItem>
                              <FormLabel>Placa del vehículo {!isSpecialReception && <span className="text-destructive">*</span>}</FormLabel>
                              <FormControl><Input placeholder="ABC123" {...field} disabled={isTunelMode && watchedRecepcionPorPlaca} onChange={(e) => field.onChange(e.target.value.toUpperCase())} maxLength={isTunelMode ? undefined : 6} /></FormControl>
                                {isSpecialReception && <FormDescription>Si se deja vacío, se guardará como N/A.</FormDescription>}
                              <FormMessage />
                            </FormItem>
                        )}/>
                        <FormField control={form.control} name="precinto" render={({ field }) => (
                            <FormItem>
                              <FormLabel>Precinto {!isSpecialReception && <span className="text-destructive">*</span>}</FormLabel>
                              <FormControl><Input placeholder="Precinto (máx. 50 caracteres)" {...field} /></FormControl>
                              {isSpecialReception && <FormDescription>Si se deja vacío, se guardará como N/A.</FormDescription>}
                              <FormMessage />
                            </FormItem>
                        )}/>
                        <FormField control={form.control} name="setPoint" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Set Point (°C) {!isSpecialReception && <span className="text-destructive">*</span>}</FormLabel>
                                <FormControl><Input type="text" inputMode="decimal" placeholder="0" {...field} onChange={e => field.onChange(e.target.value === '' ? undefined : e.target.value)} value={field.value ?? ''} /></FormControl>
                                {isSpecialReception && <FormDescription>Si se deja vacío, se guardará como N/A.</FormDescription>}
                                <FormMessage />
                            </FormItem>
                        )}/>
                         <FormField control={form.control} name="contenedor" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Contenedor {!isSpecialReception && <span className="text-destructive">*</span>}</FormLabel>
                                <FormControl><Input
                                    placeholder="ABCD1234567 o N/A"
                                    {...field}
                                    onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                                    value={field.value ?? ''}
                                /></FormControl>
                                {isSpecialReception && <FormDescription>Si se deja vacío, se guardará como N/A.</FormDescription>}
                                <FormMessage />
                            </FormItem>
                        )}/>
                        <FormField
                            control={form.control}
                            name="facturaRemision"
                            render={({ field }) => (
                                <FormItem className={cn("lg:col-span-1" )}>
                                    <FormLabel>Factura/Remisión</FormLabel>
                                    <FormControl><Input placeholder="Máx 15 caracteres" {...field} value={field.value ?? ''} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                  </CardContent>
                </Card>
              
                <Card>
                  <CardHeader><CardTitle>Detalle de la Recepción <span className="text-destructive">*</span></CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                     {isTunelMode ? (
                        <div className="space-y-4">
                            <FormField
                                control={form.control}
                                name="recepcionPorPlaca"
                                render={({ field }) => (
                                    <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4">
                                        <FormControl>
                                            <Checkbox
                                                checked={field.value}
                                                onCheckedChange={(checked) => {
                                                    field.onChange(checked);
                                                    if (checked) form.setValue('items', []); else form.setValue('placas', []);
                                                }}
                                                disabled={watchedTipoPedido === 'TUNEL DE CONGELACIÓN'}
                                            />
                                        </FormControl>
                                        <div className="space-y-1 leading-none">
                                            <FormLabel>Recepción por Placa</FormLabel>
                                            {watchedTipoPedido !== 'TUNEL DE CONGELACIÓN' && (
                                                <FormDescription>
                                                    Marque esta opción para agrupar ítems por placa de vehículo.
                                                </FormDescription>
                                            )}
                                        </div>
                                    </FormItem>
                                )}
                            />
                            {watchedRecepcionPorPlaca ? (
                                <div className="space-y-4">
                                    <Accordion type="multiple" className="w-full">
                                        {placaFields.map((placaField, placaIndex) => (
                                            <AccordionItem key={placaField.id} value={`placa-${placaIndex}`}>
                                                <div className="flex items-center">
                                                    <AccordionTrigger className="flex-grow">
                                                        <div className="flex items-center gap-2">
                                                            <Truck className="h-5 w-5 text-gray-600" />
                                                            Placa #{placaIndex + 1}: {watchedPlacas?.[placaIndex]?.numeroPlaca || '(Sin número)'}
                                                        </div>
                                                    </AccordionTrigger>
                                                    <Button type="button" variant="ghost" size="icon" className="text-destructive" onClick={() => removePlaca(placaIndex)}>
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                                <AccordionContent className="pl-2 pr-2 md:pl-6 md:pr-0">
                                                    <div className="space-y-4 rounded-md border bg-gray-50 p-4">
                                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                            <FormField
                                                                control={form.control}
                                                                name={`placas.${placaIndex}.numeroPlaca`}
                                                                render={({ field }) => (
                                                                    <FormItem>
                                                                        <FormLabel>Número de Placa <span className="text-destructive">*</span></FormLabel>
                                                                        <FormControl><Input placeholder="ABC123" {...field} onChange={e => field.onChange(e.target.value.toUpperCase())} /></FormControl>
                                                                        <FormMessage />
                                                                    </FormItem>
                                                                )}
                                                            />
                                                            <FormField
                                                                control={form.control}
                                                                name={`placas.${placaIndex}.conductor`}
                                                                render={({ field }) => (
                                                                    <FormItem>
                                                                        <FormLabel>Nombre Conductor <span className="text-destructive">*</span></FormLabel>
                                                                        <FormControl><Input placeholder="Nombre del conductor" {...field} /></FormControl>
                                                                        <FormMessage />
                                                                    </FormItem>
                                                                )}
                                                            />
                                                            <FormField
                                                                control={form.control}
                                                                name={`placas.${placaIndex}.cedulaConductor`}
                                                                render={({ field }) => (
                                                                    <FormItem>
                                                                        <FormLabel>Cédula Conductor <span className="text-destructive">*</span></FormLabel>
                                                                        <FormControl><Input placeholder="Número de cédula" {...field} /></FormControl>
                                                                        <FormMessage />
                                                                    </FormItem>
                                                                )}
                                                            />
                                                        </div>
                                                        <ItemsPorPlaca placaIndex={placaIndex} handleProductDialogOpening={handleProductDialogOpening} />
                                                    </div>
                                                </AccordionContent>
                                            </AccordionItem>
                                        ))}
                                    </Accordion>
                                    <Button type="button" variant="outline" onClick={() => appendPlaca({ numeroPlaca: '', conductor: '', cedulaConductor: '', items: [] })}><Truck className="mr-2 h-4 w-4"/>Agregar Placa</Button>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {fields.map((field, index) => (
                                        <ItemFields
                                            key={field.id}
                                            control={form.control}
                                            itemIndex={index}
                                            remove={remove}
                                            handleProductDialogOpening={handleProductDialogOpening}
                                        />
                                    ))}
                                    <Button type="button" variant="outline" onClick={handleAddItem}><PlusCircle className="mr-2 h-4 w-4" />Agregar Ítem</Button>
                                </div>
                            )}
                        </div>
                     ) : (
                        <div className="space-y-4">
                            {fields.map((field, index) => (
                                <ItemFields
                                    key={field.id}
                                    control={form.control}
                                    itemIndex={index}
                                    remove={remove}
                                    handleProductDialogOpening={handleProductDialogOpening}
                                />
                            ))}
                            <Button type="button" variant="outline" onClick={handleAddItem}><PlusCircle className="mr-2 h-4 w-4" />Agregar Ítem</Button>
                        </div>
                     )}
                     {isTunelCongelacion && (
                        <div className="mt-6 pt-6 border-t">
                            <FormField
                                control={form.control}
                                name="totalPaletasTunel"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Total Paletas de la Recepción <span className="text-destructive">*</span></FormLabel>
                                        <FormControl>
                                            <Input
                                                type="number"
                                                placeholder="0"
                                                {...field}
                                                onChange={e => field.onChange(parseInt(e.target.value, 10) || undefined)}
                                                value={field.value ?? ''}
                                            />
                                        </FormControl>
                                        <FormDescription>
                                            Ingrese el número total de paletas para toda esta recepción de túnel.
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>
                    )}
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
                                        {(isTunelMode && watchedRecepcionPorPlaca) && <TableHead>Placa</TableHead>}
                                        <TableHead>{isTunelMode ? 'Producto' : 'Descripción'}</TableHead>
                                        <TableHead className="w-[240px]">Temperaturas (°C) <span className="text-destructive">*</span></TableHead>
                                        <TableHead className="text-right">Total Paletas</TableHead>
                                        <TableHead className="text-right">Total Cantidad</TableHead>
                                        <TableHead className="text-right">Total Peso (kg)</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {form.getValues('summary')?.length > 0 ? (
                                        form.getValues('summary')?.map((summaryItem, summaryIndex) => {
                                           const itemData = calculatedSummaryForDisplay.items.find(i => (
                                                isTunelMode && watchedRecepcionPorPlaca && (i as any).placa ? `${(i as any).placa}|${i.descripcion}` : i.descripcion
                                           ) === (summaryItem.placa ? `${summaryItem.placa}|${summaryItem.descripcion}`: summaryItem.descripcion));
                                           return (
                                            <TableRow key={summaryIndex}>
                                                {(isTunelMode && watchedRecepcionPorPlaca) && (
                                                    <TableCell className="font-medium">
                                                        <div className="bg-muted/50 p-2 rounded-md flex items-center h-10">
                                                            {(summaryItem as any).placa}
                                                        </div>
                                                    </TableCell>
                                                )}
                                                <TableCell className="font-medium">
                                                    <div className="bg-muted/50 p-2 rounded-md flex items-center h-10">
                                                        {summaryItem.descripcion}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-1">
                                                            <FormField
                                                                control={form.control}
                                                                name={`summary.${summaryIndex}.temperatura1`}
                                                                render={({ field }) => (
                                                                    <FormItem>
                                                                        <FormControl><Input type="text" inputMode="decimal" placeholder="T1" {...field} 
                                                                                onChange={e => field.onChange(e.target.value === '' ? undefined : e.target.value)} 
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
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="bg-muted/50 p-2 rounded-md flex items-center justify-end h-10">
                                                        {(itemData as any)?.totalPaletas || 0}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                  <div className="bg-muted/50 p-2 rounded-md flex items-center justify-end h-10">
                                                    {itemData?.totalCantidad || 0}
                                                  </div>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                  <div className="bg-muted/50 p-2 rounded-md flex items-center justify-end h-10">
                                                    {(itemData?.totalPeso || 0).toFixed(2)}
                                                  </div>
                                                </TableCell>
                                            </TableRow>
                                        )})
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={6} className="h-24 text-center">
                                                Agregue ítems para ver el resumen.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                    <TableRow className="font-bold bg-muted hover:bg-muted">
                                        <TableCell colSpan={(isTunelMode && watchedRecepcionPorPlaca) ? 3 : 2} className="text-right">TOTAL GENERAL:</TableCell>
                                        <TableCell className="text-right pl-4">{calculatedSummaryForDisplay.totalGeneralPaletas}</TableCell>
                                        <TableCell className="text-right">{calculatedSummaryForDisplay.items.reduce((acc, item) => acc + (item.totalCantidad || 0), 0)}</TableCell>
                                        <TableCell className="text-right">{(calculatedSummaryForDisplay.items.reduce((acc, item) => acc + (item.totalPeso || 0), 0)).toFixed(2)}</TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                  </Card>
                )}
              
                <Card>
                  <CardHeader><CardTitle>Tiempo y Observaciones de la Operación</CardTitle></CardHeader>
                  <CardContent className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <FormField control={form.control} name="horaInicio" render={({ field }) => (
                          <FormItem>
                              <FormLabel>Hora Inicio <span className="text-destructive">*</span></FormLabel>
                               <div className="flex items-center gap-2">
                                <FormControl>
                                    <Input type="time" placeholder="HH:MM" {...field} className="flex-grow" />
                                </FormControl>
                                <Button type="button" variant="outline" size="icon" onClick={() => handleCaptureTime('horaInicio')}>
                                    <Clock className="h-4 w-4" />
                                </Button>
                              </div>
                              <FormMessage />
                          </FormItem>
                          )}/>
                          <FormField control={form.control} name="horaFin" render={({ field }) => (
                          <FormItem>
                              <FormLabel>Hora Fin <span className="text-destructive">*</span></FormLabel>
                              <div className="flex items-center gap-2">
                                <FormControl>
                                    <Input type="time" placeholder="HH:MM" {...field} className="flex-grow" />
                                </FormControl>
                                 <Button type="button" variant="outline" size="icon" onClick={() => handleCaptureTime('horaFin')}>
                                    <Clock className="h-4 w-4" />
                                </Button>
                              </div>
                              <FormMessage />
                          </FormItem>
                          )}/>
                      </div>
                       <div>
                        <Label>Observaciones</Label>
                        <div className="space-y-4 mt-2">
                            {observationFields.map((field, index) => {
                                const selectedObservation = watchedObservations?.[index];
                                const allObservations = [...standardObservations, {id: 'OTRAS', name: 'OTRAS OBSERVACIONES', quantityType: ''}]
                                const stdObsData = allObservations.find(obs => obs.name === selectedObservation?.type);
                                const isOtherType = selectedObservation?.type === 'OTRAS OBSERVACIONES';
                                const showCrewCheckbox = selectedObservation?.type === 'REESTIBADO' || selectedObservation?.type === 'TRANSBORDO CANASTILLA' || selectedObservation?.type === 'SALIDA PALETAS TUNEL';
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
                                                            <Textarea placeholder="Describa la observación" {...field} onChange={(e) => field.onChange(e.target.value.toUpperCase())} />
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
                                            {showCrewCheckbox && (
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
                                                                <Label htmlFor={`obs-check-${index}`} className="font-normal cursor-pointer uppercase">
                                                                    REALIZADO POR CUADRILLA
                                                                </Label>
                                                            </div>
                                                        </FormItem>
                                                    )}
                                                />
                                            )}
                                        </>
                                        )}
                                    </div>
                                </div>
                            )})}
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => appendObservation({ type: '', quantity: 0, executedByGrupoRosales: false, customType: '', quantityType: '' })}
                                className="mt-4"
                            >
                                <PlusCircle className="mr-2 h-4 w-4" />
                                Agregar Observación
                            </Button>
                        </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle>Responsables de la Operación</CardTitle></CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                        <FormField control={form.control} name="coordinador" render={({ field }) => (
                            <FormItem><FormLabel>Coordinador Responsable <span className="text-destructive">*</span></FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Seleccione un coordinador" /></SelectTrigger></FormControl><SelectContent>{coordinadores.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                        )}/>
                        {submissionId && isAdmin ? (
                             <FormField control={form.control} name="operarioResponsable" render={({ field }) => (
                                <FormItem>
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
                            <FormItem>
                                <FormLabel>Operario Responsable</FormLabel>
                                <FormControl><Input disabled value={submissionId ? originalSubmission?.userDisplayName : displayName || ''} /></FormControl>
                            </FormItem>
                        )}
                        {watchedTipoPedido !== 'INGRESO DE SALDOS' && watchedTipoPedido !== 'TUNEL A CÁMARA CONGELADOS' && (
                            <>
                                <FormField
                                    control={form.control}
                                    name="aplicaCuadrilla"
                                    render={({ field }) => (
                                        <FormItem className="space-y-1">
                                            <FormLabel>Operación Realizada por Cuadrilla <span className="text-destructive">*</span></FormLabel>
                                            <FormControl><RadioGroup onValueChange={field.onChange} value={field.value} className="flex gap-4 pt-2"><FormItem className="flex items-center space-x-2"><RadioGroupItem value="si" id="cuadrilla-si" /><Label htmlFor="cuadrilla-si">Sí</Label></FormItem><FormItem className="flex items-center space-x-2"><RadioGroupItem value="no" id="cuadrilla-no" /><Label htmlFor="cuadrilla-no">No</Label></FormItem></RadioGroup></FormControl><FormMessage /></FormItem>
                                    )}
                                />
                                {watchedAplicaCuadrilla === 'si' && watchedTipoPedido === 'MAQUILA' && (
                                    <FormField
                                        control={form.control}
                                        name="numeroOperariosCuadrilla"
                                        render={({ field }) => (
                                            <FormItem>
                                            <FormLabel>No. de Operarios <span className="text-destructive">*</span></FormLabel>
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
                            </>
                        )}
                    </div>
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
                                                Esta acción no se puede deshacer. Se eliminará toda la información que ha ingresado en el formato.
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
                    <Button type="button" variant="outline" onClick={() => setDiscardAlertOpen(true)} className="w-full sm:w-auto"><RotateCcw className="mr-2 h-4 w-4"/>Limpiar Formato</Button>
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
    </FormProvider>
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

function PedidoTypeSelectorDialog({
    open,
    onOpenChange,
    pedidoTypes,
    onSelect,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    pedidoTypes: PedidoType[];
    onSelect: (pedidoType: PedidoType) => void;
}) {
    const [search, setSearch] = useState("");

    const filteredTypes = useMemo(() => {
        if (!search) return pedidoTypes;
        return pedidoTypes.filter(pt => pt.name.toLowerCase().includes(search.toLowerCase()));
    }, [search, pedidoTypes]);

    useEffect(() => {
        if (!open) setSearch("");
    }, [open]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Seleccionar Tipo de Pedido</DialogTitle>
                </DialogHeader>
                <Input
                    placeholder="Buscar tipo de pedido..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="my-4"
                />
                <ScrollArea className="h-72">
                    <div className="space-y-1">
                        {filteredTypes.length > 0 ? filteredTypes.map((pt) => (
                            <Button
                                key={pt.id}
                                variant="ghost"
                                className="w-full justify-start"
                                onClick={() => onSelect(pt)}
                            >
                                {pt.name}
                            </Button>
                        )) : (
                            <p className="text-center text-sm text-muted-foreground">No se encontraron tipos de pedido.</p>
                        )}
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
}







