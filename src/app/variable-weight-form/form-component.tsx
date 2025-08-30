
"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback, ReactNode } from "react";
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
import { useClientChangeHandler } from "@/hooks/useClientChangeHandler";
import { saveForm } from "@/app/actions/save-form";
import { storage } from "@/lib/firebase";
import { ref, uploadString, getDownloadURL } from "firebase/storage";
import { optimizeImage } from "@/lib/image-optimizer";
import { getSubmissionById, type SubmissionResult } from "@/app/actions/consultar-formatos";
import { getStandardObservations, type StandardObservation } from "@/app/gestion-observaciones/actions";
import { PedidoType } from "@/app/gestion-tipos-pedido/actions";
import { Html5Qrcode } from "html5-qrcode";
import { getPalletInfoByCode, type PalletInfo } from "@/app/actions/pallet-lookup";


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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
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
    ChevronsUpDown,
    FileText,
    Edit2,
    Loader2,
    Check,
    CalendarIcon,
    Clock,
    MapPin,
    QrCode,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RestoreDialog } from "@/components/app/restore-dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription as AlertDialogDesc, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Calendar } from "@/components/ui/calendar";

const itemSchema = z.object({
    codigo: z.string().min(1, "El código es requerido."),
    paleta: z.coerce.number({
          required_error: "La paleta es requerida.",
          invalid_type_error: "La paleta es requerida.",
      }).int({ message: "La paleta debe ser un número entero." }).min(0, "Debe ser un número no negativo.").nullable(),
    descripcion: z.string().min(1, "La descripción es requerida."),
    lote: z.string().max(15, "Máximo 15 caracteres").optional(),
    presentacion: z.string().min(1, "Seleccione una presentación."),
    destino: z.string().optional(), // This is now set at the destination group level
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
    // If it's a summary row (paleta is exactly 0)
    if (data.paleta === 0) {
      if (data.totalCantidad === undefined || data.totalCantidad === null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "El Total Cantidad es requerido.", path: ["totalCantidad"] });
      }
      if (data.totalPesoNeto === undefined || data.totalPesoNeto === null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "El Total Peso Neto es requerido.", path: ["totalPesoNeto"] });
      }
    } 
    // Otherwise, it's an individual pallet row
    else {
      if (data.paleta === null) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La paleta es requerida.", path: ["paleta"] });
      }
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

const destinoSchema = z.object({
  nombreDestino: z.string().min(1, 'El destino es requerido.'),
  items: z.array(itemSchema).min(1, "Debe agregar al menos un ítem al destino."),
});

const tempSchema = z.preprocess(
    (val) => (val === "" ? null : val),
    z.coerce.number({ 
        invalid_type_error: "La temperatura debe ser un número." 
    })
      .min(-99, "El valor debe estar entre -99 y 99.")
      .max(99, "El valor debe estar entre -99 y 99.")
      .nullable()
);

const summaryItemSchema = z.object({
    descripcion: z.string(),
    temperatura: tempSchema,
    totalPeso: z.number(),
    totalCantidad: z.number(),
    totalPaletas: z.number(),
    destino: z.string().optional(),
}).refine(data => {
    // Al menos una temperatura es requerida.
    return data.temperatura !== null;
}, {
    message: "Debe ingresar al menos una temperatura para el producto.",
    path: ["temperatura"], // report error on the first temperature field
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
    contenedor: z.string().min(1, "El contenedor es obligatorio.").refine(value => {
        const format1 = /^[A-Z]{4}[0-9]{7}$/;
        const format2 = /^[A-Z]{2}[0-9]{6}-[0-9]{4}$/;
        const upperValue = value.toUpperCase();
        return upperValue === 'N/A' || format1.test(upperValue) || format2.test(upperValue);
    }, {
        message: "Formato inválido. Debe ser 'N/A', 4 letras y 7 números, o 2 letras, 6 números, guion y 4 números."
    }),
    despachoPorDestino: z.boolean().default(false),
    totalPaletasDespacho: z.coerce.number().int().min(0, "Debe ser un número no negativo.").optional(),
    items: z.array(itemSchema),
    destinos: z.array(destinoSchema),
    summary: z.array(summaryItemSchema).nullable(),
    horaInicio: z.string().min(1, "La hora de inicio es obligatoria.").regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Formato de hora inválido (HH:MM)."),
    horaFin: z.string().min(1, "La hora de fin es obligatoria.").regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Formato de hora inválido (HH:MM)."),
    observaciones: z.array(observationSchema).optional(),
    coordinador: z.string().min(1, "Seleccione un coordinador."),
    aplicaCuadrilla: z.enum(["si", "no"], { required_error: "Seleccione una opción para 'Operación Realizada por Cuadrilla'." }),
    operarioResponsable: z.string().optional(),
    tipoPedido: z.string({required_error: "El tipo de pedido es obligatorio."}).min(1, "El tipo de pedido es obligatorio."),
    unidadDeMedidaPrincipal: z.string().optional(),
}).refine((data) => {
    if (data.horaInicio && data.horaFin && data.horaInicio === data.horaFin) {
        return false;
    }
    return true;
}, {
    message: "La hora de fin no puede ser igual a la de inicio.",
    path: ["horaFin"],
}).superRefine((data, ctx) => {
    const allItems = data.despachoPorDestino ? data.destinos.flatMap(d => d.items) : data.items;
    
    if (data.despachoPorDestino && data.destinos.length === 0) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Debe agregar al menos un destino.",
            path: ["destinos"],
        });
    }

    if (!data.despachoPorDestino && data.items.length === 0) {
         ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Debe agregar al menos un ítem.",
            path: ["items"],
        });
    }

    const hasSummaryRow = allItems.some(item => Number(item.paleta) === 0);
    if (data.despachoPorDestino && hasSummaryRow && (data.totalPaletasDespacho === undefined || data.totalPaletasDespacho === null || data.totalPaletasDespacho <= 0)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "El total de paletas del despacho es requerido.",
            path: ["totalPaletasDespacho"],
        });
    }
    
    // START: Pallet duplication validation
    if (data.despachoPorDestino) {
        data.destinos.forEach((destino, destinoIndex) => {
            const seenPallets = new Set<number>();
            destino.items.forEach((item, itemIndex) => {
                const paletaNum = Number(item.paleta);
                // Ignore summary (0) and special (999) pallets
                if (!isNaN(paletaNum) && paletaNum > 0 && paletaNum !== 999) {
                    if (seenPallets.has(paletaNum)) {
                        ctx.addIssue({
                            code: z.ZodIssueCode.custom,
                            message: "La paleta ya existe en este destino.",
                            path: [`destinos`, destinoIndex, 'items', itemIndex, 'paleta'],
                        });
                    }
                    seenPallets.add(paletaNum);
                }
            });
        });
    }
    // END: Pallet duplication validation
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
  despachoPorDestino: false,
  totalPaletasDespacho: undefined,
  items: [],
  destinos: [],
  summary: [],
  horaInicio: "",
  horaFin: "",
  observaciones: [],
  coordinador: "",
  aplicaCuadrilla: undefined,
  operarioResponsable: undefined,
  tipoPedido: undefined,
  unidadDeMedidaPrincipal: "PALETA",
};

// Mock data
const coordinadores = ["Cristian Acuña", "Sergio Padilla"];
const presentaciones = ["Cajas", "Sacos", "Canastillas"];
const clientesEspeciales = ["AVICOLA EL MADROÑO S.A.", "SMYL TRANSPORTE Y LOGISTICA SAS", "AVICOLA EMBUTIDOS", "COMERCIALIZADORA FRESMAR SAS", "W&L WORLDWIDE TRADING SAS"];

// Attachment Constants
const MAX_ATTACHMENTS = 60;
const MAX_TOTAL_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

function getByteSizeFromBase64(base64: string): number {
    return base64.length * (3 / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
}

function ItemsPorDestino({ control, remove, handleProductDialogOpening, destinoIndex }: { control: any; remove: (index: number) => void, handleProductDialogOpening: (context: { itemIndex: number, destinoIndex: number }) => void; destinoIndex: number }) {
    const { getValues } = useFormContext();
    const { fields, append, remove: removeItem } = useFieldArray({
        control,
        name: `destinos.${destinoIndex}.items`,
    });

    const watchedItems = useWatch({ control, name: `destinos.${destinoIndex}.items` }) || [];
    const isSummaryFormat = watchedItems.some((item: any) => Number(item?.paleta) === 0);

    const subtotals = useMemo(() => {
        return watchedItems.reduce((acc: {cantidad: number, paletas: number, peso: number}, item: any) => {
            if (isSummaryFormat) {
                acc.cantidad += Number(item.totalCantidad) || 0;
                acc.paletas += Number(item.totalPaletas) || 0;
                acc.peso += Number(item.totalPesoNeto) || 0;
            } else {
                acc.cantidad += Number(item.cantidadPorPaleta) || 0;
                acc.peso += Number(item.pesoNeto) || 0;
            }
            return acc;
        }, { cantidad: 0, paletas: 0, peso: 0 });
    }, [watchedItems, isSummaryFormat]);

    if (!isSummaryFormat) {
        const uniquePallets = new Set();
        let pallets999Count = 0;
        watchedItems.forEach((item: any) => {
            const paletaNum = Number(item.paleta);
            if (!isNaN(paletaNum) && paletaNum > 0) {
                 if (paletaNum === 999) {
                    pallets999Count++;
                } else {
                    uniquePallets.add(paletaNum);
                }
            }
        });
        subtotals.paletas = uniquePallets.size + pallets999Count;
    }


    const handleAddItem = () => {
        const items = getValues(`destinos.${destinoIndex}.items`);
        const lastItem = items.length > 0 ? items[items.length - 1] : null;

        if (!lastItem) {
            append({
                codigo: '', paleta: null, descripcion: "", lote: "", presentacion: "",
                cantidadPorPaleta: null, pesoBruto: null, taraEstiba: null, taraCaja: null, totalTaraCaja: null, pesoNeto: null,
                totalCantidad: null, totalPaletas: null, totalPesoNeto: null
            });
            return;
        }

        if (lastItem.paleta === 0) {
            append({
                codigo: lastItem.codigo, descripcion: lastItem.descripcion, lote: lastItem.lote, presentacion: lastItem.presentacion,
                paleta: 0, totalCantidad: null, totalPaletas: null, totalPesoNeto: null,
                cantidadPorPaleta: null, pesoBruto: null, taraEstiba: null, taraCaja: null, totalTaraCaja: null, pesoNeto: null,
            });
        } else {
            append({
                codigo: lastItem.codigo,
                descripcion: lastItem.descripcion,
                lote: lastItem.lote,
                presentacion: lastItem.presentacion,
                cantidadPorPaleta: lastItem.cantidadPorPaleta,
                taraCaja: lastItem.taraCaja,
                paleta: null,
                pesoBruto: null,
                taraEstiba: null,
                totalTaraCaja: null,
                pesoNeto: null,
                totalCantidad: null,
                totalPaletas: null,
                totalPesoNeto: null,
            });
        }
    };

    return (
        <div className="space-y-4 pl-4 border-l-2 ml-2">
            {fields.map((field, itemIndex) => (
                <ItemFields key={field.id} control={control} itemIndex={itemIndex} handleProductDialogOpening={handleProductDialogOpening} destinoIndex={destinoIndex} remove={removeItem} />
            ))}
            <div className="flex justify-between items-center mt-4 pt-4 border-t">
                <Button type="button" variant="outline" size="sm" onClick={handleAddItem}><PlusCircle className="mr-2 h-4 w-4" />Agregar Ítem a Destino</Button>
                <div className="flex gap-4 text-sm font-medium">
                    <span>Subtotal Cantidad: {subtotals.cantidad}</span>
                     {!isSummaryFormat && <span>Subtotal Paletas: {subtotals.paletas}</span>}
                    <span>Subtotal Peso: {subtotals.peso.toFixed(2)} kg</span>
                </div>
            </div>
        </div>
    );
}

const ItemFields = ({ control, itemIndex, handleProductDialogOpening, remove, destinoIndex }: { control: any, itemIndex: number, handleProductDialogOpening: (context: { itemIndex: number, destinoIndex?: number }) => void, remove?: (index: number) => void, destinoIndex?: number }) => {
    const { toast } = useToast();
    const [isLoadingPallet, setIsLoadingPallet] = useState(false);
    const [isConfirmLoadOpen, setConfirmLoadOpen] = useState(false);
    const [foundPalletInfo, setFoundPalletInfo] = useState<PalletInfo | null>(null);

    const { setValue, getValues } = useFormContext();
    const basePath = destinoIndex !== undefined ? `destinos.${destinoIndex}.items` : 'items';
    const watchedItem = useWatch({ control, name: `${basePath}.${itemIndex}` });
    const isDespachoPorDestino = useWatch({ control, name: 'despachoPorDestino' });

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

    const handlePalletLookup = async (palletCode: string) => {
        if (!palletCode || palletCode === "0" || palletCode === "999") return;
        setIsLoadingPallet(true);
        try {
            const result = await getPalletInfoByCode(palletCode);
            if (result.success && result.palletInfo) {
                setFoundPalletInfo(result.palletInfo);
                setConfirmLoadOpen(true);
            } else if (!result.success && !result.alreadyDispatched) {
                // Do nothing, allow manual entry
            } else {
                toast({ variant: "destructive", title: "Error de Paleta", description: result.message });
            }
        } catch (error) {
            toast({ variant: "destructive", title: "Error de Servidor", description: "No se pudo buscar la información de la paleta." });
        } finally {
            setIsLoadingPallet(false);
        }
    };
    
    const confirmLoadPalletData = () => {
        if (!foundPalletInfo) return;
        setValue(`${basePath}.${itemIndex}.codigo`, foundPalletInfo.codigo);
        setValue(`${basePath}.${itemIndex}.descripcion`, foundPalletInfo.descripcion);
        setValue(`${basePath}.${itemIndex}.lote`, foundPalletInfo.lote);
        setValue(`${basePath}.${itemIndex}.presentacion`, foundPalletInfo.presentacion);
        setValue(`${basePath}.${itemIndex}.cantidadPorPaleta`, foundPalletInfo.cantidadPorPaleta);
        setValue(`${basePath}.${itemIndex}.pesoBruto`, foundPalletInfo.pesoBruto);
        setValue(`${basePath}.${itemIndex}.taraEstiba`, foundPalletInfo.taraEstiba);
        setValue(`${basePath}.${itemIndex}.taraCaja`, foundPalletInfo.taraCaja);
        // Let the useEffect recalculate pesoNeto and totalTaraCaja
        setConfirmLoadOpen(false);
        setFoundPalletInfo(null);
    };

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
                        <Button type="button" variant="outline" className="w-full justify-between h-10 text-left font-normal" onClick={() => handleProductDialogOpening({ itemIndex, destinoIndex })}>
                            <span className="truncate">{field.value || "Seleccionar código..."}</span>
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                        <FormMessage />
                    </FormItem>
                )} />
                <FormField control={control} name={`${basePath}.${itemIndex}.descripcion`} render={({ field }) => (
                    <FormItem className="md:col-span-2">
                        <FormLabel>Descripción <span className="text-destructive">*</span></FormLabel>
                        <Button type="button" variant="outline" className="w-full justify-between h-10 text-left font-normal" onClick={() => handleProductDialogOpening({ itemIndex, destinoIndex })}>
                            <span className="truncate">{field.value || "Seleccionar producto..."}</span>
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                        <FormMessage />
                    </FormItem>
                )} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField control={control} name={`${basePath}.${itemIndex}.paleta`} render={({ field }) => (
                    <FormItem>
                        <FormLabel>Paleta <span className="text-destructive">*</span></FormLabel>
                        <div className="flex items-center gap-2">
                            <FormControl>
                                <Input 
                                    type="text" 
                                    inputMode="numeric" 
                                    placeholder="0 para resumen" 
                                    {...field}
                                    onBlur={(e) => handlePalletLookup(e.target.value)}
                                    onChange={e => field.onChange(e.target.value === '' ? null : Number(e.target.value))} value={field.value ?? ''} />
                            </FormControl>
                             <Button type="button" variant="outline" size="icon" disabled={isLoadingPallet} onClick={() => console.log('Scanner not implemented yet')}>
                                {isLoadingPallet ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
                            </Button>
                        </div>
                        <FormMessage />
                    </FormItem>
                )} />
                <FormField control={control} name={`${basePath}.${itemIndex}.lote`} render={({ field }) => (
                    <FormItem><FormLabel>Lote</FormLabel><FormControl><Input placeholder="Lote (máx. 15)" {...field} value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value.toUpperCase())} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={control} name={`${basePath}.${itemIndex}.presentacion`} render={({ field }) => (
                    <FormItem><FormLabel>Presentación <span className="text-destructive">*</span></FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Seleccione" /></SelectTrigger></FormControl><SelectContent>{presentaciones.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                )} />
            </div>
            {isSummaryRow ? (
                <div className={cn("grid grid-cols-1 gap-4", isDespachoPorDestino ? 'md:grid-cols-2' : 'md:grid-cols-3')}>
                    <FormField control={control} name={`${basePath}.${itemIndex}.totalCantidad`} render={({ field }) => (
                        <FormItem><FormLabel>Total Cantidad <span className="text-destructive">*</span></FormLabel><FormControl><Input type="text" inputMode="numeric" pattern="[0-9]*" placeholder="0" {...field} onChange={e => field.onChange(e.target.value === '' ? null : e.target.value)} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                    )} />
                    {!isDespachoPorDestino && (
                        <FormField control={control} name={`${basePath}.${itemIndex}.totalPaletas`} render={({ field }) => (
                            <FormItem><FormLabel>Total Paletas</FormLabel><FormControl><Input type="text" inputMode="numeric" min="0" placeholder="0" {...field} onChange={e => field.onChange(e.target.value === '' ? null : e.target.value)} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                        )} />
                    )}
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
        <AlertDialog open={isConfirmLoadOpen} onOpenChange={setConfirmLoadOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Datos Encontrados</AlertDialogTitle>
                    <AlertDialogDesc>
                        Se encontraron datos para la paleta {watchedItem?.paleta}. ¿Desea cargarlos en este ítem?
                    </AlertDialogDesc>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setConfirmLoadOpen(false)}>No, Ingresar Manualmente</AlertDialogCancel>
                    <AlertDialogAction onClick={confirmLoadPalletData}>Sí, Cargar Datos</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
      </div>
    );
};
