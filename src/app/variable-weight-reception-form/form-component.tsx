
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
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

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
    sesion: z.string().optional(),
});

const placaSchema = z.object({
  numeroPlaca: z.string()
    .min(1, "El número de placa es obligatorio.")
    .regex(/^[A-Z]{3}[0-9]{3}$/, "Formato de placa inválido. Deben ser 3 letras y 3 números (ej: ABC123)."),
  conductor: z.string().min(1, "El nombre del conductor es obligatorio."),
  cedulaConductor: z.string().min(1, "La cédula del conductor es obligatoria.").regex(/^[0-9]*$/, "La cédula solo puede contener números."),
  items: z.array(itemSchema).min(1, "Debe agregar al menos un ítem a la placa."),
});

const requiredTempSchema = z.coerce.number({ required_error: "T1 es requerida.", invalid_type_error: "T1 debe ser un número." }).min(-99).max(99);

const optionalTempSchema = z.preprocess(
    (val) => (val === "" || val === null ? null : val),
    z.coerce.number({ invalid_type_error: "La temperatura debe ser un número." }).min(-99).max(99).nullable().optional()
);

const summaryItemSchema = z.object({
  descripcion: z.string().optional(),
  presentacion: z.string().optional(),
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
    contenedor: z.string().optional().refine(value => {
        if (!value) return true; // Optional field, so empty is ok
        const format1 = /^[A-Z]{4}[0-9]{7}$/;
        const format2 = /^[A-Z]{2}[0-9]{6}-[0-9]{4}$/;
        const upperValue = value.toUpperCase();
        return upperValue === 'N/A' || upperValue === 'NO APLICA' || format1.test(upperValue) || format2.test(upperValue);
    }, {
        message: "Formato inválido. Debe ser 'No Aplica', 4 letras y 7 números, o 2 letras, 6 números, guion y 4 números."
    }),
    facturaRemision: z.string().max(15, "Máximo 15 caracteres.").nullable().optional(),
    totalPesoBrutoKg: z.coerce.number().min(0, "El peso bruto total no puede ser negativo.").optional(),
    
    recepcionPorPlaca: z.boolean().default(false),
    items: z.array(itemSchema).optional(),
    placas: z.array(placaSchema).optional(),
    
    summary: z.array(summaryItemSchema).nullable().optional(),
    horaInicio: z.string().min(1, "La hora de inicio es obligatoria.").regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Formato de hora inválido (HH:MM)."),
    horaFin: z.string().min(1, "La hora de fin es obligatoria.").regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Formato de hora inválido (HH:MM)."),
    observaciones: z.array(observationSchema).optional(),
    coordinador: z.string().min(1, "Seleccione un coordinador."),
    aplicaCuadrilla: z.enum(["si", "no"]).optional(),
    operarioResponsable: z.string().optional(),
    tipoPedido: z.string({required_error: "El tipo de pedido es obligatorio."}).min(1, "El tipo de pedido es obligatorio."),
    tipoEmpaqueMaquila: z.enum(['EMPAQUE DE SACOS', 'EMPAQUE DE CAJAS']).optional(),
    salidaPaletasMaquilaCO: z.coerce.number().int().min(0, "Debe ser un número no negativo.").optional(),
    salidaPaletasMaquilaRE: z.coerce.number().int().min(0, "Debe ser un número no negativo.").optional(),
    salidaPaletasMaquilaSE: z.coerce.number().int().min(0, "Debe ser un número no negativo.").optional(),
    numeroOperariosCuadrilla: z.coerce.number().min(0.1, "Debe ser mayor a 0.").optional(),
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

      // Validar items
      const allItems = data.recepcionPorPlaca ? data.placas?.flatMap(p => p.items) : data.items;
      allItems?.forEach((item, index) => {
          const basePath = data.recepcionPorPlaca ? `placas.${Math.floor(index / (data.placas?.[0]?.items?.length || 1))}.items.${index % (data.placas?.[0]?.items?.length || 1)}` : `items.${index}`;
          const isSummaryRow = Number(item.paleta) === 0;
          const isSpecialOrderType = data.tipoPedido === "INGRESO DE SALDOS" || data.tipoPedido === "MAQUILA";

          if (isSummaryRow) {
              if (item.totalCantidad === undefined || item.totalCantidad === null) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Total Cantidad requerido.', path: [`${basePath}.totalCantidad`] });
              if (item.totalPesoNeto === undefined || item.totalPesoNeto === null) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Total Peso Neto requerido.', path: [`${basePath}.totalPesoNeto`] });
          } else if (!isSpecialOrderType) {
              if (item.cantidadPorPaleta === undefined || item.cantidadPorPaleta === null) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Cantidad requerida.', path: [`${basePath}.cantidadPorPaleta`] });
              if (item.pesoBruto === undefined || item.pesoBruto === null) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'P. Bruto requerido.', path: [`${basePath}.pesoBruto`] });
              if (item.taraEstiba === undefined || item.taraEstiba === null) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'T. Estiba requerida.', path: [`${basePath}.taraEstiba`] });
              if (item.taraCaja === undefined || item.taraCaja === null) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'T. Caja requerida.', path: [`${basePath}.taraCaja`] });
          }
      });
});

