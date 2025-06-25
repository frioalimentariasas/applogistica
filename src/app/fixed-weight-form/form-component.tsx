"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
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
    CheckIcon
} from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";


const productSchema = z.object({
  codigo: z.string().optional(),
  descripcion: z.string().min(1, "La descripción es requerida."),
  cajas: z.coerce.number().int().min(0, "Debe ser un número no negativo."),
  paletas: z.coerce.number().int().min(0, "Debe ser un número no negativo."),
  temperatura: z.coerce.number(),
});

const formSchema = z.object({
  nombreCliente: z.string().min(1, "Seleccione un cliente."),
  fecha: z.date({ required_error: "La fecha es obligatoria." }),
  horaInicio: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Formato de hora inválido (HH:MM)."),
  horaFin: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Formato de hora inválido (HH:MM)."),
  precinto: z.string().max(50, "Máximo 50 caracteres.").optional(),
  documentoTransporte: z.string().optional(),
  facturaRemision: z.string().optional(),
  productos: z.array(productSchema).min(1, "Debe agregar al menos un producto."),
  nombreConductor: z.string().min(1, "El nombre del conductor es obligatorio."),
  cedulaConductor: z.string().min(1, "La cédula del conductor es obligatoria."),
  placa: z.string().min(1, "La placa es obligatoria."),
  muelle: z.string().min(1, "Seleccione un muelle."),
  contenedor: z.string().optional(),
  setPoint: z.coerce.number(),
  condicionesHigiene: z.enum(["limpio", "sucio"], { required_error: "Seleccione una condición." }),
  termoregistrador: z.enum(["si", "no"], { required_error: "Seleccione una opción." }),
  clienteRequiereTermoregistro: z.enum(["si", "no"], { required_error: "Seleccione una opción." }),
  observaciones: z.string().max(100, "Máximo 100 caracteres.").optional(),
  coordinador: z.string().min(1, "Seleccione un coordinador."),
});


// Mock data for selects
const clientes = ["Cliente A", "Cliente B", "Cliente C"];
const muelles = ["Muelle 1", "Muelle 2", "Muelle 3"];
const coordinadores = ["Coordinador 1", "Coordinador 2"];
const productosExistentes = [
    { value: 'PROD001', label: 'Pollo Entero Congelado' },
    { value: 'PROD002', label: 'Pechuga de Pollo' },
    { value: 'PROD003', label: 'Carne de Res Molida' },
]


export default function FixedWeightFormComponent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const operation = searchParams.get("operation") || "operación";
  const { toast } = useToast();
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);


  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
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
      setPoint: 0,
      observaciones: "",
      coordinador: "",
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "productos",
  });

  const productos = form.watch("productos");
  const totalCajas = useMemo(() => productos.reduce((acc, p) => acc + (p.cajas || 0), 0), [productos]);
  const totalPaletas = useMemo(() => productos.reduce((acc, p) => acc + (p.paletas || 0), 0), [productos]);

  useEffect(() => {
    // Add one product field by default
    if (fields.length === 0) {
        append({ codigo: '', descripcion: '', cajas: 0, paletas: 0, temperatura: 0 });
    }
  }, [fields, append]);
  
  // Camera permission logic
  useEffect(() => {
    const getCameraPermission = async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.log("Camera API not available in this browser.");
        setHasCameraPermission(false);
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({video: true});
        setHasCameraPermission(true);

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (error) {
        console.error('Error accessing camera:', error);
        setHasCameraPermission(false);
        toast({
          variant: 'destructive',
          title: 'Acceso a la cámara denegado',
          description: 'Por favor, habilite los permisos de la cámara en la configuración de su navegador.',
        });
      }
    };

    getCameraPermission();

    return () => {
      // Cleanup: stop video stream when component unmounts
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
    }
  }, [toast]);


  function onSubmit(data: z.infer<typeof formSchema>) {
    console.log(data);
    toast({
      title: "Formulario Guardado",
      description: `El formato de ${operation} ha sido guardado y enviado correctamente.`,
    });
  }

  const title = `Formato de ${operation.charAt(0).toUpperCase() + operation.slice(1)} - Peso Fijo`;

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
                <div>
                    <h1 className="text-2xl font-bold text-[#3588CC]">{title}</h1>
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
              <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <FormField control={form.control} name="nombreCliente" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre del Cliente</FormLabel>
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
                <FormField control={form.control} name="horaInicio" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hora de Inicio Cargue</FormLabel>
                    <div className="relative">
                        <FormControl>
                            <Input placeholder="HH:MM" {...field} />
                        </FormControl>
                        <Clock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    </div>
                    <FormMessage />
                  </FormItem>
                )}/>
                 <FormField control={form.control} name="horaFin" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hora Fin Cargue</FormLabel>
                    <div className="relative">
                        <FormControl>
                            <Input placeholder="HH:MM" {...field} />
                        </FormControl>
                        <Clock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    </div>
                    <FormMessage />
                  </FormItem>
                )}/>
                <FormField control={form.control} name="precinto" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Precinto/Sello de Seguridad</FormLabel>
                    <FormControl><Input placeholder="Precinto/sello (máx. 50)" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}/>
                <FormField control={form.control} name="documentoTransporte" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Documento de Transporte</FormLabel>
                    <FormControl><Input placeholder="Documento de transporte" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}/>
                <FormItem>
                    <FormLabel>Operario Logístico</FormLabel>
                    <FormControl><Input disabled value="Cristian Jaramillo" /></FormControl>
                </FormItem>
                <FormField control={form.control} name="facturaRemision" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Factura Remisión</FormLabel>
                    <FormControl><Input placeholder="Factura o remisión" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}/>
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
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                            <FormField control={form.control} name={`productos.${index}.codigo`} render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Código</FormLabel>
                                    <FormControl><Input placeholder="Código del producto" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}/>
                            <FormField control={form.control} name={`productos.${index}.descripcion`} render={({ field }) => (
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
                                            <CommandInput placeholder="Buscar producto..." onValueChange={(search) => {
                                                // Handle search/filter if needed, for now just for typing
                                            }} />
                                            <CommandList>
                                                <CommandEmpty>No se encontraron productos.</CommandEmpty>
                                                <CommandGroup>
                                                    {productosExistentes.map((p) => (
                                                        <CommandItem
                                                            key={p.value}
                                                            value={p.label}
                                                            onSelect={(currentValue) => {
                                                                form.setValue(`productos.${index}.descripcion`, currentValue === field.value ? "" : currentValue)
                                                                form.setValue(`productos.${index}.codigo`, p.value)
                                                            }}
                                                            >
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
                             <FormField control={form.control} name={`productos.${index}.cajas`} render={({ field }) => (
                                <FormItem>
                                    <FormLabel>No. de Cajas</FormLabel>
                                    <FormControl><Input type="number" min="0" placeholder="0" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}/>
                            <FormField control={form.control} name={`productos.${index}.paletas`} render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Total Paletas/Cantidad</FormLabel>
                                    <FormControl><Input type="number" min="0" placeholder="0" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}/>
                            <FormField control={form.control} name={`productos.${index}.temperatura`} render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Temperatura (°C)</FormLabel>
                                    <FormControl><Input type="number" placeholder="0" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}/>
                        </div>
                    </div>
                ))}
                <div className="flex items-center justify-between">
                    <Button type="button" variant="outline" onClick={() => append({ codigo: '', descripcion: '', cajas: 0, paletas: 0, temperatura: 0 })}>
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Agregar Producto
                    </Button>
                    <div className="flex gap-4">
                        <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">Totales Cajas:</span>
                            <Input className="w-24" disabled value={totalCajas} />
                        </div>
                        <div className="flex items-center gap-2">
                             <span className="font-medium text-sm">Totales Paletas:</span>
                            <Input className="w-24" disabled value={totalPaletas} />
                        </div>
                    </div>
                </div>
              </CardContent>
            </Card>

            {/* Vehicle Info Card */}
            <Card>
                <CardHeader><CardTitle>Información del Vehículo</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-6">
                    <FormField control={form.control} name="nombreConductor" render={({ field }) => (
                        <FormItem><FormLabel>Nombre Conductor</FormLabel><FormControl><Input placeholder="Nombre del conductor" {...field} /></FormControl><FormMessage /></FormItem>
                    )}/>
                    <FormField control={form.control} name="cedulaConductor" render={({ field }) => (
                        <FormItem><FormLabel>Cédula Conductor</FormLabel><FormControl><Input placeholder="Cédula del conductor" {...field} /></FormControl><FormMessage /></FormItem>
                    )}/>
                    <FormField control={form.control} name="placa" render={({ field }) => (
                        <FormItem><FormLabel>Placa</FormLabel><FormControl><Input placeholder="Placa del vehículo" {...field} /></FormControl><FormMessage /></FormItem>
                    )}/>
                    <FormField control={form.control} name="muelle" render={({ field }) => (
                        <FormItem><FormLabel>Muelle</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Seleccione un muelle" /></SelectTrigger></FormControl><SelectContent>{muelles.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                    )}/>
                    <FormField control={form.control} name="contenedor" render={({ field }) => (
                        <FormItem><FormLabel>Contenedor</FormLabel><FormControl><Input placeholder="Número de contenedor" {...field} /></FormControl><FormMessage /></FormItem>
                    )}/>
                    <FormField control={form.control} name="setPoint" render={({ field }) => (
                        <FormItem><FormLabel>Set Point (°C)</FormLabel><FormControl><Input type="number" placeholder="0" {...field} /></FormControl><FormMessage /></FormItem>
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
                        <FormItem className="md:col-span-2 lg:col-span-3"><FormLabel>Observaciones</FormLabel><FormControl><Textarea placeholder="Observaciones Generales del Pedido (opcional, máx. 100 caracteres)" {...field} /></FormControl><FormMessage /></FormItem>
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
                        <FormControl><Input disabled value="Cristian Jaramillo" /></FormControl>
                    </FormItem>
                </CardContent>
             </Card>

             {/* Attachments Card */}
             <Card>
                <CardHeader><CardTitle>Anexos</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div 
                        className="flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg cursor-pointer hover:bg-gray-100"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <UploadCloud className="w-10 h-10 text-gray-400 mb-2"/>
                        <p className="text-sm text-gray-600 font-semibold">Subir archivos o arrastre y suelte</p>
                        <p className="text-xs text-gray-500">Max. de imágenes 30 / Cada imagen se optimizará a 1MB</p>
                        <Input type="file" ref={fileInputRef} className="hidden" multiple accept="image/*" />
                    </div>
                    <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg">
                        {hasCameraPermission === true && <video ref={videoRef} className="w-full aspect-video rounded-md bg-black" autoPlay muted playsInline />}
                        {hasCameraPermission === false && (
                             <div className="flex flex-col items-center justify-center text-center">
                                <Camera className="w-10 h-10 text-gray-400 mb-2"/>
                                <p className="text-sm text-gray-600 font-semibold">Tomar Foto</p>
                                <p className="text-xs text-gray-500">Usar la cámara del dispositivo</p>
                             </div>
                        )}
                         {hasCameraPermission === null && (
                             <div className="flex flex-col items-center justify-center text-center">
                                <p>Solicitando permiso de cámara...</p>
                             </div>
                        )}
                        {hasCameraPermission === false && (
                             <Alert variant="destructive" className="mt-4">
                                <AlertTitle>Acceso a Cámara Requerido</AlertTitle>
                                <AlertDescription>Por favor, permita el acceso a la cámara para usar esta función.</AlertDescription>
                            </Alert>
                        )}
                    </div>
                </CardContent>
            </Card>
            
            <footer className="flex items-center justify-end gap-4 pt-4">
                <Button type="button" variant="outline" onClick={() => form.reset()}>
                    <RotateCcw className="mr-2 h-4 w-4"/>
                    Limpiar Formato
                </Button>
                <Button type="submit">
                    <Send className="mr-2 h-4 w-4"/>
                    Guardar Formato y Enviar
                </Button>
            </footer>
          </form>
        </Form>
      </div>
    </div>
  );
}
