"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DateRange } from 'react-day-picker';
import { format, addDays, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { getSmylLotAssistantReport, type AssistantReport } from './actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Search, XCircle, Loader2, CalendarIcon, FolderSearch, Package, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';

export function SmylLiquidationAssistantComponent() {
    const router = useRouter();
    const { toast } = useToast();
    
    const [lotId, setLotId] = useState('');
    const [dateRange, setDateRange] = useState<DateRange | undefined>({
        from: new Date(),
        to: addDays(new Date(), 7)
    });
    
    const [reportData, setReportData] = useState<AssistantReport | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [searched, setSearched] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSearch = async () => {
        if (!lotId.trim()) {
            toast({ variant: 'destructive', title: 'Error', description: 'Por favor, ingrese un número de lote.' });
            return;
        }
        if (!dateRange || !dateRange.from || !dateRange.to) {
            toast({ variant: 'destructive', title: 'Error', description: 'Por favor, seleccione un rango de fechas.' });
            return;
        }
        
        setIsLoading(true);
        setSearched(true);
        setError(null);
        setReportData(null);

        try {
            const result = await getSmylLotAssistantReport(lotId.trim(), format(dateRange.from, 'yyyy-MM-dd'), format(dateRange.to, 'yyyy-MM-dd'));
            if ('error' in result) {
                setError(result.error);
                toast({ variant: 'destructive', title: 'No se pudo generar el reporte', description: result.error });
            } else {
                setReportData(result);
            }
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : 'Ocurrió un error inesperado.';
            setError(errorMessage);
            toast({ variant: 'destructive', title: 'Error del Servidor', description: errorMessage });
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleClear = () => {
        setLotId('');
        setDateRange(undefined);
        setReportData(null);
        setSearched(false);
        setError(null);
    };

    return (
        <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
            <div className="max-w-5xl mx-auto">
                <header className="mb-8">
                    <div className="relative flex items-center justify-center text-center">
                        <Button variant="ghost" size="icon" className="absolute left-0 top-1/2 -translate-y-1/2" onClick={() => router.push('/')}>
                            <ArrowLeft className="h-6 w-6" />
                        </Button>
                        <div>
                            <div className="flex items-center justify-center gap-2">
                                <Package className="h-8 w-8 text-primary" />
                                <h1 className="text-2xl font-bold text-primary">Asistente de Liquidación SMYL</h1>
                            </div>
                            <p className="text-sm text-gray-500">Consulte el historial y saldo diario de un lote para facilitar la liquidación manual.</p>
                        </div>
                    </div>
                </header>

                <Card>
                    <CardHeader>
                        <CardTitle>Buscar Lote</CardTitle>
                        <CardDescription>Ingrese el lote y el rango de fechas para ver su historial de movimientos y saldos.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                            <div className="space-y-2">
                                <Label htmlFor="lotId">Número de Lote</Label>
                                <Input id="lotId" placeholder="Ej: MNBU0967" value={lotId} onChange={(e) => setLotId(e.target.value.toUpperCase())} />
                            </div>
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
                                        <Calendar initialFocus mode="range" defaultMonth={dateRange?.from} selected={dateRange} onSelect={setDateRange} numberOfMonths={2} locale={es} />
                                    </PopoverContent>
                                </Popover>
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
                    reportData ? (
                        <Card className="mt-6">
                            <CardHeader>
                                <CardTitle>Resultado para el Lote: {reportData.lotId}</CardTitle>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-muted-foreground pt-2">
                                    <span><strong>Recepción Inicial:</strong> {format(reportData.initialReception.date, "dd/MM/yyyy")}</span>
                                    <span><strong>Paletas Iniciales:</strong> {reportData.initialReception.pallets}</span>
                                    <span><strong>Peso Bruto:</strong> {reportData.initialReception.grossWeight.toLocaleString('es-CO')} kg</span>
                                    <span><strong>Pedido SISLOG:</strong> {reportData.initialReception.pedidoSislog}</span>
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
                                        {reportData.dailyBalances.map((day) => (
                                            <TableRow key={day.date} className={day.isGracePeriod ? 'bg-blue-50' : ''}>
                                                <TableCell>{format(parseISO(day.date), "d MMM, yyyy", { locale: es })}</TableCell>
                                                <TableCell className="text-center">
                                                    <Badge variant={day.isGracePeriod ? "default" : "secondary"} className={day.isGracePeriod ? "bg-primary/80" : ""}>
                                                        Día {day.dayNumber} {day.isGracePeriod && "(Gracia)"}
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
                                        {error || `No se pudo encontrar un lote que cumpla los criterios con el ID '${lotId}'.`}
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
                                <p className="text-muted-foreground">Ingrese un número de lote y un rango de fechas para empezar.</p>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}
