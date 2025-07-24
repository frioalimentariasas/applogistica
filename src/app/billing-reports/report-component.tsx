

"use client";

import { useState, useMemo, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { DateRange } from 'react-day-picker';
import { format, addDays, differenceInDays, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

import { getBillingReport, DailyReportData } from '@/app/actions/billing-report';
import { getDetailedReport, type DetailedReportRow } from '@/app/actions/detailed-report';
import { getInventoryReport, uploadInventoryCsv, type InventoryPivotReport, getClientsWithInventory, getInventoryIdsByDateRange, deleteSingleInventoryDoc, getDetailedInventoryForExport } from '@/app/actions/inventory-report';
import { getConsolidatedMovementReport, type ConsolidatedReportRow } from '@/app/actions/consolidated-movement-report';
import type { ClientInfo } from '@/app/actions/clients';
import { useToast } from '@/hooks/use-toast';

import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { ArrowLeft, Search, XCircle, Loader2, CalendarIcon, ChevronsUpDown, BookCopy, FileDown, File, Upload, FolderSearch, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';


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
        <TableCell colSpan={16} className="py-20 text-center">
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
        return `${totalMinutes} min`;
    }
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (minutes === 0) {
        return `${hours}h`;
    }
    return `${hours}h ${minutes}m`;
};

const formatObservaciones = (observaciones: any): string => {
    if (!observaciones || !Array.isArray(observaciones) || observaciones.length === 0) {
      return '';
    }
    return observaciones.map(obs => {
        if (obs.type === 'OTRAS OBSERVACIONES') {
            return obs.customType || 'OTRAS OBSERVACIONES';
        }
        let text = obs.type;
        if (obs.quantity > 0) {
            text += ` (Cant: ${obs.quantity})`;
        }
        return text;
    }).join(', ');
};

const MAX_DATE_RANGE_DAYS = 31;


export default function BillingReportComponent({ clients }: { clients: ClientInfo[] }) {
    const router = useRouter();
    const { toast } = useToast();
    const uploadFormRef = useRef<HTMLFormElement>(null);
    const today = new Date();
    const sixtyTwoDaysAgo = subDays(today, 62);
    
    // State for billing report
    const [selectedClient, setSelectedClient] = useState<string | undefined>(undefined);
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    const [billingSesion, setBillingSesion] = useState<string>('');
    const [billingTipoOperacion, setBillingTipoOperacion] = useState<string>('');
    const [billingTipoPedido, setBillingTipoPedido] = useState<string>('');
    const [billingPedidoSislog, setBillingPedidoSislog] = useState<string>('');
    const [reportData, setReportData] = useState<DailyReportData[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searched, setSearched] = useState(false);
    const [isClientDialogOpen, setClientDialogOpen] = useState(false);
    const [clientSearch, setClientSearch] = useState("");

    // State for detailed operation report
    const [detailedReportDateRange, setDetailedReportDateRange] = useState<DateRange | undefined>(undefined);
    const [detailedReportClient, setDetailedReportClient] = useState<string | undefined>(undefined);
    const [detailedReportOperationType, setDetailedReportOperationType] = useState<string>('');
    const [detailedReportContainer, setDetailedReportContainer] = useState<string>('');
    const [detailedReportTipoPedido, setDetailedReportTipoPedido] = useState<string[]>([]);
    const [detailedReportData, setDetailedReportData] = useState<DetailedReportRow[]>([]);
    const [isDetailedReportLoading, setIsDetailedReportLoading] = useState(false);
    const [isDetailedReportSearched, setIsDetailedReportSearched] = useState(false);
    const [isDetailedClientDialogOpen, setDetailedClientDialogOpen] = useState(false);
    const [isDetailedTipoPedidoDialogOpen, setIsDetailedTipoPedidoDialogOpen] = useState(false);
    const [detailedClientSearch, setDetailedClientSearch] = useState("");

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

    // State for consolidated report
    const [consolidatedReportData, setConsolidatedReportData] = useState<ConsolidatedReportRow[]>([]);
    const [isConsolidatedLoading, setIsConsolidatedLoading] = useState(false);
    const [consolidatedSearched, setConsolidatedSearched] = useState(false);
    const [consolidatedClient, setConsolidatedClient] = useState<string | undefined>(undefined);
    const [consolidatedDateRange, setConsolidatedDateRange] = useState<DateRange | undefined>(undefined);
    const [consolidatedSesion, setConsolidatedSesion] = useState<string>('');
    const [isConsolidatedClientDialogOpen, setConsolidatedClientDialogOpen] = useState(false);
    const [consolidatedClientSearch, setConsolidatedClientSearch] = useState("");

    // State for detailed inventory export
    const [exportClient, setExportClient] = useState<string | undefined>(undefined);
    const [exportDateRange, setExportDateRange] = useState<DateRange | undefined>(undefined);
    const [isExporting, setIsExporting] = useState(false);
    const [isExportClientDialogOpen, setExportClientDialogOpen] = useState(false);
    const [exportClientSearch, setExportClientSearch] = useState("");


    // State for deleting inventory
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
    const [dateRangeToDelete, setDateRangeToDelete] = useState<DateRange | undefined>(undefined);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteProgress, setDeleteProgress] = useState(0);

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
    
    const filteredDetailedClients = useMemo(() => {
        if (!detailedClientSearch) return clients;
        return clients.filter(c => c.razonSocial.toLowerCase().includes(detailedClientSearch.toLowerCase()));
    }, [detailedClientSearch, clients]);

    const filteredConsolidatedClients = useMemo(() => {
        if (!consolidatedClientSearch) return clients;
        return clients.filter(c => c.razonSocial.toLowerCase().includes(consolidatedClientSearch.toLowerCase()));
    }, [consolidatedClientSearch, clients]);

     const filteredExportClients = useMemo(() => {
        if (!exportClientSearch) return clients;
        return clients.filter(c => c.razonSocial.toLowerCase().includes(exportClientSearch.toLowerCase()));
    }, [exportClientSearch, clients]);
    
    const filteredAvailableInventoryClients = useMemo(() => {
        if (!inventoryClientSearch) return availableInventoryClients;
        return availableInventoryClients.filter(c => c.toLowerCase().includes(inventoryClientSearch.toLowerCase()));
    }, [inventoryClientSearch, availableInventoryClients]);


    const handleSearch = async () => {
        if (!selectedClient || !dateRange || !dateRange.from || !dateRange.to) {
            toast({
                variant: 'destructive',
                title: 'Filtros incompletos',
                description: 'Por favor, seleccione un cliente y un rango de fechas para generar el reporte.',
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
                sesion: billingSesion === 'all' ? undefined : (billingSesion as 'CO' | 'RE' | 'SE'),
                tipoOperacion: billingTipoOperacion === 'all' ? undefined : (billingTipoOperacion as 'recepcion' | 'despacho'),
                tipoPedido: billingTipoPedido === 'all' ? undefined : billingTipoPedido,
                pedidoSislog: billingPedidoSislog.trim() || undefined,
            };

            const results = await getBillingReport(criteria);
            results.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
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

        const titleY = logoY + logoHeight + 16;
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text(`Informe de Facturación`, pageWidth / 2, titleY, { align: 'center' });
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('Frio Alimentaria SAS Nit: 900736914-0', pageWidth / 2, titleY + 8, { align: 'center' });

        const clientY = titleY + 22;
        
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
        setBillingSesion('');
        setBillingTipoOperacion('');
        setBillingTipoPedido('');
        setBillingPedidoSislog('');
        setReportData([]);
        setSearched(false);
    };

    const handleDetailedReportSearch = async () => {
        if (!detailedReportDateRange?.from || !detailedReportDateRange?.to) {
            toast({ variant: 'destructive', title: 'Filtros incompletos', description: 'Por favor, seleccione un rango de fechas para generar el reporte.' });
            return;
        }

        setIsDetailedReportLoading(true);
        setIsDetailedReportSearched(true);
        setDetailedReportData([]);

        try {
            const criteria = {
                startDate: format(detailedReportDateRange.from, 'yyyy-MM-dd'),
                endDate: format(detailedReportDateRange.to, 'yyyy-MM-dd'),
                clientName: detailedReportClient,
                operationType: detailedReportOperationType === 'todos' ? undefined : detailedReportOperationType as 'recepcion' | 'despacho',
                containerNumber: detailedReportContainer,
                tipoPedido: detailedReportTipoPedido.length > 0 ? detailedReportTipoPedido : undefined,
            };

            const results = await getDetailedReport(criteria);
            results.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
            setDetailedReportData(results);
            if (results.length === 0) {
                 toast({ title: "Sin resultados", description: "No se encontraron operaciones para los filtros seleccionados." });
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Ocurrió un error desconocido.";
            toast({ variant: 'destructive', title: 'Error al generar el reporte', description: errorMessage });
        } finally {
            setIsDetailedReportLoading(false);
        }
    };
    
    const handleDetailedReportClear = () => {
        setDetailedReportDateRange(undefined);
        setDetailedReportClient(undefined);
        setDetailedReportOperationType('');
        setDetailedReportContainer('');
        setDetailedReportTipoPedido([]);
        setDetailedReportData([]);
        setIsDetailedReportSearched(false);
    };

    const handleDetailedReportExportExcel = () => {
        if (detailedReportData.length === 0) return;
        
        const totalDuration = detailedReportData.reduce((acc, row) => acc + (row.duracionMinutos || 0), 0);

        const dataToExport = detailedReportData.map(row => ({
            'Fecha': format(new Date(row.fecha), 'dd/MM/yyyy'),
            'Op. Logística': row.operacionLogistica,
            'Duración': formatDuration(row.duracionMinutos),
            'Hora Inicio': formatTime12Hour(row.horaInicio),
            'Hora Fin': formatTime12Hour(row.horaFin),
            'Placa Vehículo': row.placa,
            'No. Contenedor': row.contenedor,
            'Cliente': row.cliente,
            'Tipo Operación': row.tipoOperacion,
            'Tipo Pedido': row.tipoPedido,
            'Tipo Empaque': row.tipoEmpaqueMaquila,
            'No. Pedido (SISLOG)': row.pedidoSislog,
            'Op. Cuadrilla': row.operacionPorCuadrilla,
            'No. Operarios': row.numeroOperariosCuadrilla,
            'Total Paletas': row.totalPaletas,
            'Observaciones': formatObservaciones(row.observaciones),
        }));
        
        const footer = {
            'Fecha': 'TOTAL:',
            'Op. Logística': '',
            'Duración': formatDuration(totalDuration),
        };

        const worksheet = XLSX.utils.json_to_sheet([...dataToExport, footer]);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Reporte Detallado');
        const fileName = `Reporte_Detallado_Operacion_${format(detailedReportDateRange!.from!, 'yyyy-MM-dd')}_a_${format(detailedReportDateRange!.to!, 'yyyy-MM-dd')}.xlsx`;
        XLSX.writeFile(workbook, fileName);
    };

    const handleDetailedReportExportPDF = () => {
        if (detailedReportData.length === 0 || !logoBase64 || !logoDimensions) return;
        
        const doc = new jsPDF({ orientation: 'landscape' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const totalDuration = detailedReportData.reduce((acc, row) => acc + (row.duracionMinutos || 0), 0);

        const logoWidth = 70;
        const aspectRatio = logoDimensions.width / logoDimensions.height;
        const logoHeight = logoWidth / aspectRatio;
        const logoX = (pageWidth - logoWidth) / 2;
        doc.addImage(logoBase64, 'PNG', logoX, 15, logoWidth, logoHeight);

        const titleY = 15 + logoHeight + 8;

        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('Informe Detallado por Operación', pageWidth / 2, titleY, { align: 'center' });
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('Frio Alimentaria SAS Nit: 900736914-0', pageWidth / 2, titleY + 8, { align: 'center' });

        const head = [[
            'Fecha', 'Op. Log.', 'Duración', 'Cliente', 'Tipo Op.', 'Tipo Pedido', 'Empaque', 'No. Pedido', 'Op. Cuadrilla', 'No. Ops', 'Total Paletas', 'Observaciones'
        ]];
        
        const body = detailedReportData.map(row => [
            format(new Date(row.fecha), 'dd/MM/yy'),
            row.operacionLogistica,
            formatDuration(row.duracionMinutos),
            row.cliente,
            row.tipoOperacion,
            row.tipoPedido,
            row.tipoEmpaqueMaquila,
            row.pedidoSislog,
            row.operacionPorCuadrilla,
            row.numeroOperariosCuadrilla,
            row.totalPaletas,
            formatObservaciones(row.observaciones)
        ]);

        const foot = [
            [{ content: 'Duración Total:', colSpan: 2, styles: { halign: 'right', fontStyle: 'bold' } }, { content: formatDuration(totalDuration) }, '', '', '', '', '', '', '', '', '']
        ];


        autoTable(doc, {
            startY: titleY + 18,
            head: head,
            body: body,
            foot: foot,
            theme: 'grid',
            headStyles: { fillColor: [33, 150, 243], fontSize: 6, cellPadding: 1 },
            footStyles: { fillColor: [33, 150, 243], textColor: '#ffffff' },
            styles: { fontSize: 6, cellPadding: 1, overflow: 'linebreak' },
            columnStyles: {
                 0: { cellWidth: 18 }, // Fecha
                 1: { cellWidth: 20 }, // Op. Log.
                 2: { cellWidth: 20 }, // Duración
                 3: { cellWidth: 'auto' }, // Cliente
                 11: { cellWidth: 35 }, // Observaciones column
            }
        });

        const fileName = `Reporte_Detallado_Operacion_${format(detailedReportDateRange!.from!, 'yyyy-MM-dd')}_a_${format(detailedReportDateRange!.to!, 'yyyy-MM-dd')}.pdf`;
        doc.save(fileName);
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
                sesion: inventorySesion === 'TODAS' ? undefined : inventorySesion,
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
            'SE': 'Seco',
            'TODAS': 'Todas'
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
            { wch: 15 }, // Date column
            ...clientHeaders.map(header => ({ wch: Math.max(header.length, 18) })) // Client columns
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

        // --- HEADER ---
        const logoWidth = 70;
        const aspectRatio = logoDimensions.width / logoDimensions.height;
        const logoHeight = logoWidth / aspectRatio;
        const logoX = (pageWidth - logoWidth) / 2;
        const headerY = 15;
        doc.addImage(logoBase64, 'PNG', logoX, headerY, logoWidth, logoHeight);

        const titleY = headerY + logoHeight + 8;
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text(`Informe de Inventario Acumulado por Día`, pageWidth / 2, titleY, { align: 'center' });

        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('Frio Alimentaria SAS Nit: 900736914-0', pageWidth / 2, titleY + 8, { align: 'center' });

        // --- SUB-HEADER ---
        const contentStartY = titleY + 22;
        const currentFontSize = 10;
        doc.setFontSize(currentFontSize);
        doc.setFont('helvetica', 'normal');
        
        const clientText = `Cliente(s): ${inventoryClients.join(', ')}`;
        const periodText = (inventoryDateRange?.from && inventoryDateRange?.to) 
            ? `Periodo: ${format(inventoryDateRange.from, 'dd/MM/yyyy')} - ${format(inventoryDateRange.to, 'dd/MM/yyyy')}`
            : '';
        const sessionMap: { [key: string]: string } = {
            'CO': 'Congelados', 'RE': 'Refrigerado', 'SE': 'Seco', 'TODAS': 'Todas'
        };
        const sessionText = `Sesión: ${sessionMap[inventorySesion] || inventorySesion}`;
        
        doc.text(periodText, pageWidth - margin, contentStartY, { align: 'right' });
        
        const clientTextLines = doc.splitTextToSize(clientText, pageWidth * 0.6);
        doc.text(clientTextLines, margin, contentStartY);
        
        const lineHeight = doc.getLineHeight() / doc.getFont().scaleFactor;
        const clientTextBlockHeight = clientTextLines.length * lineHeight;
        
        const sessionY = contentStartY + clientTextBlockHeight;
        doc.text(sessionText, margin, sessionY);

        const tableStartY = sessionY + lineHeight + 4;
    
        const { clientHeaders, rows } = inventoryReportData;
        const head = [['Fecha', ...clientHeaders]];
        const body = rows.map(row => {
            const rowData: (string | number)[] = [format(new Date(row.date.replace(/-/g, '/')), 'dd/MM/yyyy')];
            clientHeaders.forEach(client => {
                rowData.push(row.clientData[client] || 0);
            });
            return rowData;
        });

        autoTable(doc, {
            startY: tableStartY,
            head: head,
            body: body,
            theme: 'grid',
            styles: {
                fontSize: 9,
                cellPadding: 2,
                overflow: 'linebreak',
            },
            headStyles: {
                fillColor: [33, 150, 243],
                textColor: 255,
                fontStyle: 'bold',
                fontSize: 9,
                halign: 'center',
                cellPadding: 2,
            },
            tableWidth: 'auto', 
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

    const handleConfirmDelete = async () => {
        if (!dateRangeToDelete?.from || !dateRangeToDelete?.to) {
            toast({ variant: 'destructive', title: 'Error', description: 'Rango de fechas para eliminar no es válido.' });
            return;
        }

        setIsDeleting(true);
        setDeleteProgress(0);

        try {
            const startDate = format(dateRangeToDelete.from, 'yyyy-MM-dd');
            const endDate = format(dateRangeToDelete.to, 'yyyy-MM-dd');

            const idResult = await getInventoryIdsByDateRange(startDate, endDate);

            if (!idResult.success || !idResult.ids || idResult.ids.length === 0) {
                toast({
                    variant: 'destructive',
                    title: 'Sin registros',
                    description: idResult.message || 'No se encontraron registros de inventario para eliminar en el rango seleccionado.',
                });
                setIsDeleting(false);
                setIsDeleteConfirmOpen(false);
                return;
            }

            const idsToDelete = idResult.ids;
            const totalCount = idsToDelete.length;
            let deletedCount = 0;
            let errorCount = 0;

            for (let i = 0; i < totalCount; i++) {
                const id = idsToDelete[i];
                const deleteResult = await deleteSingleInventoryDoc(id);
                if (deleteResult.success) {
                    deletedCount++;
                } else {
                    errorCount++;
                    console.error(`No se pudo eliminar el documento ${id}: ${deleteResult.message}`);
                }
                setDeleteProgress(((i + 1) / totalCount) * 100);
            }
            
            if (errorCount > 0) {
                 toast({
                    variant: "destructive",
                    title: 'Proceso completado con errores',
                    description: `Se eliminaron ${deletedCount} de ${totalCount} registro(s). ${errorCount} no pudieron ser eliminados.`,
                });
            } else {
                 toast({
                    title: 'Proceso completado',
                    description: `Se eliminaron ${deletedCount} de ${totalCount} registro(s) de inventario.`,
                });
            }
            
            handleInventoryClear(); // Refresh the view

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Ocurrió un error desconocido.";
            toast({ variant: 'destructive', title: 'Error al eliminar', description: errorMessage });
        } finally {
            setIsDeleting(false);
            setIsDeleteConfirmOpen(false);
            setDateRangeToDelete(undefined);
            setTimeout(() => setDeleteProgress(0), 1000);
        }
    };

    const handleConsolidatedSearch = async () => {
        if (!consolidatedClient || !consolidatedDateRange?.from || !consolidatedDateRange?.to || !consolidatedSesion) {
            toast({ variant: 'destructive', title: 'Filtros incompletos', description: 'Por favor, seleccione cliente, rango de fechas y sesión para generar el reporte.' });
            return;
        }

        setIsConsolidatedLoading(true);
        setConsolidatedSearched(true);
        setConsolidatedReportData([]);

        try {
            const criteria = {
                clientName: consolidatedClient,
                startDate: format(consolidatedDateRange.from, 'yyyy-MM-dd'),
                endDate: format(consolidatedDateRange.to, 'yyyy-MM-dd'),
                sesion: consolidatedSesion,
            };
            const results = await getConsolidatedMovementReport(criteria);
            setConsolidatedReportData(results);
            if (results.length === 0) {
                toast({ title: 'Sin resultados', description: 'No se encontraron movimientos o inventario para los filtros seleccionados.' });
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Ocurrió un error desconocido.";
            toast({ variant: 'destructive', title: 'Error al generar el reporte consolidado', description: errorMessage });
        } finally {
            setIsConsolidatedLoading(false);
        }
    };
    
    const handleConsolidatedClear = () => {
        setConsolidatedClient(undefined);
        setConsolidatedDateRange(undefined);
        setConsolidatedSesion('');
        setConsolidatedReportData([]);
        setConsolidatedSearched(false);
    };

    const handleConsolidatedExportExcel = () => {
        if (!consolidatedClient || consolidatedReportData.length === 0) return;

        const dataToExport = consolidatedReportData.map(row => ({
            'Fecha': format(new Date(row.date.replace(/-/g, '/')), 'dd/MM/yyyy'),
            'Cliente': consolidatedClient,
            'Paletas Recibidas': row.paletasRecibidas,
            'Paletas Despachadas': row.paletasDespachadas,
            'Inventario Final Día': row.inventarioFinalDia,
        }));

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Reporte Consolidado');
        const fileName = `Reporte_Consolidado_${consolidatedClient.replace(/\s/g, '_')}_${format(consolidatedDateRange!.from!, 'yyyy-MM-dd')}_a_${format(consolidatedDateRange!.to!, 'yyyy-MM-dd')}.xlsx`;
        XLSX.writeFile(workbook, fileName);
    };

    const handleConsolidatedExportPDF = () => {
        if (!consolidatedClient || consolidatedReportData.length === 0 || !logoBase64 || !logoDimensions) return;
        
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        
        const logoWidth = 70;
        const aspectRatio = logoDimensions.width / logoDimensions.height;
        const logoHeight = logoWidth / aspectRatio;
        
        const logoX = (pageWidth - logoWidth) / 2;
        const logoY = 15;
        doc.addImage(logoBase64, 'PNG', logoX, logoY, logoWidth, logoHeight);

        const titleY = logoY + logoHeight + 16;
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text(`Informe Consolidado de Movimientos e Inventario`, pageWidth / 2, titleY, { align: 'center' });
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('Frio Alimentaria SAS Nit: 900736914-0', pageWidth / 2, titleY + 8, { align: 'center' });

        const clientY = titleY + 22;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Cliente: ${consolidatedClient}`, 14, clientY);
        doc.text(`Periodo: ${format(consolidatedDateRange!.from!, 'dd/MM/yyyy')} - ${format(consolidatedDateRange!.to!, 'dd/MM/yyyy')}`, pageWidth - 14, clientY, { align: 'right' });

        autoTable(doc, {
            startY: clientY + 10,
            head: [['Fecha', 'Paletas Recibidas', 'Paletas Despachadas', 'Inventario Final']],
            body: consolidatedReportData.map(row => [
                format(new Date(row.date.replace(/-/g, '/')), 'dd/MM/yyyy'),
                row.paletasRecibidas,
                row.paletasDespachadas,
                row.inventarioFinalDia
            ]),
            headStyles: { fillColor: [33, 150, 243] },
        });

        const fileName = `Reporte_Consolidado_${consolidatedClient.replace(/\s/g, '_')}_${format(consolidatedDateRange!.from!, 'yyyy-MM-dd')}_a_${format(consolidatedDateRange!.to!, 'yyyy-MM-dd')}.pdf`;
        doc.save(fileName);
    };

    const handleDetailedInventoryExport = async () => {
        if (!exportClient || !exportDateRange?.from || !exportDateRange?.to) {
            toast({
                variant: 'destructive',
                title: 'Filtros incompletos',
                description: 'Por favor, seleccione un cliente y un rango de fechas para exportar.',
            });
            return;
        }

        setIsExporting(true);
        try {
            const results = await getDetailedInventoryForExport({
                clientName: exportClient,
                startDate: format(exportDateRange.from, 'yyyy-MM-dd'),
                endDate: format(exportDateRange.to, 'yyyy-MM-dd'),
            });
            
            if (results.length === 0) {
                toast({ title: 'Sin resultados', description: 'No se encontraron datos de inventario para exportar con los filtros seleccionados.' });
                return;
            }

            const worksheet = XLSX.utils.json_to_sheet(results);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, `Inventario ${exportClient}`);

            const fileName = `Inventario_Detallado_${exportClient.replace(/\s/g, '_')}_${format(exportDateRange.from, 'yyyy-MM-dd')}_a_${format(exportDateRange.to, 'yyyy-MM-dd')}.xlsx`;
            XLSX.writeFile(workbook, fileName);

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Ocurrió un error desconocido.";
            toast({ variant: 'destructive', title: 'Error al exportar', description: errorMessage });
        } finally {
            setIsExporting(false);
        }
    };

    const tipoPedidoOptions = [
        { value: 'GENERICO', label: 'GENERICO' },
        { value: 'MAQUILA', label: 'MAQUILA' },
        { value: 'TUNEL', label: 'TUNEL' },
        { value: 'INGRESO DE SALDO', label: 'INGRESO DE SALDO' }
    ];

    const getTipoPedidoButtonText = () => {
        if (detailedReportTipoPedido.length === 0) return "Seleccionar tipo(s)...";
        if (detailedReportTipoPedido.length === 1) return detailedReportTipoPedido[0];
        return `${detailedReportTipoPedido.length} tipos seleccionados`;
    };

    return (
        <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
            <div className="max-w-screen-2xl mx-auto">
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
                                <h1 className="text-2xl font-bold text-primary">Reportes Facturación</h1>
                            </div>
                             <p className="text-sm text-gray-500">Seleccione un tipo de informe y utilice los filtros para generar los datos.</p>
                        </div>
                    </div>
                </header>

                <Tabs defaultValue="daily-movements" className="w-full">
                    <TabsList className="grid w-full grid-cols-4 mb-6">
                        <TabsTrigger value="daily-movements">Movimientos Diarios</TabsTrigger>
                        <TabsTrigger value="detailed-operation">Operaciones Detalladas</TabsTrigger>
                        <TabsTrigger value="inventory">Inventario por Día</TabsTrigger>
                        <TabsTrigger value="consolidated-report">Consolidado Movimientos/Inventario</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="daily-movements" className="space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>Filtros del Reporte Movimientos Diarios de Paletas</CardTitle>
                                <CardDescription>Seleccione un cliente y un rango de fechas para generar el informe.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
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
                                                    <DialogDescription>Busque y seleccione un cliente para generar el informe.</DialogDescription>
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
                                                    disabled={{ after: today, before: sixtyTwoDaysAgo }}
                                                />
                                            </PopoverContent>
                                        </Popover>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Sesión</Label>
                                        <Select value={billingSesion} onValueChange={setBillingSesion}>
                                            <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">Todas</SelectItem>
                                                <SelectItem value="CO">CO - Congelados</SelectItem>
                                                <SelectItem value="RE">RE - Refrigerado</SelectItem>
                                                <SelectItem value="SE">SE - Seco</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Tipo de Operación</Label>
                                        <Select value={billingTipoOperacion} onValueChange={setBillingTipoOperacion}>
                                            <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">Todos</SelectItem>
                                                <SelectItem value="recepcion">Recepción</SelectItem>
                                                <SelectItem value="despacho">Despacho</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Tipo de Pedido</Label>
                                        <Select value={billingTipoPedido} onValueChange={setBillingTipoPedido}>
                                            <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">Todos</SelectItem>
                                                <SelectItem value="GENERICO">GENERICO</SelectItem>
                                                <SelectItem value="MAQUILA">MAQUILA</SelectItem>
                                                <SelectItem value="TUNEL">TUNEL</SelectItem>
                                                <SelectItem value="INGRESO DE SALDO">INGRESO DE SALDO</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Pedido SISLOG</Label>
                                        <Input placeholder="Opcional" value={billingPedidoSislog} onChange={(e) => setBillingPedidoSislog(e.target.value)} />
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

                        <Card>
                            <CardHeader>
                                <div className="flex justify-between items-center flex-wrap gap-4">
                                    <div>
                                        <CardTitle>Resultados del Informe Movimientos Diarios de Paletas</CardTitle>
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
                    </TabsContent>

                    <TabsContent value="detailed-operation">
                        <Card>
                            <CardHeader>
                                <CardTitle>Informe Detallado por Operación</CardTitle>
                                <CardDescription>Filtre para ver un listado detallado de las operaciones registradas.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 items-end mb-6">
                                    <div className="space-y-2">
                                        <Label>Rango de Fechas</Label>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !detailedReportDateRange && "text-muted-foreground")}>
                                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                                    {detailedReportDateRange?.from ? (detailedReportDateRange.to ? (<>{format(detailedReportDateRange.from, "LLL dd, y", { locale: es })} - {format(detailedReportDateRange.to, "LLL dd, y", { locale: es })}</>) : (format(detailedReportDateRange.from, "LLL dd, y", { locale: es }))) : (<span>Seleccione un rango</span>)}
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0" align="start">
                                                <Calendar initialFocus mode="range" defaultMonth={detailedReportDateRange?.from} selected={detailedReportDateRange} onSelect={setDetailedReportDateRange} numberOfMonths={2} locale={es} disabled={{ after: today, before: sixtyTwoDaysAgo }} />
                                            </PopoverContent>
                                        </Popover>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Cliente (Opcional)</Label>
                                        <Dialog open={isDetailedClientDialogOpen} onOpenChange={setDetailedClientDialogOpen}>
                                            <DialogTrigger asChild>
                                                <Button variant="outline" className="w-full justify-between text-left font-normal">
                                                    {detailedReportClient || "Seleccione un cliente"}
                                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                </Button>
                                            </DialogTrigger>
                                            <DialogContent className="sm:max-w-[425px]">
                                                <DialogHeader><DialogTitle>Seleccionar Cliente</DialogTitle></DialogHeader>
                                                <div className="p-4">
                                                    <Input placeholder="Buscar cliente..." value={detailedClientSearch} onChange={(e) => setDetailedClientSearch(e.target.value)} className="mb-4" />
                                                    <ScrollArea className="h-72"><div className="space-y-1">
                                                        <Button variant="ghost" className="w-full justify-start" onClick={() => { setDetailedReportClient(undefined); setDetailedClientDialogOpen(false); setDetailedClientSearch(''); }}>-- Todos los clientes --</Button>
                                                        {filteredDetailedClients.map((client) => (
                                                            <Button key={client.id} variant="ghost" className="w-full justify-start" onClick={() => { setDetailedReportClient(client.razonSocial); setDetailedClientDialogOpen(false); setDetailedClientSearch(''); }}>{client.razonSocial}</Button>
                                                        ))}
                                                    </div></ScrollArea>
                                                </div>
                                            </DialogContent>
                                        </Dialog>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Tipo de Operación</Label>
                                        <Select value={detailedReportOperationType} onValueChange={setDetailedReportOperationType}>
                                            <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="todos">Todos</SelectItem>
                                                <SelectItem value="recepcion">Recepción</SelectItem>
                                                <SelectItem value="despacho">Despacho</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Tipo de Pedido</Label>
                                        <Dialog open={isDetailedTipoPedidoDialogOpen} onOpenChange={setIsDetailedTipoPedidoDialogOpen}>
                                            <DialogTrigger asChild>
                                                <Button variant="outline" className="w-full justify-between text-left font-normal">
                                                    <span className="truncate">{getTipoPedidoButtonText()}</span>
                                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                </Button>
                                            </DialogTrigger>
                                            <DialogContent>
                                                <DialogHeader>
                                                    <DialogTitle>Seleccionar Tipo(s) de Pedido</DialogTitle>
                                                </DialogHeader>
                                                <div className="space-y-2 py-4">
                                                {tipoPedidoOptions.map((option) => (
                                                    <div key={option.value} className="flex items-center space-x-2">
                                                    <Checkbox
                                                        id={`tipo-pedido-${option.value}`}
                                                        checked={detailedReportTipoPedido.includes(option.value)}
                                                        onCheckedChange={(checked) => {
                                                        setDetailedReportTipoPedido((prev) =>
                                                            checked
                                                            ? [...prev, option.value]
                                                            : prev.filter((value) => value !== option.value)
                                                        );
                                                        }}
                                                    />
                                                    <Label htmlFor={`tipo-pedido-${option.value}`} className="font-normal cursor-pointer">
                                                        {option.label}
                                                    </Label>
                                                    </div>
                                                ))}
                                                </div>
                                                <DialogFooter>
                                                    <Button onClick={() => setIsDetailedTipoPedidoDialogOpen(false)}>Cerrar</Button>
                                                </DialogFooter>
                                            </DialogContent>
                                        </Dialog>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>No. Contenedor (Opcional)</Label>
                                        <Input placeholder="Buscar por contenedor" value={detailedReportContainer} onChange={(e) => setDetailedReportContainer(e.target.value)} />
                                    </div>
                                    <div className="flex gap-2">
                                        <Button onClick={handleDetailedReportSearch} className="w-full" disabled={isDetailedReportLoading}>
                                            {isDetailedReportLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                                            Buscar
                                        </Button>
                                        <Button onClick={handleDetailedReportClear} variant="outline" className="w-full">
                                            <XCircle className="mr-2 h-4 w-4" />
                                            Limpiar
                                        </Button>
                                    </div>
                                </div>
                                
                                <div className="flex justify-end gap-2 my-4">
                                    <Button onClick={handleDetailedReportExportExcel} disabled={isDetailedReportLoading || detailedReportData.length === 0} variant="outline">
                                        <File className="mr-2 h-4 w-4" /> Exportar a Excel
                                    </Button>
                                    <Button onClick={handleDetailedReportExportPDF} disabled={isDetailedReportLoading || detailedReportData.length === 0 || isLogoLoading} variant="outline">
                                        {isLogoLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
                                        Exportar a PDF
                                    </Button>
                                </div>

                                <ScrollArea className="w-full whitespace-nowrap rounded-md border h-[60vh] relative">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="sticky left-0 z-20 bg-background/95 backdrop-blur-sm top-0">Fecha</TableHead>
                                                <TableHead className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm">Op. Logística</TableHead>
                                                <TableHead className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm">Duración</TableHead>
                                                <TableHead className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm">Hora Inicio</TableHead>
                                                <TableHead className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm">Hora Fin</TableHead>
                                                <TableHead className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm">Placa Vehículo</TableHead>
                                                <TableHead className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm">No. Contenedor</TableHead>
                                                <TableHead className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm">Cliente</TableHead>
                                                <TableHead className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm">Tipo Operación</TableHead>
                                                <TableHead className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm">Tipo Pedido</TableHead>
                                                <TableHead className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm">Tipo Empaque</TableHead>
                                                <TableHead className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm">No. Pedido (SISLOG)</TableHead>
                                                <TableHead className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm">Op. Cuadrilla</TableHead>
                                                <TableHead className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm">No. Operarios</TableHead>
                                                <TableHead className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm">Total Paletas</TableHead>
                                                <TableHead className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm">Observaciones</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {isDetailedReportLoading ? (
                                                <TableRow><TableCell colSpan={16}><Skeleton className="h-20 w-full" /></TableCell></TableRow>
                                            ) : detailedReportData.length > 0 ? (
                                                detailedReportData.map((row) => (
                                                    <TableRow key={row.id}>
                                                        <TableCell className="sticky left-0 z-10 bg-background/95 backdrop-blur-sm">{format(new Date(row.fecha), 'dd/MM/yyyy')}</TableCell>
                                                        <TableCell>{row.operacionLogistica}</TableCell>
                                                        <TableCell>{formatDuration(row.duracionMinutos)}</TableCell>
                                                        <TableCell>{formatTime12Hour(row.horaInicio)}</TableCell>
                                                        <TableCell>{formatTime12Hour(row.horaFin)}</TableCell>
                                                        <TableCell>{row.placa}</TableCell>
                                                        <TableCell>{row.contenedor}</TableCell>
                                                        <TableCell>{row.cliente}</TableCell>
                                                        <TableCell>{row.tipoOperacion}</TableCell>
                                                        <TableCell>{row.tipoPedido}</TableCell>
                                                        <TableCell>{row.tipoEmpaqueMaquila}</TableCell>
                                                        <TableCell>{row.pedidoSislog}</TableCell>
                                                        <TableCell>{row.operacionPorCuadrilla}</TableCell>
                                                        <TableCell>{row.numeroOperariosCuadrilla}</TableCell>
                                                        <TableCell>{row.totalPaletas}</TableCell>
                                                        <TableCell className="max-w-[200px] truncate" title={formatObservaciones(row.observaciones)}>{formatObservaciones(row.observaciones)}</TableCell>
                                                    </TableRow>
                                                ))
                                            ) : (
                                                <EmptyState
                                                    searched={isDetailedReportSearched}
                                                    title="No se encontraron operaciones"
                                                    emptyDescription="No hay datos para los filtros seleccionados."
                                                    description="Seleccione los filtros para ver el informe."
                                                />
                                            )}
                                        </TableBody>
                                    </Table>
                                    <ScrollBar orientation="horizontal" />
                                </ScrollArea>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="inventory">
                        <Card>
                            <CardHeader>
                                <CardTitle>Informe de Inventario Acumulado por Día</CardTitle>
                                <CardDescription>Cargue, elimine o consulte el inventario diario.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="mb-6 rounded-lg border p-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                                        <form onSubmit={handleFileUploadAction} ref={uploadFormRef} className="space-y-2 flex flex-col">
                                            <Label htmlFor="csv-upload" className="font-semibold text-base">Cargar Inventario</Label>
                                            <p className="text-sm text-muted-foreground flex-grow">Suba los archivos de inventario (.csv, .xlsx, .xls).</p>
                                            <div className="flex items-center gap-2 pt-2">
                                                <Input
                                                    id="csv-upload"
                                                    name="file"
                                                    type="file"
                                                    accept=".csv, .xlsx, .xls"
                                                    disabled={isUploading}
                                                    multiple
                                                    className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                                                />
                                                <Button type="submit" disabled={isUploading}>
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
                                        <div className="space-y-2 flex flex-col border-t pt-6 md:border-t-0 md:border-l md:pt-0 md:pl-8">
                                            <Label className="font-semibold text-base text-destructive">Eliminar Inventario</Label>
                                            <p className="text-sm text-muted-foreground flex-grow">Esta acción es permanente. Seleccione un rango para eliminar los registros.</p>
                                            <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                                                <DialogTrigger asChild>
                                                    <Button variant="destructive" className="w-full mt-2">
                                                        <Trash2 className="mr-2 h-4 w-4" />
                                                        Eliminar Registros por Rango
                                                    </Button>
                                                </DialogTrigger>
                                                <DialogContent>
                                                    <DialogHeader>
                                                        <DialogTitle>Seleccione el rango de fechas a eliminar</DialogTitle>
                                                        <DialogDescription>
                                                            Todos los registros de inventario dentro de este rango (incluyendo las fechas de inicio y fin) serán eliminados.
                                                        </DialogDescription>
                                                    </DialogHeader>
                                                    <div className="flex justify-center py-4">
                                                        <Calendar
                                                            mode="range"
                                                            selected={dateRangeToDelete}
                                                            onSelect={setDateRangeToDelete}
                                                            locale={es}
                                                            disabled={{ after: today, before: sixtyTwoDaysAgo }}
                                                        />
                                                    </div>
                                                    <DialogFooter>
                                                        <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>Cancelar</Button>
                                                        <Button 
                                                            variant="destructive" 
                                                            disabled={!dateRangeToDelete?.from || !dateRangeToDelete?.to}
                                                            onClick={() => {
                                                                setIsDeleteDialogOpen(false);
                                                                setIsDeleteConfirmOpen(true);
                                                            }}
                                                        >
                                                            Proceder a Eliminar
                                                        </Button>
                                                    </DialogFooter>
                                                </DialogContent>
                                            </Dialog>
                                        </div>
                                    </div>
                                </div>

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
                                                        disabled={{ after: today, before: sixtyTwoDaysAgo }}
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
                                                        <DialogDescription>Seleccione los clientes para incluir en el reporte de inventario.</DialogDescription>
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
                                                                    <div className="flex items-center space-x-2 rounded-md p-2 hover:bg-accent border-b">
                                                                        <Checkbox
                                                                            id="select-all-inv-clients"
                                                                            checked={availableInventoryClients.length > 0 && inventoryClients.length === availableInventoryClients.length}
                                                                            onCheckedChange={(checked) => {
                                                                                if (checked) {
                                                                                    setInventoryClients(availableInventoryClients);
                                                                                } else {
                                                                                    setInventoryClients([]);
                                                                                }
                                                                            }}
                                                                        />
                                                                        <Label htmlFor="select-all-inv-clients" className="w-full cursor-pointer font-semibold">Seleccionar Todos</Label>
                                                                    </div>
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
                                                    <SelectItem value="TODAS">TODAS - Todas las sesiones</SelectItem>
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
                                                        <TableHead className="sticky left-0 z-10 bg-background/95 backdrop-blur-sm px-2 py-2 text-left font-medium text-xs">Fecha</TableHead>
                                                        {inventoryReportData?.clientHeaders.map(client => (
                                                            <TableHead key={client} className="text-right px-2 py-2 font-medium text-xs">{client}</TableHead>
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
                    </TabsContent>

                    <TabsContent value="consolidated-report" className="space-y-6">
                        <Card>
                             <CardHeader>
                                <CardTitle>Filtros del Reporte Consolidado</CardTitle>
                                <CardDescription>Seleccione cliente, rango de fechas y sesión para ver el informe consolidado.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end mb-6">
                                    <div className="space-y-2">
                                        <Label>Cliente</Label>
                                         <Dialog open={isConsolidatedClientDialogOpen} onOpenChange={setConsolidatedClientDialogOpen}>
                                            <DialogTrigger asChild>
                                                <Button variant="outline" className="w-full justify-between text-left font-normal">
                                                    {consolidatedClient || "Seleccione un cliente"}
                                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                </Button>
                                            </DialogTrigger>
                                            <DialogContent className="sm:max-w-[425px]">
                                                <DialogHeader><DialogTitle>Seleccionar Cliente</DialogTitle></DialogHeader>
                                                <div className="p-4">
                                                    <Input placeholder="Buscar cliente..." value={consolidatedClientSearch} onChange={(e) => setConsolidatedClientSearch(e.target.value)} className="mb-4" />
                                                    <ScrollArea className="h-72"><div className="space-y-1">
                                                        {filteredConsolidatedClients.map((client) => (
                                                            <Button key={client.id} variant="ghost" className="w-full justify-start" onClick={() => { setConsolidatedClient(client.razonSocial); setConsolidatedClientDialogOpen(false); setConsolidatedClientSearch(''); }}>{client.razonSocial}</Button>
                                                        ))}
                                                    </div></ScrollArea>
                                                </div>
                                            </DialogContent>
                                        </Dialog>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Rango de Fechas</Label>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !consolidatedDateRange && "text-muted-foreground")}>
                                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                                    {consolidatedDateRange?.from ? (consolidatedDateRange.to ? (<>{format(consolidatedDateRange.from, "LLL dd, y", { locale: es })} - {format(consolidatedDateRange.to, "LLL dd, y", { locale: es })}</>) : (format(consolidatedDateRange.from, "LLL dd, y", { locale: es }))) : (<span>Seleccione un rango</span>)}
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0" align="start">
                                                <Calendar initialFocus mode="range" defaultMonth={consolidatedDateRange?.from} selected={consolidatedDateRange} onSelect={setConsolidatedDateRange} numberOfMonths={2} locale={es} disabled={{ after: today, before: sixtyTwoDaysAgo }} />
                                            </PopoverContent>
                                        </Popover>
                                    </div>
                                     <div className="space-y-2">
                                        <Label>Sesión</Label>
                                        <Select value={consolidatedSesion} onValueChange={setConsolidatedSesion}>
                                            <SelectTrigger><SelectValue placeholder="Seleccione una sesión" /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="CO">CO - Congelados</SelectItem>
                                                <SelectItem value="RE">RE - Refrigerado</SelectItem>
                                                <SelectItem value="SE">SE - Seco</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button onClick={handleConsolidatedSearch} className="w-full" disabled={isConsolidatedLoading}>
                                            {isConsolidatedLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                                            Buscar
                                        </Button>
                                        <Button onClick={handleConsolidatedClear} variant="outline" className="w-full">
                                            <XCircle className="mr-2 h-4 w-4" />
                                            Limpiar
                                        </Button>
                                    </div>
                                </div>
                                
                                <div className="flex justify-between items-center flex-wrap gap-4 my-4">
                                    <div>
                                        <h3 className="text-lg font-semibold">Resultados del Informe Consolidado</h3>
                                        <p className="text-sm text-muted-foreground">{isConsolidatedLoading ? "Cargando resultados..." : `Mostrando ${consolidatedReportData.length} días.`}</p>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button onClick={handleConsolidatedExportExcel} disabled={isConsolidatedLoading || consolidatedReportData.length === 0} variant="outline">
                                            <File className="mr-2 h-4 w-4" /> Exportar a Excel
                                        </Button>
                                        <Button onClick={handleConsolidatedExportPDF} disabled={isConsolidatedLoading || consolidatedReportData.length === 0 || isLogoLoading} variant="outline">
                                            {isLogoLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
                                            Exportar a PDF
                                        </Button>
                                    </div>
                                </div>

                                <div className="rounded-md border">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Fecha</TableHead>
                                                <TableHead className="text-right">Paletas Recibidas</TableHead>
                                                <TableHead className="text-right">Paletas Despachadas</TableHead>
                                                <TableHead className="text-right">Inventario Final</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {isConsolidatedLoading ? (
                                                <ResultsSkeleton />
                                            ) : consolidatedReportData.length > 0 ? (
                                                consolidatedReportData.map((row) => (
                                                    <TableRow key={row.date}>
                                                        <TableCell className="font-medium">{format(new Date(row.date.replace(/-/g, '/')), 'dd/MM/yyyy')}</TableCell>
                                                        <TableCell className="text-right">{row.paletasRecibidas}</TableCell>
                                                        <TableCell className="text-right">{row.paletasDespachadas}</TableCell>
                                                        <TableCell className="text-right">{row.inventarioFinalDia}</TableCell>
                                                    </TableRow>
                                                ))
                                            ) : (
                                                <EmptyState
                                                    searched={consolidatedSearched}
                                                    title="No se encontraron datos"
                                                    emptyDescription="No hay datos para el cliente y los filtros seleccionados."
                                                    description="Seleccione los filtros para ver el informe."
                                                />
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader>
                                <CardTitle>Exportar Inventario Detallado a Excel</CardTitle>
                                <CardDescription>Genere un archivo Excel con el detalle completo del inventario para un cliente y rango de fechas específico.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                                    <div className="space-y-2">
                                        <Label>Cliente</Label>
                                         <Dialog open={isExportClientDialogOpen} onOpenChange={setExportClientDialogOpen}>
                                            <DialogTrigger asChild>
                                                <Button variant="outline" className="w-full justify-between text-left font-normal">
                                                    {exportClient || "Seleccione un cliente"}
                                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                </Button>
                                            </DialogTrigger>
                                            <DialogContent className="sm:max-w-[425px]">
                                                <DialogHeader><DialogTitle>Seleccionar Cliente</DialogTitle></DialogHeader>
                                                <div className="p-4">
                                                    <Input placeholder="Buscar cliente..." value={exportClientSearch} onChange={(e) => setExportClientSearch(e.target.value)} className="mb-4" />
                                                    <ScrollArea className="h-72"><div className="space-y-1">
                                                        {filteredExportClients.map((client) => (
                                                            <Button key={client.id} variant="ghost" className="w-full justify-start" onClick={() => { setExportClient(client.razonSocial); setExportClientDialogOpen(false); setExportClientSearch(''); }}>{client.razonSocial}</Button>
                                                        ))}
                                                    </div></ScrollArea>
                                                </div>
                                            </DialogContent>
                                        </Dialog>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Rango de Fechas</Label>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !exportDateRange && "text-muted-foreground")}>
                                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                                    {exportDateRange?.from ? (exportDateRange.to ? (<>{format(exportDateRange.from, "LLL dd, y", { locale: es })} - {format(exportDateRange.to, "LLL dd, y", { locale: es })}</>) : (format(exportDateRange.from, "LLL dd, y", { locale: es }))) : (<span>Seleccione un rango</span>)}
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0" align="start">
                                                <Calendar initialFocus mode="range" defaultMonth={exportDateRange?.from} selected={exportDateRange} onSelect={setExportDateRange} numberOfMonths={2} locale={es} disabled={{ after: today, before: sixtyTwoDaysAgo }} />
                                            </PopoverContent>
                                        </Popover>
                                    </div>
                                    <div className="lg:col-span-2 flex items-end">
                                        <Button onClick={handleDetailedInventoryExport} className="w-full" disabled={isExporting}>
                                            {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
                                            Exportar a Excel
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
            
             <AlertDialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Está absolutamente seguro?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta acción no se puede deshacer. Se eliminarán permanentemente los registros de inventario para el rango:
                            <br />
                            <strong className="text-foreground">
                                {dateRangeToDelete?.from && format(dateRangeToDelete.from, "PPP", { locale: es })} - {dateRangeToDelete?.to && format(dateRangeToDelete.to, "PPP", { locale: es })}
                            </strong>.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction 
                            onClick={handleConfirmDelete} 
                            disabled={isDeleting}
                            className={buttonVariants({ variant: 'destructive' })}
                        >
                            {isDeleting ? (
                                <div className="flex flex-col items-center w-full">
                                    <div className="flex items-center">
                                         <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        <span>Eliminando...</span>
                                    </div>
                                    <Progress value={deleteProgress} className="w-full mt-2" />
                                    <p className="text-xs text-center text-muted-foreground mt-1">{Math.round(deleteProgress)}%</p>
                                </div>
                            ) : "Sí, eliminar registros"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
