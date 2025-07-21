
"use client";

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { DateRange } from 'react-day-picker';
import { format, subDays, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

import { getCrewPerformanceReport, type CrewPerformanceReportRow } from '@/app/actions/crew-performance-report';
import { findBestMatchingStandard, type PerformanceStandard, type UnitOfMeasure } from '@/app/gestion-estandares/actions';
import { getAvailableOperarios } from '@/app/actions/performance-report';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { ArrowLeft, Search, XCircle, Loader2, CalendarIcon, File, FileDown, FolderSearch, Users, ShieldAlert, TrendingUp, Circle, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';


const EmptyState = ({ searched }: { searched: boolean; }) => (
    <TableRow>
        <TableCell colSpan={10} className="py-20 text-center">
            <div className="flex flex-col items-center gap-4">
                <div className="rounded-full bg-primary/10 p-4">
                    <FolderSearch className="h-12 w-12 text-primary" />
                </div>
                <h3 className="text-xl font-semibold">
                    {searched ? "No se encontraron operaciones de cuadrilla" : "Genere un reporte"}
                </h3>
                <p className="text-muted-foreground">
                    {searched ? "No hay datos para los filtros seleccionados." : "Seleccione los filtros para ver el informe."}
                </p>
            </div>
        </TableCell>
    </TableRow>
);

const AccessDenied = () => (
    <div className="flex flex-col items-center justify-center text-center gap-4">
        <div className="rounded-full bg-destructive/10 p-4">
            <ShieldAlert className="h-12 w-12 text-destructive" />
        </div>
        <h3 className="text-xl font-semibold">Acceso Denegado</h3>
        <p className="text-muted-foreground">
            No tiene permisos para acceder a esta página.
        </p>
    </div>
);


const getImageWithDimensions = (src: string): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            resolve({ width: img.width, height: img.height });
        };
        img.onerror = reject;
        img.src = src;
    });
};

const getImageAsBase64Client = async (url: string): Promise<string> => {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
        }
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = reject;
            reader.onload = () => {
                resolve(reader.result as string);
            };
            reader.readAsDataURL(blob);
        });
    } catch(e) {
        console.error("Error fetching client image", e);
        return "";
    }
};

const formatTime12Hour = (time24: string | undefined): string => {
    if (!time24 || !time24.includes(':')) return 'N/A';
    const [hours, minutes] = time24.split(':');
    let h = parseInt(hours, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    h = h ? h : 12; // the hour '0' should be '12'
    return `${h}:${minutes} ${ampm}`;
};

const formatDuration = (totalMinutes: number | null): string => {
    if (totalMinutes === null || totalMinutes < 0) return 'N/A';
    if (totalMinutes < 60) {
        return `${Math.round(totalMinutes)} min`;
    }
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (minutes === 0) {
        return `${hours}h`;
    }
    return `${hours}h ${Math.round(minutes)}m`;
};

const getPerformanceIndicator = (
  row: CrewPerformanceReportRow, 
  standard: PerformanceStandard | null
): {
  status: 'Óptimo' | 'Normal' | 'Lento' | 'N/A',
  color: string,
  tooltip: string
} => {
  const { duracionMinutos, kilos, formType } = row;
  if (!formType || duracionMinutos === null || duracionMinutos <= 0 || kilos <= 0) {
    return { status: 'N/A', color: 'text-gray-400', tooltip: 'Datos insuficientes para calcular.' };
  }
  
  const standardMinutesPerTon = standard?.minutesPerTon ?? 25; // Default to 25 mins/ton if not found
  
  const toneladas = kilos / 1000;
  const standardTime = toneladas * standardMinutesPerTon;
  const lowerBound = standardTime * 0.9;
  const upperBound = standardTime * 1.1;

  const standardTooltip = `Estándar Aplicado: ${standard ? standard.description : `Por defecto (${standardMinutesPerTon} min/ton)`}. Tiempo esperado: ${formatDuration(standardTime)}`;

  if (duracionMinutos < lowerBound) {
    return { status: 'Óptimo', color: 'text-green-600', tooltip: `Más rápido que el estándar. ${standardTooltip}` };
  }
  if (duracionMinutos > upperBound) {
    return { status: 'Lento', color: 'text-red-600', tooltip: `Más lento que el estándar. ${standardTooltip}` };
  }
  return { status: 'Normal', color: 'text-yellow-600', tooltip: `Dentro del estándar. ${standardTooltip}` };
};


export default function CrewPerformanceReportPage() {
    const router = useRouter();
    const { toast } = useToast();
    const today = new Date();
    const sixtyTwoDaysAgo = subDays(today, 62);
    
    const { permissions, loading: authLoading } = useAuth();
    
    const [dateRange, setDateRange] = useState<DateRange | undefined>({ from: subDays(today, 7), to: today });
    const [selectedOperario, setSelectedOperario] = useState<string>('all');
    const [availableOperarios, setAvailableOperarios] = useState<string[]>([]);
    const [operationType, setOperationType] = useState<string>('all');
    const [productType, setProductType] = useState<string>('all');
    
    const [reportData, setReportData] = useState<(CrewPerformanceReportRow & { standard: PerformanceStandard | null })[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingOperarios, setIsLoadingOperarios] = useState(false);
    const [searched, setSearched] = useState(false);

    
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    const totalPages = Math.ceil(reportData.length / itemsPerPage);
    const displayedData = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        return reportData.slice(startIndex, endIndex);
    }, [reportData, currentPage, itemsPerPage]);

    const [logoBase64, setLogoBase64] = useState<string | null>(null);
    const [logoDimensions, setLogoDimensions] = useState<{ width: number, height: number } | null>(null);
    const [isLogoLoading, setIsLogoLoading] = useState(true);

    useEffect(() => {
        const fetchLogo = async () => {
            setIsLogoLoading(true);
            const logoUrl = new URL('/images/company-logo.png', window.location.origin).href;
            try {
                const data = await getImageAsBase64Client(logoUrl);
                if (data) {
                    const dims = await getImageWithDimensions(data);
                    setLogoDimensions(dims);
                    setLogoBase64(data);
                }
            } catch (error) {
                console.error("Failed to load logo for PDF:", error);
            } finally {
                setIsLogoLoading(false);
            }
        };
        fetchLogo();
    }, []);

    useEffect(() => {
        const fetchOperarios = async () => {
            if (dateRange?.from && dateRange?.to) {
                setIsLoadingOperarios(true);
                try {
                    const startDate = format(dateRange.from, 'yyyy-MM-dd');
                    const endDate = format(dateRange.to, 'yyyy-MM-dd');
                    const operarios = await getAvailableOperarios(startDate, endDate);
                    setAvailableOperarios(operarios);
                } catch (error) {
                     toast({ variant: 'destructive', title: 'Error', description: 'No se pudo cargar la lista de operarios.' });
                } finally {
                    setIsLoadingOperarios(false);
                }
            } else {
                setAvailableOperarios([]);
            }
        };
        fetchOperarios();
    }, [dateRange, toast]);

    const handleSearch = useCallback(async () => {
        if (!dateRange || !dateRange.from || !dateRange.to) {
            toast({
                variant: 'destructive',
                title: 'Filtros incompletos',
                description: 'Por favor, seleccione un rango de fechas.',
            });
            return;
        }

        setIsLoading(true);
        setSearched(true);
        setReportData([]);
        setCurrentPage(1);

        try {
            const criteria = {
                startDate: format(dateRange.from, 'yyyy-MM-dd'),
                endDate: format(dateRange.to, 'yyyy-MM-dd'),
                operario: selectedOperario === 'all' ? undefined : selectedOperario,
                operationType: operationType === 'all' ? undefined : operationType as 'recepcion' | 'despacho',
                productType: productType === 'all' ? undefined : productType as 'fijo' | 'variable',
            };

            const results = await getCrewPerformanceReport(criteria);
            
            const resultsWithStandards = await Promise.all(results.map(async (row) => {
                const operation = row.formType.includes('recepcion') || row.formType.includes('reception') ? 'recepcion' : 'despacho';
                const product = row.formType.includes('fixed-weight') ? 'fijo' : 'variable';
                const unitOfMeasure = row.unidadDeMedidaPrincipal as UnitOfMeasure;
                const standard = await findBestMatchingStandard(row.cliente, operation, product, unitOfMeasure);
                return { ...row, standard };
            }));

            setReportData(resultsWithStandards);
            
            if (results.length === 0) {
                 toast({
                    title: "Sin resultados",
                    description: "No se encontraron operaciones de cuadrilla para los filtros seleccionados.",
                });
            }
        } catch (error: any) {
            console.error("Crew Performance Report Error:", error);
            const errorMessage = error instanceof Error ? error.message : "Ocurrió un error desconocido.";
            
            toast({
                variant: 'destructive',
                title: 'Error al generar el reporte',
                description: errorMessage,
                duration: 9000
            });
        } finally {
            setIsLoading(false);
        }
    }, [dateRange, selectedOperario, operationType, productType, toast]);
    
    const handleClear = () => {
        setDateRange(undefined);
        setSelectedOperario('all');
        setOperationType('all');
        setProductType('all');
        setReportData([]);
        setSearched(false);
        setCurrentPage(1);
    };

    const totalDuration = useMemo(() => reportData.reduce((acc, row) => acc + (row.duracionMinutos || 0), 0), [reportData]);
    const totalToneladas = useMemo(() => reportData.reduce((acc, row) => acc + (row.kilos || 0), 0) / 1000, [reportData]);
    
    const handleExportExcel = () => {
        if (reportData.length === 0) return;

        const dataToExport = reportData.map(row => {
            const indicator = getPerformanceIndicator(row, row.standard);
            return {
                'Fecha': format(new Date(row.fecha), 'dd/MM/yyyy'),
                'Operario Responsable': row.operario,
                'Cliente': row.cliente,
                'Tipo Operación': row.tipoOperacion,
                'Tipo Producto': row.tipoProducto,
                'Pedido SISLOG': row.pedidoSislog,
                'Indicador': indicator.status,
                'Toneladas': (row.kilos / 1000).toFixed(2),
                'Hora Inicio': formatTime12Hour(row.horaInicio),
                'Hora Fin': formatTime12Hour(row.horaFin),
                'Duración': formatDuration(row.duracionMinutos),
                'Estándar Aplicado': row.standard?.description || 'Por defecto',
                'Minutos/Tonelada Estándar': row.standard?.minutesPerTon || 25,
            }
        });

        const totalRow = {
            'Fecha': '',
            'Operario Responsable': '',
            'Cliente': '',
            'Tipo Operación': '',
            'Tipo Producto': '',
            'Pedido SISLOG': 'TOTALES:',
            'Indicador': '',
            'Toneladas': totalToneladas.toFixed(2),
            'Hora Inicio': '',
            'Hora Fin': '',
            'Duración': formatDuration(totalDuration)
        };

        const worksheet = XLSX.utils.json_to_sheet([...dataToExport, totalRow]);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Desempeño Cuadrilla');
        const fileName = `Reporte_Desempeño_Cuadrilla_${format(dateRange!.from!, 'yyyy-MM-dd')}_a_${format(dateRange!.to!, 'yyyy-MM-dd')}.xlsx`;
        XLSX.writeFile(workbook, fileName);
    };

    const handleExportPDF = async () => {
        if (reportData.length === 0 || !logoBase64 || !logoDimensions) return;
        
        const doc = new jsPDF({ orientation: 'landscape' });
        const pageWidth = doc.internal.pageSize.getWidth();

        const logoWidth = 60;
        const aspectRatio = logoDimensions.width / logoDimensions.height;
        const logoHeight = logoWidth / aspectRatio;
        const logoX = (pageWidth - logoWidth) / 2;
        doc.addImage(logoBase64, 'PNG', logoX, 10, logoWidth, logoHeight);

        const titleY = 10 + logoHeight + 5;
        
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text(`Informe de Desempeño de Cuadrilla`, pageWidth / 2, titleY, { align: 'center' });
        
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(`Periodo: ${format(dateRange!.from!, 'dd/MM/yyyy')} - ${format(dateRange!.to!, 'dd/MM/yyyy')}`, 14, titleY + 10);

        autoTable(doc, {
            startY: titleY + 15,
            head: [['Fecha', 'Operario', 'Cliente', 'Tipo Op.', 'Tipo Prod.', 'Pedido', 'Toneladas', 'Duración', 'Indicador']],
            body: reportData.map(row => {
                const indicator = getPerformanceIndicator(row, row.standard);
                return [
                format(new Date(row.fecha), 'dd/MM/yy'),
                row.operario,
                row.cliente,
                row.tipoOperacion,
                row.tipoProducto,
                row.pedidoSislog,
                (row.kilos / 1000).toFixed(2),
                formatDuration(row.duracionMinutos),
                indicator.status
            ]}),
            foot: [
                [
                    { content: 'TOTALES:', colSpan: 6, styles: { halign: 'right', fontStyle: 'bold' } }, 
                    { content: totalToneladas.toFixed(2), styles: { halign: 'left', fontStyle: 'bold' } },
                    { content: formatDuration(totalDuration), styles: { halign: 'left', fontStyle: 'bold' } },
                    ''
                ]
            ],
            headStyles: { fillColor: [33, 150, 243], fontSize: 7 },
            footStyles: { fillColor: [33, 150, 243], textColor: '#ffffff' },
            theme: 'grid',
            styles: { fontSize: 7, cellPadding: 1.5 },
        });

        const fileName = `Reporte_Desempeño_Cuadrilla_${format(dateRange!.from!, 'yyyy-MM-dd')}_a_${format(dateRange!.to!, 'yyyy-MM-dd')}.pdf`;
        doc.save(fileName);
    };

    if (authLoading) {
        return (
             <div className="flex min-h-screen w-full items-center justify-center">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
             </div>
        )
    }

    if (!permissions.canViewCrewPerformanceReport) {
        return (
            <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8 flex items-center justify-center">
                <div className="max-w-xl mx-auto text-center">
                    <AccessDenied />
                     <Button onClick={() => router.push('/')} className="mt-6">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Volver al Inicio
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
            <div className="max-w-7xl mx-auto">
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
                            <div className="flex items-center justify-center gap-2">
                                <Users className="h-8 w-8 text-primary" />
                                <h1 className="text-2xl font-bold text-primary">Gestión de Desempeño Cuadrilla</h1>
                            </div>
                             <p className="text-sm text-gray-500">Analice los kilos movilizados y tiempos por operación de cuadrillas.</p>
                        </div>
                    </div>
                </header>

                <Card>
                    <CardHeader>
                        <div className="flex justify-between items-start">
                             <div>
                                <CardTitle>Filtros del Reporte</CardTitle>
                                <CardDescription>Seleccione los filtros para generar el informe de desempeño de cuadrilla.</CardDescription>
                            </div>
                            <Button asChild variant="outline" size="sm">
                                <Link href="/gestion-estandares">
                                    <Settings className="mr-2 h-4 w-4" />
                                    Gestionar Estándares de Productividad
                                </Link>
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
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
                                        <Calendar initialFocus mode="range" defaultMonth={dateRange?.from} selected={dateRange} onSelect={setDateRange} numberOfMonths={2} locale={es} disabled={{ after: today, before: sixtyTwoDaysAgo }} />
                                    </PopoverContent>
                                </Popover>
                            </div>
                             <div className="space-y-2">
                                <Label>Operario Responsable</Label>
                                <Select value={selectedOperario} onValueChange={setSelectedOperario} disabled={isLoadingOperarios}>
                                    <SelectTrigger><SelectValue placeholder="Seleccione un operario" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Todos los Operarios</SelectItem>
                                        {availableOperarios.map(op => <SelectItem key={op} value={op}>{op}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                             <div className="space-y-2">
                                <Label>Tipo de Operación</Label>
                                <Select value={operationType} onValueChange={setOperationType}>
                                    <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Todos</SelectItem>
                                        <SelectItem value="recepcion">Recepción</SelectItem>
                                        <SelectItem value="despacho">Despacho</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Tipo de Producto</Label>
                                <Select value={productType} onValueChange={setProductType}>
                                    <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Todos</SelectItem>
                                        <SelectItem value="fijo">Peso Fijo</SelectItem>
                                        <SelectItem value="variable">Peso Variable</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex gap-2">
                                <Button onClick={handleSearch} className="w-full" disabled={isLoading}>
                                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                                    Generar
                                </Button>
                                <Button onClick={handleClear} variant="outline" className="w-full">
                                    <XCircle className="mr-2 h-4 w-4" />
                                    Limpiar
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                 <Card className="mt-6">
                    <CardHeader>
                        <div className="flex justify-between items-center flex-wrap gap-4">
                            <div>
                                <CardTitle>Resultados del Informe de Cuadrilla</CardTitle>
                                <CardDescription>
                                    {isLoading ? "Cargando resultados..." : `Mostrando ${reportData.length} operaciones.`}
                                </CardDescription>
                            </div>
                            <div className="flex gap-2">
                                <Button onClick={handleExportExcel} disabled={isLoading || reportData.length === 0} variant="outline"><File className="mr-2 h-4 w-4" /> Exportar a Excel</Button>
                                <Button onClick={handleExportPDF} disabled={isLoading || reportData.length === 0 || isLogoLoading} variant="outline">{isLogoLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />} Exportar a PDF</Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <ScrollArea className="w-full whitespace-nowrap rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Indicador</TableHead>
                                        <TableHead>Fecha</TableHead>
                                        <TableHead>Operario</TableHead>
                                        <TableHead>Cliente</TableHead>
                                        <TableHead>Tipo Op.</TableHead>
                                        <TableHead>Tipo Prod.</TableHead>
                                        <TableHead>Pedido SISLOG</TableHead>
                                        <TableHead className="text-right">Toneladas</TableHead>
                                        <TableHead className="text-right">Duración</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading ? (
                                        <TableRow><TableCell colSpan={9}><Skeleton className="h-20 w-full" /></TableCell></TableRow>
                                    ) : displayedData.length > 0 ? (
                                        displayedData.map((row) => {
                                            const indicator = getPerformanceIndicator(row, row.standard);
                                            return (
                                                <TableRow key={row.id}>
                                                    <TableCell>
                                                        <TooltipProvider>
                                                            <Tooltip>
                                                                <TooltipTrigger>
                                                                    <div className="flex items-center gap-2">
                                                                        <Circle className={cn("h-3 w-3", indicator.color)} fill="currentColor" />
                                                                        {indicator.status}
                                                                    </div>
                                                                </TooltipTrigger>
                                                                <TooltipContent>
                                                                    <p>{indicator.tooltip}</p>
                                                                </TooltipContent>
                                                            </Tooltip>
                                                        </TooltipProvider>
                                                    </TableCell>
                                                    <TableCell>{format(new Date(row.fecha), 'dd/MM/yyyy')}</TableCell>
                                                    <TableCell>{row.operario}</TableCell>
                                                    <TableCell className="max-w-[150px] truncate" title={row.cliente}>{row.cliente}</TableCell>
                                                    <TableCell>{row.tipoOperacion}</TableCell>
                                                    <TableCell>{row.tipoProducto}</TableCell>
                                                    <TableCell>{row.pedidoSislog}</TableCell>
                                                    <TableCell className="text-right font-mono">{(row.kilos / 1000).toFixed(2)}</TableCell>
                                                    <TableCell className="text-right font-medium">{formatDuration(row.duracionMinutos)}</TableCell>
                                                </TableRow>
                                            )
                                        })
                                    ) : (
                                        <EmptyState searched={searched} />
                                    )}
                                </TableBody>
                            </Table>
                            <ScrollBar orientation="horizontal" />
                        </ScrollArea>
                         <div className="flex items-center justify-between space-x-2 py-4">
                            <div className="flex-1 text-sm text-muted-foreground">{reportData.length} fila(s) en total.</div>
                            <div className="flex items-center space-x-2">
                                <p className="text-sm font-medium">Filas por página</p>
                                <Select value={`${itemsPerPage}`} onValueChange={(value) => { setItemsPerPage(Number(value)); setCurrentPage(1); }}>
                                    <SelectTrigger className="h-8 w-[70px]"><SelectValue placeholder={itemsPerPage} /></SelectTrigger>
                                    <SelectContent side="top">
                                        {[10, 20, 50, 100].map((pageSize) => (<SelectItem key={pageSize} value={`${pageSize}`}>{pageSize}</SelectItem>))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex w-[100px] items-center justify-center text-sm font-medium">Página {currentPage} de {totalPages}</div>
                            <div className="flex items-center space-x-2">
                                <Button variant="outline" size="sm" onClick={() => setCurrentPage((prev) => prev - 1)} disabled={currentPage === 1}>Anterior</Button>
                                <Button variant="outline" size="sm" onClick={() => setCurrentPage((prev) => prev + 1)} disabled={currentPage === totalPages || totalPages === 0}>Siguiente</Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}


