
"use client";

import { useState, useMemo, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { DateRange } from 'react-day-picker';
import { format, addDays, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

import { getBillingReport, DailyReportData } from '@/app/actions/billing-report';
import { getInventoryReport, uploadInventoryCsv, type InventoryPivotReport, getClientsWithInventory } from '@/app/actions/inventory-report';
import type { ClientInfo } from '@/app/actions/clients';
import { useToast } from '@/hooks/use-toast';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { ArrowLeft, Search, XCircle, Loader2, CalendarIcon, ChevronsUpDown, BookCopy, FileDown, File, Upload, FolderSearch } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';


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

const EmptyState = ({ searched, title, description, emptyDescription }: { searched: boolean; title: string; description: string; emptyDescription: string; }) => (
    <TableRow>
        <TableCell colSpan={4} className="py-20 text-center">
            <div className="flex flex-col items-center gap-4">
                <div className="rounded-full bg-primary/10 p-4">
                    <FolderSearch className="h-12 w-12 text-primary" />
                </div>
                <h3 className="text-xl font-semibold">
                    {searched ? title : "Genere un reporte"}
                </h3>
                <p className="text-muted-foreground">
                    {searched ? emptyDescription : description}
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

const MAX_DATE_RANGE_DAYS = 31;


export default function BillingReportComponent({ clients }: { clients: ClientInfo[] }) {
    const router = useRouter();
    const { toast } = useToast();
    const uploadFormRef = useRef<HTMLFormElement>(null);
    
    // State for billing report
    const [selectedClient, setSelectedClient] = useState<string | undefined>(undefined);
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    const [reportData, setReportData] = useState<DailyReportData[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searched, setSearched] = useState(false);
    const [isClientDialogOpen, setClientDialogOpen] = useState(false);
    const [clientSearch, setClientSearch] = useState("");

    // State for CSV inventory report
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [isQuerying, setIsQuerying] = useState(false);
    const [inventoryClients, setInventoryClients] = useState<string[]>([]);
    const [inventoryDateRange, setInventoryDateRange] = useState<DateRange | undefined>(undefined);
    const [inventorySesion, setInventorySesion] = useState<string>('');
    const [inventoryReportData, setInventoryReportData] = useState<InventoryPivotReport | null>(null);
    const [inventorySearched, setInventorySearched] = useState(false);
    const [isInventoryClientDialogOpen, setInventoryClientDialogOpen] = useState(false);
    const [inventoryClientSearch, setInventoryClientSearch] = useState('');
    const [availableInventoryClients, setAvailableInventoryClients] = useState<string[]>([]);
    const [isLoadingInventoryClients, setIsLoadingInventoryClients] = useState(false);

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

    useEffect(() => {
        const fetchInventoryClients = async () => {
            if (inventoryDateRange?.from && inventoryDateRange?.to) {
                setIsLoadingInventoryClients(true);
                try {
                    const startDate = format(inventoryDateRange.from, 'yyyy-MM-dd');
                    const endDate = format(inventoryDateRange.to, 'yyyy-MM-dd');
                    const clientsWithInv = await getClientsWithInventory(startDate, endDate);
                    setAvailableInventoryClients(clientsWithInv);

                    // Clear selected clients that are not in the new list
                    setInventoryClients(prev => prev.filter(c => clientsWithInv.includes(c)));

                    if (clientsWithInv.length === 0) {
                        toast({
                            title: "No se encontraron clientes",
                            description: "No hay datos de inventario para ningún cliente en el rango de fechas seleccionado.",
                        });
                    }
                } catch (error) {
                    toast({ variant: 'destructive', title: 'Error', description: 'No se pudo cargar la lista de clientes para el inventario.' });
                } finally {
                    setIsLoadingInventoryClients(false);
                }
            } else {
                // Clear the list if the date range is incomplete
                setAvailableInventoryClients([]);
                setInventoryClients([]);
            }
        };
        fetchInventoryClients();
    }, [inventoryDateRange, toast]);

    const filteredClients = useMemo(() => {
        if (!clientSearch) return clients;
        return clients.filter(c => c.razonSocial.toLowerCase().includes(clientSearch.toLowerCase()));
    }, [clientSearch, clients]);
    
    const filteredAvailableInventoryClients = useMemo(() => {
        if (!inventoryClientSearch) return availableInventoryClients;
        return availableInventoryClients.filter(c => c.toLowerCase().includes(inventoryClientSearch.toLowerCase()));
    }, [inventoryClientSearch, availableInventoryClients]);


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

    const handleFileUploadAction = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const form = event.currentTarget;
        const formData = new FormData(form);
        const files = formData.getAll('file') as File[];
        
        if (files.length === 0 || (files.length > 0 && files[0]?.size === 0)) {
            toast({ variant: 'destructive', title: 'Error', description: 'Por favor, seleccione uno o más archivos para cargar.' });
            return;
        }
    
        setIsUploading(true);
        setUploadProgress(0);
        
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const singleFileFormData = new FormData();
            singleFileFormData.append('file', file);
    
            try {
                const result = await uploadInventoryCsv(singleFileFormData);
                if (!result.success) {
                    toast({
                        variant: 'destructive',
                        title: `Error al procesar "${file.name}"`,
                        description: result.message || 'Ocurrió un error inesperado.',
                        duration: 7000,
                    });
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : "Error inesperado en el cliente.";
                toast({
                    variant: 'destructive',
                    title: `Error crítico al procesar "${file.name}"`,
                    description: errorMessage,
                    duration: 7000,
                });
            }
            
            const newProgress = ((i + 1) / files.length) * 100
            setUploadProgress(newProgress);
        }
    
        toast({
            title: 'Proceso de Carga Completado',
            description: `Se han procesado ${files.length} archivo(s). Revise las notificaciones por si hubo errores.`,
            duration: 5000,
        });
    
        if (uploadFormRef.current) {
            uploadFormRef.current.reset();
        }
        setIsUploading(false);
    };
    
    const handleInventorySearch = async () => {
        if (!inventoryDateRange?.from || !inventoryDateRange?.to) {
            toast({ variant: 'destructive', title: 'Rango de fechas incompleto', description: 'Seleccione un rango de fechas para la consulta.' });
            return;
        }
    
        if (!inventorySesion) {
            toast({ variant: 'destructive', title: 'Sesión no seleccionada', description: 'Por favor, seleccione una sesión para la consulta.' });
            return;
        }

        if (inventoryClients.length === 0) {
            toast({ variant: 'destructive', title: 'Clientes no seleccionados', description: 'Por favor, seleccione al menos un cliente para la consulta.' });
            return;
        }
    
        setIsQuerying(true);
        setInventorySearched(true);
        setInventoryReportData(null);
    
        try {
            const results = await getInventoryReport({
                clientNames: inventoryClients,
                startDate: format(inventoryDateRange.from, 'yyyy-MM-dd'),
                endDate: format(inventoryDateRange.to, 'yyyy-MM-dd'),
                sesion: inventorySesion,
            });
            setInventoryReportData(results);
            if (results.rows.length === 0) {
                toast({ title: 'Sin Resultados', description: 'No se encontró inventario para los criterios seleccionados.' });
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Ocurrió un error inesperado.';
            toast({ variant: 'destructive', title: 'Error de Consulta', description: msg });
        } finally {
            setIsQuerying(false);
        }
    };
    
    const handleInventoryExportExcel = () => {
        if (!inventoryReportData || inventoryReportData.rows.length === 0) return;
    
        const { clientHeaders, rows } = inventoryReportData;
    
        const sessionMap: { [key: string]: string } = {
            'CO': 'Congelados',
            'RE': 'Refrigerado',
            'SE': 'Seco'
        };
        const sessionText = `Sesión: ${sessionMap[inventorySesion] || inventorySesion}`;
    
        const headers = ['Fecha', ...clientHeaders];

        const sheetData: (string | number)[][] = [
            [sessionText],
            [], // Empty row for spacing
            headers
        ];

        rows.forEach(row => {
            const rowData: (string | number)[] = [format(new Date(row.date.replace(/-/g, '/')), 'dd/MM/yyyy')];
            clientHeaders.forEach(client => {
                rowData.push(row.clientData[client] || 0);
            });
            sheetData.push(rowData);
        });
    
        const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
        // Set column widths for better legibility
        const colWidths = [
            { wch: 12 }, // Date column
            ...clientHeaders.map(header => ({ wch: Math.max(header.length, 12) })) // Client columns
        ];
        worksheet['!cols'] = colWidths;
        
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Reporte Inventario');
        
        const fileName = `Reporte_Inventario_Pivot_${inventorySesion}_${format(inventoryDateRange!.from!, 'yyyy-MM-dd')}_a_${format(inventoryDateRange!.to!, 'yyyy-MM-dd')}.xlsx`;
        XLSX.writeFile(workbook, fileName);
    };
    
    const handleInventoryExportPDF = () => {
        if (!inventoryReportData || inventoryReportData.rows.length === 0 || !logoBase64 || !logoDimensions) return;
        
        const doc = new jsPDF({ orientation: 'landscape' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 14;
        const availableWidth = pageWidth - margin * 2;

        const logoWidth = 35;
        const aspectRatio = logoDimensions.width / logoDimensions.height;
        const logoHeight = logoWidth / aspectRatio;
        const logoY = 15;
        doc.addImage(logoBase64, 'PNG', margin, logoY, logoWidth, logoHeight);
    
        const textX = margin + logoWidth + 10;
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('FRIO ALIMENTARIA SAS', textX, logoY + 8);
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text('NIT: 900736914-0', textX, logoY + 18);
        
        const contentStartY = logoY + logoHeight + 10;
        
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text(`Informe de Inventario Acumulado por Día`, pageWidth / 2, contentStartY, { align: 'center' });
        
        const infoY = contentStartY + 8;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        
        let clientText = inventoryClients.length > 0 ? `Cliente(s): ${inventoryClients.join(', ')}` : "Todos los clientes";
        const maxClientTextWidth = pageWidth / 2 - margin;
        clientText = doc.splitTextToSize(clientText, maxClientTextWidth)[0];

        const periodText = (inventoryDateRange?.from && inventoryDateRange?.to) 
            ? `Periodo: ${format(inventoryDateRange.from, 'dd/MM/yyyy')} - ${format(inventoryDateRange.to, 'dd/MM/yyyy')}`
            : '';
        
        const sessionMap: { [key: string]: string } = {
            'CO': 'Congelados',
            'RE': 'Refrigerado',
            'SE': 'Seco'
        };
        const sessionText = `Sesión: ${sessionMap[inventorySesion] || inventorySesion}`;

        doc.text(clientText, margin, infoY);
        doc.text(periodText, pageWidth - margin, infoY, { align: 'right' });
        doc.text(sessionText, margin, infoY + 12);
    
        const { clientHeaders, rows } = inventoryReportData;
        const head = [['Fecha', ...clientHeaders]];
        const body = rows.map(row => {
            const rowData: (string | number)[] = [format(new Date(row.date.replace(/-/g, '/')), 'dd/MM/yyyy')];
            clientHeaders.forEach(client => {
                rowData.push(row.clientData[client] || 0);
            });
            return rowData;
        });

        const headStyles = {
            fillColor: [33, 150, 243],
            textColor: 255,
            fontStyle: 'bold' as const,
            halign: 'center' as const,
            fontSize: 9,
        };
        
        doc.setFontSize(headStyles.fontSize);
        doc.setFont('helvetica', headStyles.fontStyle);

        const PADDING = 4;
        const dateHeaderWidth = doc.getTextWidth(head[0][0]) + PADDING * 2;
        const clientHeaderWidths = clientHeaders.map(header => doc.getTextWidth(header) + PADDING * 2);
        const totalContentWidth = dateHeaderWidth + clientHeaderWidths.reduce((a, b) => a + b, 0);

        const columnStyles: { [key: number]: { cellWidth?: number | 'auto', halign?: 'left' | 'right' } } = {
            0: { halign: 'left' }
        };

        if (totalContentWidth < availableWidth) {
            columnStyles[0].cellWidth = dateHeaderWidth;
            clientHeaderWidths.forEach((width, index) => {
                columnStyles[index + 1] = { cellWidth: width, halign: 'right' };
            });
        } else {
            const scaleFactor = availableWidth / totalContentWidth;
            columnStyles[0].cellWidth = dateHeaderWidth * scaleFactor;
            clientHeaderWidths.forEach((width, index) => {
                columnStyles[index + 1] = { cellWidth: width * scaleFactor, halign: 'right' };
            });
        }
    
        autoTable(doc, {
            startY: infoY + 14,
            head: head,
            body: body,
            theme: 'grid',
            styles: {
                fontSize: 8,
                cellPadding: 2,
                overflow: 'ellipsize',
            },
            headStyles: headStyles,
            columnStyles: columnStyles,
        });
    
        const fileName = `Reporte_Inventario_Acumulado_${inventorySesion}_${format(inventoryDateRange!.from!, 'yyyy-MM-dd')}_a_${format(inventoryDateRange!.to!, 'yyyy-MM-dd')}.pdf`;
        doc.save(fileName);
    };

    const handleInventoryClear = () => {
        setInventoryDateRange(undefined);
        setInventoryClients([]);
        setInventorySesion('');
        setInventoryReportData(null);
        setInventorySearched(false);
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
                             <p className="text-sm text-gray-500">Consulte los movimientos consolidados y el inventario diario.</p>
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
                                        <EmptyState
                                            searched={searched}
                                            title="No se encontraron movimientos"
                                            emptyDescription="No hay datos para el cliente y rango de fechas seleccionado."
                                            description="Seleccione un cliente y un rango de fechas para ver el informe."
                                        />
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
                
                <Card className="mt-8">
                    <CardHeader>
                        <CardTitle>Informe de Inventario Acumulado por Día</CardTitle>
                        <CardDescription>Cargue el archivo de inventario y luego consulte por cliente y rango de fechas.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleFileUploadAction} ref={uploadFormRef} className="mb-6 rounded-lg border p-4">
                             <Label htmlFor="csv-upload" className="font-semibold text-base">1. Cargar Archivo(s) de Inventario (.csv, .xlsx, .xls)</Label>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center mt-2">
                                <div className="sm:col-span-2">
                                    <Input
                                        id="csv-upload"
                                        name="file"
                                        type="file"
                                        accept=".csv, .xlsx, .xls"
                                        disabled={isUploading}
                                        multiple
                                        className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                                    />
                                </div>
                                <Button type="submit" disabled={isUploading} className="w-full">
                                    {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                                    Cargar
                                </Button>
                            </div>
                             {isUploading && (
                                <div className="mt-4 space-y-2">
                                    <Progress value={uploadProgress} className="w-full" />
                                    <p className="text-sm text-center text-muted-foreground">Procesando... {Math.round(uploadProgress)}%</p>
                                </div>
                            )}
                        </form>

                        <div>
                            <Label className="font-semibold text-base">Consultar inventario Acumulado por Día</Label>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end mt-2">
                                <div className="space-y-2">
                                    <Label>Rango de Fechas (Máx. 31 días)</Label>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant={"outline"}
                                                className={cn("w-full justify-start text-left font-normal", !inventoryDateRange && "text-muted-foreground")}
                                            >
                                                <CalendarIcon className="mr-2 h-4 w-4" />
                                                {inventoryDateRange?.from ? (
                                                    inventoryDateRange.to ? (
                                                        <>
                                                            {format(inventoryDateRange.from, "LLL dd, y", { locale: es })} -{" "}
                                                            {format(inventoryDateRange.to, "LLL dd, y", { locale: es })}
                                                        </>
                                                    ) : ( format(inventoryDateRange.from, "LLL dd, y", { locale: es }) )
                                                ) : ( <span>Seleccione un rango</span> )}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0">
                                            <Calendar
                                                mode="range"
                                                selected={inventoryDateRange}
                                                onSelect={(range) => {
                                                    if (range?.from && range?.to && differenceInDays(range.to, range.from) > MAX_DATE_RANGE_DAYS) {
                                                        toast({ variant: 'destructive', title: 'Rango muy amplio', description: `Por favor, seleccione un rango de no más de ${MAX_DATE_RANGE_DAYS} días.` });
                                                    } else {
                                                        setInventoryDateRange(range);
                                                    }
                                                }}
                                                defaultMonth={inventoryDateRange?.from}
                                                numberOfMonths={2}
                                                locale={es}
                                            />
                                        </PopoverContent>
                                    </Popover>
                                </div>
                                <div className="space-y-2">
                                    <Label>Cliente(s)</Label>
                                    <Dialog open={isInventoryClientDialogOpen} onOpenChange={setInventoryClientDialogOpen}>
                                        <DialogTrigger asChild>
                                            <Button
                                                variant="outline"
                                                className="w-full justify-between font-normal"
                                                disabled={!inventoryDateRange?.from || !inventoryDateRange?.to || isLoadingInventoryClients}
                                            >
                                                <span className="truncate">
                                                    {inventoryClients.length === 0
                                                        ? "Seleccione uno o más clientes"
                                                        : inventoryClients.length === 1
                                                        ? inventoryClients[0]
                                                        : `${inventoryClients.length} clientes seleccionados`}
                                                </span>
                                                {isLoadingInventoryClients ? <Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin" /> : <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />}
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent className="sm:max-w-[425px]">
                                            <DialogHeader>
                                                <DialogTitle>Seleccionar Cliente(s)</DialogTitle>
                                            </DialogHeader>
                                            <div className="p-4">
                                                <Input
                                                    placeholder="Buscar cliente..."
                                                    value={inventoryClientSearch}
                                                    onChange={(e) => setInventoryClientSearch(e.target.value)}
                                                    className="mb-4"
                                                />
                                                <ScrollArea className="h-72">
                                                    {isLoadingInventoryClients ? (
                                                        <div className="flex justify-center items-center h-full">
                                                            <Loader2 className="h-6 w-6 animate-spin" />
                                                        </div>
                                                    ) : (
                                                        <div className="space-y-1">
                                                            {filteredAvailableInventoryClients.map((clientName) => (
                                                                <div key={clientName} className="flex items-center space-x-2 rounded-md p-2 hover:bg-accent">
                                                                    <Checkbox
                                                                        id={`client-inv-${clientName}`}
                                                                        checked={inventoryClients.includes(clientName)}
                                                                        onCheckedChange={(checked) => {
                                                                            setInventoryClients(prev =>
                                                                                checked
                                                                                    ? [...prev, clientName]
                                                                                    : prev.filter(s => s !== clientName)
                                                                            )
                                                                        }}
                                                                    />
                                                                    <Label htmlFor={`client-inv-${clientName}`} className="w-full cursor-pointer">{clientName}</Label>
                                                                </div>
                                                            ))}
                                                            {filteredAvailableInventoryClients.length === 0 && (
                                                                <p className="text-center text-sm text-muted-foreground">
                                                                    {availableInventoryClients.length > 0 ? "No se encontraron clientes." : "No hay clientes con inventario en estas fechas."}
                                                                </p>
                                                            )}
                                                        </div>
                                                    )}
                                                </ScrollArea>
                                            </div>
                                            <DialogFooter>
                                                <Button onClick={() => setInventoryClientDialogOpen(false)}>Cerrar</Button>
                                            </DialogFooter>
                                        </DialogContent>
                                    </Dialog>
                                    <p className="text-xs text-muted-foreground">
                                        {!inventoryDateRange?.from || !inventoryDateRange?.to 
                                            ? "Seleccione un rango de fechas para ver y seleccionar clientes."
                                            : "Seleccione uno o más clientes. Este filtro es obligatorio."
                                        }
                                    </p>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="inventory-session">Sesión</Label>
                                    <Select
                                        value={inventorySesion}
                                        onValueChange={setInventorySesion}
                                        disabled={isQuerying}
                                    >
                                        <SelectTrigger id="inventory-session">
                                            <SelectValue placeholder="Seleccione una sesión" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="CO">CO - Congelados</SelectItem>
                                            <SelectItem value="RE">RE - Refrigerado</SelectItem>
                                            <SelectItem value="SE">SE - Seco</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <p className="text-xs text-muted-foreground">
                                        Este filtro es obligatorio.
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    <Button onClick={handleInventorySearch} className="w-full self-end" disabled={isQuerying || !inventoryDateRange?.from || !inventoryDateRange?.to || isLoadingInventoryClients || !inventorySesion || inventoryClients.length === 0}>
                                        {isQuerying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                                        Consultar
                                    </Button>
                                    <Button onClick={handleInventoryClear} variant="outline" className="w-full self-end">
                                        <XCircle className="h-4 w-4" />
                                        Limpiar
                                    </Button>
                                </div>
                            </div>
                        </div>
                        
                        {inventorySearched && (
                             <div className="mt-6">
                                <div className="flex justify-between items-center flex-wrap gap-4 mb-4">
                                    <h3 className="text-lg font-semibold">Resultados del Inventario</h3>
                                    <div className="flex gap-2">
                                        <Button 
                                            onClick={handleInventoryExportExcel} 
                                            disabled={isQuerying || !inventoryReportData || inventoryReportData.rows.length === 0} 
                                            variant="outline"
                                        >
                                            <File className="mr-2 h-4 w-4" /> Exportar a Excel
                                        </Button>
                                        <Button 
                                            onClick={handleInventoryExportPDF} 
                                            disabled={isQuerying || !inventoryReportData || inventoryReportData.rows.length === 0 || isLogoLoading} 
                                            variant="outline"
                                        >
                                            {isLogoLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
                                            Exportar a PDF
                                        </Button>
                                    </div>
                                </div>
                                <ScrollArea className="w-full whitespace-nowrap rounded-md border">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="sticky left-0 z-10 bg-background/95 backdrop-blur-sm px-2 py-2 text-left font-normal text-xs">Fecha</TableHead>
                                                {inventoryReportData?.clientHeaders.map(client => (
                                                    <TableHead key={client} className="text-right px-2 py-2 font-normal text-xs">{client}</TableHead>
                                                ))}
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {isQuerying ? (
                                                <TableRow><TableCell colSpan={(inventoryReportData?.clientHeaders.length || 1) + 1}><Skeleton className="h-20 w-full" /></TableCell></TableRow>
                                            ) : inventoryReportData && inventoryReportData.rows.length > 0 ? (
                                                inventoryReportData.rows.map((row) => (
                                                    <TableRow key={row.date}>
                                                        <TableCell className="font-medium sticky left-0 z-10 bg-background/95 backdrop-blur-sm px-2 py-2 text-xs">{format(new Date(row.date.replace(/-/g, '/')), 'dd/MM/yyyy')}</TableCell>
                                                        {inventoryReportData.clientHeaders.map(client => (
                                                            <TableCell key={client} className="text-right font-mono px-2 py-2 text-xs">{row.clientData[client] ?? 0}</TableCell>
                                                        ))}
                                                    </TableRow>
                                                ))
                                            ) : (
                                                <TableRow>
                                                    <TableCell colSpan={(inventoryReportData?.clientHeaders.length || 1) + 1} className="py-10 text-center text-muted-foreground">
                                                        No se encontraron registros de inventario para su selección.
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                    <ScrollBar orientation="horizontal" />
                                </ScrollArea>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

    

    

    