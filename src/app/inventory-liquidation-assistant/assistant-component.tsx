
"use client";

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { DateRange } from 'react-day-picker';
import { format, eachDayOfInterval, startOfDay, endOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { ArrowLeft, Calculator, CalendarIcon, ChevronsUpDown, DollarSign, FolderSearch, Loader2, RefreshCw, Search, XCircle, Package, AlertTriangle, Send } from 'lucide-react';

import { useToast } from '@/hooks/use-toast';
import type { ClientInfo } from '@/app/actions/clients';
import type { ClientBillingConcept } from '@/app/gestion-conceptos-liquidacion-clientes/actions';
import { saveAssistantLiquidation, type AssistantLiquidationData } from './actions';
import { useAuth } from '@/hooks/use-auth';


import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { getSmylEligibleLots, type EligibleLot, GraceFilter } from '../smyl-liquidation-assistant/actions';
import { IndexCreationDialog } from '@/components/app/index-creation-dialog';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';


const dailyEntrySchema = z.object({
  date: z.date(),
  initialBalance: z.number().default(0),
  entries: z.coerce.number().int().min(0).default(0),
  exits: z.coerce.number().int().min(0).default(0),
  finalBalance: z.number().default(0),
});

const formSchema = z.object({
  clientId: z.string().min(1, "Debe seleccionar un cliente."),
  dateRange: z.object({
    from: z.date({ required_error: "La fecha de inicio es requerida."}),
    to: z.date({ required_error: "La fecha de fin es requerida."}),
  }),
  plate: z.string().optional(),
  container: z.string().optional(),
  initialBalance: z.coerce.number().int().min(0, "El saldo inicial no puede ser negativo.").default(0),
  dailyEntries: z.array(dailyEntrySchema),
});

type FormValues = z.infer<typeof formSchema>;

const STORAGE_CONCEPT_NAME = 'SERVICIO DE CONGELACIÓN - PALLET/DÍA (-18ºC)';
const ENTRY_CONCEPT_NAME = 'MOVIMIENTO ENTRADA PRODUCTO - PALETA';
const EXIT_CONCEPT_NAME = 'MOVIMIENTO SALIDA PRODUCTO - PALETA';

export function LiquidationAssistantComponent({ clients, billingConcepts }: { clients: ClientInfo[]; billingConcepts: ClientBillingConcept[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const { user, displayName } = useAuth();

  const [tariffs, setTariffs] = useState<{ storage: number; entry: number; exit: number } | null>(null);
  const [isClientDialogOpen, setClientDialogOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConfirmSendOpen, setIsConfirmSendOpen] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      clientId: '',
      dateRange: undefined,
      plate: '',
      container: '',
      initialBalance: 0,
      dailyEntries: [],
    },
  });

  const { fields, replace } = useFieldArray({
    control: form.control,
    name: 'dailyEntries',
  });

  const watchedClientId = useWatch({ control: form.control, name: 'clientId' });
  const watchedDailyEntries = useWatch({ control: form.control, name: 'dailyEntries' });

  // Update tariffs when client changes
  useEffect(() => {
    if (watchedClientId) {
      const getTariff = (conceptName: string) => {
        const clientInfo = clients.find(c => c.id === watchedClientId);
        const concept = billingConcepts.find(c => c.conceptName === conceptName && (c.clientNames.includes(clientInfo?.razonSocial || '') || c.clientNames.includes('TODOS (Cualquier Cliente)')));
        return concept?.value || 0;
      };
      
      const newTariffs = {
        storage: getTariff(STORAGE_CONCEPT_NAME),
        entry: getTariff(ENTRY_CONCEPT_NAME),
        exit: getTariff(EXIT_CONCEPT_NAME),
      };

      if (newTariffs.storage === 0 || newTariffs.entry === 0 || newTariffs.exit === 0) {
        const clientInfo = clients.find(c => c.id === watchedClientId);
        toast({
            variant: "destructive",
            title: "Tarifas no encontradas",
            description: `Asegúrese de que los conceptos: SERVICIO DE CONGELACIÓN - PALLET/DÍA (-18ºC), MOVIMIENTO ENTRADA PRODUCTO - PALETA y MOVIMIENTO SALIDA PRODUCTO - PALETA estén configurados para "${clientInfo?.razonSocial}".`
        });
      }
      setTariffs(newTariffs);
    } else {
      setTariffs(null);
    }
  }, [watchedClientId, billingConcepts, clients, toast]);
  
  const { getValues, setValue } = form;

  const handleGenerateTable = useCallback(() => {
    const { dateRange, initialBalance } = getValues();
    if (!dateRange?.from || !dateRange?.to) {
      toast({ variant: 'destructive', title: 'Error', description: 'Por favor seleccione un rango de fechas.' });
      return;
    }
    
    const days = eachDayOfInterval({
      start: startOfDay(dateRange.from),
      end: endOfDay(dateRange.to),
    });
    
    let balance = 0;
    const newDailyEntries = days.map((day, index) => {
        const entries = index === 0 ? Number(initialBalance) : 0;
        const newEntry = {
            date: day,
            initialBalance: balance,
            entries: entries,
            exits: 0,
            finalBalance: balance + entries,
        };
        balance = newEntry.finalBalance;
        return newEntry;
    });
    
    replace(newDailyEntries);
  }, [getValues, toast, replace]);
  
  const liquidationSummary = useMemo(() => {
    if (!tariffs) return null;

    let totalStorageCost = 0;
    let totalEntries = 0;
    let totalExits = 0;
    let totalPalletsForAvg = 0;
    let daysWithStock = 0;
    let currentBalance = 0;

    watchedDailyEntries.forEach((day, index) => {
        const initialBalanceForDay = index === 0 ? 0 : (watchedDailyEntries[index - 1].finalBalance || 0);
        const entries = Number(day.entries) || 0;
        const exits = Number(day.exits) || 0;

        currentBalance = initialBalanceForDay + entries - exits;
        
        if (currentBalance > 0) {
            totalStorageCost += currentBalance * tariffs.storage;
            totalPalletsForAvg += currentBalance;
            daysWithStock++;
        }
        
        totalEntries += entries;
        totalExits += exits;
    });

    const avgPallets = daysWithStock > 0 ? totalPalletsForAvg / daysWithStock : 0;
    const totalEntryCost = totalEntries * tariffs.entry;
    const totalExitCost = totalExits * tariffs.exit;
    const grandTotal = totalStorageCost + totalEntryCost + totalExitCost;

    return {
        totalStorageDays: daysWithStock,
        avgPallets,
        totalStorageCost,
        totalEntries,
        totalEntryCost,
        totalExits,
        totalExitCost,
        grandTotal,
    };
}, [watchedDailyEntries, tariffs]);


  const filteredClients = useMemo(() => {
    if (!clientSearch) return clients;
    return clients.filter(c => c.razonSocial.toLowerCase().includes(clientSearch.toLowerCase()));
  }, [clientSearch, clients]);

  const handleSendToLiquidation = async () => {
    if (!user) {
        toast({ variant: "destructive", title: "Error", description: "Debe iniciar sesión para realizar esta acción." });
        return;
    }

    const values = getValues();
    if (!liquidationSummary || liquidationSummary.grandTotal <= 0) {
        toast({ variant: "destructive", title: "Sin datos", description: "No hay nada para liquidar." });
        return;
    }

    setIsSubmitting(true);
    
    const clientInfo = clients.find(c => c.id === values.clientId);

    const payload: AssistantLiquidationData = {
        clientName: clientInfo?.razonSocial || 'Desconocido',
        dateRange: {
            from: values.dateRange.from.toISOString(),
            to: values.dateRange.to.toISOString(),
        },
        plate: values.plate,
        container: values.container,
        dailyEntries: values.dailyEntries.map(d => ({
            date: d.date.toISOString(),
            initialBalance: d.initialBalance,
            entries: d.entries,
            exits: d.exits,
            finalBalance: d.initialBalance + d.entries - d.exits
        })),
        createdBy: {
            uid: user.uid,
            displayName: displayName || user.email!
        }
    };

    try {
        const result = await saveAssistantLiquidation(payload);
        if (result.success) {
            toast({
                title: "Éxito",
                description: `Se han enviado ${result.count} registros a la liquidación de clientes.`,
            });
        } else {
            throw new Error(result.message);
        }
    } catch (e) {
        const error = e instanceof Error ? e.message : "Ocurrió un error inesperado.";
        toast({ variant: "destructive", title: "Error al Enviar", description: error });
    } finally {
        setIsSubmitting(false);
        setIsConfirmSendOpen(false);
    }
  }

    const [lotIds, setLotIds] = useState('');
    
    const [isIndexErrorOpen, setIsIndexErrorOpen] = useState(false);
    const [indexErrorMessage, setIndexErrorMessage] = useState('');

    const [isLotFinderOpen, setIsLotFinderOpen] = useState(false);
    const [eligibleLots, setEligibleLots] = useState<EligibleLot[]>([]);
    const [isLoadingLots, setIsLoadingLots] = useState(false);
    const [lotFinderSearch, setLotFinderSearch] = useState('');
    const [graceFilter, setGraceFilter] = useState<GraceFilter>('all');
    const [selectedLotsInDialog, setSelectedLotsInDialog] = useState<Set<string>>(new Set());

    const handleOpenLotFinder = async () => {
        if (!dateRange?.from || !dateRange?.to) {
            toast({ variant: 'destructive', title: 'Error', description: 'Por favor, seleccione un rango de fechas primero.' });
            return;
        }
        setIsLoadingLots(true);
        setIsLotFinderOpen(true);
        try {
            const lots = await getSmylEligibleLots(format(dateRange.from, 'yyyy-MM-dd'), format(dateRange.to, 'yyyy-MM-dd'), graceFilter);
            setEligibleLots(lots);
            
            const currentLotIds = lotIds.split(/[\s,]+/).filter(Boolean);
            setSelectedLotsInDialog(new Set(currentLotIds));

        } catch (e) {
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar los lotes elegibles.' });
        } finally {
            setIsLoadingLots(false);
        }
    };
    
    const handleConfirmLotSelection = () => {
      setLotIds(Array.from(selectedLotsInDialog).join(', '));
      setIsLotFinderOpen(false);
    };

    const handleSearch = () => {
      // Dummy implementation to satisfy onClick, real logic is in parent component or elsewhere
      console.log("Search initiated");
    };

    const handleClear = () => {
        setLotIds('');
        setDateRange(undefined);
        form.reset();
    };

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8">
          <div className="relative flex items-center justify-center text-center">
            <Button variant="ghost" size="icon" className="absolute left-0 top-1/2 -translate-y-1/2" onClick={() => router.push('/')}>
              <ArrowLeft className="h-6 w-6" />
            </Button>
            <div>
              <div className="flex items-center justify-center gap-2">
                <Calculator className="h-8 w-8 text-primary" />
                <h1 className="text-2xl font-bold text-primary">Asistente de Liquidación de Inventario</h1>
              </div>
              <p className="text-sm text-gray-500">Calcule dinámicamente la liquidación de almacenamiento y movimientos de paletas.</p>
              <h3 className="text-sm text-gray-500">Liquidación para Operación Logistica Por PLACA (Cliente Activo SMYL)</h3>
            </div>
          </div>
        </header>

        <Form {...form}>
            <div className="space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle>1. Configuración de la Liquidación</CardTitle>
                        <CardDescription>Seleccione el cliente, el rango de fechas e ingrese los datos generales.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
                            <FormField
                                control={form.control}
                                name="clientId"
                                render={({ field }) => (
                                <FormItem className="flex flex-col">
                                    <FormLabel>Cliente</FormLabel>
                                    <Dialog open={isClientDialogOpen} onOpenChange={setClientDialogOpen}>
                                        <DialogTrigger asChild>
                                            <Button variant="outline" className="w-full justify-between text-left font-normal">
                                                {field.value ? clients.find(c => c.id === field.value)?.razonSocial : "Seleccione un cliente..."}
                                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent>
                                            <DialogHeader>
                                                <DialogTitle>Seleccionar Cliente</DialogTitle>
                                                <Input placeholder="Buscar cliente..." value={clientSearch} onChange={e => setClientSearch(e.target.value)} className="mt-4" />
                                            </DialogHeader>
                                            <ScrollArea className="h-72 mt-4">
                                                {filteredClients.map(c => <Button key={c.id} variant="ghost" className="w-full justify-start" onClick={() => { field.onChange(c.id); setClientDialogOpen(false); }}>{c.razonSocial}</Button>)}
                                            </ScrollArea>
                                        </DialogContent>
                                    </Dialog>
                                    <FormMessage />
                                </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="dateRange"
                                render={({ field }) => (
                                <FormItem className="flex flex-col">
                                    <FormLabel>Rango de Fechas</FormLabel>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !field.value?.from && "text-muted-foreground")}>
                                                <CalendarIcon className="mr-2 h-4 w-4" />
                                                {field.value?.from ? (field.value.to ? (<>{format(field.value.from, "dd/MM/yy")} - {format(field.value.to, "dd/MM/yy")}</>) : format(field.value.from, "dd/MM/yy")) : (<span>Seleccione un rango</span>)}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0"><Calendar mode="range" selected={field.value} onSelect={field.onChange} numberOfMonths={2} locale={es} /></PopoverContent>
                                    </Popover>
                                    <FormMessage />
                                </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="initialBalance"
                                render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Saldo Inicial de Paletas</FormLabel>
                                    <Input type="number" min="0" {...field} />
                                    <FormMessage />
                                </FormItem>
                                )}
                            />
                             <FormField
                                control={form.control}
                                name="plate"
                                render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Placa (Opcional)</FormLabel>
                                    <Input placeholder="Ej: ABC123" {...field} />
                                    <FormMessage />
                                </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="container"
                                render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Contenedor (Opcional)</FormLabel>
                                    <Input placeholder="Ej: ZCSU1234567" {...field} />
                                    <FormMessage />
                                </FormItem>
                                )}
                            />

                            <Button onClick={handleGenerateTable} disabled={!watchedClientId || !form.getValues('dateRange.from')}>
                                <Search className="mr-2 h-4 w-4" />
                                Generar Tabla
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {fields.length > 0 && (
                    <>
                    <Card>
                        <CardHeader>
                            <CardTitle>2. Registro de Movimientos Diarios</CardTitle>
                            <CardDescription>Ingrese las entradas y salidas de paletas para cada día. Los saldos se calcularán automáticamente.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <ScrollArea className="h-[400px] border rounded-md">
                                <Table>
                                    <TableHeader className="sticky top-0 bg-background z-10">
                                        <TableRow>
                                            <TableHead className="w-32">Fecha</TableHead>
                                            <TableHead className="w-32 text-right">Saldo Inicial</TableHead>
                                            <TableHead className="w-32">Entradas</TableHead>
                                            <TableHead className="w-32">Salidas</TableHead>
                                            <TableHead className="w-32 text-right">Saldo Final</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {fields.map((field, index) => {
                                            const initialBalanceForDay = index === 0 ? 0 : (Number(watchedDailyEntries[index - 1]?.finalBalance) || 0);
                                            const entries = Number(watchedDailyEntries[index]?.entries) || 0;
                                            const exits = Number(watchedDailyEntries[index]?.exits) || 0;
                                            const finalBalanceForDay = initialBalanceForDay + entries - exits;
                                            
                                            // This check helps prevent infinite loops
                                            if (watchedDailyEntries[index]?.initialBalance !== initialBalanceForDay) {
                                                setTimeout(() => setValue(`dailyEntries.${index}.initialBalance`, initialBalanceForDay), 0);
                                            }
                                            if (watchedDailyEntries[index]?.finalBalance !== finalBalanceForDay) {
                                                setTimeout(() => setValue(`dailyEntries.${index}.finalBalance`, finalBalanceForDay), 0);
                                            }

                                            return (
                                            <TableRow key={field.id} className="hover:bg-muted/50">
                                                <TableCell className="font-medium">{format(field.date, "dd MMM, yyyy", { locale: es })}</TableCell>
                                                <TableCell className="text-right">{initialBalanceForDay}</TableCell>
                                                <TableCell>
                                                    <FormField
                                                        control={form.control}
                                                        name={`dailyEntries.${index}.entries`}
                                                        render={({ field }) => (
                                                            <Input
                                                                type="number"
                                                                {...field}
                                                                onChange={(e) => field.onChange(Number(e.target.value))}
                                                                className="h-8 text-green-700 font-bold"
                                                            />
                                                        )}
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                   <FormField
                                                        control={form.control}
                                                        name={`dailyEntries.${index}.exits`}
                                                        render={({ field }) => (
                                                            <Input
                                                                type="number"
                                                                {...field}
                                                                className="h-8 text-red-700 font-bold"
                                                                max={initialBalanceForDay + entries}
                                                                onChange={(e) => {
                                                                    const val = Number(e.target.value);
                                                                    const maxAllowed = initialBalanceForDay + entries;
                                                                    if (val > maxAllowed) {
                                                                        toast({
                                                                            variant: "destructive",
                                                                            title: "Límite de salidas excedido",
                                                                            description: `No puede sacar más de ${maxAllowed} paletas.`,
                                                                        });
                                                                        field.onChange(maxAllowed);
                                                                    } else {
                                                                        field.onChange(val);
                                                                    }
                                                                }}
                                                            />
                                                        )}
                                                    />
                                                </TableCell>
                                                <TableCell className="text-right font-bold text-lg">{finalBalanceForDay}</TableCell>
                                            </TableRow>
                                        )})}
                                    </TableBody>
                                </Table>
                            </ScrollArea>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <div className="flex justify-between items-center">
                                <CardTitle>3. Resumen de Liquidación</CardTitle>
                                <Button onClick={() => setIsConfirmSendOpen(true)} disabled={!liquidationSummary || liquidationSummary.grandTotal <= 0}>
                                    <Send className="mr-2 h-4 w-4"/>
                                    Enviar a Liquidación
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {!tariffs || !liquidationSummary ? (
                                <p className="text-muted-foreground">Seleccione un cliente con tarifas configuradas para ver la liquidación.</p>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                    <Card className="bg-blue-50 border-blue-200">
                                        <CardHeader>
                                            <CardTitle className="text-blue-800">Almacenamiento</CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <p>{liquidationSummary.totalStorageDays} días x {liquidationSummary.avgPallets.toFixed(2)} paletas promedio</p>
                                            <p className="text-2xl font-bold text-blue-900">{liquidationSummary.totalStorageCost.toLocaleString('es-CO', {style: 'currency', currency: 'COP'})}</p>
                                            <p className="text-xs text-muted-foreground">Tarifa: {tariffs.storage.toLocaleString('es-CO')}/paleta/día</p>
                                        </CardContent>
                                    </Card>
                                     <Card className="bg-green-50 border-green-200">
                                        <CardHeader>
                                            <CardTitle className="text-green-800">Mov. Entrada</CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <p>{liquidationSummary.totalEntries.toLocaleString('es-CO')} paletas</p>
                                            <p className="text-2xl font-bold text-green-900">{liquidationSummary.totalEntryCost.toLocaleString('es-CO', {style: 'currency', currency: 'COP'})}</p>
                                            <p className="text-xs text-muted-foreground">Tarifa: {tariffs.entry.toLocaleString('es-CO')}/paleta</p>
                                        </CardContent>
                                    </Card>
                                     <Card className="bg-red-50 border-red-200">
                                        <CardHeader>
                                            <CardTitle className="text-red-800">Mov. Salida</CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <p>{liquidationSummary.totalExits.toLocaleString('es-CO')} paletas</p>
                                            <p className="text-2xl font-bold text-red-900">{liquidationSummary.totalExitCost.toLocaleString('es-CO', {style: 'currency', currency: 'COP'})}</p>
                                            <p className="text-xs text-muted-foreground">Tarifa: {tariffs.exit.toLocaleString('es-CO')}/paleta</p>
                                        </CardContent>
                                    </Card>
                                     <Card className="bg-primary/10 border-primary/20">
                                        <CardHeader>
                                            <CardTitle className="text-primary">Total a Facturar</CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <p>&nbsp;</p>
                                            <p className="text-3xl font-extrabold text-primary">{liquidationSummary.grandTotal.toLocaleString('es-CO', {style: 'currency', currency: 'COP'})}</p>
                                        </CardContent>
                                    </Card>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                    </>
                )}
            </div>
        </Form>
        <AlertDialog open={isConfirmSendOpen} onOpenChange={setIsConfirmSendOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>¿Confirmar envío a liquidación?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Esta acción creará registros de operaciones manuales para cada movimiento y día de almacenamiento. Estos registros aparecerán en el reporte de "Liquidación de Clientes".
                        <br/><br/>
                        <strong>Total a enviar: {liquidationSummary?.grandTotal.toLocaleString('es-CO', {style: 'currency', currency: 'COP'})}</strong>
                        <br/>
                        ¿Desea continuar?
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleSendToLiquidation} disabled={isSubmitting}>
                         {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Sí, Enviar
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
        <IndexCreationDialog 
            isOpen={isIndexErrorOpen}
            onOpenChange={setIsIndexErrorOpen}
            errorMessage={indexErrorMessage}
        />
      </div>
    </div>
  );
}

    