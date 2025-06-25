
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
  FormMessage,
  FormProvider
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
  paleta: z.coerce.number().int().min(0, "Requerido"),
  descripcion: z.string().min(1, "Descripción requerida"),
  lote: z.string().max(20, "Máx 20 caracteres").optional(),
  cajas: z.coerce.number().int().min(0, "Requerido"),
  pesoBruto: z.coerce.number().min(0, "Requerido"),
  taraPorCaja: z.coerce.number().min(0, "Requerido"),
  totalTaraCaja: z.coerce.number().optional(), 
  pesoNeto: z.coerce.number().optional(), 
});

const formSchema = z.object({
  pedidoSislog: z.string().max(10, "Máx 10 dígitos").optional(),
  cliente: z.string().min(1, "Cliente requerido"),
  fecha: z.date({ required_error: "Fecha requerida" }),
  conductor: z.string().min(1, "Nombre requerido"),
  placa: z.string().min(1, "Placa requerida"),
  items: z.array(itemSchema).min(1, "Debe agregar al menos un item"),
  observaciones: z.string().max(250, "Máx 250 caracteres").optional(),
  coordinador: z.string().min(1, "Coordinador requerido"),
});

// Mock Data
const clientes = ["Cliente A", "Cliente B", "Cliente C"];
const coordinadores = ["Coordinador 1", "Coordinador 2"];
const productosExistentes = [
    { value: 'PROD001', label: 'Pollo Entero Congelado' },
    { value: 'PROD002', label: 'Pechuga de Pollo' },
    { value: 'PROD003', label: 'Carne de Res Molida' },
];

const ItemRow = ({ control, index, remove }: { control: any, index: number, remove: (index: number) => void }) => {
    const { setValue } = useFormContext();
    const itemData = useWatch({
        control,
        name: `items.${index}`
    });

    useEffect(() => {
        const cajas = Number(itemData.cajas) || 0;
        const taraPorCaja = Number(itemData.taraPorCaja) || 0;
        const pesoBruto = Number(itemData.pesoBruto) || 0;
        
        const totalTaraKg = parseFloat(((cajas * taraPorCaja) / 1000).toFixed(2));
        const pesoNeto = parseFloat((pesoBruto - totalTaraKg).toFixed(2));

        setValue(`items.${index}.totalTaraCaja`, isNaN(totalTaraKg) ? 0 : totalTaraKg, { shouldValidate: true });
        setValue(`items.${index}.pesoNeto`, isNaN(pesoNeto) ? 0 : pesoNeto, { shouldValidate: true });

    }, [itemData.cajas, itemData.taraPorCaja, itemData.pesoBruto, index, setValue]);


    return (
        <div className="p-4 border rounded-lg relative bg-white">
            <div className="flex justify-between items-center mb-4">
                <h4 className="font-semibold text-lg">Item #{index + 1}</h4>
                <Button type="button" variant="ghost" size="icon" className="text-destructive" onClick={() => remove(index)}><Trash2 className="h-4 w-4" /></Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <FormField control={control} name={`items.${index}.paleta`} render={({ field }) => (
                    <FormItem><FormLabel>Paleta</FormLabel><FormControl><Input type="number" min="0" placeholder="No. Paleta" {...field} /></FormControl><FormMessage /></FormItem>
                )}/>
                <FormField control={control} name={`items.${index}.descripcion`} render={({ field }) => (
                    <FormItem className="lg:col-span-3"><FormLabel>Descripción</FormLabel>
                        <Popover><PopoverTrigger asChild><FormControl>
                            <Button variant="outline" role="combobox" className="w-full justify-between">{field.value ? productosExistentes.find(p => p.label === field.value)?.label : "Seleccionar producto..."}<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" /></Button>
                        </FormControl></PopoverTrigger><PopoverContent className="w-[--radix-popover-trigger-width] p-0"><Command><CommandInput placeholder="Buscar producto..." /><CommandList><CommandEmpty>No hay resultados.</CommandEmpty><CommandGroup>
                            {productosExistentes.map(p => (<CommandItem key={p.value} value={p.label} onSelect={() => setValue(`items.${index}.descripcion`, p.label)}><CheckIcon className={cn("mr-2 h-4 w-4", p.label === field.value ? "opacity-100" : "opacity-0")} />{p.label}</CommandItem>))}
                        </CommandGroup></CommandList></Command></PopoverContent></Popover>
                    <FormMessage />
                    </FormItem>
                )}/>
                <FormField control={control} name={`items.${index}.lote`} render={({ field }) => (
                    <FormItem><FormLabel>Lote</FormLabel><FormControl><Input placeholder="Lote del producto" {...field} /></FormControl><FormMessage /></FormItem>
                )}/>
                <FormField control={control} name={`items.${index}.cajas`} render={({ field }) => (
                    <FormItem><FormLabel>Cajas</FormLabel><FormControl><Input type="number" min="0" placeholder="0" {...field} /></FormControl><FormMessage /></FormItem>
                )}/>
                <FormField control={control} name={`items.${index}.pesoBruto`} render={({ field }) => (
                    <FormItem><FormLabel>Peso Bruto (kg)</FormLabel><FormControl><Input type="number" min="0" step="0.01" placeholder="0.00" {...field} /></FormControl><FormMessage /></FormItem>
                )}/>
                <FormField control={control} name={`items.${index}.taraPorCaja`} render={({ field }) => (
                    <FormItem><FormLabel>Tara por Caja (gr)</FormLabel><FormControl><Input type="number" min="0" placeholder="0" {...field} /></FormControl><FormMessage /></FormItem>
                )}/>
                <FormField control={control} name={`items.${index}.totalTaraCaja`} render={({ field }) => (
                    <FormItem><FormLabel>Total Tara Caja (kg)</FormLabel><FormControl><Input disabled readOnly {...field} value={itemData.totalTaraCaja || 0} /></FormControl></FormItem>
                )}/>
                <FormField control={control} name={`items.${index}.pesoNeto`} render={({ field }) => (
                    <FormItem><FormLabel>Peso Neto (kg)</FormLabel><FormControl><Input disabled readOnly {...field} value={itemData.pesoNeto || 0} /></FormControl></FormItem>
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
      conductor: "",
      placa: "",
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
  
  const watchedItems = useWatch({
    control,
    name: "items",
    defaultValue: []
  });
  
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (fields.length === 0) {
      append({ paleta: 0, descripcion: "", lote: "", cajas: 0, pesoBruto: 0, taraPorCaja: 0, totalTaraCaja: 0, pesoNeto: 0 }, { shouldFocus: false });
    }
  }, [fields, append]);

  const { totalCajas, totalPesoBruto, totalTara, totalPesoNeto } = useMemo(() => {
    return watchedItems.reduce((totals, item) => {
        totals.totalCajas += Number(item.cajas) || 0;
        totals.totalPesoBruto += Number(item.pesoBruto) || 0;
        totals.totalTara += Number(item.totalTaraCaja) || 0;
        totals.totalPesoNeto += Number(item.pesoNeto) || 0;
        return totals;
    }, { totalCajas: 0, totalPesoBruto: 0, totalTara: 0, totalPesoNeto: 0 });
  }, [watchedItems]);


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
    <FormProvider {...form}>
      <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
        <div className="max-w-6xl mx-auto">
          <header className="mb-8">
            <div className="relative flex items-center justify-center text-center">
              <Button variant="ghost" size="icon" className="absolute left-0" onClick={() => router.push('/')}>
                <ArrowLeft className="h-6 w-6" />
              </Button>
              <div className="flex items-center gap-2">
                  <FileSignature className="h-8 w-8 text-[#3588CC]"/>
                  <h1 className="text-2xl font-bold text-[#3588CC]">Formato de Recepción - Peso Variable</h1>
              </div>
            </div>
          </header>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card>
                      <CardHeader><CardTitle>Información General</CardTitle></CardHeader>
                      <CardContent className="space-y-6">
                          <div className="space-y-4">
                            <FormField control={control} name="pedidoSislog" render={({ field }) => (
                                <FormItem><FormLabel>Pedido SISLOG</FormLabel><FormControl><Input placeholder="Opcional" {...field} /></FormControl><FormMessage /></FormItem>
                            )}/>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <FormField control={control} name="cliente" render={({ field }) => (
                                  <FormItem><FormLabel>Cliente</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Seleccionar cliente..." /></SelectTrigger></FormControl><SelectContent>{clientes.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                              )}/>
                              <FormField control={control} name="fecha" render={({ field }) => (
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
                              <FormItem><FormLabel>Operario Logístico</FormLabel><FormControl><Input disabled value="Cristian Jaramillo" /></FormControl></FormItem>
                          </div>
                      </CardContent>
                  </Card>
                  <Card>
                      <CardHeader><CardTitle>Información del Vehículo</CardTitle></CardHeader>
                      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <FormField control={control} name="conductor" render={({ field }) => (
                              <FormItem><FormLabel>Nombre Conductor</FormLabel><FormControl><Input placeholder="Nombre completo" {...field} /></FormControl><FormMessage /></FormItem>
                          )}/>
                          <FormField control={control} name="placa" render={({ field }) => (
                              <FormItem><FormLabel>Placa</FormLabel><FormControl><Input placeholder="Placa del vehículo" {...field} /></FormControl><FormMessage /></FormItem>
                          )}/>
                      </CardContent>
                  </Card>
              </div>
              
              <Card>
                  <CardHeader><CardTitle>Items de Recepción</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                      <div className="space-y-4">
                          {fields.map((field, index) => (
                             <ItemRow key={field.id} control={control} index={index} remove={() => remove(index)} />
                          ))}
                      </div>
                      <Button type="button" variant="outline" onClick={() => append({ paleta: 0, descripcion: "", lote: "", cajas: 0, pesoBruto: 0, taraPorCaja: 0 })}><PlusCircle className="mr-2 h-4 w-4" />Agregar Item</Button>
                      <div className="mt-6 p-4 border rounded-lg bg-gray-100">
                          <h4 className="font-bold text-lg mb-2">Totales Generales</h4>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                              <div><span className="font-semibold">Total Cajas:</span> {totalCajas}</div>
                              <div><span className="font-semibold">Total Peso Bruto:</span> {totalPesoBruto.toFixed(2)} kg</div>
                              <div><span className="font-semibold">Total Tara:</span> {totalTara.toFixed(2)} kg</div>
                              <div><span className="font-semibold">Total Peso Neto:</span> {totalPesoNeto.toFixed(2)} kg</div>
                          </div>
                      </div>
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
                          <FormItem><FormLabel>Coordinador Responsable</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Seleccionar coordinador" /></SelectTrigger></FormControl><SelectContent>{coordinadores.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                      )}/>
                  </CardContent>
              </Card>

              <footer className="flex items-center justify-end gap-4 pt-4">
                  <Button type="button" variant="outline" onClick={() => form.reset()}><RotateCcw className="mr-2 h-4 w-4"/>Limpiar</Button>
                  <Button type="submit"><Send className="mr-2 h-4 w-4"/>Guardar y Enviar</Button>
              </footer>
            </form>
          </Form>
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
    </FormProvider>
  );
}
