
"use client";

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DateRange } from 'react-day-picker';
import { format, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

import { getPerformanceReport, getAvailableOperarios, type PerformanceReportRow } from '@/app/actions/performance-report';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { ArrowLeft, Search, XCircle, Loader2, CalendarIcon, File, FileDown, FolderSearch, Timer, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const EmptyState = ({ searched }: { searched: boolean; }) => (
    <TableRow>
        <TableCell colSpan={8} className="py-20 text-center">
            <div className="flex flex-col items-center gap-4">
                <div className="rounded-full bg-primary/10 p-4">
                    <FolderSearch className="h-12 w-12 text-primary" />
                </div>
                <h3 className="text-xl font-semibold">
                    {searched ? "No se encontraron operaciones" : "Genere un reporte"}
                </h3>
                <p className="text-muted-foreground">
                    {searched ? "No hay datos para el operario y rango de fechas seleccionado." : "Seleccione un rango de fechas para ver el informe."}
                </p>
            </div>
        </TableCell>
    </TableRow>
);

const formatTime12Hour = (time24: string | undefined): string => {
    if (!time24 || !time24.includes(':')) return 'N/A';
    const [hours, minutes] = time24.split(':');
    let h = parseInt(hours, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    h = h ? h : 12; // the hour '0' should be '12'
    return `${h}:${minutes} ${ampm}`;
};

export default function PerformanceReportPage() {
    const router = useRouter();
    const { toast } = useToast();
    const today = new Date();
    const sixtyTwoDaysAgo = subDays(today, 62);
    
    const { user, isAdmin } = useAuth();
    
    const [dateRange, setDateRange] = useState<DateRange | undefined>({ from: subDays(today, 7), to: today });
    const [selectedOperario, setSelectedOperario] = useState<string>('all');
    const [availableOperarios, setAvailableOperarios] = useState<string[]>([]);
    
    const [reportData, setReportData] = useState<PerformanceReportRow[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingOperarios, setIsLoadingOperarios] = useState(false);
    const [searched, setSearched] = useState(false);

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

    const handleSearch = async () => {
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

        try {
            const criteria = {
                startDate: format(dateRange.from, 'yyyy-MM-dd'),
                endDate: format(dateRange.to, 'yyyy-MM-dd'),
                operario: selectedOperario === 'all' ? undefined : selectedOperario,
            };

            const results = await getPerformanceReport(criteria);
            setReportData(results);
            
            if (results.length === 0) {
                 toast({
                    title: "Sin resultados",
                    description: "No se encontraron operaciones para los filtros seleccionados.",
                });
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Ocurrió un error desconocido.";
            toast({
                variant: 'destructive',
                title: 'Error al generar el reporte',
                description: errorMessage,
            });
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleClear = () => {
        setDateRange(undefined);
        setSelectedOperario('all');
        setReportData([]);
        setSearched(false);
    };

    const handleExportExcel = () => {
        if (reportData.length === 0) return;

        const dataToExport = reportData.map(row => ({
            'Fecha': format(new Date(row.fecha), 'dd/MM/yyyy'),
            'Operario': row.operario,
            'Cliente': row.cliente,
            'Tipo Operación': row.tipoOperacion,
            'No. Pedido (SISLOG)': row.pedidoSislog,
            'Hora Inicio': formatTime12Hour(row.horaInicio),
            'Hora Fin': formatTime12Hour(row.horaFin),
            'Duración (Minutos)': row.duracionMinutos ?? 'N/A',
        }));

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Reporte Desempeño');
        const fileName = `Reporte_Desempeño_${format(dateRange!.from!, 'yyyy-MM-dd')}_a_${format(dateRange!.to!, 'yyyy-MM-dd')}.xlsx`;
        XLSX.writeFile(workbook, fileName);
    };

    const handleExportPDF = async () => {
        if (reportData.length === 0) return;
        
        const doc = new jsPDF({ orientation: 'landscape' });
        
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text(`Informe de Desempeño por Operario`, doc.internal.pageSize.getWidth() / 2, 20, { align: 'center' });
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Periodo: ${format(dateRange!.from!, 'dd/MM/yyyy')} - ${format(dateRange!.to!, 'dd/MM/yyyy')}`, 14, 30);
        if (selectedOperario !== 'all') {
            doc.text(`Operario: ${selectedOperario}`, doc.internal.pageSize.getWidth() - 14, 30, { align: 'right' });
        }


        autoTable(doc, {
            startY: 40,
            head: [['Fecha', 'Operario', 'Cliente', 'Tipo Op.', 'Pedido', 'H. Inicio', 'H. Fin', 'Duración (Min)']],
            body: reportData.map(row => [
                format(new Date(row.fecha), 'dd/MM/yy'),
                row.operario,
                row.cliente,
                row.tipoOperacion,
                row.pedidoSislog,
                formatTime12Hour(row.horaInicio),
                formatTime12Hour(row.horaFin),
                row.duracionMinutos ?? 'N/A'
            ]),
            headStyles: { fillColor: [33, 150, 243] },
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 2 },
        });

        const fileName = `Reporte_Desempeño_${format(dateRange!.from!, 'yyyy-MM-dd')}_a_${format(dateRange!.to!, 'yyyy-MM-dd')}.pdf`;
        doc.save(fileName);
    };

    if (!isAdmin && !user) {
        // user object might not be loaded yet, so wait. If it's loaded and not admin, then deny.
        return null; 
    }
    if (user && !isAdmin) {
        return <div className="p-8 text-center">Acceso denegado.</div>;
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
                                <Timer className="h-8 w-8 text-primary" />
                                <h1 className="text-2xl font-bold text-primary">Informe de Desempeño</h1>
                            </div>
                             <p className="text-sm text-gray-500">Analice los tiempos de operación de los formularios por operario.</p>
                        </div>
                    </div>
                </header>

                <Card>
                    <CardHeader>
                        <CardTitle>Filtros del Reporte</CardTitle>
                        <CardDescription>Seleccione los filtros para generar el informe de desempeño.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
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
                                <Label>Operario</Label>
                                <Select value={selectedOperario} onValueChange={setSelectedOperario} disabled={isLoadingOperarios}>
                                    <SelectTrigger>
                                       <SelectValue placeholder="Seleccione un operario" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Todos los Operarios</SelectItem>
                                        {availableOperarios.map(op => <SelectItem key={op} value={op}>{op}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                           
                            <div className="flex gap-2 lg:col-start-4">
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
                                <CardTitle>Resultados del Informe</CardTitle>
                                <CardDescription>
                                    {isLoading ? "Cargando resultados..." : `Mostrando ${reportData.length} operaciones.`}
                                </CardDescription>
                            </div>
                            <div className="flex gap-2">
                                <Button onClick={handleExportExcel} disabled={isLoading || reportData.length === 0} variant="outline">
                                    <File className="mr-2 h-4 w-4" /> Exportar a Excel
                                </Button>
                                <Button onClick={handleExportPDF} disabled={isLoading || reportData.length === 0} variant="outline">
                                    <FileDown className="mr-2 h-4 w-4" /> Exportar a PDF
                                </Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <ScrollArea className="w-full whitespace-nowrap rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Fecha</TableHead>
                                        <TableHead>Operario</TableHead>
                                        <TableHead>Cliente</TableHead>
                                        <TableHead>Tipo Op.</TableHead>
                                        <TableHead>Pedido</TableHead>
                                        <TableHead>H. Inicio</TableHead>
                                        <TableHead>H. Fin</TableHead>
                                        <TableHead className="text-right">Duración (Minutos)</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading ? (
                                        <TableRow><TableCell colSpan={8}><Skeleton className="h-20 w-full" /></TableCell></TableRow>
                                    ) : reportData.length > 0 ? (
                                        reportData.map((row) => (
                                            <TableRow key={row.id}>
                                                <TableCell>{format(new Date(row.fecha), 'dd/MM/yyyy')}</TableCell>
                                                <TableCell>{row.operario}</TableCell>
                                                <TableCell className="max-w-[150px] truncate" title={row.cliente}>{row.cliente}</TableCell>
                                                <TableCell>{row.tipoOperacion}</TableCell>
                                                <TableCell>{row.pedidoSislog}</TableCell>
                                                <TableCell>{formatTime12Hour(row.horaInicio)}</TableCell>
                                                <TableCell>{formatTime12Hour(row.horaFin)}</TableCell>
                                                <TableCell className="text-right font-medium">{row.duracionMinutos ?? 'N/A'}</TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <EmptyState searched={searched} />
                                    )}
                                </TableBody>
                            </Table>
                            <ScrollBar orientation="horizontal" />
                        </ScrollArea>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
