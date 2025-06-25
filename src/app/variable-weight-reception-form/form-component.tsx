
"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useForm, useFieldArray, useWatch, useFormContext } from "react-hook-form";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
    ArrowLeft,
    Trash2,
    PlusCircle,
    UploadCloud,
    Camera,
    Send,
    RotateCcw,
    ChevronsUpDown,
    CheckIcon,
    FileSignature,
} from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";


const itemSchema = z.object({
    paleta: z.coerce.number({ required_error: "La paleta es requerida.", invalid_type_error: "La paleta es requerida."}).int().min(0, "Debe ser un número no negativo."),
    descripcion: z.string().min(1, "La descripción es requerida."),
    lote: z.string().min(1, "El lote es requerido.").max(15, "Máx 15 caracteres"),
    presentacion: z.string().min(1, "La presentación es requerida."),
    cantidadPorPaleta: z.coerce.number({ required_error: "La cantidad es requerida.", invalid_type_error: "La cantidad es requerida." }).int().min(0, "Debe ser un número no negativo."),
    pesoBruto: z.coerce.number({ required_error: "El peso bruto es requerido.", invalid_type_error: "El peso bruto es requerido." }).min(0, "Debe ser un número no negativo."),
    taraEstiba: z.coerce.number({ required_error: "La tara estiba es requerida.", invalid_type_error: "La tara estiba es requerida." }).min(0, "Debe ser un número no negativo."),
    taraCaja: z.coerce.number({ required_error: "La tara caja es requerida.", invalid_type_error: "La tara caja es requerida." }).min(0, "Debe ser un número no negativo."),
    totalTaraCaja: z.coerce.number().optional(), 
    pesoNeto: z.coerce.number().optional(), 
  });
  

const formSchema = z.object({
    pedidoSislog: z.string()
      .min(1, "El pedido SISLOG es obligatorio.")
      .max(10, "El número de pedido no puede exceder los 10 dígitos.")
      .regex(/^[0-9]*$/, "El pedido solo puede contener números."),
    cliente: z.string().min(1, "Seleccione un cliente."),
    fecha: z.date({ required_error: "La fecha es obligatoria." }),
    cedulaConductor: z.string()
      .min(1, "La cédula del conductor es obligatoria.")
      .max(10, "La cédula no puede exceder los 10 dígitos.")
      .regex(/^[0-9]*$/, "La cédula solo puede contener números."),
    conductor: z.string()
      .min(1, "El nombre del conductor es obligatorio.")
      .max(10, "Máximo 10 caracteres."),
    placa: z.string()
      .min(1, "La placa es obligatoria.")
      .regex(/^[A-Z]{3}[0-9]{3}$/, "Formato inválido. Deben ser 3 letras y 3 números (ej: ABC123)."),
    precinto: z.string().min(1, "El precinto es obligatorio.").max(50, "Máximo 50 caracteres."),
    setPoint: z.number({required_error: "El Set Point es requerido.", invalid_type_error: "El Set Point es requerido."}).min(-99, "El valor debe estar entre -99 y 99.").max(99, "El valor debe estar entre -99 y 99."),
    items: z.array(itemSchema).min(1, "Debe agregar al menos un item."),
    observaciones: z.string().max(250, "Máximo 250 caracteres.").optional(),
    coordinador: z.string().min(1, "Seleccione un coordinador."),
});

// Mock Data
const clientes = ["Cliente A", "Cliente B", "Cliente C"];
const coordinadores = ["Cristian Acuña", "Sergio Padilla"];
const productosExistentes = [
    { value: 'PROD001', label: 'Pollo Entero Congelado' },
    { value: 'PROD002', label: 'Pechuga de Pollo' },
    { value: 'PROD003', label: 'Carne de Res Molida' },
];
const presentaciones = ["Caja", "Bolsa", "Paquete"];


const ItemRow = ({ control, index, remove }: { control: any, index: number, remove: (index: number) => void }) => {
    const { setValue } = useFormContext();
    const itemData = useWatch({
        control,
        name: `items.${index}`
    });

    useEffect(() => {
        const cantidad = Number(itemData.cantidadPorPaleta) || 0;
        const taraCaja = Number(itemData.taraCaja) || 0;
        const taraEstiba = Number(itemData.taraEstiba) || 0;
        const pesoBruto = Number(itemData.pesoBruto) || 0;
        
        const totalTaraCajaCalc = cantidad * taraCaja;
        const pesoNetoCalc = pesoBruto - taraEstiba - totalTaraCajaCalc;

        setValue(`items.${index}.totalTaraCaja`, isNaN(totalTaraCajaCalc) ? 0 : totalTaraCajaCalc, { shouldValidate: true });
        setValue(`items.${index}.pesoNeto`, isNaN(pesoNetoCalc) ? 0 : pesoNetoCalc, { shouldValidate: true });

    }, [itemData.cantidadPorPaleta, itemData.taraCaja, itemData.taraEstiba, itemData.pesoBruto, index, setValue]);


    return (
        <div className="p-4 border rounded-lg relative bg-white space-y-4">
            <div className="flex justify-between items-center">
                <h4 className="font-semibold text-lg">Ítem #{index + 1}</h4>
                <Button type="button" variant="ghost" size="icon" className="text-destructive" onClick={() => remove(index)}><Trash2 className="h-4 w-4" /></Button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField control={control} name={`items.${index}.paleta`} render={({ field }) => (
                    <FormItem><FormLabel>Paleta</FormLabel><FormControl><Input type="number" min="0" placeholder="0" {...field} /></FormControl><FormMessage /></FormItem>
                )}/>
                <FormField control={control} name={`items.${index}.descripcion`} render={({ field }) => (
                    <FormItem className="md:col-span-2"><FormLabel>Descripción del Producto</FormLabel>
                        <Popover><PopoverTrigger asChild><FormControl>
                            <Button variant="outline" role="combobox" className="w-full justify-between">{field.value ? productosExistentes.find(p => p.label === field.value)?.label : "Seleccionar o escribir descripción..."}<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" /></Button>
                        </FormControl></PopoverTrigger><PopoverContent className="w-[--radix-popover-trigger-width] p-0"><Command><CommandInput placeholder="Buscar producto..." /><CommandList><CommandEmpty>No hay resultados.</CommandEmpty><CommandGroup>
                            {productosExistentes.map(p => (<CommandItem key={p.value} value={p.label} onSelect={() => setValue(`items.${index}.descripcion`, p.label)}><CheckIcon className={cn("mr-2 h-4 w-4", p.label === field.value ? "opacity-100" : "opacity-0")} />{p.label}</CommandItem>))}
                        </CommandGroup></CommandList></Command></PopoverContent></Popover>
                    <FormMessage />
                    </FormItem>
                )}/>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField control={control} name={`items.${index}.lote`} render={({ field }) => (
                    <FormItem><FormLabel>Lote</FormLabel><FormControl><Input placeholder="Lote (máx. 15 caracteres)" {...field} /></FormControl><FormMessage /></FormItem>
                )}/>
                <FormField control={control} name={`items.${index}.presentacion`} render={({ field }) => (
                    <FormItem><FormLabel>Presentación</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Seleccione presentación" /></SelectTrigger></FormControl><SelectContent>{presentaciones.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                )}/>
                 <FormField control={control} name={`items.${index}.cantidadPorPaleta`} render={({ field }) => (
                    <FormItem><FormLabel>Cantidad Por Paleta</FormLabel><FormControl><Input type="number" min="0" placeholder="0" {...field} /></FormControl><FormMessage /></FormItem>
                )}/>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
                <FormField control={control} name={`items.${index}.pesoBruto`} render={({ field }) => (
                    <FormItem><FormLabel>Peso Bruto (kg)</FormLabel><FormControl><Input type="number" min="0" step="0.01" placeholder="0.00" {...field} /></FormControl><FormMessage /></FormItem>
                )}/>
                 <FormField control={control} name={`items.${index}.taraEstiba`} render={({ field }) => (
                    <FormItem><FormLabel>Tara Estiba (kg)</FormLabel><FormControl><Input type="number" min="0" step="0.01" placeholder="0.00" {...field} /></FormControl><FormMessage /></FormItem>
                )}/>
                <FormField control={control} name={`items.${index}.taraCaja`} render={({ field }) => (
                    <FormItem><FormLabel>Tara Caja (kg)</FormLabel><FormControl><Input type="number" min="0" step="0.01" placeholder="0.00" {...field} /></FormControl><FormMessage /></FormItem>
                )}/>
                <FormField control={control} name={`items.${index}.totalTaraCaja`} render={({ field }) => (
                    <FormItem><FormLabel>Total Tara Caja (kg)</FormLabel><FormControl><Input disabled readOnly {...field} value={itemData.totalTaraCaja?.toFixed(2) || '0.00'} /></FormControl></FormItem>
                )}/>
                <FormField control={control} name={`items.${index}.pesoNeto`} render={({ field }) => (
                    <FormItem><FormLabel>Peso Neto (kg)</FormLabel><FormControl><Input disabled readOnly {...field} value={itemData.pesoNeto?.toFixed(2) || '0.00'} /></FormControl></FormItem>
                )}/>
            </div>
        </div>
    );
};


export default function VariableWeightReceptionFormComponent() {
  const router = useRouter();
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
      setPoint: undefined,
      items: [],
      observaciones: "",
      coordinador: "",
    },
  });

  const { control } = form;

  const { fields, append, remove } = useFieldArray({
    control,
    name: "items",
  });
  
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (fields.length === 0) {
      append({ paleta: 0, descripcion: "", lote: "", presentacion: "", cantidadPorPaleta: 0, pesoBruto: 0, taraEstiba: 0, taraCaja: 0, totalTaraCaja: 0, pesoNeto: 0 }, { shouldFocus: false });
    }
  }, [fields, append]);


  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
        const imageFiles = Array.from(event.target.files).filter(file => file.type.startsWith('image/'));
        imageFiles.forEach(file => {
            const reader = new FileReader();
            reader.onloadend = () => setAttachments(prev => [...prev, reader.result as string]);
            reader.readAsDataURL(file);
        });
    }
  };

  const handleOpenCamera = () => setIsCameraOpen(true);
  
  const handleCapture = () => {
    if (videoRef.current && canvasRef.current) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg');
        setAttachments(prev => [...prev, dataUrl]);
        handleCloseCamera();
    }
  };

  const handleCloseCamera = () => {
    if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
    }
    setIsCameraOpen(false);
  };
  
  useEffect(() => {
    let stream: MediaStream;
    if (isCameraOpen) {
      navigator.mediaDevices.getUserMedia({ video: true })
        .then(s => {
          stream = s;
          if (videoRef.current) videoRef.current.srcObject = stream;
        })
        .catch(err => {
          toast({ variant: 'destructive', title: 'Error de Cámara', description: 'No se pudo acceder a la cámara.' });
          setIsCameraOpen(false);
        });
    }
    return () => {
        stream?.getTracks().forEach(track => track.stop());
    }
  }, [isCameraOpen, toast]);

  function onSubmit(data: z.infer<typeof formSchema>) {
    console.log({ ...data, attachments });
    toast({ title: "Formulario Guardado", description: "La recepción de peso variable ha sido guardada." });
  }

  return (
    <Form {...form}>
      <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
        <div className="max-w-6xl mx-auto">
          <header className="mb-8">
            <div className="relative flex items-center justify-center text-center">
              <Button variant="ghost" size="icon" className="absolute left-0" onClick={() => router.push('/')}>
                <ArrowLeft className="h-6 w-6" />
              </Button>
              <div className="flex items-center gap-2">
                  <FileSignature className="h-8 w-8 text-primary"/>
                  <h1 className="text-2xl font-bold text-primary">Formato de Recepción - Peso Variable</h1>
              </div>
            </div>
          </header>

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <Card>
                <CardHeader>
                    <CardTitle>Información General</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField control={control} name="pedidoSislog" render={({ field }) => (
                        <FormItem><FormLabel>Pedido SISLOG</FormLabel><FormControl><Input placeholder="Máximo 10 dígitos" {...field} /></FormControl><FormMessage /></FormItem>
                    )}/>
                    <FormField control={control} name="cliente" render={({ field }) => (
                        <FormItem><FormLabel>Cliente</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Seleccionar cliente..." /></SelectTrigger></FormControl><SelectContent>{clientes.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                    )}/>
                    <FormItem>
                        <FormLabel>Operario Logístico</FormLabel>
                        <FormControl><Input disabled value="Cristian Jaramillo" /></FormControl>
                    </FormItem>
                    <FormField control={control} name="fecha" render={({ field }) => (
                        <FormItem><FormLabel>Fecha</FormLabel><FormControl><Input disabled value={field.value ? format(field.value, "dd/MM/yyyy") : ""} /></FormControl><FormMessage /></FormItem>
                    )}/>
                    <FormField control={control} name="cedulaConductor" render={({ field }) => (
                        <FormItem><FormLabel>Cédula Conductor</FormLabel><FormControl><Input placeholder="Máximo 10 dígitos" {...field} /></FormControl><FormMessage /></FormItem>
                    )}/>
                    <FormField control={control} name="conductor" render={({ field }) => (
                        <FormItem><FormLabel>Conductor</FormLabel><FormControl><Input placeholder="Máximo 10 caracteres" {...field} /></FormControl><FormMessage /></FormItem>
                    )}/>
                    <FormField control={control} name="placa" render={({ field }) => (
                        <FormItem><FormLabel>Placa</FormLabel><FormControl><Input placeholder="ABC123" {...field} onChange={(e) => field.onChange(e.target.value.toUpperCase())} maxLength={6} /></FormControl><FormMessage /></FormItem>
                    )}/>
                    <FormField control={control} name="precinto" render={({ field }) => (
                        <FormItem><FormLabel>Precinto</FormLabel><FormControl><Input placeholder="Precinto (máx. 50 caracteres)" {...field} /></FormControl><FormMessage /></FormItem>
                    )}/>
                    <FormField control={control} name="setPoint" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Set Point (°C)</FormLabel>
                            <FormControl><Input type="number" placeholder="0" {...field} onChange={e => field.onChange(e.target.value === '' ? undefined : e.target.valueAsNumber)} value={field.value === undefined || Number.isNaN(field.value) ? '' : field.value} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )}/>
                </CardContent>
              </Card>
              
              <Card>
                  <CardHeader><CardTitle>Detalle de la Recepción</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                      <div className="space-y-4">
                          {fields.map((field, index) => (
                             <ItemRow key={field.id} control={control} index={index} remove={() => remove(index)} />
                          ))}
                      </div>
                      <Button type="button" variant="outline" onClick={() => append({ paleta: 0, descripcion: "", lote: "", presentacion: "", cantidadPorPaleta: 0, pesoBruto: 0, taraEstiba: 0, taraCaja: 0, totalTaraCaja: 0, pesoNeto: 0 })}><PlusCircle className="mr-2 h-4 w-4" />Agregar Item</Button>
                  </CardContent>
              </Card>

              <Card>
                  <CardHeader><CardTitle>Anexos</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg cursor-pointer hover:bg-gray-100" onClick={() => fileInputRef.current?.click()}>
                              <UploadCloud className="w-10 h-10 text-gray-400 mb-2"/><p className="text-sm font-semibold">Subir archivos</p><Input type="file" ref={fileInputRef} className="hidden" multiple accept="image/*" onChange={handleFileChange} />
                          </div>
                          <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg cursor-pointer hover:bg-gray-100" onClick={handleOpenCamera}>
                              <Camera className="w-10 h-10 text-gray-400 mb-2"/><p className="text-sm font-semibold">Tomar Foto</p>
                          </div>
                      </div>
                      {attachments.length > 0 && (
                          <div>
                              <h4 className="text-sm font-medium mb-2">Archivos Adjuntos:</h4>
                              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                                  {attachments.map((src, index) => (
                                      <div key={index} className="relative group aspect-square">
                                          <Image src={src} alt={`Anexo ${index + 1}`} fill className="rounded-md object-cover" />
                                          <Button type="button" variant="destructive" size="icon" className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => setAttachments(prev => prev.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" /></Button>
                                      </div>
                                  ))}
                              </div>
                          </div>
                      )}
                  </CardContent>
              </Card>

              <Card>
                  <CardHeader><CardTitle>Responsables y Observaciones</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                      <FormField control={control} name="observaciones" render={({ field }) => (
                          <FormItem><FormLabel>Observaciones</FormLabel><FormControl><Textarea placeholder="Observaciones generales (opcional)" {...field} /></FormControl><FormMessage /></FormItem>
                      )}/>
                      <FormField control={control} name="coordinador" render={({ field }) => (
                          <FormItem><FormLabel>Coordinador Responsable</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Seleccione un coordinador" /></SelectTrigger></FormControl><SelectContent>{coordinadores.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                      )}/>
                  </CardContent>
              </Card>

              <footer className="flex items-center justify-end gap-4 pt-4">
                  <Button type="button" variant="outline" onClick={() => form.reset()}><RotateCcw className="mr-2 h-4 w-4"/>Limpiar</Button>
                  <Button type="submit"><Send className="mr-2 h-4 w-4"/>Guardar y Enviar</Button>
              </footer>
            </form>
        </div>

        <Dialog open={isCameraOpen} onOpenChange={setIsCameraOpen}>
            <DialogContent><DialogHeader><DialogTitle>Tomar Foto</DialogTitle></DialogHeader>
                <video ref={videoRef} className="w-full aspect-video rounded-md bg-black" autoPlay playsInline />
                <canvas ref={canvasRef} className="hidden" />
                <DialogFooter>
                    <Button variant="outline" onClick={handleCloseCamera}>Cancelar</Button>
                    <Button onClick={handleCapture}><Camera className="mr-2 h-4 w-4"/>Capturar</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
      </div>
    </Form>
  );
}
