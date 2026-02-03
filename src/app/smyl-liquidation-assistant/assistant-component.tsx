

"use client";

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { DateRange } from 'react-day-picker';
import { format, addDays, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { ArrowLeft, Calculator, CalendarIcon, ChevronsUpDown, DollarSign, FolderSearch, Loader2, RefreshCw, Search, XCircle, Package, AlertTriangle, CheckCircle, Clock, Home } from 'lucide-react';

import { useToast } from '@/hooks/use-toast';
import { getSmylLotAssistantReport, type AssistantReport, getSmylEligibleLots, type EligibleLot, GraceFilter, LotStatusFilter, toggleLotStatus } from './actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { IndexCreationDialog } from '@/components/app/index-creation-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';


export function SmylLiquidationAssistantComponent() {
    const router = useRouter();
    const { toast } = useToast();
    
    const [lotIds, setLotIds] = useState('');
    const [dateRange, setDateRange] = useState<DateRange | undefined>();
    
    const [reportData, setReportData] = useState<AssistantReport[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searched, setSearched] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [isIndexErrorOpen, setIsIndexErrorOpen] = useState(false);
    const [indexErrorMessage, setIndexErrorMessage] = useState('');

    const [isLotFinderOpen, setIsLotFinderOpen] = useState(false);
    const [eligibleLots, setEligibleLots] = useState<EligibleLot[]>([]);
    const [isLoadingLots, setIsLoadingLots] = useState(false);
    const [lotFinderSearch, setLotFinderSearch] = useState('');
    const [graceFilter, setGraceFilter] = useState<GraceFilter>('all');
    const [statusFilter, setStatusFilter] = useState<LotStatusFilter>('pendiente');
    const [selectedLotsInDialog, setSelectedLotsInDialog] = useState<Set<string>>(new Set());
    const [togglingLotId, setTogglingLotId] = useState<string | null>(null);


    const fetchEligibleLots = useCallback(async () => {
      if (!dateRange?.from || !dateRange?.to) {
        setEligibleLots([]);
        return;
      }
      setIsLoadingLots(true);
      try {
        const lots = await getSmylEligibleLots(
          format(dateRange.from, 'yyyy-MM-dd'),
          format(dateRange.to, 'yyyy-MM-dd'),
          graceFilter,
          statusFilter
        );
        setEligibleLots(lots);
      } catch (e) {
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar los lotes elegibles.' });
      } finally {
        setIsLoadingLots(false);
      }
    }, [dateRange, graceFilter, statusFilter, toast]);

    useEffect(() => {
        if (isLotFinderOpen) {
            fetchEligibleLots();
        }
    }, [isLotFinderOpen, graceFilter, statusFilter, fetchEligibleLots]);

    const handleOpenLotFinder = () => {
        if (!dateRange?.from || !dateRange?.to) {
            toast({ variant: 'destructive', title: 'Error', description: 'Por favor, seleccione un rango de fechas primero.' });
            return;
        }
        const currentLotIds = lotIds.split(/[\s,]+/).filter(Boolean);
        setSelectedLotsInDialog(new Set(currentLotIds));
        setIsLotFinderOpen(true);
    };
    
    const handleConfirmLotSelection = () => {
      setLotIds(Array.from(selectedLotsInDialog).join(', '));
      setIsLotFinderOpen(false);
    };

    const handleToggleStatus = async (lotId: string) => {
      setTogglingLotId(lotId);
      const result = await toggleLotStatus(lotId);
      if (result.success) {
        toast({ title: 'Éxito', description: result.message });
        setEligibleLots(prevLots => 
          prevLots.map(lot => 
            lot.lotId === lotId ? { ...lot, status: result.newStatus } : lot
          )
        );
        fetchEligibleLots();
      } else {
        toast({ variant: 'destructive', title: 'Error', description: result.message });
      }
      setTogglingLotId(null);
    };


    const handleSearch = async () => {
        const lotIdArray = lotIds.split(/[\s,]+/).filter(Boolean);
        if (lotIdArray.length === 0) {
            toast({ variant: 'destructive', title: 'Error', description: 'Por favor, ingrese al menos un número de lote.' });
            return;
        }
        if (!dateRange || !dateRange.from || !dateRange.to) {
            toast({ variant: 'destructive', title: 'Error', description: 'Por favor, seleccione un rango de fechas.' });
            return;
        }
        
        setIsLoading(true);
        setSearched(true);
        setError(null);
        setReportData([]);

        const results: AssistantReport[] = [];
        let hasError = false;

        for (const lotId of lotIdArray) {
            try {
                const result = await getSmylLotAssistantReport(lotId, format(dateRange.from, 'yyyy-MM-dd'), format(dateRange.to, 'yyyy-MM-dd'));
                
                if ('error' in result) {
                    hasError = true;
                    toast({ variant: 'destructive', title: `Error en Lote ${lotId}`, description: result.error });
                    
                    if (typeof result.error === 'string' && (result.error.includes('requires an index') || result.error.includes('needs an index'))) {
                        setIndexErrorMessage(result.error);
                        setIsIndexErrorOpen(true);
                    }
                } else {
                    results.push(result);
                }
            } catch (e) {
                hasError = true;
                const errorMessage = e instanceof Error ? e.message : 'Ocurrió un error inesperado.';
                setError(errorMessage);
                toast({ variant: 'destructive', title: 'Error del Servidor', description: errorMessage });
            }
        }
        
        setReportData(results);
        if (!hasError && results.length === 0) {
            setError(`No se encontró un lote que cumpla los criterios con el ID '${lotIds}'.`);
        }

        setIsLoading(false);
    };
    
    const handleClear = () => {
        setLotIds('');
        setDateRange(undefined);
        setReportData([]);
        setSearched(false);
        setError(null);
    };

    return (
        <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
            <div className="max-w-5xl mx-auto">
                <header className="mb-8">
                    <div className="relative flex items-center justify-center text-center">
                        <Button variant="ghost" size="icon" className="absolute left-0 top-1/2 -translate-y-1/2" onClick={() => router.back()}>
                            <ArrowLeft className="h-6 w-6" />
                        </Button>
                        <div>
                            <Button variant="ghost" className="mb-2" onClick={() => router.push('/')}>
                                <Home className="mr-2 h-4 w-4" />
                                Ir al Inicio
                            </Button>
                            <div className="flex items-center justify-center gap-2">
                                <Package className="h-8 w-8 text-primary" />
                                <h1 className="text-2xl font-bold text-primary">Asistente de Verificación Liquidación Por Lote SMYL</h1>
                            </div>
                            <p className="text-sm text-gray-500">Consulte el historial y saldo diario de un lote para facilitar la liquidación manual.</p>
                        </div>
                    </div>
                </header>

                <Card>
                    <CardHeader>
                        <CardTitle>Buscar Lote(s)</CardTitle>
                        <CardDescription>Ingrese uno o más lotes y el rango de fechas para ver su historial de movimientos y saldos.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                            <div className="space-y-2">
                                <Label>Rango de Fechas</Label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !dateRange && "text-muted-foreground")}>
                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                            {dateRange?.from ? (dateRange.to ? (<>{format(dateRange.from, "LLL dd, y", { locale: es })} - {format(dateRange.to, "LLL dd, y", { locale: es })}</>) : (format(dateRange.from, "LLL dd, y", { locale: es }))) : (<span>Seleccione un rango</span>)}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                        <Calendar initialFocus mode="range" defaultMonth={dateRange?.from} selected={dateRange} onSelect={setDateRange} numberOfMonths={2} locale={es} disabled={{ after: new Date() }} />
                                    </PopoverContent>
                                </Popover>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="lotId">Número de Lote(s)</Label>
                                <div className="flex items-center gap-2">
                                    <Textarea id="lotIds" placeholder="Ej: MNBU0967, CAIU0530..." value={lotIds} onChange={(e) => setLotIds(e.target.value.toUpperCase())} />
                                    <Button type="button" variant="outline" size="icon" onClick={handleOpenLotFinder} disabled={!dateRange?.from || !dateRange?.to}>
                                        <Search className="h-4 w-4" />
                                        <span className="sr-only">Buscar Lote</span>
                                    </Button>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <Button onClick={handleSearch} className="w-full" disabled={isLoading}>
                                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                                    Buscar
                                </Button>
                                <Button onClick={handleClear} variant="outline" className="w-full">
                                    <XCircle className="mr-2 h-4 w-4" />
                                    Limpiar
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {isLoading ? (
                    <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>
                ) : searched ? (
                    reportData.length > 0 ? (
                      <div className="space-y-6 mt-6">
                        {reportData.map(report => (
                            <Card key={report.lotId}>
                                <CardHeader>
                                    <CardTitle>Resultado para el Lote: {report.lotId}</CardTitle>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-muted-foreground pt-2">
                                        <span><strong>Recepción Inicial:</strong> {format(report.initialReception.date, "dd/MM/yyyy")}</span>
                                        <span><strong>Paletas Iniciales:</strong> {report.initialReception.pallets}</span>
                                        <span><strong>Peso Bruto:</strong> {report.initialReception.grossWeight.toLocaleString('es-CO')} kg</span>
                                        <span><strong>Pedido SISLOG:</strong> {report.initialReception.pedidoSislog}</span>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="rounded-md border h-96 overflow-auto">
                                    <Table>
                                        <TableHeader className="sticky top-0 bg-background z-10">
                                            <TableRow>
                                                <TableHead className="w-28">Fecha</TableHead>
                                                <TableHead className="w-20 text-center">Día</TableHead>
                                                <TableHead>Movimientos del Día</TableHead>
                                                <TableHead className="w-32 text-right">Saldo Inicial</TableHead>
                                                <TableHead className="w-32 text-right">Saldo Final</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {report.dailyBalances.map((day) => (
                                                <TableRow key={day.date} className={day.isGracePeriod ? 'bg-blue-50' : ''}>
                                                    <TableCell>{format(parseISO(day.date), "d MMM, yyyy", { locale: es })}</TableCell>
                                                    <TableCell className="text-center">
                                                        <Badge variant={day.isGracePeriod ? "default" : "secondary"} className={day.isGracePeriod ? "bg-primary/80" : ""}>
                                                            Día {Math.ceil(day.dayNumber)} {day.isGracePeriod && "(Gracia)"}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-xs text-muted-foreground">{day.movementsDescription}</TableCell>
                                                    <TableCell className="text-right font-medium">{day.initialBalance}</TableCell>
                                                    <TableCell className="text-right font-bold text-lg">{day.finalBalance}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                      </div>
                    ) : (
                        <Card className="mt-6">
                            <CardContent className="py-20 text-center">
                                <div className="flex flex-col items-center gap-4">
                                    <div className="rounded-full bg-destructive/10 p-4">
                                        <AlertTriangle className="h-12 w-12 text-destructive" />
                                    </div>
                                    <h3 className="text-xl font-semibold">
                                        {error ? "Error al generar el reporte" : "No se encontraron resultados"}
                                    </h3>
                                    <p className="text-muted-foreground">
                                        {error || `No se pudo encontrar un lote que cumpla los criterios con el ID '${lotIds}'.`}
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    )
                ) : (
                    <Card className="mt-6">
                        <CardContent className="py-20 text-center">
                            <div className="flex flex-col items-center gap-4">
                                <div className="rounded-full bg-primary/10 p-4">
                                    <FolderSearch className="h-12 w-12 text-primary" />
                                </div>
                                <h3 className="text-xl font-semibold">Listo para la consulta</h3>
                                <p className="text-muted-foreground">Ingrese uno o más números de lote y un rango de fechas para empezar.</p>
                            </div>
                        </CardContent>
                    </Card>
                )}
                <IndexCreationDialog 
                    isOpen={isIndexErrorOpen}
                    onOpenChange={setIsIndexErrorOpen}
                    errorMessage={indexErrorMessage}
                />
                 <Dialog open={isLotFinderOpen} onOpenChange={setIsLotFinderOpen}>
                    <DialogContent className="sm:max-w-3xl">
                        <DialogHeader>
                            <DialogTitle>Buscar Lotes Elegibles de SMYL</DialogTitle>
                            <DialogDescription>
                                Se muestran los lotes que tienen saldo dentro del rango de fechas seleccionado.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="flex flex-col sm:flex-row items-center justify-between my-4 gap-4">
                            <RadioGroup value={graceFilter} onValueChange={(value: GraceFilter) => setGraceFilter(value)} className="flex items-center space-x-2 sm:space-x-4">
                                <div className="flex items-center space-x-2"><RadioGroupItem value="all" id="r-all" /><Label htmlFor="r-all">Todos</Label></div>
                                <div className="flex items-center space-x-2"><RadioGroupItem value="in_grace" id="r-in_grace" /><Label htmlFor="r-in_grace">En Gracia</Label></div>
                                <div className="flex items-center space-x-2"><RadioGroupItem value="post_grace" id="r-post_grace" /><Label htmlFor="r-post_grace">Post-Gracia</Label></div>
                            </RadioGroup>
                             <RadioGroup value={statusFilter} onValueChange={(value: LotStatusFilter) => setStatusFilter(value)} className="flex items-center space-x-2 sm:space-x-4">
                                <div className="flex items-center space-x-2"><RadioGroupItem value="pendiente" id="s-pendiente" /><Label htmlFor="s-pendiente">Pendientes</Label></div>
                                <div className="flex items-center space-x-2"><RadioGroupItem value="liquidado" id="s-liquidado" /><Label htmlFor="s-liquidado">Liquidados</Label></div>
                                <div className="flex items-center space-x-2"><RadioGroupItem value="all" id="s-all" /><Label htmlFor="s-all">Todos</Label></div>
                            </RadioGroup>
                        </div>
                        <Input
                            placeholder="Filtrar por lote o pedido..."
                            value={lotFinderSearch}
                            onChange={(e) => setLotFinderSearch(e.target.value)}
                        />
                        <ScrollArea className="h-72 mt-4">
                            {isLoadingLots ? (
                                <div className="flex justify-center items-center h-full"><Loader2 className="h-6 w-6 animate-spin" /></div>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-[10px]">
                                                <Checkbox
                                                    checked={eligibleLots.length > 0 && eligibleLots.every(l => selectedLotsInDialog.has(l.lotId))}
                                                    onCheckedChange={(checked) => {
                                                        const newSet = new Set(selectedLotsInDialog);
                                                        const lotsToChange = eligibleLots.filter(l => l.lotId.toLowerCase().includes(lotFinderSearch.toLowerCase()) || l.pedidoSislog.includes(lotFinderSearch));
                                                        if (checked) {
                                                            lotsToChange.forEach(l => newSet.add(l.lotId));
                                                        } else {
                                                            lotsToChange.forEach(l => newSet.delete(l.lotId));
                                                        }
                                                        setSelectedLotsInDialog(newSet);
                                                    }}
                                                />
                                            </TableHead>
                                            <TableHead>Lote</TableHead>
                                            <TableHead>Fecha Recepción</TableHead>
                                            <TableHead>Pedido SISLOG</TableHead>
                                            <TableHead className="text-center">Estado</TableHead>
                                            <TableHead className="text-right">Acción</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {eligibleLots.filter(l => l.lotId.toLowerCase().includes(lotFinderSearch.toLowerCase()) || l.pedidoSislog.includes(lotFinderSearch)).map(lot => (
                                            <TableRow key={lot.lotId}>
                                                 <TableCell>
                                                    <Checkbox
                                                        checked={selectedLotsInDialog.has(lot.lotId)}
                                                        onCheckedChange={(checked) => {
                                                            const newSet = new Set(selectedLotsInDialog);
                                                            if (checked) {
                                                                newSet.add(lot.lotId);
                                                            } else {
                                                                newSet.delete(lot.lotId);
                                                            }
                                                            setSelectedLotsInDialog(newSet);
                                                        }}
                                                    />
                                                </TableCell>
                                                <TableCell className="font-mono">{lot.lotId}</TableCell>
                                                <TableCell>{format(parseISO(lot.receptionDate), "dd/MM/yyyy")}</TableCell>
                                                <TableCell>{lot.pedidoSislog}</TableCell>
                                                <TableCell className="text-center">
                                                    <Badge variant={lot.status === 'liquidado' ? 'default' : 'outline'} className={cn(
                                                        lot.status === 'liquidado' && 'bg-green-100 text-green-800 border-green-300 hover:bg-green-200',
                                                        lot.status === 'pendiente' && 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200'
                                                    )}>
                                                        {lot.status === 'liquidado' ? 'Liquidado' : 'Pendiente'}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button 
                                                        variant="ghost" 
                                                        size="sm"
                                                        onClick={() => handleToggleStatus(lot.lotId)}
                                                        disabled={togglingLotId === lot.lotId}
                                                    >
                                                        {togglingLotId === lot.lotId ? <Loader2 className="h-4 w-4 animate-spin"/> : lot.status === 'liquidado' ? <Clock className="h-4 w-4"/> : <CheckCircle className="h-4 w-4"/>}
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </ScrollArea>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsLotFinderOpen(false)}>Cancelar</Button>
                             <Button onClick={handleConfirmLotSelection}>
                                Confirmar Selección ({selectedLotsInDialog.size})
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    );
}

    
