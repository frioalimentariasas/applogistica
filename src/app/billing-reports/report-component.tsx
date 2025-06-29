
"use client";

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DateRange } from 'react-day-picker';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

import { getBillingReport, DailyReportData } from '@/app/actions/billing-report';
import type { ClientInfo } from '@/app/actions/clients';
import { useToast } from '@/hooks/use-toast';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft, Search, XCircle, Loader2, CalendarIcon, ChevronsUpDown, BarChart2, BookCopy, FileDown, File, FileUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';


const ResultsSkeleton = () => (
  <>
    {Array.from({ length: 3 }).map((_, index) => (
      <TableRow key={index}>
        <TableCell><Skeleton className="h-5 w-[100px] rounded-md" /></TableCell>
        <TableCell><Skeleton className="h-5 w-[150px] rounded-md" /></TableCell>
        <TableCell className="text-right"><Skeleton className="h-5 w-[150px] rounded-md float-right" /></TableCell>
        <TableCell className="text-right"><Skeleton className="h-5 w-[150px] rounded-md float-right" /></TableCell>
      </TableRow>
    ))}
  </>
);

const EmptyState = ({ searched }: { searched: boolean }) => (
    <TableRow>
        <TableCell colSpan={4} className="py-20 text-center">
            <div className="flex flex-col items-center gap-4">
                <div className="rounded-full bg-primary/10 p-4">
                    <BarChart2 className="h-12 w-12 text-primary" />
                </div>
                <h3 className="text-xl font-semibold">
                    {searched ? "No se encontraron movimientos" : "Genere un reporte"}
                </h3>
                <p className="text-muted-foreground">
                    {searched
                        ? "No hay datos para el cliente y rango de fechas seleccionado."
                        : "Seleccione un cliente y un rango de fechas para ver el informe."}
                </p>
            </div>
        </TableCell>
    </TableRow>
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
        return ""; // Return empty string on failure
    }
};


export default function BillingReportComponent({ clients }: { clients: ClientInfo[] }) {
    const router = useRouter();
    const { toast } = useToast();
    
    // State for billing report
    const [selectedClient, setSelectedClient] = useState<string | undefined>(undefined);
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    const [reportData, setReportData] = useState<DailyReportData[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searched, setSearched] = useState(false);
    const [isClientDialogOpen, setClientDialogOpen] = useState(false);
    const [clientSearch, setClientSearch] = useState('');

    // State for CSV inventory report
    const [csvData, setCsvData] = useState<any[]>([]);
    const [csvFileName, setCsvFileName] = useState<string>('');
    const [isProcessingCsv, setIsProcessingCsv] = useState<boolean>(false);
    const [inventoryClient, setInventoryClient] = useState<string | undefined>(undefined);
    const [inventoryDate, setInventoryDate] = useState<Date | undefined>(undefined);
    const [inventoryResult, setInventoryResult] = useState<{ count: number } | null>(null);
    const [inventorySearched, setInventorySearched] = useState<boolean>(false);
    const [isInventoryClientDialogOpen, setInventoryClientDialogOpen] = useState(false);
    const [inventoryClientSearch, setInventoryClientSearch] = useState('');

    // State for PDF logo
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

    const filteredClients = useMemo(() => {
        if (!clientSearch) return clients;
        return clients.filter(c => c.razonSocial.toLowerCase().includes(clientSearch.toLowerCase()));
    }, [clientSearch, clients]);
    
    const filteredInventoryClients = useMemo(() => {
        if (!inventoryClientSearch) return clients;
        return clients.filter(c => c.razonSocial.toLowerCase().includes(inventoryClientSearch.toLowerCase()));
    }, [inventoryClientSearch, clients]);


    const handleSearch = async () => {
        if (!selectedClient) {
            toast({
                variant: 'destructive',
                title: 'Cliente no seleccionado',
                description: 'Por favor, seleccione un cliente para generar el reporte.',
            });
            return;
        }

        if (!dateRange || !dateRange.from || !dateRange.to) {
            toast({
                variant: 'destructive',
                title: 'Filtro incompleto',
                description: 'Por favor, seleccione un rango de fechas.',
            });
            return;
        }

        setIsLoading(true);
        setSearched(true);
        setReportData([]);

        try {
            const criteria = {
                clientName: selectedClient,
                startDate: format(dateRange.from, 'yyyy-MM-dd'),
                endDate: format(dateRange.to, 'yyyy-MM-dd'),
            };

            const results = await getBillingReport(criteria);
            setReportData(results);
            
            if (results.length === 0) {
                 toast({
                    title: "Sin resultados",
                    description: "No se encontraron movimientos para los filtros seleccionados.",
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

    const handleExportExcel = () => {
        if (!selectedClient || reportData.length === 0) return;

        const dataToExport = reportData.map(row => ({
            'Fecha': format(new Date(row.date.replace(/-/g, '/')), 'dd/MM/yyyy'),
            'Cliente': selectedClient,
            'Paletas Recibidas': row.paletasRecibidas,
            'Paletas Despachadas': row.paletasDespachadas,
        }));

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Reporte Facturación');

        const fileName = `Reporte_Facturacion_${selectedClient.replace(/\s/g, '_')}_${format(dateRange!.from!, 'yyyy-MM-dd')}_a_${format(dateRange!.to!, 'yyyy-MM-dd')}.xlsx`;
        XLSX.writeFile(workbook, fileName);
    };

    const handleExportPDF = () => {
        if (!selectedClient || reportData.length === 0 || !logoBase64 || !logoDimensions) return;
        
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        
        const logoWidth = 70;
        const aspectRatio = logoDimensions.width / logoDimensions.height;
        const logoHeight = logoWidth / aspectRatio;
        
        const logoX = (pageWidth - logoWidth) / 2;
        const logoY = 15;
        doc.addImage(logoBase64, 'PNG', logoX, logoY, logoWidth, logoHeight);

        const textY = logoY + logoHeight + 10;
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('FRIO ALIMENTARIA SAS', pageWidth / 2, textY, { align: 'center' });
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text('NIT: 900736914-0', pageWidth / 2, textY + 6, { align: 'center' });
        
        const titleY = textY + 16;
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text(`Informe de Facturación`, pageWidth / 2, titleY, { align: 'center' });
        
        const clientY = titleY + 8;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Cliente: ${selectedClient}`, 14, clientY);
        doc.text(`Periodo: ${format(dateRange!.from!, 'dd/MM/yyyy')} - ${format(dateRange!.to!, 'dd/MM/yyyy')}`, pageWidth - 14, clientY, { align: 'right' });


        autoTable(doc, {
            startY: clientY + 10,
            head: [['Fecha', 'Cliente', 'Paletas Recibidas', 'Paletas Despachadas']],
            body: reportData.map(row => [
                format(new Date(row.date.replace(/-/g, '/')), 'dd/MM/yyyy'),
                selectedClient,
                row.paletasRecibidas,
                row.paletasDespachadas
            ]),
            headStyles: { fillColor: [33, 150, 243] },
        });

        const fileName = `Reporte_Facturacion_${selectedClient.replace(/\s/g, '_')}_${format(dateRange!.from!, 'yyyy-MM-dd')}_a_${format(dateRange!.to!, 'yyyy-MM-dd')}.pdf`;
        doc.save(fileName);
    };

    const handleClear = () => {
        setSelectedClient(undefined);
        setDateRange(undefined);
        setReportData([]);
        setSearched(false);
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) {
          setCsvData([]);
          setCsvFileName('');
          return;
        }
    
        setIsProcessingCsv(true);
        setCsvFileName(file.name);
        setInventoryResult(null);
        setInventorySearched(false);
    
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const data = e.target?.result;
            const workbook = XLSX.read(data, { type: 'binary', cellDates: true });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            
            const json = XLSX.utils.sheet_to_json(worksheet, { raw: true });
            
            if (json.length > 0) {
                const firstRow: any = json[0];
                if (!('FECHA' in firstRow && 'PROPIETARIO' in firstRow && 'PALETA' in firstRow)) {
                     toast({
                        variant: 'destructive',
                        title: 'Formato de CSV incorrecto',
                        description: 'El archivo debe contener las columnas "FECHA", "PROPIETARIO" y "PALETA".',
                    });
                    setCsvData([]);
                    setCsvFileName('');
                    setIsProcessingCsv(false);
                    return;
                }
            }
    
            setCsvData(json);
            toast({
                title: 'Archivo cargado',
                description: `${file.name} ha sido procesado. Ya puede filtrar.`,
            });
          } catch (error) {
            console.error("Error parsing CSV file:", error);
            toast({
                variant: 'destructive',
                title: 'Error al procesar el archivo',
                description: 'Asegúrese de que es un archivo CSV válido con el formato correcto.',
            });
            setCsvData([]);
            setCsvFileName('');
          } finally {
            setIsProcessingCsv(false);
          }
        };
        reader.onerror = (error) => {
            console.error("File reading error:", error);
            toast({
                variant: 'destructive',
                title: 'Error al leer el archivo',
                description: 'No se pudo leer el archivo seleccionado.',
            });
            setIsProcessingCsv(false);
        };
        reader.readAsBinaryString(file);
    };

    const handleCalculateInventory = () => {
        if (!inventoryClient || !inventoryDate) {
            toast({
                variant: 'destructive',
                title: 'Filtros incompletos',
                description: 'Por favor seleccione un cliente y una fecha.',
            });
            return;
        }
    
        setInventorySearched(true);
    
        const targetDate = new Date(Date.UTC(inventoryDate.getFullYear(), inventoryDate.getMonth(), inventoryDate.getDate()));
    
        const filteredData = csvData.filter(row => {
            const clientMatch = row.PROPIETARIO === inventoryClient;
            if (!clientMatch) return false;
    
            if (!row.FECHA) return false;

            // Handle Excel serial date numbers or date strings
            let rowDate: Date;
            if (typeof row.FECHA === 'number') {
                 // Excel serial date number
                 const excelDate = new Date(Date.UTC(1899, 11, 30 + row.FECHA));
                 rowDate = new Date(Date.UTC(excelDate.getFullYear(), excelDate.getMonth(), excelDate.getDate()));
            } else if (typeof row.FECHA === 'string') {
                // Assuming string is DD/MM/YYYY
                const parts = row.FECHA.split('/');
                if (parts.length === 3) {
                    const d = parseInt(parts[0], 10);
                    const m = parseInt(parts[1], 10) - 1;
                    const y = parseInt(parts[2], 10);
                    rowDate = new Date(Date.UTC(y, m, d));
                } else {
                    return false; // Skip invalid date strings
                }
            } else {
                return false;
            }
            
            return rowDate.getTime() === targetDate.getTime();
        });
    
        const uniquePallets = new Set(filteredData.map(row => row.PALETA));
        const count = uniquePallets.size;
        
        setInventoryResult({ count });
    
        if (count === 0) {
            toast({
                title: 'Sin resultados',
                description: 'No se encontraron paletas para el cliente y fecha seleccionados en el archivo.',
            });
        }
    };


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
                                <BookCopy className="h-8 w-8 text-primary" />
                                <h1 className="text-2xl font-bold text-primary">Informes para Facturación</h1>
                            </div>
                             <p className="text-sm text-gray-500">Consulte los movimientos consolidados por fecha.</p>
                        </div>
                    </div>
                </header>
                
                <Card className="mb-6">
                    <CardHeader>
                        <CardTitle>Filtros del Reporte Movimientos Diarios</CardTitle>
                        <CardDescription>Seleccione un cliente y un rango de fechas para generar el informe.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
                            <div className="space-y-2">
                                <Label>Cliente</Label>
                                <Dialog open={isClientDialogOpen} onOpenChange={setClientDialogOpen}>
                                    <DialogTrigger asChild>
                                        <Button variant="outline" className="w-full justify-between text-left font-normal">
                                            {selectedClient || "Seleccione un cliente"}
                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent className="sm:max-w-[425px]">
                                        <DialogHeader>
                                            <DialogTitle>Seleccionar Cliente</DialogTitle>
                                        </DialogHeader>
                                        <div className="p-4">
                                            <Input
                                                placeholder="Buscar cliente..."
                                                value={clientSearch}
                                                onChange={(e) => setClientSearch(e.target.value)}
                                                className="mb-4"
                                            />
                                            <ScrollArea className="h-72">
                                                <div className="space-y-1">
                                                    {filteredClients.map((client) => (
                                                        <Button
                                                            key={client.id}
                                                            variant="ghost"
                                                            className="w-full justify-start"
                                                            onClick={() => {
                                                                setSelectedClient(client.razonSocial);
                                                                setClientDialogOpen(false);
                                                                setClientSearch('');
                                                            }}
                                                        >
                                                            {client.razonSocial}
                                                        </Button>
                                                    ))}
                                                    {filteredClients.length === 0 && <p className="text-center text-sm text-muted-foreground">No se encontraron clientes.</p>}
                                                </div>
                                            </ScrollArea>
                                        </div>
                                    </DialogContent>
                                </Dialog>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="date">Rango de Fechas</Label>
                                 <Popover>
                                    <PopoverTrigger asChild>
                                        <Button
                                            id="date"
                                            variant={"outline"}
                                            className={cn(
                                                "w-full justify-start text-left font-normal",
                                                !dateRange && "text-muted-foreground"
                                            )}
                                        >
                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                            {dateRange?.from ? (
                                                dateRange.to ? (
                                                    <>
                                                        {format(dateRange.from, "LLL dd, y", { locale: es })} -{" "}
                                                        {format(dateRange.to, "LLL dd, y", { locale: es })}
                                                    </>
                                                ) : (
                                                    format(dateRange.from, "LLL dd, y", { locale: es })
                                                )
                                            ) : (
                                                <span>Seleccione un rango</span>
                                            )}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                        <Calendar
                                            initialFocus
                                            mode="range"
                                            defaultMonth={dateRange?.from}
                                            selected={dateRange}
                                            onSelect={setDateRange}
                                            numberOfMonths={2}
                                            locale={es}
                                        />
                                    </PopoverContent>
                                </Popover>
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

                <Card>
                    <CardHeader>
                        <div className="flex justify-between items-center flex-wrap gap-4">
                            <div>
                                <CardTitle>Resultados del Informe Movimientos Diarios</CardTitle>
                                <CardDescription>
                                     {isLoading ? "Cargando resultados..." : `Mostrando ${reportData.length} días con movimientos.`}
                                </CardDescription>
                            </div>
                            <div className="flex gap-2">
                                <Button onClick={handleExportExcel} disabled={isLoading || reportData.length === 0} variant="outline">
                                    <File className="mr-2 h-4 w-4" /> Exportar a Excel
                                </Button>
                                <Button onClick={handleExportPDF} disabled={isLoading || reportData.length === 0 || isLogoLoading} variant="outline">
                                    {isLogoLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
                                    Exportar a PDF
                                </Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Fecha</TableHead>
                                        <TableHead>Cliente</TableHead>
                                        <TableHead className="text-right">Paletas Recibidas</TableHead>
                                        <TableHead className="text-right">Paletas Despachadas</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading ? (
                                        <ResultsSkeleton />
                                    ) : reportData.length > 0 ? (
                                        reportData.map((row) => (
                                            <TableRow key={row.date}>
                                                <TableCell className="font-medium">{format(new Date(row.date.replace(/-/g, '/')), 'dd/MM/yyyy')}</TableCell>
                                                <TableCell>{selectedClient}</TableCell>
                                                <TableCell className="text-right">{row.paletasRecibidas}</TableCell>
                                                <TableCell className="text-right">{row.paletasDespachadas}</TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <EmptyState searched={searched} />
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
                
                {/* Inventory Report Section */}
                <Card className="mt-8">
                    <CardHeader>
                        <CardTitle>Informe de Inventario Diario (desde CSV)</CardTitle>
                        <CardDescription>Cargue el archivo CSV diario para consultar el total de paletas almacenadas por cliente y fecha.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
                            <div className="space-y-2 lg:col-span-3">
                                <Label htmlFor="csv-upload">Archivo de Inventario (.csv)</Label>
                                <Input
                                    id="csv-upload"
                                    type="file"
                                    accept=".csv"
                                    onChange={handleFileChange}
                                    disabled={isProcessingCsv}
                                    className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                                />
                                {isProcessingCsv && <p className="text-sm text-muted-foreground flex items-center"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Procesando archivo...</p>}
                                {csvFileName && !isProcessingCsv && <p className="text-sm text-muted-foreground">Archivo cargado: {csvFileName}</p>}
                            </div>

                            <div className="space-y-2">
                                <Label>Cliente</Label>
                                <Dialog open={isInventoryClientDialogOpen} onOpenChange={setInventoryClientDialogOpen}>
                                    <DialogTrigger asChild>
                                        <Button variant="outline" className="w-full justify-between text-left font-normal" disabled={csvData.length === 0}>
                                            {inventoryClient || "Seleccione un cliente"}
                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent className="sm:max-w-[425px]">
                                        <DialogHeader>
                                            <DialogTitle>Seleccionar Cliente</DialogTitle>
                                        </DialogHeader>
                                        <div className="p-4">
                                            <Input
                                                placeholder="Buscar cliente..."
                                                value={inventoryClientSearch}
                                                onChange={(e) => setInventoryClientSearch(e.target.value)}
                                                className="mb-4"
                                            />
                                            <ScrollArea className="h-72">
                                                <div className="space-y-1">
                                                    {filteredInventoryClients.map((client) => (
                                                        <Button
                                                            key={client.id}
                                                            variant="ghost"
                                                            className="w-full justify-start"
                                                            onClick={() => {
                                                                setInventoryClient(client.razonSocial);
                                                                setInventoryClientDialogOpen(false);
                                                                setInventoryClientSearch('');
                                                            }}
                                                        >
                                                            {client.razonSocial}
                                                        </Button>
                                                    ))}
                                                    {filteredInventoryClients.length === 0 && <p className="text-center text-sm text-muted-foreground">No se encontraron clientes.</p>}
                                                </div>
                                            </ScrollArea>
                                        </div>
                                    </DialogContent>
                                </Dialog>
                            </div>

                            <div className="space-y-2">
                                <Label>Fecha del Inventario</Label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant={"outline"}
                                            className={cn("w-full justify-start text-left font-normal", !inventoryDate && "text-muted-foreground")}
                                            disabled={csvData.length === 0}
                                        >
                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                            {inventoryDate ? format(inventoryDate, "PPP", { locale: es }) : <span>Seleccione una fecha</span>}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0">
                                        <Calendar
                                            mode="single"
                                            selected={inventoryDate}
                                            onSelect={setInventoryDate}
                                            initialFocus
                                            locale={es}
                                        />
                                    </PopoverContent>
                                </Popover>
                            </div>

                            <div className="flex">
                                <Button onClick={handleCalculateInventory} className="w-full" disabled={csvData.length === 0}>
                                    <Search className="mr-2 h-4 w-4" />
                                    Consultar Inventario
                                </Button>
                            </div>
                        </div>

                        {inventorySearched && (
                            <div className="mt-6">
                                <h4 className="font-semibold mb-2 text-lg">Resultado del Inventario</h4>
                                <div className="border rounded-md p-6 bg-muted/50">
                                    {inventoryResult ? (
                                        <p className="text-base">
                                            Total de paletas almacenadas para <strong>{inventoryClient}</strong> en la fecha <strong>{format(inventoryDate!, 'dd/MM/yyyy')}</strong>: <strong className="text-2xl text-primary">{inventoryResult.count}</strong>
                                        </p>
                                    ) : (
                                        <p className="text-muted-foreground">No se encontraron datos para la selección realizada. Verifique el cliente y la fecha.</p>
                                    )}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

    