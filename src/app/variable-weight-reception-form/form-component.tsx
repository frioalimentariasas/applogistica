
"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import Image from "next/image";

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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
    ArrowLeft,
    CalendarIcon,
    Clock,
    Trash2,
    PlusCircle,
    UploadCloud,
    Camera,
    Send,
    RotateCcw,
    ChevronsUpDown,
    CheckIcon,
    File,
    Edit2
} from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";


const itemSchema = z.object({
  paleta: z.coerce.number().int().min(0, "Debe ser un número no negativo."),
  descripcion: z.string().min(1, "La descripción es requerida."),
  lote: z.string().max(15, "Máximo 15 caracteres").optional(),
  presentacion: z.string().min(1, "Seleccione una presentación."),
  cantidadPorPaleta: z.coerce.number().int().min(0, "Debe ser un número no negativo."),
  pesoBruto: z.coerce.number().min(0, "Debe ser un número no negativo."),
  taraEstiba: z.coerce.number().min(0, "Debe ser un número no negativo."),
  taraCaja: z.coerce.number().min(0, "Debe ser un número no negativo."),
  totalTaraCaja: z.number().optional(),
  pesoNeto: z.number().optional(),
});

const formSchema = z.object({
  pedidoSislog: z.string()
    .max(10, "El número de pedido no puede exceder los 10 dígitos.")
    .regex(/^[0-9]*$/, "El pedido solo puede contener números.")
    .optional(),
  cliente: z.string().min(1, "Seleccione un cliente."),
  fecha: z.date({ required_error: "La fecha es obligatoria." }),
  cedulaConductor: z.string().min(1, "La cédula del conductor es obligatoria."),
  conductor: z.string().min(1, "El nombre del conductor es obligatorio."),
  placa: z.string().min(1, "La placa es obligatoria."),
  precinto: z.string().max(50, "Máximo 50 caracteres.").optional(),
  setPoint: z.coerce.number(),
  items: z.array(itemSchema).min(1, "Debe agregar al menos un item."),
  horaInicio: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Formato de hora inválido (HH:MM)."),
  horaFin: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Formato de hora inválido (HH:MM)."),
  observaciones: z.string().max(250, "Máximo 250 caracteres.").optional(),
  coordinador: z.string().min(1, "Seleccione un coordinador."),
});


// Mock data
const clientes = ["Cliente A", "Cliente B", "Cliente C"];
const coordinadores = ["Coordinador 1", "Coordinador 2"];
const presentaciones = ["Caja", "Bolsa", "Paquete"];
const productosExistentes = [
    { value: 'PROD001', label: 'Pollo Entero Congelado' },
    { value: 'PROD002', label: 'Pechuga de Pollo' },
    { value: 'PROD003', label: 'Carne de Res Molida' },
    { value: 'PROD004', label: 'Alitas de Pollo' },
    { value: 'PROD005', label: 'Filete de Pescado' },
]


export default function VariableWeightReceptionFormComponent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const operation = searchParams.get("operation") || "operación";
  const { toast } = useToast();

  const [attachments, setAttachments] = useState<string[]>([]);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      setPoint: 0,
      items: [],
      horaInicio: "",
      horaFin: "",
      observaciones: "",
      coordinador: "",
    },
  });

  const { control, setValue, watch, getValues } = form;

  const { fields, append, remove } = useFieldArray({
    control,
    name: "items",
  });

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  
  useEffect(() => {
    if (fields.length === 0) {
        append({ paleta: 0, descripcion: '', lote: '', presentacion: '', cantidadPorPaleta: 0, pesoBruto: 0, taraEstiba: 0, taraCaja: 0, totalTaraCaja: 0, pesoNeto: 0 });
    }
  }, [fields, append]);
  
  useEffect(() => {
    const subscription = watch((_value, { name }) => {
      if (!name || !name.startsWith('items.')) {
        return;
      }

      const parts = name.split('.');
      if (parts.length < 3) {
        return;
      }

      const index = parseInt(parts[1], 10);
      const fieldName = parts[2];
      
      const isRelevantField = ['cantidadPorPaleta', 'taraCaja', 'pesoBruto', 'taraEstiba'].includes(fieldName);

      if (isRelevantField) {
        const item = getValues(`items.${index}`);
        
        const cantidadPorPaleta = Number(item.cantidadPorPaleta) || 0;
        const taraCaja = Number(item.taraCaja) || 0;
        const pesoBruto = Number(item.pesoBruto) || 0;
        const taraEstiba = Number(item.taraEstiba) || 0;

        const calculatedTotalTaraCaja = cantidadPorPaleta * taraCaja;
        const calculatedPesoNeto = pesoBruto - taraEstiba - calculatedTotalTaraCaja;
        
        if (Number(item.totalTaraCaja).toFixed(2) !== calculatedTotalTaraCaja.toFixed(2)) {
          setValue(`items.${index}.totalTaraCaja`, calculatedTotalTaraCaja, { shouldDirty: true });
        }
        if (Number(item.pesoNeto).toFixed(2) !== calculatedPesoNeto.toFixed(2)) {
          setValue(`items.${index}.pesoNeto`, calculatedPesoNeto, { shouldDirty: true });
        }
      }
    });
    return () => subscription.unsubscribe();
  }, [watch, setValue, getValues]);
  
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


  function onSubmit(data: z.infer<typeof formSchema>) {
    console.log(data);
    toast({
      title: "Formulario Guardado",
      description: `El formato de ${operation} de peso variable ha sido guardado y enviado correctamente.`,
    });
  }

  const title = `Formato de ${operation.charAt(0).toUpperCase() + operation.slice(1)} - Peso Variable`;

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
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
                 <div className="flex items-center gap-2">
                    <File className="h-8 w-8 text-[#3588CC]"/>
                    <h1 className="text-2xl font-bold text-[#3588CC]">{title}</h1>
                </div>
            </div>
        </header>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Datos de Cabecera</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <FormField control={form.control} name="pedidoSislog" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Pedido SISLOG</FormLabel>
                    <FormControl><Input placeholder="Pedido SISLOG (máx. 10 digitos)" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}/>
                <FormField control={form.control} name="cliente" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cliente</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Seleccionar cliente..." /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {clientes.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}/>
                <FormItem>
                    <FormLabel>Operario Logístico</FormLabel>
                    <FormControl><Input disabled value="Cristian Jaramillo" /></FormControl>
                </FormItem>
                 <FormField control={form.control} name="fecha" render={({ field }) => (
                  <FormItem className="flex flex-col pt-2">
                    <FormLabel>Fecha</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button variant="outline" className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                            {field.value ? format(field.value, "dd/MM/yyyy") : <span>Seleccione una fecha</span>}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}/>
                <FormField control={form.control} name="cedulaConductor" render={({ field }) => (
                    <FormItem><FormLabel>Cédula Conductor</FormLabel><FormControl><Input placeholder="Número de cédula" {...field} /></FormControl><FormMessage /></FormItem>
                )}/>
                <FormField control={form.control} name="conductor" render={({ field }) => (
                    <FormItem><FormLabel>Conductor</FormLabel><FormControl><Input placeholder="Nombre del conductor" {...field} /></FormControl><FormMessage /></FormItem>
                )}/>
                <FormField control={form.control} name="placa" render={({ field }) => (
                    <FormItem><FormLabel>Placa</FormLabel><FormControl><Input placeholder="Placa del vehículo" {...field} /></FormControl><FormMessage /></FormItem>
                )}/>
                <FormField control={form.control} name="precinto" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Precinto</FormLabel>
                    <FormControl><Input placeholder="Precinto (máx. 50 caracteres)" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}/>
                <FormField control={form.control} name="setPoint" render={({ field }) => (
                    <FormItem><FormLabel>Set Point (°C)</FormLabel><FormControl><Input type="number" placeholder="0" {...field} /></FormControl><FormMessage /></FormItem>
                )}/>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Características del Producto</CardTitle>
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
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            <FormField control={form.control} name={`items.${index}.paleta`} render={({ field }) => (
                                <FormItem><FormLabel>Paleta</FormLabel><FormControl><Input type="number" min="0" placeholder="0" {...field} /></FormControl><FormMessage /></FormItem>
                            )}/>
                            <FormField control={form.control} name={`items.${index}.descripcion`} render={({ field }) => (
                                <FormItem className="lg:col-span-2">
                                <FormLabel>Descripción del Producto</FormLabel>
                                 <Popover>
                                    <PopoverTrigger asChild>
                                    <FormControl>
                                        <Button variant="outline" role="combobox" className={cn("w-full justify-between", !field.value && "text-muted-foreground")}>
                                        {field.value ? productosExistentes.find((p) => p.label === field.value)?.label : "Seleccionar o escribir descripción..."}
                                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                    </FormControl>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                                        <Command shouldFilter={false}>
                                            <CommandInput placeholder="Buscar producto..." onValueChange={(search) => { /* Handle search if needed */ }} />
                                            <CommandList>
                                                <CommandEmpty>No se encontraron productos.</CommandEmpty>
                                                <CommandGroup>
                                                    {productosExistentes.map((p) => (
                                                        <CommandItem key={p.value} value={p.label} onSelect={(currentValue) => {
                                                            form.setValue(`items.${index}.descripcion`, currentValue === field.value ? "" : currentValue)
                                                        }}>
                                                            <CheckIcon className={cn("mr-2 h-4 w-4", p.label === field.value ? "opacity-100" : "opacity-0")} />
                                                            {p.label}
                                                        </CommandItem>
                                                    ))}
                                                </CommandGroup>
                                            </CommandList>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                                <FormMessage />
                                </FormItem>
                            )}/>
                            <FormField control={form.control} name={`items.${index}.lote`} render={({ field }) => (
                                <FormItem><FormLabel>Lote</FormLabel><FormControl><Input placeholder="Lote (máx. 15 caracteres)" {...field} /></FormControl><FormMessage /></FormItem>
                            )}/>
                            <FormField control={form.control} name={`items.${index}.presentacion`} render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Presentación</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl><SelectTrigger><SelectValue placeholder="Seleccione presentación" /></SelectTrigger></FormControl>
                                    <SelectContent>{presentaciones.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}/>
                            <FormField control={form.control} name={`items.${index}.cantidadPorPaleta`} render={({ field }) => (
                                <FormItem><FormLabel>Cantidad Por Paleta</FormLabel><FormControl><Input type="number" min="0" placeholder="0" {...field} /></FormControl><FormMessage /></FormItem>
                            )}/>
                            <FormField control={form.control} name={`items.${index}.pesoBruto`} render={({ field }) => (
                                <FormItem><FormLabel>Peso Bruto (kg)</FormLabel><FormControl><Input type="number" min="0" placeholder="0" {...field} /></FormControl><FormMessage /></FormItem>
                            )}/>
                             <FormField control={form.control} name={`items.${index}.taraEstiba`} render={({ field }) => (
                                <FormItem><FormLabel>Tara Estiba (kg)</FormLabel><FormControl><Input type="number" min="0" placeholder="0" {...field} /></FormControl><FormMessage /></FormItem>
                            )}/>
                             <FormField control={form.control} name={`items.${index}.taraCaja`} render={({ field }) => (
                                <FormItem><FormLabel>Tara Caja (kg)</FormLabel><FormControl><Input type="number" min="0" placeholder="0" {...field} /></FormControl><FormMessage /></FormItem>
                            )}/>
                             <FormField control={form.control} name={`items.${index}.totalTaraCaja`} render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Total Tara Caja (kg)</FormLabel>
                                    <FormControl><Input type="text" disabled value={typeof field.value === 'number' ? field.value.toFixed(2).replace('.', ',') : '0,00'} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}/>
                            <FormField control={form.control} name={`items.${index}.pesoNeto`} render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Peso Neto (kg)</FormLabel>
                                    <FormControl><Input type="text" disabled value={typeof field.value === 'number' ? field.value.toFixed(2).replace('.', ',') : '0,00'} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}/>
                        </div>
                    </div>
                ))}
                <Button type="button" variant="outline" onClick={() => append({ paleta: 0, descripcion: '', lote: '', presentacion: '', cantidadPorPaleta: 0, pesoBruto: 0, taraEstiba: 0, taraCaja: 0, totalTaraCaja: 0, pesoNeto: 0 })}>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Agregar Item
                </Button>
              </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Tiempo y Observaciones de la Operación</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form.control} name="horaInicio" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Hora de Inicio</FormLabel>
                        <div className="relative">
                            <FormControl><Input placeholder="HH:MM" {...field} /></FormControl>
                            <Clock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        </div>
                        <FormMessage />
                    </FormItem>
                    )}/>
                    <FormField control={form.control} name="horaFin" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Hora Fin</FormLabel>
                        <div className="relative">
                            <FormControl><Input placeholder="HH:MM" {...field} /></FormControl>
                            <Clock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        </div>
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

             <Card>
                <CardHeader><CardTitle>Coordinador y Operario Responsables de la Operación</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form.control} name="coordinador" render={({ field }) => (
                        <FormItem><FormLabel>Coordinador Responsable de la Operación</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Seleccione un coordinador" /></SelectTrigger></FormControl><SelectContent>{coordinadores.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                    )}/>
                     <FormItem>
                        <FormLabel>Operario Logístico Responsable</FormLabel>
                        <FormControl><Input disabled value="Cristian Jaramillo" /></FormControl>
                    </FormItem>
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
                <Button type="submit">
                    <Send className="mr-2 h-4 w-4"/>
                    Guardar Formato y Enviar
                </Button>
                <Button type="button" variant="outline" onClick={() => form.reset()}>
                    <RotateCcw className="mr-2 h-4 w-4"/>
                    Limpiar Formato
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
