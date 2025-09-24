
"use client";

import * as React from 'react';
import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from 'zod';
import { DateRange } from 'react-day-picker';
import { format, addDays, differenceInDays, subDays, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as ExcelJS from 'exceljs';

import { getBillingReport, DailyReportData } from '@/app/actions/billing-report';
import { getDetailedReport, type DetailedReportRow } from '@/app/actions/detailed-report';
import { getInventoryReport, uploadInventoryCsv, type InventoryPivotReport, getClientsWithInventory, getInventoryIdsByDateRange, deleteSingleInventoryDoc, getDetailedInventoryForExport } from '@/app/actions/inventory-report';
import { getConsolidatedMovementReport, type ConsolidatedReportRow } from '@/app/actions/consolidated-movement-report';
import { getClientBillingConcepts, type ClientBillingConcept } from '@/app/gestion-conceptos-liquidacion-clientes/actions';
import { generateClientSettlement, type ClientSettlementRow, findApplicableConcepts } from './actions/generate-client-settlement';
import type { ClientInfo } from '@/app/actions/clients';
import { getPedidoTypes, type PedidoType } from '@/app/gestion-tipos-pedido/actions';
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
import { ArrowLeft, Search, XCircle, Loader2, CalendarIcon, ChevronsUpDown, BookCopy, FileDown, File, Upload, FolderSearch, Trash2, Edit, CheckCircle2, DollarSign, ExternalLink, Edit2, Undo, Info, Pencil, History, Undo2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { IndexCreationDialog } from '@/components/app/index-creation-dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

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
        <TableCell colSpan={17} className="py-20 text-center">
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

const formatTime12Hour = (timeStr: string | undefined): string => {
    if (!timeStr) return 'No Aplica';

    // Check if it's already a formatted date-time string
    // e.g., "13/09/2025 06:50 PM"
    const dateTimeParts = timeStr.split(' ');
    if (dateTimeParts.length > 2 && (dateTimeParts[2] === 'AM' || dateTimeParts[2] === 'PM')) {
        return timeStr;
    }
    
    // Handle HH:mm format
    if (!timeStr.includes(':')) return 'No Aplica';

    const [hours, minutes] = timeStr.split(':');
    let h = parseInt(hours, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    h = h ? h : 12; // the hour '0' should be '12'
    return `${h.toString().padStart(2, '0')}:${minutes} ${ampm}`;
};

const formatDuration = (totalMinutes: number | null): string => {
    if (totalMinutes === null || totalMinutes < 0) return 'No Aplica';
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
    return observaciones.map((obs:any) => {
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

const MAX_DATE_RANGE_DAYS = 62;

export default function BillingReportComponent({ clients }: { clients: ClientInfo[] }) {
    const router = useRouter();
    const { toast } = useToast();
    const uploadFormRef = useRef<HTMLFormElement>(null);
    const today = new Date();
    const sixtyTwoDaysAgo = subDays(today, 62);
    
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
    const [detailedTipoPedidoSearch, setDetailedTipoPedidoSearch] = useState('');
    const [allPedidoTypes, setAllPedidoTypes] = useState<PedidoType[]>([]);

    // State for CSV inventory report
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [currentFileIndex, setCurrentFileIndex] = useState(0);
    const [totalFiles, setTotalFiles] = useState(0);
    const [isQuerying, setIsQuerying] = useState(false);
    const [inventoryClients, setInventoryClients] = useState<string[]>([]);
    const [inventoryDateRange, setInventoryDateRange] = useState<DateRange | undefined>(undefined);
    const [inventorySesion, setInventorySesion] = useState<string>('');
    const [inventoryReportData, setInventoryReportData] = useState<InventoryPivotReport | null>(null);
    const [inventorySearched, setInventorySearched] = useState(false);
    const [isInventoryClientDialogOpen, setIsInventoryClientDialogOpen] = useState(false);
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
    const [isConsolidatedClientDialogOpen, setIsConsolidatedClientDialogOpen] = useState(false);
    const [consolidatedClientSearch, setConsolidatedClientSearch] = useState("");

    // State for detailed inventory export
    const [exportClients, setExportClients] = useState<string[]>([]);
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

    // State for client settlement
    const [settlementClient, setSettlementClient] = useState<string | undefined>(undefined);
    const [settlementDateRange, setSettlementDateRange] = useState<DateRange | undefined>();
    const [settlementContainer, setSettlementContainer] = useState<string>('');
    const [availableConcepts, setAvailableConcepts] = useState<ClientBillingConcept[]>([]);
    const [isLoadingAvailableConcepts, setIsLoadingAvailableConcepts] = useState(false);
    const [selectedConcepts, setSelectedConcepts] = useState<string[]>([]);
    const [isSettlementLoading, setIsSettlementLoading] = useState(false);
    const [settlementSearched, setSettlementSearched] = useState(false);
    const [settlementReportData, setSettlementReportData] = useState<ClientSettlementRow[]>([]);
    const [isSettlementClientDialogOpen, setIsSettlementClientDialogOpen] = useState(false);
    const [settlementClientSearch, setSettlementClientSearch] = useState("");
    const [isSettlementConceptDialogOpen, setIsSettlementConceptDialogOpen] = useState(false);
    const [rowToEdit, setRowToEdit] = useState<ClientSettlementRow | null>(null);
    const [isEditSettlementRowOpen, setIsEditSettlementRowOpen] = useState(false);
    const [originalSettlementData, setOriginalSettlementData] = useState<ClientSettlementRow[]>([]);

    
    const [isIndexErrorOpen, setIsIndexErrorOpen] = useState(false);
    const [indexErrorMessage, setIndexErrorMessage] = useState('');

    // State for PDF logo
    const [logoBase64, setLogoBase64] = useState<string | null>(null);
    const [logoDimensions, setLogoDimensions] = useState<{ width: number, height: number } | null>(null);
    const [isLogoLoading, setIsLogoLoading] = useState(true);

    useEffect(() => {
        getPedidoTypes().then(setAllPedidoTypes);
    }, []);

    useEffect(() => {
        const fetchApplicableConcepts = async () => {
            if (settlementClient && settlementDateRange?.from && settlementDateRange?.to) {
                setIsLoadingAvailableConcepts(true);
                try {
                    const result = await findApplicableConcepts(
                        settlementClient,
                        format(settlementDateRange.from, 'yyyy-MM-dd'),
                        format(settlementDateRange.to, 'yyyy-MM-dd')
                    );
                    setAvailableConcepts(result);
                    // Clear selected concepts that are no longer available for the new criteria
                    setSelectedConcepts(prev => prev.filter(sc => result.some(ac => ac.id === sc)));
                } catch (error) {
                    toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar los conceptos aplicables.' });
                    setAvailableConcepts([]);
                } finally {
                    setIsLoadingAvailableConcepts(false);
                }
            } else {
                setAvailableConcepts([]);
                setSelectedConcepts([]);
            }
        };
        fetchApplicableConcepts();
    }, [settlementClient, settlementDateRange, toast]);


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
    
    const handleFetchInventoryClients = useCallback(async () => {
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
    }, [inventoryDateRange, toast]);

    useEffect(() => {
        handleFetchInventoryClients();
    }, [handleFetchInventoryClients]);
    
    const filteredDetailedClients = useMemo(() => {
        if (!detailedClientSearch) return clients;
        return clients.filter(c => c.razonSocial.toLowerCase().includes(detailedClientSearch.toLowerCase()));
    }, [detailedClientSearch, clients]);

    const filteredConsolidatedClients = useMemo(() => {
        if (!consolidatedClientSearch) return clients;
        return clients.filter(c => c.razonSocial.toLowerCase().includes(consolidatedClientSearch.toLowerCase()));
    }, [consolidatedClientSearch, clients]);
    
    const filteredSettlementClients = useMemo(() => {
        if (!settlementClientSearch) return clients;
        return clients.filter(c => c.razonSocial.toLowerCase().includes(settlementClientSearch.toLowerCase()));
    }, [settlementClientSearch, clients]);

     const filteredExportClients = useMemo(() => {
        if (!exportClientSearch) return clients;
        return clients.filter(c => c.razonSocial.toLowerCase().includes(exportClientSearch.toLowerCase()));
    }, [exportClientSearch, clients]);
    
    const filteredAvailableInventoryClients = useMemo(() => {
        if (!inventoryClientSearch) return availableInventoryClients;
        return availableInventoryClients.filter(c => c.toLowerCase().includes(inventoryClientSearch.toLowerCase()));
    }, [inventoryClientSearch, availableInventoryClients]);

    const filteredDetailedPedidoTypes = useMemo(() => {
        if (!detailedTipoPedidoSearch) return allPedidoTypes;
        return allPedidoTypes.filter(pt => pt.name.toLowerCase().includes(detailedTipoPedidoSearch.toLowerCase()));
    }, [detailedTipoPedidoSearch, allPedidoTypes]);

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
            console.error("Error al generar el reporte:", error);
            const errorMessage = error instanceof Error ? error.message : "Ocurrió un error desconocido.";
            if (typeof errorMessage === 'string' && errorMessage.includes('requires an index')) {
                console.error("Firestore Error:", errorMessage);
                setIndexErrorMessage(errorMessage);
                setIsIndexErrorOpen(true);
            } else {
                toast({ variant: 'destructive', title: 'Error al generar el reporte', description: errorMessage });
            }
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

    const handleDetailedReportExportExcel = async () => {
        if (detailedReportData.length === 0) return;
        
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Reporte Detallado');

        const totalDuration = detailedReportData.reduce((acc, row) => acc + (row.duracionMinutos || 0), 0);
        const totalGeneralPesoKg = detailedReportData.reduce((acc, row) => acc + (row.totalPesoKg || 0), 0);
        
        const detailColumns = [
            { header: 'Fecha', key: 'fecha', width: 12 },
            { header: 'Op. Logística', key: 'opLogistica', width: 15 },
            { header: 'Duración', key: 'duracion', width: 12 },
            { header: 'Hora Inicio', key: 'horaInicio', width: 12 },
            { header: 'Hora Fin', key: 'horaFin', width: 12 },
            { header: 'Placa Vehículo', key: 'placa', width: 15 },
            { header: 'No. Contenedor', key: 'contenedor', width: 18 },
            { header: 'Cliente', key: 'cliente', width: 30 },
            { header: 'Tipo Operación', key: 'tipoOperacion', width: 15 },
            { header: 'Tipo Pedido', key: 'tipoPedido', width: 15 },
            { header: 'Cámara Almacenamiento', key: 'camara', width: 20 },
            { header: 'Tipo Empaque', key: 'tipoEmpaque', width: 15 },
            { header: 'No. Pedido (SISLOG)', key: 'pedidoSislog', width: 20 },
            { header: 'Op. Cuadrilla', key: 'opCuadrilla', width: 15 },
            { header: 'No. Operarios', key: 'numOperarios', width: 15 },
            { header: 'Total Cantidad', key: 'totalCantidad', width: 15 },
            { header: 'Total Peso (kg)', key: 'totalPesoKg', width: 18 },
            { header: 'Total Paletas', key: 'totalPaletas', width: 15 },
            { header: 'Observaciones', key: 'observaciones', width: 40 },
        ];
        
        worksheet.columns = detailColumns;
        worksheet.getRow(1).hidden = true; // Oculta la fila de encabezados generada automáticamente

        worksheet.addRow(detailColumns.map(c => c.header));
        worksheet.getRow(2).font = { bold: true };

        detailedReportData.forEach(row => {
            worksheet.addRow({
                fecha: format(new Date(row.fecha), 'dd/MM/yyyy'),
                opLogistica: row.operacionLogistica,
                duracion: formatDuration(row.duracionMinutos),
                horaInicio: formatTime12Hour(row.horaInicio),
                horaFin: formatTime12Hour(row.horaFin),
                placa: row.placa,
                contenedor: row.contenedor,
                cliente: row.cliente,
                tipoOperacion: row.tipoOperacion,
                tipoPedido: row.tipoPedido,
                camara: getSessionName(row.sesion),
                tipoEmpaque: row.tipoEmpaqueMaquila,
                pedidoSislog: row.pedidoSislog,
                opCuadrilla: row.operacionPorCuadrilla,
                numOperarios: row.numeroOperariosCuadrilla,
                totalCantidad: row.totalCantidad,
                totalPesoKg: row.totalPesoKg,
                totalPaletas: row.totalPaletas,
                observaciones: formatObservaciones(row.observaciones),
            });
        });
        
        worksheet.addRow({}); // Empty row as spacer
        const totalRow = worksheet.addRow({
            opLogistica: 'TOTALES:',
            duracion: formatDuration(totalDuration),
            totalPesoKg: totalGeneralPesoKg.toFixed(2),
        });
        totalRow.font = { bold: true };


        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        const fileName = `Reporte_Detallado_Operacion_${format(detailedReportDateRange!.from!, 'yyyy-MM-dd')}_a_${format(detailedReportDateRange!.to!, 'yyyy-MM-dd')}.xlsx`;
        link.download = fileName;
        link.click();
    };

    const handleDetailedReportExportPDF = () => {
        if (detailedReportData.length === 0 || !logoBase64 || !logoDimensions) return;
        
        const doc = new jsPDF({ orientation: 'landscape' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const totalDuration = detailedReportData.reduce((acc, row) => acc + (row.duracionMinutos || 0), 0);
        const totalGeneralPesoKg = detailedReportData.reduce((acc, row) => acc + (row.totalPesoKg || 0), 0);

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
            'Fecha', 'Op. Logística', 'Duración', 'Cliente', 'Tipo Op.', 'Tipo Pedido', 'Cámara', 'Empaque', 'No. Pedido', 'Op. Cuadrilla', 'No. Ops', 'Total Cantidad', 'Total Paletas', 'Total Peso (kg)', 'Observaciones'
        ]];
        
        const body = detailedReportData.map(row => [
            format(new Date(row.fecha), 'dd/MM/yy'),
            row.operacionLogistica,
            formatDuration(row.duracionMinutos),
            row.cliente,
            row.tipoOperacion,
            row.tipoPedido,
            getSessionName(row.sesion),
            row.tipoEmpaqueMaquila,
            row.pedidoSislog,
            row.operacionPorCuadrilla,
            row.numeroOperariosCuadrilla,
            row.totalCantidad,
            row.totalPaletas,
            row.totalPesoKg.toFixed(2),
            formatObservaciones(row.observaciones)
        ]);

        const foot = [
            [
                { content: 'TOTALES:', colSpan: 2, styles: { halign: 'right', fontStyle: 'bold' } }, 
                { content: formatDuration(totalDuration) }, 
                { content: '', colSpan: 10},
                { content: totalGeneralPesoKg.toFixed(2), styles: {fontStyle: 'bold'} },
                { content: ''}
            ]
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
                 14: { cellWidth: 35 }, // Observaciones column
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
        setTotalFiles(files.length);
        let filesWithErrors = 0;
        const errorMessages: string[] = [];
        
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            setCurrentFileIndex(i + 1);
            const singleFileFormData = new FormData();
            singleFileFormData.append('file', file);
    
            try {
                const result = await uploadInventoryCsv(singleFileFormData);
                if (!result.success) {
                    filesWithErrors++;
                    errorMessages.push(`Error en "${file.name}": ${result.message}`);
                }
            } catch (error) {
                filesWithErrors++;
                const errorMessage = error instanceof Error ? error.message : "Error inesperado en el cliente.";
                errorMessages.push(`Error crítico en "${file.name}": ${errorMessage}`);
            }
            
            const newProgress = ((i + 1) / files.length) * 100
            setUploadProgress(newProgress);
        }
    
        if (filesWithErrors > 0) {
             toast({
                variant: 'destructive',
                title: 'Proceso de Carga Completado con Errores',
                description: (
                    <div className="flex flex-col gap-2">
                        <span>{filesWithErrors} de {files.length} archivo(s) no pudieron ser procesados.</span>
                        <ScrollArea className="max-h-20">
                            <ul className="list-disc pl-4 text-xs">
                                {errorMessages.map((msg, idx) => <li key={idx}>{msg}</li>)}
                            </ul>
                        </ScrollArea>
                    </div>
                ),
                duration: 9000,
            });
        } else {
            toast({
                title: 'Proceso de Carga Completado',
                description: `Se han procesado ${files.length} archivo(s) exitosamente.`,
                duration: 5000,
            });
        }
    
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
    
    const handleInventoryExportExcel = async () => {
        if (!inventoryReportData || inventoryReportData.rows.length === 0) return;
        
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Reporte Inventario');

        const { clientHeaders, rows } = inventoryReportData;
    
        const sessionMap: { [key: string]: string } = {
            'CO': 'Congelados',
            'RE': 'Refrigerado',
            'SE': 'Seco',
            'TODAS': 'Todas'
        };
        const sessionText = `Sesión: ${sessionMap[inventorySesion] || inventorySesion}`;
    
        worksheet.addRow([sessionText]);
        worksheet.mergeCells('A1:B1');
        worksheet.addRow([]); // Empty row
        
        const headerRow = worksheet.addRow(['Fecha', ...clientHeaders]);
        headerRow.font = { bold: true };
        
        rows.forEach(row => {
            const rowData: (string | number)[] = [format(new Date(row.date.replace(/-/g, '/')), 'dd/MM/yyyy')];
            clientHeaders.forEach(client => {
                rowData.push(row.clientData[client] || 0);
            });
            worksheet.addRow(rowData);
        });

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        const fileName = `Reporte_Inventario_Pivot_${inventorySesion}_${format(inventoryDateRange!.from!, 'yyyy-MM-dd')}_a_${format(inventoryDateRange!.to!, 'yyyy-MM-dd')}.xlsx`;
        link.download = fileName;
        link.click();
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
                rowData.push(row.clientData[client] ?? 0);
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
                sesion: consolidatedSesion as 'CO' | 'RE' | 'SE',
            };
            const results = await getConsolidatedMovementReport(criteria);
            setConsolidatedReportData(results);
            if (results.length === 0) {
                toast({ title: 'Sin resultados', description: 'No se encontraron movimientos o inventario para los filtros seleccionados.' });
            }
        } catch (error) {
            console.error("Error al generar el reporte consolidado:", error);
            const errorMessage = error instanceof Error ? error.message : "Ocurrió un error desconocido.";
             if (typeof errorMessage === 'string' && errorMessage.includes('firestore.googleapis.com/v1/projects/')) {
                 setIndexErrorMessage(errorMessage);
                 setIsIndexErrorOpen(true);
            } else {
                toast({ variant: 'destructive', title: 'Error al generar el reporte consolidado', description: errorMessage });
            }
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

    const handleConsolidatedExportExcel = async () => {
        if (!consolidatedClient || consolidatedReportData.length === 0) return;

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Reporte Consolidado');

        worksheet.columns = [
            { header: 'Fecha', key: 'fecha', width: 15 },
            { header: 'Cliente', key: 'cliente', width: 30 },
            { header: 'Paletas Recibidas', key: 'recibidas', width: 20 },
            { header: 'Paletas Despachadas', key: 'despachadas', width: 20 },
            { header: 'Posiciones Almacenadas', key: 'posicionesAlmacenadas', width: 22 },
            { header: 'Inventario Acumulado', key: 'inventarioAcumulado', width: 20 },
            { header: 'Validación', key: 'validacion', width: 15 },
        ];
        
        consolidatedReportData.forEach(row => {
            worksheet.addRow({
                fecha: format(new Date(row.date.replace(/-/g, '/')), 'dd/MM/yyyy'),
                cliente: consolidatedClient,
                recibidas: row.paletasRecibidas,
                despachadas: row.paletasDespachadas,
                posicionesAlmacenadas: row.posicionesAlmacenadas,
                inventarioAcumulado: row.inventarioAcumulado,
                validacion: row.posicionesAlmacenadas === row.inventarioAcumulado ? 'OK' : 'Error',
            });
        });

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        const fileName = `Reporte_Consolidado_${consolidatedClient.replace(/\s/g, '_')}_${format(consolidatedDateRange!.from!, 'yyyy-MM-dd')}_a_${format(consolidatedDateRange!.to!, 'yyyy-MM-dd')}.xlsx`;
        link.download = fileName;
        link.click();
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
            head: [['Fecha', 'Recibidas', 'Despachadas', 'Pos. Almacenadas', 'Inv. Acumulado', 'Validación']],
            body: consolidatedReportData.map(row => [
                format(new Date(row.date.replace(/-/g, '/')), 'dd/MM/yyyy'),
                row.paletasRecibidas,
                row.paletasDespachadas,
                row.posicionesAlmacenadas,
                row.inventarioAcumulado,
                row.posicionesAlmacenadas === row.inventarioAcumulado ? 'OK' : 'Error',
            ]),
            headStyles: { fillColor: [33, 150, 243] },
            didParseCell: function (data) {
                if (data.column.index === 5 && data.cell.section === 'body') {
                    if (data.cell.text[0] === 'OK') {
                        data.cell.styles.textColor = '#16a34a';
                        data.cell.styles.fontStyle = 'bold';
                    } else {
                        data.cell.styles.textColor = '#dc2626';
                        data.cell.styles.fontStyle = 'bold';
                    }
                }
            }
        });

        const fileName = `Reporte_Consolidado_${consolidatedClient.replace(/\s/g, '_')}_${format(consolidatedDateRange!.from!, 'yyyy-MM-dd')}_a_${format(consolidatedDateRange!.to!, 'yyyy-MM-dd')}.pdf`;
        doc.save(fileName);
    };

    const handleDetailedInventoryExport = async () => {
        if (!exportClients || exportClients.length === 0 || !exportDateRange?.from || !exportDateRange?.to) {
            toast({
                variant: 'destructive',
                title: 'Filtros incompletos',
                description: 'Por favor, seleccione uno o más clientes y un rango de fechas para exportar.',
            });
            return;
        }

        setIsExporting(true);
        try {
            const results = await getDetailedInventoryForExport({
                clientNames: exportClients,
                startDate: format(exportDateRange.from, 'yyyy-MM-dd'),
                endDate: format(exportDateRange.to, 'yyyy-MM-dd'),
            });
            
            if (results.length === 0) {
                toast({ title: 'Sin resultados', description: 'No se encontraron datos de inventario para exportar con los filtros seleccionados.' });
                return;
            }

            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Inventario Detallado');
            
            // Assuming the first row contains headers
            if (results.length > 0) {
                const headers = Object.keys(results[0]);
                worksheet.columns = headers.map(header => ({ header, key: header, width: 20 }));
                worksheet.addRows(results);
            }
            
            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            const fileName = `Inventario_Detallado_${format(exportDateRange.from, 'yyyy-MM-dd')}_a_${format(exportDateRange.to, 'yyyy-MM-dd')}.xlsx`;
            link.download = fileName;
            link.click();

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Ocurrió un error desconocido.";
            toast({ variant: 'destructive', title: 'Error al exportar', description: errorMessage });
        } finally {
            setIsExporting(false);
        }
    };
    
    const handleSettlementSearch = async () => {
        if (!settlementClient || !settlementDateRange?.from || !settlementDateRange?.to || selectedConcepts.length === 0) {
            toast({ variant: 'destructive', title: 'Filtros incompletos', description: 'Seleccione cliente, rango de fechas y al menos un concepto.' });
            return;
        }
        setIsSettlementLoading(true);
        setSettlementSearched(true);
        setSettlementReportData([]);
        setOriginalSettlementData([]);
        try {
            const result = await generateClientSettlement({
                clientName: settlementClient,
                startDate: format(settlementDateRange.from, 'yyyy-MM-dd'),
                endDate: format(settlementDateRange.to, 'yyyy-MM-dd'),
                conceptIds: selectedConcepts,
                containerNumber: settlementContainer,
            });
            
            if (result.success && result.data) {
                const dataWithIds = result.data.map((row, index) => ({...row, uniqueId: `${row.date}-${row.conceptName}-${index}`}));
                setSettlementReportData(dataWithIds);
                setOriginalSettlementData(JSON.parse(JSON.stringify(dataWithIds)));
                if(result.data.length === 0) {
                    toast({ title: "Sin resultados", description: "No se encontraron operaciones para liquidar con los filtros seleccionados." });
                }
            } else {
                 if (result.error && result.errorLink) {
                    setIndexErrorMessage(result.errorLink);
                    setIsIndexErrorOpen(true);
                } else {
                    toast({ variant: 'destructive', title: 'Error al Liquidar', description: result.error || "Ocurrió un error inesperado en el servidor." });
                }
            }
        } catch (error: any) {
            const msg = error.message ? error.message : "Error inesperado.";
            if (typeof msg === 'string' && msg.includes('requires an index')) {
                setIndexErrorMessage(msg);
                setIsIndexErrorOpen(true);
            } else {
                toast({ variant: 'destructive', title: 'Error al Liquidar', description: msg });
            }
        } finally {
            setIsSettlementLoading(false);
        }
    };

    const handleSaveRowEdit = (updatedRow: ClientSettlementRow) => {
        setSettlementReportData(prevData =>
            prevData.map(row =>
                row.uniqueId === updatedRow.uniqueId
                    ? { ...updatedRow, isEdited: true }
                    : row
            )
        );
        setIsEditSettlementRowOpen(false);
    };

    const handleRestoreRow = (uniqueId: string) => {
        const originalRow = originalSettlementData.find(row => row.uniqueId === uniqueId);
        if (originalRow) {
            setSettlementReportData(prevData =>
                prevData.map(row => (row.uniqueId === uniqueId ? originalRow : row))
            );
        }
    };
    
    const handleSettlementExportExcel = async () => {
        if (settlementReportData.length === 0 || !settlementClient || !settlementDateRange?.from) return;
    
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Frio Alimentaria App';
        workbook.created = new Date();
    
        const conceptOrder = [
            'OPERACIÓN DESCARGUE', 'OPERACIÓN CARGUE', 'ALISTAMIENTO POR UNIDAD', 'FMM DE INGRESO ZFPC', 'ARIN DE INGRESO ZFPC', 'FMM DE SALIDA ZFPC',
            'ARIN DE SALIDA ZFPC', 'REESTIBADO', 'TOMA DE PESOS POR ETIQUETA HRS', 'MOVIMIENTO ENTRADA PRODUCTOS PALLET',
            'MOVIMIENTO SALIDA PRODUCTOS PALLET', 'CONEXIÓN ELÉCTRICA CONTENEDOR', 'ESTIBA MADERA RECICLADA',
            'POSICIONES FIJAS CÁMARA CONGELADOS', 'INSPECCIÓN ZFPC', 'TIEMPO EXTRA FRIOAL (FIJO)', 'TIEMPO EXTRA ZFPC',
            'IN-HOUSE INSPECTOR ZFPC', 'ALQUILER IMPRESORA ETIQUETADO',
        ];

        const addHeaderAndTitle = (ws: ExcelJS.Worksheet, title: string, columns: any[]) => {
            ws.addRow([]);
            const titleRow = ws.addRow([title]);
            titleRow.font = { bold: true, size: 16 };
            ws.mergeCells(2, 1, 2, columns.length);
            titleRow.getCell(1).alignment = { horizontal: 'center' };
        
            const clientRow = ws.addRow([`Cliente: ${settlementClient}`]);
            clientRow.font = { bold: true };
            ws.mergeCells(clientRow.number, 1, clientRow.number, columns.length);
            clientRow.getCell(1).alignment = { horizontal: 'center' };
        
            if (settlementDateRange?.from && settlementDateRange.to) {
                const periodText = `Periodo: ${format(settlementDateRange.from, 'dd/MM/yyyy', { locale: es })} - ${format(settlementDateRange.to, 'dd/MM/yyyy', { locale: es })}`;
                const periodRow = ws.addRow([periodText]);
                periodRow.font = { bold: true };
                ws.mergeCells(ws.rowCount, 1, ws.rowCount, columns.length);
                periodRow.getCell(1).alignment = { horizontal: 'center' };
            }
            ws.addRow([]);
        };

        const headerFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A90C8' } };
        const headerFont: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    
        // --- Hoja de Resumen ---
        const summaryWorksheet = workbook.addWorksheet('Resumen Liquidación');
        
        const summaryColumns = [
            { header: 'Item', key: 'item', width: 10 },
            { header: 'Concepto', key: 'concept', width: 50 },
            { header: 'Total Cantidad', key: 'totalQuantity', width: 20 },
            { header: 'Unidad', key: 'unitOfMeasure', width: 15 },
            { header: 'Valor Unitario', key: 'unitValue', width: 20 },
            { header: 'Valor Total', key: 'totalValue', width: 20 },
        ];
        
        summaryWorksheet.columns = summaryColumns;
        summaryWorksheet.getRow(1).hidden = true;

        addHeaderAndTitle(summaryWorksheet, "Resumen Liquidación", summaryColumns);

        const summaryHeaderRow = summaryWorksheet.getRow(6); // Start table headers at row 6
        summaryHeaderRow.values = summaryColumns.map(c => c.header);
        summaryHeaderRow.eachCell((cell) => {
            cell.fill = headerFill;
            cell.font = headerFont;
            cell.alignment = { horizontal: 'center' };
        });

        const summaryByConcept = settlementReportData.reduce((acc, row) => {
            let conceptKey: string;
            let conceptName: string;
            let unitOfMeasure: string;

            if ((row.conceptName === 'OPERACIÓN CARGUE' || row.conceptName === 'OPERACIÓN DESCARGUE') && row.operacionLogistica !== 'No Aplica') {
                conceptName = `${row.conceptName} (${row.operacionLogistica})`;
                unitOfMeasure = row.tipoVehiculo;
                conceptKey = `${row.conceptName}-${row.operacionLogistica}-${unitOfMeasure}`;
            } else if (row.conceptName === 'TIEMPO EXTRA FRIOAL (FIJO)') {
                conceptName = row.conceptName;
                unitOfMeasure = 'HORA';
                conceptKey = row.conceptName; // Consolidate all under one key
            } else {
                conceptName = row.conceptName + (row.subConceptName ? ` (${row.subConceptName})` : '');
                unitOfMeasure = row.unitOfMeasure;
                conceptKey = `${row.conceptName}-${row.subConceptName || ''}-${unitOfMeasure}`;
            }

            if (!acc[conceptKey]) {
                acc[conceptKey] = {
                    concept: conceptName,
                    totalQuantity: 0,
                    totalValue: 0,
                    unitOfMeasure: unitOfMeasure,
                    unitValue: row.unitValue,
                    order: conceptOrder.indexOf(row.conceptName),
                };
            }
            
            acc[conceptKey].totalQuantity += row.quantity;
            acc[conceptKey].totalValue += row.totalValue;
            
            return acc;
        }, {} as Record<string, { concept: string; totalQuantity: number; totalValue: number; unitOfMeasure: string; unitValue: number; order: number; }>);
    
        const sortedSummary = Object.values(summaryByConcept).sort((a, b) => {
            const orderA = a.order === -1 ? Infinity : a.order;
            const orderB = b.order === -1 ? Infinity : b.order;
            if (orderA !== orderB) return orderA - orderB;
            return a.concept.localeCompare(b.concept);
        });

        sortedSummary.forEach((item, index) => {
            const addedRow = summaryWorksheet.addRow({
                item: index + 1,
                concept: item.concept,
                totalQuantity: item.totalQuantity,
                unitOfMeasure: item.unitOfMeasure,
                unitValue: item.unitValue,
                totalValue: item.totalValue,
            });
            addedRow.getCell('totalQuantity').numFmt = '#,##0.00';
            addedRow.getCell('unitValue').numFmt = '$ #,##0.00';
            addedRow.getCell('totalValue').numFmt = '$ #,##0.00';
        });
    
        summaryWorksheet.addRow([]);
        const totalSumRow = summaryWorksheet.addRow([]);
        totalSumRow.getCell(5).value = 'TOTAL GENERAL:';
        totalSumRow.getCell(5).font = { bold: true, size: 12 };
        totalSumRow.getCell(5).alignment = { horizontal: 'right' };
        totalSumRow.getCell(6).value = settlementTotalGeneral;
        totalSumRow.getCell(6).numFmt = '$ #,##0.00';
        totalSumRow.getCell(6).font = { bold: true, size: 12 };
    
        // --- Hoja de Detalle ---
        const detailWorksheet = workbook.addWorksheet('Detalle Liquidación');
        
        const detailColumns = [
            { header: 'Fecha', key: 'date', width: 15 },
            { header: 'Concepto', key: 'conceptName', width: 40 },
            { header: 'Detalle Concepto', key: 'subConceptName', width: 40 },
            { header: 'No. Personas', key: 'numeroPersonas', width: 15 },
            { header: 'Total Paletas', key: 'totalPaletas', width: 15 },
            { header: 'Contenedor', key: 'container', width: 20 },
            { header: 'Cámara', key: 'camara', width: 20 },
            { header: 'Pedido SISLOG', key: 'pedidoSislog', width: 20 },
            { header: 'Op. Logística', key: 'operacionLogistica', width: 15 },
            { header: 'Tipo Vehículo', key: 'tipoVehiculo', width: 15 },
            { header: 'H. Inicio', key: 'horaInicio', width: 20 },
            { header: 'H. Fin', key: 'horaFin', width: 20 },
            { header: 'Cantidad', key: 'quantity', width: 15 },
            { header: 'Unidad', key: 'unitOfMeasure', width: 15 },
            { header: 'Valor Unitario', key: 'unitValue', width: 20 },
            { header: 'Valor Total', key: 'totalValue', width: 20 },
        ];

        detailWorksheet.columns = detailColumns;
        detailWorksheet.getRow(1).hidden = true;
        
        addHeaderAndTitle(detailWorksheet, "Detalle Liquidación", detailColumns);
        
        const detailHeaderRow = detailWorksheet.getRow(6); // Start table headers at row 6
        detailHeaderRow.values = detailColumns.map(c => c.header);
        detailHeaderRow.eachCell((cell) => {
            cell.fill = headerFill;
            cell.font = headerFont;
            cell.alignment = { horizontal: 'center' };
        });
    
        const groupedByConcept = settlementReportData.reduce((acc, row) => {
            const conceptKey = row.conceptName;
            if (!acc[conceptKey]) {
                acc[conceptKey] = { rows: [], subtotalValor: 0, order: conceptOrder.indexOf(conceptKey) };
            }
            acc[conceptKey].rows.push(row);
            acc[conceptKey].subtotalValor += row.totalValue;
            return acc;
        }, {} as Record<string, { rows: ClientSettlementRow[], subtotalValor: number, order: number }>);
    
        const sortedConceptKeys = Object.keys(groupedByConcept).sort((a, b) => {
            const orderA = groupedByConcept[a].order === -1 ? Infinity : groupedByConcept[a].order;
            const orderB = groupedByConcept[b].order === -1 ? Infinity : b.order;
            if (orderA !== orderB) return orderA - orderB;
            return a.localeCompare(b);
        });
    
        sortedConceptKeys.forEach(conceptName => {
            const group = groupedByConcept[conceptName];
            const sortedRowsForConcept = group.rows.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            
            sortedRowsForConcept.forEach(row => {
                 detailWorksheet.addRow({
                    date: format(parseISO(row.date), 'dd/MM/yyyy'),
                    conceptName: row.conceptName,
                    subConceptName: row.subConceptName,
                    numeroPersonas: row.numeroPersonas,
                    totalPaletas: row.totalPaletas > 0 ? row.totalPaletas : '',
                    container: row.container,
                    camara: getSessionName(row.camara),
                    pedidoSislog: row.pedidoSislog,
                    operacionLogistica: row.operacionLogistica,
                    tipoVehiculo: (row.conceptName === 'OPERACIÓN CARGUE' || row.conceptName === 'OPERACIÓN DESCARGUE') ? row.tipoVehiculo : 'No Aplica',
                    horaInicio: formatTime12Hour(row.horaInicio),
                    horaFin: formatTime12Hour(row.horaFin),
                    quantity: row.quantity,
                    unitOfMeasure: row.unitOfMeasure,
                    unitValue: row.unitValue,
                    totalValue: row.totalValue
                }).eachCell((cell, colNumber) => {
                    const colKey = detailColumns[colNumber - 1].key;
                    if (['quantity', 'unitValue', 'totalValue'].includes(colKey)) {
                        cell.numFmt = colKey === 'quantity' ? '#,##0.00' : '$ #,##0.00';
                    }
                });
            });
    
            const subtotalRow = detailWorksheet.addRow([]);
            subtotalRow.getCell(15).value = `Subtotal ${conceptName}:`;
            subtotalRow.getCell(15).font = { bold: true };
            subtotalRow.getCell(15).alignment = { horizontal: 'right' };
            subtotalRow.getCell(16).value = group.subtotalValor;
            subtotalRow.getCell(16).numFmt = '$ #,##0.00';
            subtotalRow.getCell(16).font = { bold: true };
            subtotalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } };
        });
    
        detailWorksheet.addRow([]);
        const totalDetailRow = detailWorksheet.addRow([]);
        const totalDetailLabelCell = totalDetailRow.getCell(15);
        totalDetailLabelCell.value = 'TOTAL GENERAL:';
        totalDetailLabelCell.font = { bold: true, size: 12 };
        totalDetailLabelCell.alignment = { horizontal: 'right' };
        const totalDetailValueCell = totalDetailRow.getCell(16);
        totalDetailValueCell.value = settlementTotalGeneral;
        totalDetailValueCell.numFmt = '$ #,##0.00';
        totalDetailValueCell.font = { bold: true, size: 12 };
        totalDetailRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC5E0B3' } };
    
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        const fileName = `Liquidacion_${settlementClient.replace(/\s/g, '_')}_${format(settlementDateRange!.from!, 'yyyy-MM-dd')}_a_${format(settlementDateRange!.to!, 'yyyy-MM-dd')}.xlsx`;
        link.download = fileName;
        link.click();
    };
    
    const handleSettlementExportPDF = () => {
        if (settlementReportData.length === 0 || !settlementClient || !settlementDateRange?.from || isLogoLoading || !logoBase64 || !logoDimensions) return;
    
        const doc = new jsPDF({ orientation: 'landscape' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 14;

        const conceptOrder = [
            'OPERACIÓN DESCARGUE', 'OPERACIÓN CARGUE', 'ALISTAMIENTO POR UNIDAD', 'FMM DE INGRESO ZFPC', 'ARIN DE INGRESO ZFPC', 'FMM DE SALIDA ZFPC',
            'ARIN DE SALIDA ZFPC', 'REESTIBADO', 'TOMA DE PESOS POR ETIQUETA HRS', 'MOVIMIENTO ENTRADA PRODUCTOS PALLET',
            'MOVIMIENTO SALIDA PRODUCTOS PALLET', 'CONEXIÓN ELÉCTRICA CONTENEDOR', 'ESTIBA MADERA RECICLADA',
            'POSICIONES FIJAS CÁMARA CONGELADOS', 'INSPECCIÓN ZFPC', 'TIEMPO EXTRA FRIOAL (FIJO)', 'TIEMPO EXTRA ZFPC',
            'IN-HOUSE INSPECTOR ZFPC', 'ALQUILER IMPRESORA ETIQUETADO',
        ];
    
        const addHeader = (docInstance: jsPDF, pageTitle: string) => {
            const logoWidth = 30;
            const aspectRatio = logoDimensions!.width / logoDimensions!.height;
            const logoHeight = logoWidth / aspectRatio;
            docInstance.addImage(logoBase64!, 'PNG', (pageWidth - logoWidth) / 2, 10, logoWidth, logoHeight);
    
            let currentY = 10 + logoHeight + 6;
            docInstance.setFontSize(14);
            docInstance.setFont('helvetica', 'bold');
            docInstance.text(pageTitle, pageWidth / 2, currentY, { align: 'center' });
    
            currentY += 6;
            docInstance.setFontSize(10);
            docInstance.setFont('helvetica', 'normal');
            docInstance.text(`Cliente: ${settlementClient}`, pageWidth / 2, currentY, { align: 'center' });
    
            currentY += 5;
            docInstance.text(`Periodo: ${format(settlementDateRange!.from!, 'dd/MM/yyyy')} - ${format(settlementDateRange!.to!, 'dd/MM/yyyy')}`, pageWidth / 2, currentY, { align: 'center' });
    
            return currentY + 10;
        };
    
        // --- Summary Page ---
        let lastY = addHeader(doc, "Resumen de Liquidación");
    
        const summaryByConcept = settlementReportData.reduce((acc, row) => {
             let conceptName: string;
            let conceptKey: string;
            let unitOfMeasure: string;

            if ((row.conceptName === 'OPERACIÓN CARGUE' || row.conceptName === 'OPERACIÓN DESCARGUE') && row.operacionLogistica !== 'No Aplica') {
                conceptName = `${row.conceptName} (${row.operacionLogistica})`;
                unitOfMeasure = row.tipoVehiculo;
                conceptKey = `${row.conceptName}-${row.operacionLogistica}-${unitOfMeasure}`;
            } else if (row.conceptName === 'TIEMPO EXTRA FRIOAL (FIJO)') {
                conceptName = row.conceptName;
                unitOfMeasure = row.unitOfMeasure;
                conceptKey = row.conceptName; // Consolidate
            } else {
                conceptName = row.conceptName + (row.subConceptName ? ` (${row.subConceptName})` : '');
                unitOfMeasure = row.unitOfMeasure;
                conceptKey = `${row.conceptName}-${row.subConceptName || ''}-${unitOfMeasure}`;
            }

            if (!acc[conceptKey]) {
                acc[conceptKey] = { 
                    concept: conceptName, 
                    totalQuantity: 0, 
                    totalValue: 0, 
                    unitOfMeasure: unitOfMeasure, 
                    order: conceptOrder.indexOf(row.conceptName) 
                };
            }
            acc[conceptKey].totalQuantity += row.quantity;
            acc[conceptKey].totalValue += row.totalValue;
            return acc;
        }, {} as Record<string, { concept: string; totalQuantity: number; totalValue: number; unitOfMeasure: string; order: number; }>);
    
        const sortedSummary = Object.values(summaryByConcept).sort((a, b) => {
            const orderA = a.order === -1 ? Infinity : a.order;
            const orderB = b.order === -1 ? Infinity : b.order;
            if (orderA !== orderB) return orderA - orderB;
            return a.concept.localeCompare(b.concept);
        });

        autoTable(doc, {
            head: [['Item', 'Concepto', 'Total Cantidad', 'Unidad', 'Total Valor']],
            body: sortedSummary.map((item, index) => [
                index + 1,
                item.concept,
                item.totalQuantity.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                item.unitOfMeasure,
                item.totalValue.toLocaleString('es-CO', { style: 'currency', currency: 'COP' })
            ]),
            foot: [[
                { content: 'TOTAL GENERAL:', colSpan: 4, styles: { halign: 'right', fontStyle: 'bold', fillColor: [26, 144, 200], textColor: '#ffffff' } },
                { content: settlementTotalGeneral.toLocaleString('es-CO', { style: 'currency', currency: 'COP' }), styles: { halign: 'right', fontStyle: 'bold', fillColor: [26, 144, 200], textColor: '#ffffff' } }
            ]],
            startY: lastY,
            pageBreak: 'auto',
            theme: 'grid',
            headStyles: { fillColor: [26, 144, 200], fontSize: 8 },
            styles: { fontSize: 7, cellPadding: 1.5 },
            columnStyles: { 0: { cellWidth: 10 }, 2: { halign: 'right' }, 4: { halign: 'right' } },
            footStyles: { fontStyle: 'bold' }
        });

        // --- Detail Page ---
        doc.addPage();
        lastY = addHeader(doc, "Detalle de Operaciones");

        const groupedByConcept = settlementReportData.reduce((acc, row) => {
            const conceptKey = row.conceptName;
            if (!acc[conceptKey]) {
                acc[conceptKey] = { rows: [], subtotalValor: 0, order: conceptOrder.indexOf(conceptKey) };
            }
            acc[conceptKey].rows.push(row);
            acc[conceptKey].subtotalValor += row.totalValue;
            return acc;
        }, {} as Record<string, { rows: ClientSettlementRow[], subtotalValor: number, order: number }>);
    
        const sortedConceptKeys = Object.keys(groupedByConcept).sort((a, b) => {
            const orderA = groupedByConcept[a].order === -1 ? Infinity : a.order;
            const orderB = groupedByConcept[b].order === -1 ? Infinity : b.order;
            if (orderA !== orderB) return orderA - orderB;
            return a.localeCompare(b);
        });

        const detailBody: any[] = [];
        sortedConceptKeys.forEach(conceptName => {
             detailBody.push([{ content: conceptName, colSpan: 15, styles: { fontStyle: 'bold', fillColor: '#dceaf5', textColor: '#000' } }]);
             const sortedRows = groupedByConcept[conceptName].rows.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
             sortedRows.forEach(row => {
                 detailBody.push([
                    format(parseISO(row.date), 'dd/MM/yyyy'),
                    row.subConceptName || '', row.numeroPersonas || '', row.totalPaletas > 0 ? row.totalPaletas : '', getSessionName(row.camara),
                    row.container, row.pedidoSislog, row.operacionLogistica, row.tipoVehiculo, formatTime12Hour(row.horaInicio),
                    formatTime12Hour(row.horaFin), row.quantity.toLocaleString('es-CO', { minimumFractionDigits: 2 }),
                    row.unitOfMeasure, row.unitValue.toLocaleString('es-CO', { style: 'currency', currency: 'COP' }),
                    row.totalValue.toLocaleString('es-CO', { style: 'currency', currency: 'COP' })
                ]);
             });
             detailBody.push([
                { content: `Subtotal ${conceptName}:`, colSpan: 14, styles: { halign: 'right', fontStyle: 'bold' } },
                { content: groupedByConcept[conceptName].subtotalValor.toLocaleString('es-CO', { style: 'currency', currency: 'COP' }), styles: { halign: 'right', fontStyle: 'bold' } }
            ]);
        });
    
        autoTable(doc, {
            head: [['Fecha', 'Detalle', 'Pers.', 'Pal.', 'Cámara', 'Contenedor', 'Pedido', 'Op. Log.', 'T. Vehículo', 'H. Inicio', 'H. Fin', 'Cant.', 'Unidad', 'Vlr. Unit.', 'Vlr. Total']],
            body: detailBody,
            foot: [[
                { content: 'TOTAL GENERAL:', colSpan: 14, styles: { halign: 'right', fontStyle: 'bold', fillColor: [26, 144, 200], textColor: '#ffffff' } },
                { content: settlementTotalGeneral.toLocaleString('es-CO', { style: 'currency', currency: 'COP' }), styles: { halign: 'right', fontStyle: 'bold', fillColor: [26, 144, 200], textColor: '#ffffff' } }
            ]],
            startY: lastY,
            pageBreak: 'auto',
            headStyles: { fillColor: [26, 144, 200], fontSize: 6, cellPadding: 1 },
            styles: { fontSize: 6, cellPadding: 1 },
            columnStyles: { 11: { halign: 'right' }, 13: { halign: 'right' }, 14: { halign: 'right' } },
            footStyles: { fontStyle: 'bold' }
        });
    
        const fileName = `Liquidacion_${settlementClient.replace(/\s/g, '_')}_${format(settlementDateRange!.from!, 'yyyy-MM-dd')}_a_${format(settlementDateRange!.to!, 'yyyy-MM-dd')}.pdf`;
        doc.save(fileName);
    };

    const getTipoPedidoButtonText = () => {
        if (detailedReportTipoPedido.length === 0) return "Todos";
        if (detailedReportTipoPedido.length === 1) return detailedReportTipoPedido[0];
        if (detailedReportTipoPedido.length === allPedidoTypes.length) return "Todos";
        return `${detailedReportTipoPedido.length} tipos seleccionados`;
    };
    
    const getExportClientsText = () => {
        if (exportClients.length === 0) return "Seleccione uno o más clientes...";
        if (exportClients.length === clients.length) return "Todos los clientes seleccionados";
        if (exportClients.length === 1) return exportClients[0];
        return `${exportClients.length} clientes seleccionados`;
    };

    const sessionMapping: { [key: string]: string } = {
        CO: 'CONGELADO',
        RE: 'REFRIGERADO',
        SE: 'SECO',
        'No Aplica': 'No Aplica'
    };

    const getSessionName = (sesionCode: string) => {
        return sessionMapping[sesionCode] || 'No Aplica';
    }
    
    const settlementGroupedData = useMemo(() => {
        const conceptOrder = [
            'OPERACIÓN DESCARGUE', 'OPERACIÓN CARGUE', 'ALISTAMIENTO POR UNIDAD', 'FMM DE INGRESO ZFPC', 'ARIN DE INGRESO ZFPC', 'FMM DE SALIDA ZFPC',
            'ARIN DE SALIDA ZFPC', 'REESTIBADO', 'TOMA DE PESOS POR ETIQUETA HRS', 'MOVIMIENTO ENTRADA PRODUCTOS PALLET',
            'MOVIMIENTO SALIDA PRODUCTOS PALLET', 'CONEXIÓN ELÉCTRICA CONTENEDOR', 'ESTIBA MADERA RECICLADA',
            'POSICIONES FIJAS CÁMARA CONGELADOS', 'INSPECCIÓN ZFPC', 'TIEMPO EXTRA FRIOAL (FIJO)', 'TIEMPO EXTRA ZFPC',
            'IN-HOUSE INSPECTOR ZFPC', 'ALQUILER IMPRESORA ETIQUETADO',
        ];
        
        const grouped = settlementReportData.reduce((acc, row) => {
            if (!acc[row.conceptName]) {
                acc[row.conceptName] = { rows: [], subtotalCantidad: 0, subtotalValor: 0 };
            }
            acc[row.conceptName].rows.push(row);
            acc[row.conceptName].subtotalCantidad += row.quantity || 0;
            acc[row.conceptName].subtotalValor += row.totalValue || 0;
            return acc;
        }, {} as Record<string, { rows: ClientSettlementRow[], subtotalCantidad: number, subtotalValor: number }>);
        
        const sortedKeys = Object.keys(grouped).sort((a, b) => {
            const indexA = conceptOrder.indexOf(a);
            const indexB = conceptOrder.indexOf(b);
            const orderA = indexA === -1 ? Infinity : indexA;
            const orderB = indexB === -1 ? Infinity : indexB;

            if (orderA !== orderB) return orderA - orderB;
            return a.localeCompare(b);
        });

        const sortedGroupedData: Record<string, { rows: ClientSettlementRow[], subtotalCantidad: number, subtotalValor: number }> = {};
        sortedKeys.forEach(key => {
            sortedGroupedData[key] = grouped[key];
        });

        return sortedGroupedData;
    }, [settlementReportData]);
    
    const settlementTotalGeneral = useMemo(() => {
        return settlementReportData.reduce((sum, row) => sum + (row.totalValue || 0), 0);
    }, [settlementReportData]);

    return (
        <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
            <div className="max-w-screen-2xl mx-auto">
                <header className="mb-8">
                    <div className="relative flex items-center justify-center">
                         <Button 
                            variant="ghost" 
                            size="icon" 
                            className="absolute left-0 top-1/2 -translate-y-1/2" 
                            onClick={() => router.push('/')}
                            aria-label="Volver a la página principal"
                        >
                            <ArrowLeft className="mr-2 h-4 w-4" />
                        </Button>
                        <div className="text-center">
                            <div className="flex items-center justify-center gap-2">
                                <BookCopy className="h-8 w-8 text-primary" />
                                <h1 className="text-2xl font-bold text-primary">Informes para Facturación Clientes</h1>
                            </div>
                             <p className="text-sm text-gray-500">Seleccione un tipo de informe y utilice los filtros para generar los datos.</p>
                        </div>
                         <Button onClick={() => router.push('/operaciones-manuales-clientes')} className="absolute right-0 top-1/2 -translate-y-1/2">
                            <Edit className="mr-2 h-4 w-4" />
                            Ops. Manuales
                        </Button>
                    </div>
                </header>

                <Tabs defaultValue="detailed-operation" className="w-full">
                    <TabsList className="grid w-full grid-cols-4 mb-6">
                        <TabsTrigger value="detailed-operation">Operaciones Detalladas</TabsTrigger>
                        <TabsTrigger value="inventory">Inventario Acumulado</TabsTrigger>
                        <TabsTrigger value="consolidated-report">Consolidado Movimientos/Inventario</TabsTrigger>
                        <TabsTrigger value="client-settlement">Liquidación de Clientes</TabsTrigger>
                    </TabsList>

                    <TabsContent value="detailed-operation">
                        <Card>
                            <CardHeader>
                                <CardTitle>Informe Detallado por Operación</CardTitle>
                                <CardDescription>Filtre para ver un listado detallado de las operaciones registradas.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4 mb-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                        <div className="space-y-2 lg:col-span-2">
                                            <Label>Rango de Fechas</Label>
                                            <Popover>
                                                <PopoverTrigger asChild>
                                                    <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !detailedReportDateRange && "text-muted-foreground")}>
                                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                                        {detailedReportDateRange?.from ? (detailedReportDateRange.to ? (<>{format(detailedReportDateRange.from, "LLL dd, y", { locale: es })} - {format(detailedReportDateRange.to, "LLL dd, y", { locale: es })}</>) : (format(detailedReportDateRange.from, "LLL dd, y", { locale: es }))) : (<span>Seleccione un rango</span>)}
                                                    </Button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-auto p-0" align="start">
                                                    <Calendar initialFocus mode="range" defaultMonth={detailedReportDateRange?.from} selected={detailedReportDateRange} onSelect={(range) => {
                                                            if (range?.from && range?.to && differenceInDays(range.to, range.from) > MAX_DATE_RANGE_DAYS) {
                                                                toast({ variant: 'destructive', title: 'Rango muy amplio', description: `Por favor, seleccione un rango de no más de ${MAX_DATE_RANGE_DAYS} días.` });
                                                            } else {
                                                                setDetailedReportDateRange(range);
                                                            }
                                                        }} numberOfMonths={2} locale={es} disabled={{ after: today, before: sixtyTwoDaysAgo }} />
                                                </PopoverContent>
                                            </Popover>
                                        </div>
                                        <div className="space-y-2 lg:col-span-2">
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
                                         <div className="space-y-4 lg:col-span-4">
                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
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
                                                            <Input
                                                                placeholder="Buscar tipo..."
                                                                value={detailedTipoPedidoSearch}
                                                                onChange={(e) => setDetailedTipoPedidoSearch(e.target.value)}
                                                                className="my-4"
                                                            />
                                                            <ScrollArea className="h-72">
                                                                <div className="space-y-2 py-4">
                                                                {filteredDetailedPedidoTypes.map((option) => (
                                                                    <div key={option.id} className="flex items-center space-x-2">
                                                                    <Checkbox
                                                                        id={`tipo-pedido-${option.id}`}
                                                                        checked={detailedReportTipoPedido.includes(option.name)}
                                                                        onCheckedChange={(checked) => {
                                                                        setDetailedReportTipoPedido((prev) =>
                                                                            checked
                                                                            ? [...prev, option.name]
                                                                            : prev.filter((value) => value !== option.name)
                                                                        );
                                                                        }}
                                                                    />
                                                                    <Label htmlFor={`tipo-pedido-${option.id}`} className="font-normal cursor-pointer">
                                                                        {option.name}
                                                                    </Label>
                                                                    </div>
                                                                ))}
                                                                </div>
                                                            </ScrollArea>
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
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 items-center lg:col-span-4 mt-4">
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
                                                <TableHead className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm">Cámara Almacenamiento</TableHead>
                                                <TableHead className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm">Tipo Empaque</TableHead>
                                                <TableHead className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm">No. Pedido (SISLOG)</TableHead>
                                                <TableHead className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm">Op. Cuadrilla</TableHead>
                                                <TableHead className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm">No. Operarios</TableHead>
                                                <TableHead className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm">Total Cantidad</TableHead>
                                                <TableHead className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm">Total Peso (kg)</TableHead>
                                                <TableHead className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm">Total Paletas</TableHead>
                                                <TableHead className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm">Observaciones</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {isDetailedReportLoading ? (
                                                <TableRow><TableCell colSpan={19}><Skeleton className="h-20 w-full" /></TableCell></TableRow>
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
                                                        <TableCell>{getSessionName(row.sesion)}</TableCell>
                                                        <TableCell>{row.tipoEmpaqueMaquila}</TableCell>
                                                        <TableCell>{row.pedidoSislog}</TableCell>
                                                        <TableCell>{row.operacionPorCuadrilla}</TableCell>
                                                        <TableCell>{row.numeroOperariosCuadrilla}</TableCell>
                                                        <TableCell>{row.totalCantidad}</TableCell>
                                                        <TableCell>{row.totalPesoKg.toFixed(2)}</TableCell>
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

                    <TabsContent value="inventory" className="space-y-6">
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
                                                    accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
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
                                                    <p className="text-sm text-center text-muted-foreground">
                                                        Procesando archivo {currentFileIndex} de {totalFiles}... {Math.round(uploadProgress)}%
                                                    </p>
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
                                            <Label>Rango de Fechas (Máx. 62 días)</Label>
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
                                            <Dialog open={isInventoryClientDialogOpen} onOpenChange={setIsInventoryClientDialogOpen}>
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
                                                        <Button onClick={() => setIsInventoryClientDialogOpen(false)}>Cerrar</Button>
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
                                <Card className="mt-6">
                                    <CardHeader>
                                        <CardTitle>Exportar Inventario Detallado a Excel</CardTitle>
                                        <CardDescription>Genere un archivo Excel con el detalle completo del inventario para un cliente y rango de fechas específico.</CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                                            <div className="space-y-2 lg:col-span-2">
                                                <Label>Cliente(s)</Label>
                                                <Dialog open={isExportClientDialogOpen} onOpenChange={setExportClientDialogOpen}>
                                                    <DialogTrigger asChild>
                                                        <Button variant="outline" className="w-full justify-between font-normal">
                                                            <span className="truncate">{getExportClientsText()}</span>
                                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                        </Button>
                                                    </DialogTrigger>
                                                    <DialogContent className="sm:max-w-[425px]">
                                                        <DialogHeader>
                                                            <DialogTitle>Seleccionar Cliente(s)</DialogTitle>
                                                            <DialogDescription>Seleccione los clientes para la exportación detallada.</DialogDescription>
                                                        </DialogHeader>
                                                        <div className="p-4">
                                                            <Input
                                                                placeholder="Buscar cliente..."
                                                                value={exportClientSearch}
                                                                onChange={(e) => setExportClientSearch(e.target.value)}
                                                                className="mb-4"
                                                            />
                                                            <ScrollArea className="h-72">
                                                                <div className="space-y-1">
                                                                    <div className="flex items-center space-x-2 rounded-md p-2 hover:bg-accent border-b">
                                                                        <Checkbox
                                                                            id="select-all-export-clients"
                                                                            checked={clients.length > 0 && exportClients.length === clients.length}
                                                                            onCheckedChange={(checked) => {
                                                                                setExportClients(checked ? clients.map(c => c.razonSocial) : []);
                                                                            }}
                                                                        />
                                                                        <Label htmlFor="select-all-export-clients" className="w-full cursor-pointer font-semibold">Seleccionar Todos</Label>
                                                                    </div>
                                                                    {filteredExportClients.map((client) => (
                                                                        <div key={`export-${client.id}`} className="flex items-center space-x-2 rounded-md p-2 hover:bg-accent">
                                                                            <Checkbox
                                                                                id={`client-export-${client.id}`}
                                                                                checked={exportClients.includes(client.razonSocial)}
                                                                                onCheckedChange={(checked) => {
                                                                                    setExportClients(prev =>
                                                                                        checked ? [...prev, client.razonSocial] : prev.filter(s => s !== client.razonSocial)
                                                                                    );
                                                                                }}
                                                                            />
                                                                            <Label htmlFor={`client-export-${client.id}`} className="w-full cursor-pointer">{client.razonSocial}</Label>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </ScrollArea>
                                                        </div>
                                                        <DialogFooter>
                                                            <Button onClick={() => setExportClientDialogOpen(false)}>Cerrar</Button>
                                                        </DialogFooter>
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
                                            <div className="flex items-end">
                                                <Button onClick={handleDetailedInventoryExport} className="w-full" disabled={isExporting}>
                                                    {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
                                                    Exportar a Excel
                                                </Button>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
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
                                         <Dialog open={isConsolidatedClientDialogOpen} onOpenChange={setIsConsolidatedClientDialogOpen}>
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
                                                            <Button key={client.id} variant="ghost" className="w-full justify-start" onClick={() => { setConsolidatedClient(client.razonSocial); setIsConsolidatedClientDialogOpen(false); setConsolidatedClientSearch(''); }}>{client.razonSocial}</Button>
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
                                                <Calendar initialFocus mode="range" defaultMonth={consolidatedDateRange?.from} selected={consolidatedDateRange} onSelect={(range) => {
                                                            if (range?.from && range?.to && differenceInDays(range.to, range.from) > MAX_DATE_RANGE_DAYS) {
                                                                toast({ variant: 'destructive', title: 'Rango muy amplio', description: `Por favor, seleccione un rango de no más de ${MAX_DATE_RANGE_DAYS} días.` });
                                                            } else {
                                                                setConsolidatedDateRange(range);
                                                            }
                                                        }} numberOfMonths={2} locale={es} disabled={{ after: today, before: sixtyTwoDaysAgo }} />
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
                                                <TableHead className="text-right">Recibidas</TableHead>
                                                <TableHead className="text-right">Despachadas</TableHead>
                                                <TableHead className="text-right">Posiciones Almacenadas</TableHead>
                                                <TableHead className="text-right">Inventario Acumulado</TableHead>
                                                <TableHead className="text-center">Validación</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {isConsolidatedLoading ? (
                                                <ResultsSkeleton />
                                            ) : consolidatedReportData.length > 0 ? (
                                                consolidatedReportData.map((row) => {
                                                    const isValid = row.posicionesAlmacenadas === row.inventarioAcumulado;
                                                    return (
                                                        <TableRow key={row.date}>
                                                            <TableCell className="font-medium">{format(new Date(row.date.replace(/-/g, '/')), 'dd/MM/yyyy')}</TableCell>
                                                            <TableCell className="text-right">{row.paletasRecibidas}</TableCell>
                                                            <TableCell className="text-right">{row.paletasDespachadas}</TableCell>
                                                            <TableCell className="text-right font-semibold">{row.posicionesAlmacenadas}</TableCell>
                                                            <TableCell className="text-right">{row.inventarioAcumulado}</TableCell>
                                                            <TableCell className="text-center">
                                                                {isValid ? (
                                                                    <Badge variant="secondary" className="bg-green-100 text-green-800 border-green-200 hover:bg-green-200">
                                                                        <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                                                                        OK
                                                                    </Badge>
                                                                ) : (
                                                                    <Badge variant="destructive">
                                                                        <XCircle className="mr-1 h-3.5 w-3.5" />
                                                                        Error
                                                                    </Badge>
                                                                )}
                                                            </TableCell>
                                                        </TableRow>
                                                    );
                                                })
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
                    </TabsContent>

                    <TabsContent value="client-settlement">
                         <Card>
                             <CardHeader>
                                <CardTitle>Liquidación de Clientes</CardTitle>
                                <CardDescription>Genere un reporte de liquidación para los servicios prestados a un cliente.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end mb-6">
                                     <div className="space-y-2">
                                        <Label>Cliente</Label>
                                         <Dialog open={isSettlementClientDialogOpen} onOpenChange={setIsSettlementClientDialogOpen}>
                                            <DialogTrigger asChild>
                                                <Button variant="outline" className="w-full justify-between text-left font-normal">
                                                    {settlementClient || "Seleccione un cliente"}
                                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                </Button>
                                            </DialogTrigger>
                                            <DialogContent className="sm:max-w-[425px]">
                                                <DialogHeader><DialogTitle>Seleccionar Cliente</DialogTitle></DialogHeader>
                                                <div className="p-4">
                                                    <Input placeholder="Buscar cliente..." value={settlementClientSearch} onChange={(e) => setSettlementClientSearch(e.target.value)} className="mb-4" />
                                                    <ScrollArea className="h-72"><div className="space-y-1">
                                                        {filteredSettlementClients.map((client) => (
                                                            <Button key={client.id} variant="ghost" className="w-full justify-start" onClick={() => { setSettlementClient(client.razonSocial); setIsSettlementClientDialogOpen(false); setSettlementClientSearch(''); }}>{client.razonSocial}</Button>
                                                        ))}
                                                    </div></ScrollArea>
                                                </div>
                                            </DialogContent>
                                        </Dialog>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>No. Contenedor (Opcional)</Label>
                                        <Input placeholder="Buscar por contenedor" value={settlementContainer} onChange={(e) => setSettlementContainer(e.target.value)} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Rango de Fechas</Label>
                                        <Popover>
                                            <PopoverTrigger asChild><Button variant={"outline"} className={cn("w-full justify-between text-left font-normal", !settlementDateRange && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4" />{settlementDateRange?.from ? (settlementDateRange.to ? (<>{format(settlementDateRange.from, "LLL dd, y", { locale: es })} - {format(settlementDateRange.to, "LLL dd, y", { locale: es })}</>) : (format(settlementDateRange.from, "LLL dd, y", { locale: es }))) : (<span>Seleccione un rango</span>)}</Button></PopoverTrigger>
                                            <PopoverContent className="w-auto p-0" align="start"><Calendar initialFocus mode="range" defaultMonth={settlementDateRange?.from} selected={settlementDateRange} onSelect={(range) => {
                                                if (range?.from && range?.to && differenceInDays(range.to, range.from) > MAX_DATE_RANGE_DAYS) {
                                                    toast({ variant: 'destructive', title: 'Rango muy amplio', description: `Por favor, seleccione un rango de no más de ${MAX_DATE_RANGE_DAYS} días.` });
                                                } else {
                                                    setSettlementDateRange(range);
                                                }
                                            }} numberOfMonths={2} locale={es} disabled={{ after: today, before: sixtyTwoDaysAgo }} /></PopoverContent>
                                        </Popover>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Conceptos a Liquidar</Label>
                                        <Dialog open={isSettlementConceptDialogOpen} onOpenChange={setIsSettlementConceptDialogOpen}><DialogTrigger asChild><Button variant="outline" className="w-full justify-between" disabled={!settlementClient || !settlementDateRange}><span className="truncate">{selectedConcepts.length === 0 ? "Seleccionar conceptos..." : `${selectedConcepts.length} seleccionados`}</span>{isLoadingAvailableConcepts ? <Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin" /> : <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50"/>}</Button></DialogTrigger>
                                            <DialogContent><DialogHeader><DialogTitle>Seleccionar Conceptos</DialogTitle><DialogDescription>Marque los conceptos que desea incluir en la liquidación.</DialogDescription></DialogHeader>
                                                <ScrollArea className="h-72 mt-4"><div className="space-y-2 pr-4">
                                                    {isLoadingAvailableConcepts ? (
                                                        <div className="flex justify-center items-center h-full"><Loader2 className="h-6 w-6 animate-spin" /></div>
                                                    ) : availableConcepts.length > 0 ? (
                                                        <>
                                                            <div className="flex items-center space-x-3 p-2 border-b">
                                                                <Checkbox
                                                                    id="select-all-concepts"
                                                                    checked={availableConcepts.length > 0 && selectedConcepts.length === availableConcepts.length}
                                                                    onCheckedChange={(checked) => {
                                                                        if (checked) {
                                                                            setSelectedConcepts(availableConcepts.map(c => c.id));
                                                                        } else {
                                                                            setSelectedConcepts([]);
                                                                        }
                                                                    }}
                                                                />
                                                                <Label htmlFor="select-all-concepts" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                                                    Seleccionar Todos
                                                                </Label>
                                                            </div>
                                                            {availableConcepts.map(c => (<div key={c.id} className="flex items-center space-x-3"><Checkbox id={`concept-${c.id}`} checked={selectedConcepts.includes(c.id)} onCheckedChange={checked => setSelectedConcepts(prev => checked ? [...prev, c.id] : prev.filter(id => id !== c.id))} /><label htmlFor={`concept-${c.id}`} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">{c.conceptName}</label></div>))}
                                                        </>
                                                    ) : (
                                                        <p className="text-sm text-muted-foreground text-center py-10">No hay conceptos de liquidación aplicables para el cliente y fechas seleccionados.</p>
                                                    )}
                                                </div></ScrollArea>
                                            <DialogFooter><Button onClick={() => setIsSettlementConceptDialogOpen(false)}>Cerrar</Button></DialogFooter>
                                            </DialogContent>
                                        </Dialog>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button onClick={handleSettlementSearch} className="w-full" disabled={isSettlementLoading}><Search className="mr-2 h-4 w-4" />Liquidar</Button>
                                        <Button onClick={() => { setSettlementClient(undefined); setSettlementDateRange(undefined); setSelectedConcepts([]); setSettlementReportData([]); setSettlementSearched(false); setSettlementContainer(''); }} variant="outline" className="w-full"><XCircle className="mr-2 h-4 w-4" />Limpiar</Button>
                                    </div>
                                </div>

                                {settlementSearched && (
                                    <>
                                    <div className="flex justify-end gap-2 my-4">
                                        <Button onClick={handleSettlementExportExcel} disabled={isSettlementLoading || settlementReportData.length === 0} variant="outline"><File className="mr-2 h-4 w-4" />Exportar a Excel</Button>
                                         <Button onClick={handleSettlementExportPDF} disabled={isSettlementLoading || settlementReportData.length === 0 || isLogoLoading} variant="outline">
                                            {isLogoLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
                                            Exportar a PDF
                                        </Button>
                                    </div>
                                    <div className="rounded-md border">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead className="text-xs p-2">Fecha</TableHead>
                                                    <TableHead className="text-xs p-2">Concepto</TableHead>
                                                    <TableHead className="text-xs p-2">No. Personas</TableHead>
                                                    <TableHead className="text-xs p-2">Total Paletas</TableHead>
                                                    <TableHead className="text-xs p-2">Cámara</TableHead>
                                                    <TableHead className="text-xs p-2">Contenedor</TableHead>
                                                    <TableHead className="text-xs p-2">Pedido SISLOG</TableHead>
                                                    <TableHead className="text-xs p-2">Op. Logística</TableHead>
                                                    <TableHead className="text-xs p-2">Tipo Vehículo</TableHead>
                                                    <TableHead className="text-xs p-2">H. Inicio</TableHead>
                                                    <TableHead className="text-xs p-2">H. Fin</TableHead>
                                                    <TableHead className="text-xs p-2">Cantidad</TableHead>
                                                    <TableHead className="text-xs p-2">Unidad</TableHead>
                                                    <TableHead className="text-right text-xs p-2">Valor Unitario</TableHead>
                                                    <TableHead className="text-right text-xs p-2">Valor Total</TableHead>
                                                    <TableHead className="text-right text-xs p-2">Acciones</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {isSettlementLoading ? (
                                                    Array.from({length: 3}).map((_, i) => <TableRow key={i}><TableCell colSpan={16}><Skeleton className="h-8 w-full"/></TableCell></TableRow>)
                                                ) : settlementGroupedData && Object.keys(settlementGroupedData).length > 0 ? (
                                                    <>
                                                        {Object.keys(settlementGroupedData).map(conceptName => (
                                                            <React.Fragment key={conceptName}>
                                                                <TableRow className="bg-muted hover:bg-muted">
                                                                    <TableCell colSpan={16} className="font-bold text-primary text-sm p-2">{conceptName}</TableCell>
                                                                </TableRow>
                                                                {settlementGroupedData[conceptName].rows.map((row) => (
                                                                    <TableRow key={row.uniqueId} data-state={row.isEdited ? "edited" : ""}>
                                                                        <TableCell className="text-xs p-2">{format(parseISO(row.date), 'dd/MM/yyyy', { locale: es })}</TableCell>
                                                                        <TableCell className="text-xs p-2 whitespace-normal">{row.subConceptName}</TableCell>
                                                                        <TableCell className="text-xs p-2">{row.numeroPersonas || ''}</TableCell>
                                                                        <TableCell className="text-xs p-2">{row.totalPaletas > 0 ? row.totalPaletas : ''}</TableCell>
                                                                        <TableCell className="text-xs p-2">{getSessionName(row.camara)}</TableCell>
                                                                        <TableCell className="text-xs p-2">{row.container}</TableCell>
                                                                        <TableCell className="text-xs p-2">{row.pedidoSislog}</TableCell>
                                                                        <TableCell className="text-xs p-2">{row.operacionLogistica}</TableCell>
                                                                        <TableCell className="text-xs p-2">{row.tipoVehiculo}</TableCell>
                                                                        <TableCell className="text-xs p-2">{formatTime12Hour(row.horaInicio)}</TableCell>
                                                                        <TableCell className="text-xs p-2">{formatTime12Hour(row.horaFin)}</TableCell>
                                                                        <TableCell className="text-xs p-2">{row.quantity.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</TableCell>
                                                                        <TableCell className="text-xs p-2">{row.unitOfMeasure}</TableCell>
                                                                        <TableCell className="text-right text-xs p-2">{row.unitValue.toLocaleString('es-CO', {style: 'currency', currency: 'COP'})}</TableCell>
                                                                        <TableCell className="text-right font-bold text-xs p-2">{row.totalValue.toLocaleString('es-CO', {style: 'currency', currency: 'COP'})}</TableCell>
                                                                        <TableCell className="text-right p-1">
                                                                            {row.isEdited ? (
                                                                                <Button variant="ghost" size="sm" onClick={() => handleRestoreRow(row.uniqueId)}>
                                                                                    <Undo2 className="mr-2 h-4 w-4" /> Restaurar
                                                                                </Button>
                                                                            ) : (
                                                                                <Button variant="ghost" size="icon" onClick={() => { setRowToEdit(row); setIsEditSettlementRowOpen(true); }}>
                                                                                    <Edit2 className="h-4 w-4" />
                                                                                </Button>
                                                                            )}
                                                                        </TableCell>
                                                                    </TableRow>
                                                                ))}
                                                                <TableRow className="bg-secondary hover:bg-secondary/80 font-bold">
                                                                    <TableCell colSpan={13} className="text-right text-xs p-2">SUBTOTAL {conceptName}:</TableCell>
                                                                    <TableCell colSpan={1} className="text-xs p-2"></TableCell>
                                                                    <TableCell className="text-right text-xs p-2" colSpan={2}>{settlementGroupedData[conceptName].subtotalValor.toLocaleString('es-CO', {style: 'currency', currency: 'COP'})}</TableCell>
                                                                </TableRow>
                                                            </React.Fragment>
                                                        ))}
                                                        <TableRow className="bg-primary hover:bg-primary text-primary-foreground font-bold text-base">
                                                            <TableCell colSpan={14} className="text-right p-2">TOTAL GENERAL:</TableCell>
                                                            <TableCell className="text-right p-2" colSpan={2}>{settlementTotalGeneral.toLocaleString('es-CO', {style: 'currency', currency: 'COP'})}</TableCell>
                                                        </TableRow>
                                                    </>
                                                ) : (
                                                    <TableRow><TableCell colSpan={16} className="h-24 text-center">No se encontraron datos para liquidar.</TableCell></TableRow>
                                                )}
                                            </TableBody>
                                        </Table>
                                    </div>
                                    </>
                                )}
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
            <IndexCreationDialog 
                isOpen={isIndexErrorOpen}
                onOpenChange={setIsIndexErrorOpen}
                errorMessage={indexErrorMessage}
            />
            {rowToEdit && <EditSettlementRowDialog isOpen={isEditSettlementRowOpen} onOpenChange={setIsEditSettlementRowOpen} row={rowToEdit} onSave={handleSaveRowEdit} />}
        </div>
    );
}

function EditSettlementRowDialog({ isOpen, onOpenChange, row, onSave }: { isOpen: boolean; onOpenChange: (open: boolean) => void; row: ClientSettlementRow; onSave: (updatedRow: ClientSettlementRow) => void; }) {
    const [editedRow, setEditedRow] = useState<ClientSettlementRow>(row);
    const unitOfMeasureOptions = ['TONELADA', 'PALETA', 'ESTIBA', 'UNIDAD', 'CAJA', 'SACO', 'CANASTILLA', 'HORA', 'DIA', 'VIAJE', 'MES', 'CONTENEDOR', 'HORA EXTRA DIURNA', 'HORA EXTRA NOCTURNA', 'HORA EXTRA DIURNA DOMINGO Y FESTIVO', 'HORA EXTRA NOCTURNA DOMINGO Y FESTIVO', 'POSICION/DIA', 'POSICIONES', 'TIPO VEHÍCULO', 'TRACTOMULA'];

    useEffect(() => {
        setEditedRow(row);
    }, [row]);

    const handleSave = () => {
        const newTotal = (editedRow.quantity || 0) * (editedRow.unitValue || 0);
        onSave({ ...editedRow, totalValue: newTotal });
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setEditedRow(prev => ({ ...prev, [name]: name === 'quantity' || name === 'unitValue' ? parseFloat(value) : value }));
    };

    const handleSelectChange = (name: keyof ClientSettlementRow, value: string) => {
        setEditedRow(prev => ({ ...prev, [name]: value }));
    }

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Editar Liquidación Manualmente</DialogTitle>
                    <DialogDescription>Ajuste los valores para este registro. El cambio solo se aplicará a esta liquidación.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto px-2">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Concepto</Label>
                            <Input value={editedRow.conceptName} disabled />
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="operacionLogistica">Op. Logística</Label>
                             <Select name="operacionLogistica" value={editedRow.operacionLogistica} onValueChange={(value) => handleSelectChange('operacionLogistica', value)}>
                                <SelectTrigger><SelectValue/></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Diurno">Diurno</SelectItem>
                                    <SelectItem value="Nocturno">Nocturno</SelectItem>
                                    <SelectItem value="Extra">Extra</SelectItem>
                                    <SelectItem value="No Aplica">No Aplica</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="horaInicio">H. Inicio</Label>
                            <Input id="horaInicio" name="horaInicio" type="time" value={editedRow.horaInicio} onChange={handleChange} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="horaFin">H. Fin</Label>
                            <Input id="horaFin" name="horaFin" type="time" value={editedRow.horaFin} onChange={handleChange} />
                        </div>
                    </div>
                     <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="tipoVehiculo">Tipo Vehículo</Label>
                            <Input id="tipoVehiculo" name="tipoVehiculo" value={editedRow.tipoVehiculo} onChange={handleChange} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="quantity">Cantidad</Label>
                            <Input id="quantity" name="quantity" type="number" value={editedRow.quantity} onChange={handleChange} />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="unitOfMeasure">Unidad</Label>
                             <Select name="unitOfMeasure" value={editedRow.unitOfMeasure} onValueChange={(value) => handleSelectChange('unitOfMeasure', value)}>
                                <SelectTrigger><SelectValue/></SelectTrigger>
                                <SelectContent>
                                    <ScrollArea className="h-48">
                                    {unitOfMeasureOptions.map(option => (
                                        <SelectItem key={option} value={option}>{option}</SelectItem>
                                    ))}
                                    </ScrollArea>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="unitValue">Valor Unitario</Label>
                            <Input id="unitValue" name="unitValue" type="number" value={editedRow.unitValue} onChange={handleChange} />
                        </div>
                    </div>
                     <div className="space-y-2">
                        <Label>Comentarios de justificación</Label>
                        <Textarea placeholder="Opcional: explique por qué se realizó este cambio manual." />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                    <Button onClick={handleSave}>Guardar Cambios</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
    


    







    