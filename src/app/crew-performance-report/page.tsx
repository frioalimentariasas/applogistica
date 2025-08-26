

"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from 'zod';
import Link from 'next/link';
import { DateRange } from 'react-day-picker';
import { format, subDays, parseISO, startOfDay, endOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import ExcelJS from 'exceljs';
import autoTable from 'jspdf-autotable';
import jsPDF from 'jspdf';


import { getCrewPerformanceReport, type CrewPerformanceReportRow } from '@/app/actions/crew-performance-report';
import { addNoveltyToOperation, deleteNovelty } from '@/app/actions/novelty-actions';
import { legalizeWeights } from '@/app/actions/legalize-weights';
import { getAvailableOperarios } from '@/app/actions/performance-report';
import { getClients, type ClientInfo } from '@/app/actions/clients';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import type { PerformanceStandard } from '@/app/actions/standard-actions';
import { getStandardNoveltyTypes, type StandardNoveltyType } from '@/app/gestion-novedades/actions';
import { getBillingConcepts, type BillingConcept } from '@/app/gestion-conceptos-liquidacion/actions';
import { addManualOperation, updateManualOperation } from '../operaciones-manuales/actions';


import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea, ScrollAreaViewport, ScrollBar } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { ArrowLeft, Search, XCircle, Loader2, CalendarIcon, File, FileDown, FolderSearch, ShieldAlert, TrendingUp, Circle, Settings, ChevronsUpDown, AlertCircle, PlusCircle, X, Edit2, CheckCircle2, ClockIcon, AlertTriangleIcon, DollarSign, Activity, FileSpreadsheet, ChevronLeft, ChevronRight, Info, Edit } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge, badgeVariants } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription as AlertDialogDesc, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';


const noveltySchema = z.object({
    type: z.string().min(1, "Debe seleccionar o ingresar un tipo de novedad."),
    downtimeMinutes: z.coerce.number({invalid_type_error: "Debe ser un número"}).int("Debe ser un número entero.").min(0, "Los minutos no pueden ser negativos."),
});

type NoveltyFormValues = z.infer<typeof noveltySchema>;

const legalizeFormSchema = z.object({
  totalPesoBrutoKg: z.coerce.number({ required_error: 'Requerido', invalid_type_error: 'Numérico' }).min(0.01, 'Debe ser mayor a 0'),
});

type LegalizeFormValues = z.infer<typeof legalizeFormSchema>;

const EmptyState = ({ searched, title, description }: { searched: boolean; title: string; description: string; }) => (
    <TableRow>
        <TableCell colSpan={22} className="py-20 text-center">
            <div className="flex flex-col items-center gap-4">
                <div className="rounded-full bg-primary/10 p-4">
                    <FolderSearch className="h-12 w-12 text-primary" />
                </div>
                <h3 className="text-xl font-semibold">
                    {searched ? title : "Genere un reporte"}
                </h3>
                <p className="text-muted-foreground">
                    {searched ? "No hay datos para los filtros seleccionados." : description}
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

const getPerformanceIndicator = (row: CrewPerformanceReportRow): { text: string, className: string, icon: React.FC<any> } => {
    const { operationalDurationMinutes, totalDurationMinutes, standard, cantidadConcepto, conceptoLiquidado } = row;

    if (conceptoLiquidado !== 'CARGUE' && conceptoLiquidado !== 'DESCARGUE') {
        return { text: 'No Aplica', className: 'bg-gray-100 text-gray-600', icon: Circle };
    }
    
    if (cantidadConcepto === -1) {
        return { text: 'Pendiente', className: 'bg-amber-100 text-amber-800 border-amber-200', icon: ClockIcon };
    }
    
    const effectiveOperationalTime = operationalDurationMinutes ?? totalDurationMinutes;
    
    if (effectiveOperationalTime === null || effectiveOperationalTime < 0) {
        return { text: 'Sin Tiempo', className: 'bg-gray-100 text-gray-600', icon: Circle };
    }
    
    if (!standard) {
        return { text: 'Sin Estándar', className: 'bg-gray-100 text-gray-600', icon: Circle };
    }

    const { baseMinutes } = standard;

    if (effectiveOperationalTime < baseMinutes) {
        return { text: 'Óptimo', className: 'bg-green-100 text-green-800 border-green-200', icon: CheckCircle2 };
    }
    
    if (effectiveOperationalTime <= baseMinutes + 10) {
        return { text: 'Normal', className: 'bg-yellow-100 text-yellow-800 border-yellow-200', icon: AlertCircle };
    }

    return { text: 'Lento', className: badgeVariants({variant: "destructive"}), icon: AlertTriangleIcon };
};

export default function CrewPerformanceReportPage() {
    const router = useRouter();
    const { toast } = useToast();
    
    const { user, displayName, permissions, loading: authLoading } = useAuth();
    
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    const [selectedOperario, setSelectedOperario] = useState<string>('all');
    const [availableOperarios, setAvailableOperarios] = useState<string[]>([]);
    const [operationType, setOperationType] = useState<string>('all');
    const [productType, setProductType] = useState<string>('all');
    const [cuadrillaFilter, setCuadrillaFilter] = useState<'con' | 'sin' | 'todas'>('todas');
    
    const [clients, setClients] = useState<ClientInfo[]>([]);
    const [selectedClients, setSelectedClients] = useState<string[]>([]);
    const [isClientDialogOpen, setClientDialogOpen] = useState(false);
    const [clientSearch, setClientSearch] = useState('');
    const [filterPending, setFilterPending] = useState(false);
    const [filterLento, setFilterLento] = useState(false);
    
    const [standardNoveltyTypes, setStandardNoveltyTypes] = useState<StandardNoveltyType[]>([]);
    const [allBillingConcepts, setAllBillingConcepts] = useState<BillingConcept[]>([]);
    const [selectedConcepts, setSelectedConcepts] = useState<string[]>([]);
    const [isConceptDialogOpen, setIsConceptDialogOpen] = useState(false);
    const [conceptSearch, setConceptSearch] = useState('');

    const [reportData, setReportData] = useState<CrewPerformanceReportRow[]>([]);
    const [filteredReportData, setFilteredReportData] = useState<CrewPerformanceReportRow[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingOperarios, setIsLoadingOperarios] = useState(false);
    const [searched, setSearched] = useState(false);

    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    
    // Horizontal Scroll State
    const scrollViewportRef = useRef<HTMLDivElement>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);

    // State for novelty management
    const [isNoveltyDialogOpen, setIsNoveltyDialogOpen] = useState(false);
    const [isNoveltySelectorOpen, setIsNoveltySelectorOpen] = useState(false);
    const [isSubmittingNovelty, setIsSubmittingNovelty] = useState(false);
    const [selectedRowForNovelty, setSelectedRowForNovelty] = useState<CrewPerformanceReportRow | null>(null);
    const [noveltyToDelete, setNoveltyToDelete] = useState<{ rowId: string; noveltyId: string; } | null>(null);
    const [isDeletingNovelty, setIsDeletingNovelty] = useState(false);
    
    // State for legalization
    const [isLegalizeDialogOpen, setIsLegalizeDialogOpen] = useState(false);
    const [isLegalizing, setIsLegalizing] = useState(false);
    const [rowToLegalize, setRowToLegalize] = useState<CrewPerformanceReportRow | null>(null);
    
    const noveltyForm = useForm<NoveltyFormValues>({
        resolver: zodResolver(noveltySchema),
        defaultValues: { type: '', downtimeMinutes: 0 }
    });
    
    const legalizeForm = useForm<LegalizeFormValues>({
      resolver: zodResolver(legalizeFormSchema),
      defaultValues: {
        totalPesoBrutoKg: 0,
      },
    });

    const totalPages = Math.ceil(filteredReportData.length / itemsPerPage);
    const displayedData = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        return filteredReportData.slice(startIndex, endIndex);
    }, [filteredReportData, currentPage, itemsPerPage]);

    const filteredClients = useMemo(() => {
        if (!clientSearch) return clients;
        return clients.filter(c => c.razonSocial.toLowerCase().includes(clientSearch.toLowerCase()));
    }, [clientSearch, clients]);

    const filteredConcepts = useMemo(() => {
        const uniqueConcepts = [...new Set(allBillingConcepts.map(c => c.conceptName))];
        if (!conceptSearch) return uniqueConcepts;
        return uniqueConcepts.filter(name => name.toLowerCase().includes(conceptSearch.toLowerCase()));
    }, [conceptSearch, allBillingConcepts]);

    const liquidationData = useMemo(() => {
        return filteredReportData.filter(row => {
            if (row.aplicaCuadrilla === 'si') return true;
            if (row.valorTotalConcepto > 0) return true;
            return false;
        });
    }, [filteredReportData]);
    
    const liquidationTotalPages = Math.ceil(liquidationData.length / itemsPerPage);
    const displayedLiquidationData = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        return liquidationData.slice(startIndex, endIndex);
    }, [liquidationData, currentPage, itemsPerPage]);

    useEffect(() => {
        const fetchInitialData = async () => {
             const [clientList, noveltyTypes, billingConcepts] = await Promise.all([
                 getClients(),
                 getStandardNoveltyTypes(),
                 getBillingConcepts(),
             ]);
             setClients(clientList);
             setStandardNoveltyTypes(noveltyTypes);
             setAllBillingConcepts(billingConcepts);
        };
        fetchInitialData();
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
        }
        fetchOperarios();
    }, [dateRange, toast]);

    useEffect(() => {
        let results = reportData;
        
        if (filterLento) {
            results = results.filter(row => getPerformanceIndicator(row).text === 'Lento');
        }

        setFilteredReportData(results);
    }, [filterLento, reportData]);
    
    const handleCheckScroll = useCallback(() => {
        const el = scrollViewportRef.current;
        if (el) {
            const scrollLeft = el.scrollLeft;
            const scrollWidth = el.scrollWidth;
            const clientWidth = el.clientWidth;
            setCanScrollLeft(scrollLeft > 0);
            setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
        }
    }, []);
    
    const handleScroll = useCallback((direction: 'left' | 'right') => {
        const el = scrollViewportRef.current;
        if (el) {
            const scrollAmount = direction === 'left' ? -300 : 300;
            el.scrollBy({ left: scrollAmount, behavior: 'smooth' });
        }
    }, []);
    
    useEffect(() => {
        const el = scrollViewportRef.current;
        if (!el) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                handleScroll('left');
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                handleScroll('right');
            }
        };

        handleCheckScroll();
        el.addEventListener('scroll', handleCheckScroll, { passive: true });
        window.addEventListener('resize', handleCheckScroll);
        el.addEventListener('keydown', handleKeyDown);
        el.setAttribute('tabindex', '0');

        return () => {
            el.removeEventListener('scroll', handleCheckScroll);
            window.removeEventListener('resize', handleCheckScroll);
            el.removeEventListener('keydown', handleKeyDown);
            el.removeAttribute('tabindex');
        };
    }, [handleCheckScroll, handleScroll]);


    const handleSearch = useCallback(async (isAutoSearch = false) => {
        setIsLoading(true);
        if (!isAutoSearch) {
            setSearched(true);
        }
        setReportData([]);
        setCurrentPage(1);

        try {
            const criteria = {
                startDate: dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : undefined,
                endDate: dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : undefined,
                operario: selectedOperario === 'all' ? undefined : selectedOperario,
                operationType: operationType === 'all' ? undefined : operationType as 'recepcion' | 'despacho',
                productType: productType === 'all' ? undefined : productType as 'fijo' | 'variable',
                clientNames: selectedClients.length > 0 ? selectedClients : undefined,
                cuadrillaFilter: cuadrillaFilter,
                conceptos: selectedConcepts.length > 0 ? selectedConcepts : undefined,
                filterPending: filterPending
            };

            const results = await getCrewPerformanceReport(criteria);
            
            setReportData(results);
            
            if (results.length === 0 && searched) {
                 toast({
                    title: "Sin resultados",
                    description: "No se encontraron operaciones para los filtros seleccionados.",
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
    }, [dateRange, selectedOperario, operationType, productType, selectedClients, cuadrillaFilter, selectedConcepts, toast, filterPending, searched]);
    
    
    const handleClear = () => {
        setDateRange(undefined);
        setSelectedOperario('all');
        setOperationType('all');
        setProductType('all');
        setCuadrillaFilter('todas');
        setSelectedClients([]);
        setSelectedConcepts([]);
        setFilterPending(false);
        setFilterLento(false);
        setReportData([]);
        setFilteredReportData([]);
        setSearched(false);
        setCurrentPage(1);
    };

    const totalLiquidacion = useMemo(() => liquidationData.reduce((acc, row) => acc + (row.valorTotalConcepto || 0), 0), [liquidationData]);
    
    const getSelectedClientsText = () => {
        if (selectedClients.length === 0) return "Todos los clientes...";
        if (selectedClients.length === clients.length) return "Todos los clientes seleccionados";
        if (selectedClients.length === 1) return selectedClients[0];
        return `${selectedClients.length} clientes seleccionados`;
    };

    const getSelectedConceptsText = () => {
        const uniqueConcepts = [...new Set(allBillingConcepts.map(c => c.conceptName))];
        if (selectedConcepts.length === 0) return "Todos los conceptos...";
        if (selectedConcepts.length === uniqueConcepts.length) return "Todos los conceptos";
        if (selectedConcepts.length === 1) return selectedConcepts[0];
        return `${selectedConcepts.length} conceptos seleccionados`;
    }

    const performanceSummary = useMemo(() => {
        const cargaDescargaData = reportData.filter(row => row.conceptoLiquidado === 'CARGUE' || row.conceptoLiquidado === 'DESCARGUE');

        if (cargaDescargaData.length === 0) return null;

        const summary: Record<string, { count: number }> = {
            'Óptimo': { count: 0 },
            'Normal': { count: 0 },
            'Lento': { count: 0 },
            'Pendiente': { count: 0 },
            'Sin Estándar': { count: 0 },
            'Sin Tiempo': { count: 0 },
            'No Aplica': { count: 0 }
        };

        cargaDescargaData.forEach(row => {
            const indicator = getPerformanceIndicator(row).text;
             if (indicator in summary) {
                summary[indicator as keyof typeof summary].count++;
            }
        });
        
        const totalEvaluableOperations = Object.entries(summary).reduce((acc, [key, value]) => {
            return (key !== 'No Aplica' && key !== 'Sin Tiempo' && key !== 'Pendiente' && key !== 'Sin Estándar') ? acc + value.count : acc;
        }, 0);

        if (totalEvaluableOperations === 0) {
             return {
                summary,
                totalOperations: cargaDescargaData.length,
                qualification: "No Calculable",
                totalEvaluable: 0,
            };
        }
        
        const optimoPercent = summary['Óptimo'].count / totalEvaluableOperations;
        const optimoNormalPercent = (summary['Óptimo'].count + summary['Normal'].count) / totalEvaluableOperations;

        let qualification = 'Deficiente';
        if (optimoPercent >= 0.95) {
            qualification = 'Excelente';
        } else if (optimoNormalPercent >= 0.85) {
            qualification = 'Sobresaliente';
        }

        return {
            summary,
            totalOperations: cargaDescargaData.length,
            qualification,
            totalEvaluable: totalEvaluableOperations,
        };
    }, [reportData]);

     const conceptSummary = useMemo(() => {
        if (liquidationData.length === 0) return null;
        
        const summary = liquidationData.reduce((acc, row) => {
            const { conceptoLiquidado, cantidadConcepto, valorUnitario, valorTotalConcepto, unidadMedidaConcepto } = row;

            if (conceptoLiquidado === 'N/A') return acc;
            if (!acc[conceptoLiquidado]) {
                const firstValidEntry = reportData.find(r => r.conceptoLiquidado === conceptoLiquidado && r.valorUnitario > 0);
                acc[conceptoLiquidado] = {
                    totalCantidad: 0,
                    totalValor: 0,
                    unidadMedida: unidadMedidaConcepto,
                    valorUnitario: firstValidEntry ? firstValidEntry.valorUnitario : 0, 
                };
            }
            
            if (cantidadConcepto !== -1) {
                 acc[conceptoLiquidado].totalCantidad += cantidadConcepto;
                 acc[conceptoLiquidado].totalValor += valorTotalConcepto;
            }
            return acc;
        }, {} as Record<string, { totalCantidad: number, totalValor: number, unidadMedida: string, valorUnitario: number }>);

        return Object.entries(summary).map(([name, data], index) => ({
            item: index + 1,
            name,
            totalCantidad: data.totalCantidad,
            valorUnitario: data.valorUnitario,
            totalValor: data.totalValor,
            unidadMedida: data.unidadMedida
        }));
     }, [liquidationData, reportData]);


    const handleExportExcel = async (type: 'productivity' | 'settlement') => {
        if (isLoading) return;
    
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Frio Alimentaria App';
        workbook.created = new Date();
    
        const titleStyle: Partial<ExcelJS.Style> = { font: { bold: true, size: 14, color: { argb: 'FF005A9E' } }, alignment: { horizontal: 'center' } };
        const subtitleStyle: Partial<ExcelJS.Style> = { font: { size: 11, italic: true }, alignment: { horizontal: 'center' } };
        const headerStyle: Partial<ExcelJS.Style> = { font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF005A9E' } }, border: { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } } };
    
        const periodText = dateRange?.from && dateRange.to ? `Periodo: ${format(dateRange.from, 'dd/MM/yyyy')} a ${format(dateRange.to, 'dd/MM/yyyy')}` : 'Periodo no especificado';
    
        if (type === 'productivity') {
            const wsProd = workbook.addWorksheet('Productividad');
            
            wsProd.addRow(['Informe de Productividad de Cuadrilla']).getCell(1).style = titleStyle;
            wsProd.mergeCells(1, 1, 1, 17);
            wsProd.addRow([periodText]).getCell(1).style = subtitleStyle;
            wsProd.mergeCells(2, 1, 2, 17);
            wsProd.addRow([]);

            wsProd.columns = [
                { header: 'Fecha Op.', key: 'fechaOp', width: 12 },
                { header: 'Fecha Creación', key: 'fechaCreacion', width: 18 },
                { header: 'Operario', key: 'operario', width: 25 },
                { header: 'Cliente', key: 'cliente', width: 30 },
                { header: 'Tipo Op.', key: 'tipoOp', width: 12 },
                { header: 'Tipo Prod.', key: 'tipoProd', width: 12 },
                { header: 'Pedido', key: 'pedido', width: 15 },
                { header: 'No. Contenedor', key: 'contenedor', width: 18 },
                { header: 'Placa', key: 'placa', width: 12 },
                { header: 'Concepto', key: 'concepto', width: 20 },
                { header: 'Hora Inicio', key: 'horaInicio', width: 12 },
                { header: 'Hora Fin', key: 'horaFin', width: 12 },
                { header: 'Cant.', key: 'cantidad', width: 12 },
                { header: 'Dur. Total', key: 'durTotal', width: 12 },
                { header: 'T. Operativo', key: 'tOperativo', width: 12 },
                { header: 'Novedades', key: 'novedades', width: 30 },
                { header: 'Productividad', key: 'productividad', width: 15 },
            ];

            const prodHeaderRow = wsProd.getRow(4);
            prodHeaderRow.eachCell(cell => cell.style = headerStyle);
            
            filteredReportData.forEach(row => {
                 const newRow = wsProd.addRow({
                    fechaOp: format(new Date(row.fecha), 'dd/MM/yy'),
                    fechaCreacion: format(parseISO(row.createdAt), 'dd/MM/yy HH:mm'),
                    operario: row.operario,
                    cliente: row.cliente,
                    tipoOp: row.tipoOperacion,
                    tipoProd: row.tipoProducto,
                    pedido: row.pedidoSislog,
                    contenedor: row.contenedor,
                    placa: row.placa,
                    concepto: row.conceptoLiquidado,
                    horaInicio: row.horaInicio,
                    horaFin: row.horaFin,
                    cantidad: row.cantidadConcepto === -1 ? 'Pendiente' : row.cantidadConcepto,
                    durTotal: formatDuration(row.totalDurationMinutes),
                    tOperativo: formatDuration(row.operationalDurationMinutes),
                    novedades: row.novelties.map(n => `${n.type}: ${n.downtimeMinutes} min`).join(', '),
                    productividad: getPerformanceIndicator(row).text
                });

                const cantCell = newRow.getCell('cantidad');
                if (typeof cantCell.value === 'number') {
                    cantCell.numFmt = '#,##0.00';
                }
            });

            if (performanceSummary) {
                wsProd.addRow([]);
                const summaryTitleRow = wsProd.addRow(['Resumen de Productividad']);
                summaryTitleRow.getCell(1).style = { font: { bold: true, size: 12 }};
                wsProd.mergeCells(wsProd.rowCount, 1, wsProd.rowCount, 3);

                const summaryHeader = wsProd.addRow(['Indicador', 'Cantidad', 'Porcentaje']);
                summaryHeader.font = { bold: true };
                
                Object.entries(performanceSummary.summary).forEach(([key, value]) => {
                    const isEvaluable = key === 'Óptimo' || key === 'Normal' || key === 'Lento';
                    if (isEvaluable && value.count > 0) {
                        const percent = performanceSummary.totalEvaluable > 0 ? value.count / performanceSummary.totalEvaluable : 0;
                        const row = wsProd.addRow([key, value.count, percent]);
                        row.getCell(3).numFmt = '0.00%';
                    }
                });

                const totalEvaluableRow = wsProd.addRow(['Total Evaluables:', performanceSummary.totalEvaluable]);
                totalEvaluableRow.font = { bold: true };

                wsProd.addRow([]);
                const qualificationRow = wsProd.addRow(['Calificación General:', performanceSummary.qualification]);
                qualificationRow.font = { bold: true, color: { argb: 'FF005A9E' }, size: 12 };
            }
    
        } else if (type === 'settlement') {
            if (liquidationData.length === 0) {
                toast({ variant: 'destructive', title: 'Sin datos', description: 'No hay datos de liquidación para exportar.' });
                return;
            }
    
            const wsLiq = workbook.addWorksheet('Liquidacion_Cuadrilla');
            wsLiq.addRow(['Detalle Liquidación Cuadrilla']).getCell(1).style = titleStyle;
            wsLiq.mergeCells(1, 1, 1, 14);
            wsLiq.addRow([periodText]).getCell(1).style = subtitleStyle;
            wsLiq.mergeCells(2, 1, 2, 14);
            wsLiq.addRow([]);

            wsLiq.columns = [
                { header: 'Mes', key: 'mes', width: 12 },
                { header: 'Fecha Op.', key: 'fechaOp', width: 12 },
                { header: 'Pedido', key: 'pedido', width: 15 },
                { header: 'Contenedor', key: 'contenedor', width: 18 },
                { header: 'Placa', key: 'placa', width: 12 },
                { header: 'Cliente', key: 'cliente', width: 30 },
                { header: 'Concepto', key: 'concepto', width: 20 },
                { header: 'Cantidad', key: 'cantidad', width: 12, style: { numFmt: '#,##0.00' } },
                { header: 'Unidad', key: 'unidad', width: 12 },
                { header: 'H. Inicio', key: 'hInicio', width: 12 },
                { header: 'H. Fin', key: 'hFin', width: 12 },
                { header: 'Duración', key: 'duracion', width: 12 },
                { header: 'Vlr. Unitario', key: 'vlrUnitario', width: 15, style: { numFmt: '$ #,##0.00' } },
                { header: 'Vlr. Total', key: 'vlrTotal', width: 15, style: { numFmt: '$ #,##0.00' } }
            ];

            const liqHeaderRow = wsLiq.getRow(4);
            liqHeaderRow.eachCell(cell => cell.style = headerStyle);
    
            liquidationData.forEach(row => {
                const isPending = row.cantidadConcepto === -1;
                wsLiq.addRow({
                    mes: format(new Date(row.fecha), 'MMMM', { locale: es }),
                    fechaOp: format(new Date(row.fecha), 'dd/MM/yy'),
                    pedido: row.pedidoSislog,
                    contenedor: row.contenedor,
                    placa: row.placa,
                    cliente: row.cliente,
                    concepto: row.conceptoLiquidado,
                    cantidad: isPending ? 'Pendiente' : row.cantidadConcepto,
                    unidad: isPending ? 'N/A' : row.unidadMedidaConcepto,
                    hInicio: row.horaInicio,
                    hFin: row.horaFin,
                    duracion: formatDuration(row.totalDurationMinutes),
                    vlrUnitario: isPending ? 'N/A' : row.valorUnitario,
                    vlrTotal: isPending ? 'N/A' : row.valorTotalConcepto
                });
            });
    
            wsLiq.addRow([]);
            const totalLiqRow = wsLiq.addRow([]);
            totalLiqRow.getCell(13).value = 'TOTAL GENERAL:';
            totalLiqRow.getCell(13).style = { font: { bold: true }, alignment: { horizontal: 'right' } };
            const totalLiqValueCell = totalLiqRow.getCell(14);
            totalLiqValueCell.value = totalLiquidacion;
            totalLiqValueCell.numFmt = '$ #,##0.00';
            totalLiqValueCell.style.font = { bold: true };
            
            if (conceptSummary) {
                const wsSumCon = workbook.addWorksheet('Resumen_Conceptos');
                wsSumCon.addRow(['Resumen de Conceptos Liquidados']).getCell(1).style = titleStyle;
                wsSumCon.mergeCells(1, 1, 1, 6);
                wsSumCon.addRow([periodText]).getCell(1).style = subtitleStyle;
                wsSumCon.mergeCells(2, 1, 2, 6);
                wsSumCon.addRow([]);
    
                wsSumCon.columns = [
                    { header: 'Item', key: 'item', width: 8 },
                    { header: 'Concepto', key: 'concepto', width: 25 },
                    { header: 'Total Cantidad', key: 'totalCantidad', width: 15, style: { numFmt: '#,##0.00' } },
                    { header: 'Unidad Medida', key: 'unidad', width: 15 },
                    { header: 'Vlr. Unitario', key: 'vlrUnitario', width: 18, style: { numFmt: '$ #,##0.00' } },
                    { header: 'Vlr. Total', key: 'vlrTotal', width: 18, style: { numFmt: '$ #,##0.00' } }
                ];
                
                const conceptHeaderRow = wsSumCon.getRow(4);
                conceptHeaderRow.eachCell(cell => cell.style = headerStyle);
                
                conceptSummary.forEach(item => {
                    wsSumCon.addRow({
                        item: item.item,
                        concepto: item.name,
                        totalCantidad: item.totalCantidad,
                        unidad: item.unidadMedida,
                        vlrUnitario: item.valorUnitario,
                        vlrTotal: item.totalValor
                    });
                });
                
                wsSumCon.addRow([]);
                const totalSumRow = wsSumCon.addRow([]);
                totalSumRow.getCell(5).value = 'TOTAL GENERAL:';
                totalSumRow.getCell(5).style = { font: { bold: true }, alignment: { horizontal: 'right' } };
                const totalSumValueCell = totalSumRow.getCell(6);
                totalSumValueCell.value = totalLiquidacion;
                totalSumValueCell.numFmt = '$ #,##0.00';
                totalSumValueCell.style.font = { bold: true };
            }
        }
    
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        const reportName = type === 'productivity' ? 'Productividad_Cuadrilla' : 'Liquidacion_Cuadrilla';
        link.download = `Reporte_${reportName}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
        link.click();
    };

    const handleExportPDF = (type: 'productivity' | 'settlement') => {
        if (isLoading) return;
    
        const doc = new jsPDF({ orientation: 'landscape' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 14;

        const periodText = dateRange?.from && dateRange.to ? `Periodo: ${format(dateRange.from, 'dd/MM/yyyy')} a ${format(dateRange.to, 'dd/MM/yyyy')}` : 'Periodo no especificado';
    
        if (type === 'productivity') {
            if (filteredReportData.length === 0) {
                toast({ variant: 'destructive', title: 'Sin datos', description: 'No hay datos de productividad para exportar.' });
                return;
            }
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text('Informe de Productividad de Cuadrilla', pageWidth / 2, margin, { align: 'center' });
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.text(periodText, pageWidth / 2, margin + 5, { align: 'center' });
            
            const head = [['Fecha Op.', 'Operario', 'Cliente', 'Tipo Op.', 'Tipo Prod.', 'Pedido', 'Placa', 'Concepto', 'Cant.', 'Dur. Total', 'T. Operativo', 'Productividad']];
            const body = filteredReportData.map(row => {
                 const indicator = getPerformanceIndicator(row);
                 return [
                    format(new Date(row.fecha), 'dd/MM/yy'),
                    row.operario,
                    row.cliente,
                    row.tipoOperacion,
                    row.tipoProducto,
                    row.pedidoSislog,
                    row.placa,
                    row.conceptoLiquidado,
                    row.cantidadConcepto === -1 ? 'Pendiente' : row.cantidadConcepto.toFixed(2),
                    formatDuration(row.totalDurationMinutes),
                    formatDuration(row.operationalDurationMinutes),
                    indicator.text
                 ];
            });
            autoTable(doc, { startY: margin + 15, head, body, theme: 'grid', styles: { fontSize: 6, cellPadding: 1 }, headStyles: { fillColor: [33, 150, 243] }, columnStyles: { 2: { cellWidth: 40 }, 10: {cellWidth: 30} } });

            if (performanceSummary) {
                const summaryBody = Object.entries(performanceSummary.summary)
                    .filter(([key, value]) => (key === 'Óptimo' || key === 'Normal' || key === 'Lento') && value.count > 0)
                    .map(([key, value]) => {
                        const percent = performanceSummary.totalEvaluable > 0 ? (value.count / performanceSummary.totalEvaluable) * 100 : 0;
                        return [key, value.count, `${percent.toFixed(2)} %`];
                    });
                
                autoTable(doc, {
                    startY: (doc as any).lastAutoTable.finalY + 10,
                    head: [['Indicador', 'Cantidad', 'Porcentaje']],
                    body: summaryBody,
                    foot: [
                        ['Total Evaluables:', performanceSummary.totalEvaluable, ''],
                        ['Calificación General:', performanceSummary.qualification, '']
                    ],
                    theme: 'grid',
                    headStyles: { fillColor: [33, 150, 243] },
                    footStyles: { fontStyle: 'bold' }
                });
            }


        } else if (type === 'settlement') {
            if (liquidationData.length === 0 || !conceptSummary) {
                toast({ variant: 'destructive', title: 'Sin datos', description: 'No hay datos de liquidación para exportar.' });
                return;
            }
             doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text('Informe de Liquidación de Cuadrilla', pageWidth / 2, margin, { align: 'center' });
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.text(periodText, pageWidth / 2, margin + 5, { align: 'center' });
            
            const detailHead = [['Mes', 'Fecha Op.', 'Pedido', 'Contenedor', 'Placa', 'Cliente', 'Concepto', 'Cantidad', 'Unidad', 'H. Inicio', 'H. Fin', 'Duración', 'Vlr. Unitario', 'Vlr. Total']];
            const detailBody = liquidationData.map(row => [
                format(new Date(row.fecha), 'MMMM', { locale: es }),
                format(new Date(row.fecha), 'dd/MM/yy'),
                row.pedidoSislog,
                row.contenedor,
                row.placa,
                row.cliente,
                row.conceptoLiquidado,
                row.cantidadConcepto === -1 ? 'Pendiente' : row.cantidadConcepto.toFixed(2),
                row.unidadMedidaConcepto,
                row.horaInicio,
                row.horaFin,
                formatDuration(row.totalDurationMinutes),
                row.valorUnitario.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }),
                row.valorTotalConcepto.toLocaleString('es-CO', { style: 'currency', currency: 'COP' })
            ]);
            
            autoTable(doc, {
                startY: margin + 15,
                head: detailHead,
                body: detailBody,
                theme: 'grid',
                styles: { fontSize: 7, cellPadding: 1 },
                headStyles: { fillColor: [33, 150, 243] }
            });
            
            const lastTableY = (doc as any).lastAutoTable.finalY;
            autoTable(doc, {
                startY: lastTableY + 10,
                head: [['Resumen de Conceptos Liquidados']],
                theme: 'grid',
                headStyles: { fontStyle: 'bold', halign: 'center', fillColor: [33, 150, 243] }
            });
            
            const summaryHead = [['Item', 'Concepto', 'Total Cantidad', 'Vlr. Unitario', 'Vlr. Total']];
            const summaryBody = conceptSummary.map(row => [
                row.item,
                row.name,
                row.totalCantidad.toFixed(2),
                row.valorUnitario.toLocaleString('es-CO', { style: 'currency', currency: 'COP' }),
                row.totalValor.toLocaleString('es-CO', { style: 'currency', currency: 'COP' })
            ]);
            const summaryFoot = [[
                { content: 'TOTAL GENERAL:', colSpan: 4, styles: { halign: 'right', fontStyle: 'bold' } },
                { content: totalLiquidacion.toLocaleString('es-CO', { style: 'currency', currency: 'COP' }), styles: { halign: 'right', fontStyle: 'bold' } }
            ]];
            
            autoTable(doc, {
                startY: (doc as any).lastAutoTable.finalY,
                head: summaryHead,
                body: summaryBody,
                foot: summaryFoot,
                theme: 'grid',
                styles: { fontSize: 8 },
                headStyles: { fillColor: [33, 150, 243] }
            });
        }
    
        const reportName = type === 'productivity' ? 'Productividad_Cuadrilla' : 'Liquidacion_Cuadrilla';
        doc.save(`Reporte_${reportName}_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    };
    
    const handleOpenNoveltyDialog = (row: CrewPerformanceReportRow) => {
        setSelectedRowForNovelty(row);
        noveltyForm.reset({ type: '', downtimeMinutes: 0 });
        setIsNoveltyDialogOpen(true);
    };
    
    const onNoveltySubmit: SubmitHandler<NoveltyFormValues> = async (data) => {
        if (!selectedRowForNovelty || !user || !displayName) return;
        setIsSubmittingNovelty(true);
    
        const noveltyData = {
            operationId: selectedRowForNovelty.submissionId,
            type: data.type.toUpperCase(),
            downtimeMinutes: data.downtimeMinutes,
            createdBy: { uid: user.uid, displayName: displayName }
        };
    
        const result = await addNoveltyToOperation(noveltyData);
        if (result.success && result.novelty) {
            toast({ title: 'Éxito', description: result.message });
            setReportData(prevData => prevData.map(row => {
                if (row.id === selectedRowForNovelty.id) {
                    const updatedNovelties = [...row.novelties, result.novelty!];
                    let downtimeMinutes = 0;
                    if (row.aplicaCuadrilla === 'si') {
                        downtimeMinutes = updatedNovelties
                            .reduce((sum, n) => sum + n.downtimeMinutes, 0);
                    }
                    const newOperationalDuration = row.totalDurationMinutes !== null ? row.totalDurationMinutes - downtimeMinutes : null;
                    return { ...row, novelties: updatedNovelties, operationalDurationMinutes: newOperationalDuration };
                }
                return row;
            }));
             getStandardNoveltyTypes().then(setStandardNoveltyTypes);
            setIsNoveltyDialogOpen(false);
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.message });
        }
        setIsSubmittingNovelty(false);
    };
    
    const handleDeleteNoveltyConfirm = async () => {
        if (!noveltyToDelete) return;

        setIsDeletingNovelty(true);
        const result = await deleteNovelty(noveltyToDelete.noveltyId);

        if (result.success) {
            toast({ title: 'Éxito', description: result.message });
            setReportData(prevData => prevData.map(row => {
                if (row.id === noveltyToDelete.rowId) {
                    const updatedNovelties = row.novelties.filter(n => n.id !== noveltyToDelete.noveltyId);
                    let downtimeMinutes = 0;
                     if (row.aplicaCuadrilla === 'si') {
                        downtimeMinutes = updatedNovelties
                            .reduce((sum, n) => sum + n.downtimeMinutes, 0);
                    }
                    const newOperationalDuration = row.totalDurationMinutes !== null ? row.totalDurationMinutes - downtimeMinutes : null;
                    return { ...row, novelties: updatedNovelties, operationalDurationMinutes: newOperationalDuration };
                }
                return row;
            }));
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.message });
        }
        setIsDeletingNovelty(false);
        setNoveltyToDelete(null);
    };

    const handleOpenLegalizeDialog = (row: CrewPerformanceReportRow) => {
        setRowToLegalize(row);
        legalizeForm.reset({
          totalPesoBrutoKg: row.kilos > 0 ? row.kilos : 0,
        });
        setIsLegalizeDialogOpen(true);
    };
    
    const onLegalizeSubmit: SubmitHandler<LegalizeFormValues> = async (data) => {
        if (!rowToLegalize) return;
        setIsLegalizing(true);
        const result = await legalizeWeights(rowToLegalize.submissionId, data.totalPesoBrutoKg);
        if (result.success) {
            toast({ title: "Éxito", description: result.message });
            await handleSearch();
            setIsLegalizeDialogOpen(false);
        } else {
            toast({ variant: "destructive", title: "Error", description: result.message });
        }
        setIsLegalizing(false);
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
            <div className="max-w-screen-2xl mx-auto">
                <header className="mb-8">
                    <div className="relative flex items-center justify-center text-center">
                         <Button variant="ghost" size="icon" className="absolute left-0 top-1/2 -translate-y-1/2" onClick={() => router.push('/')}>
                            <ArrowLeft className="h-6 w-6" />
                        </Button>
                        <div>
                            <div className="flex items-center justify-center gap-2">
                                <FileSpreadsheet className="h-8 w-8 text-primary" />
                                <h1 className="text-2xl font-bold text-primary">Informe de Productividad y Liquidación</h1>
                            </div>
                             <p className="text-sm text-gray-500">Analice el rendimiento operativo y liquide los conceptos de cuadrilla.</p>
                        </div>
                    </div>
                </header>

                <Card>
                    <CardHeader>
                         <div className='flex justify-between items-center flex-wrap gap-4'>
                            <div>
                                <CardTitle>Filtros del Reporte</CardTitle>
                                <CardDescription>Seleccione los filtros para generar los informes.</CardDescription>
                            </div>
                            <div className="flex gap-2">
                                <Button asChild variant="secondary">
                                    <Link href="/operaciones-manuales">
                                        <Edit className="mr-2 h-4 w-4" />
                                        Gestionar Operaciones Manuales
                                    </Link>
                                </Button>
                                <Button asChild variant="outline">
                                    <Link href="/gestion-estandares">
                                        <Settings className="mr-2 h-4 w-4" />
                                        Gestionar Estándares
                                    </Link>
                                </Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 items-end">
                             <div className="space-y-2">
                                <Label>Rango de Fechas</Label>
                                <Popover>
                                    <PopoverTrigger asChild><Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !dateRange && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4" />{dateRange?.from ? (dateRange.to ? (<>{format(dateRange.from, "LLL dd, y", { locale: es })} - {format(dateRange.to, "LLL dd, y", { locale: es })}</>) : (format(dateRange.from, "LLL dd, y", { locale: es }))) : (<span>Seleccione un rango</span>)}</Button></PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start"><Calendar initialFocus mode="range" defaultMonth={dateRange?.from} selected={dateRange} onSelect={setDateRange} numberOfMonths={2} locale={es} /></PopoverContent>
                                </Popover>
                            </div>
                            <div className="space-y-2">
                                <Label>Cliente(s)</Label>
                                <Dialog open={isClientDialogOpen} onOpenChange={setClientDialogOpen}>
                                    <DialogTrigger asChild><Button variant="outline" className="w-full justify-between text-left font-normal"><span className="truncate">{getSelectedClientsText()}</span><ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" /></Button></DialogTrigger>
                                    <DialogContent>
                                        <DialogHeader><DialogTitle>Seleccionar Cliente(s)</DialogTitle><DialogDescription>Deje la selección vacía para incluir a todos los clientes.</DialogDescription></DialogHeader>
                                        <Input placeholder="Buscar cliente..." value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} className="my-4" />
                                        <ScrollArea className="h-72">
                                            <div className="space-y-1">
                                                <div className="flex items-center space-x-2 rounded-md p-2 hover:bg-accent border-b"><Checkbox id="select-all-clients" checked={selectedClients.length === clients.length} onCheckedChange={(checked) => { setSelectedClients(checked ? clients.map(c => c.razonSocial) : []); }} /><Label htmlFor="select-all-clients" className="w-full cursor-pointer font-semibold">Seleccionar Todos</Label></div>
                                                {filteredClients.map((client) => (<div key={client.id} className="flex items-center space-x-2 rounded-md p-2 hover:bg-accent"><Checkbox id={`client-${client.id}`} checked={selectedClients.includes(client.razonSocial)} onCheckedChange={(checked) => { setSelectedClients(prev => checked ? [...prev, client.razonSocial] : prev.filter(s => s !== client.razonSocial) ) }} /><Label htmlFor={`client-${client.id}`} className="w-full cursor-pointer">{client.razonSocial}</Label></div>))}
                                            </div>
                                        </ScrollArea>
                                        <DialogFooter><Button onClick={() => setClientDialogOpen(false)}>Cerrar</Button></DialogFooter>
                                    </DialogContent>
                                </Dialog>
                            </div>
                             <div className="space-y-2"><Label>Operario</Label><Select value={selectedOperario} onValueChange={setSelectedOperario} disabled={isLoadingOperarios}><SelectTrigger><SelectValue placeholder="Seleccione un operario" /></SelectTrigger><SelectContent><SelectItem value="all">Todos los Operarios</SelectItem>{availableOperarios.map(op => <SelectItem key={op} value={op}>{op}</SelectItem>)}</SelectContent></Select></div>
                             <div className="space-y-2"><Label>Tipo de Operación</Label><Select value={operationType} onValueChange={setOperationType}><SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger><SelectContent><SelectItem value="all">Todos</SelectItem><SelectItem value="recepcion">Recepción</SelectItem><SelectItem value="despacho">Despacho</SelectItem></SelectContent></Select></div>
                            <div className="space-y-2"><Label>Tipo de Producto</Label><Select value={productType} onValueChange={setProductType}><SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger><SelectContent><SelectItem value="all">Todos</SelectItem><SelectItem value="fijo">Peso Fijo</SelectItem><SelectItem value="variable">Peso Variable</SelectItem></SelectContent></Select></div>
                             <div className="space-y-2"><Label>Concepto Liquidación</Label>
                                <Dialog open={isConceptDialogOpen} onOpenChange={setIsConceptDialogOpen}>
                                    <DialogTrigger asChild><Button variant="outline" className="w-full justify-between text-left font-normal"><span className="truncate">{getSelectedConceptsText()}</span><ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" /></Button></DialogTrigger>
                                    <DialogContent>
                                        <DialogHeader><DialogTitle>Seleccionar Concepto(s)</DialogTitle><DialogDescription>Deje la selección vacía para incluir a todos los conceptos.</DialogDescription></DialogHeader>
                                        <Input placeholder="Buscar concepto..." value={conceptSearch} onChange={(e) => setConceptSearch(e.target.value)} className="my-4" />
                                        <ScrollArea className="h-72">
                                            <div className="space-y-1">
                                                <div className="flex items-center space-x-2 rounded-md p-2 hover:bg-accent border-b"><Checkbox id="select-all-concepts" checked={selectedConcepts.length === [...new Set(allBillingConcepts.map(c => c.conceptName))].length} onCheckedChange={(checked) => { setSelectedConcepts(checked ? [...new Set(allBillingConcepts.map(c => c.conceptName))] : []); }} /><Label htmlFor="select-all-concepts" className="w-full cursor-pointer font-semibold">Seleccionar Todos</Label></div>
                                                {filteredConcepts.map((conceptName) => (<div key={conceptName} className="flex items-center space-x-2 rounded-md p-2 hover:bg-accent"><Checkbox id={`concept-${conceptName}`} checked={selectedConcepts.includes(conceptName)} onCheckedChange={(checked) => { setSelectedConcepts(prev => checked ? [...prev, conceptName] : prev.filter(s => s !== conceptName) ) }} /><Label htmlFor={`concept-${conceptName}`} className="w-full cursor-pointer">{conceptName}</Label></div>))}
                                            </div>
                                        </ScrollArea>
                                        <DialogFooter><Button onClick={() => setIsConceptDialogOpen(false)}>Cerrar</Button></DialogFooter>
                                    </DialogContent>
                                </Dialog>
                            </div>
                            <div className="space-y-2"><Label>Operaciones de Cuadrilla</Label><Select value={cuadrillaFilter} onValueChange={setCuadrillaFilter as (value: 'con' | 'sin' | 'todas') => void}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="todas">Todas las Operaciones</SelectItem><SelectItem value="con">Solo con Cuadrilla</SelectItem><SelectItem value="sin">Solo sin Cuadrilla</SelectItem></SelectContent></Select></div>
                            <div className="flex flex-col space-y-2 self-end pb-2">
                                <div className="flex items-center space-x-2">
                                    <Checkbox id="filter-pending" checked={filterPending} onCheckedChange={(checked) => setFilterPending(checked as boolean)} />
                                    <Label htmlFor="filter-pending" className="cursor-pointer text-sm font-normal">Mostrar solo pendientes P. Bruto</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <Checkbox id="filter-lento" checked={filterLento} onCheckedChange={(checked) => setFilterLento(checked as boolean)} />
                                    <Label htmlFor="filter-lento" className="cursor-pointer text-sm font-normal">Mostrar solo para justificar (Lento)</Label>
                                </div>
                            </div>
                            <div className="flex gap-2 xl:col-span-4"><Button onClick={() => handleSearch()} className="w-full" disabled={isLoading}>{isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}Generar</Button><Button onClick={handleClear} variant="outline" className="w-full"><XCircle className="mr-2 h-4 w-4" />Limpiar</Button></div>
                        </div>
                    </CardContent>
                </Card>

                 <Card className="mt-6">
                    <CardHeader>
                        <CardTitle>Resultados del Informe</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Tabs defaultValue="productivity" className="w-full">
                            <TabsList className="grid w-full grid-cols-2">
                                <TabsTrigger value="productivity"><Activity className="mr-2 h-4 w-4" />Análisis de Productividad</TabsTrigger>
                                <TabsTrigger value="settlement"><DollarSign className="mr-2 h-4 w-4" />Liquidación de Cuadrilla</TabsTrigger>
                            </TabsList>
                            <TabsContent value="productivity" className="pt-4">
                                <div className="flex justify-end gap-2 mb-4">
                                    <Button onClick={() => handleExportExcel('productivity')} disabled={isLoading || filteredReportData.length === 0} variant="outline" size="sm">
                                        <File className="mr-2 h-4 w-4" /> Exportar a Excel
                                    </Button>
                                    <Button onClick={() => handleExportPDF('productivity')} disabled={isLoading || filteredReportData.length === 0} variant="outline" size="sm">
                                        <FileDown className="mr-2 h-4 w-4" /> Exportar a PDF
                                    </Button>
                                </div>
                                 <div className="relative">
                                     <ScrollArea className="w-full whitespace-nowrap rounded-md border">
                                        <ScrollAreaViewport ref={scrollViewportRef} className="outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
                                            <Table><TableHeader><TableRow>
                                                <TableHead>Fecha Op.</TableHead>
                                                <TableHead>Fecha Creación</TableHead>
                                                <TableHead>Operario</TableHead>
                                                <TableHead>Cliente</TableHead>
                                                <TableHead>Tipo Op.</TableHead>
                                                <TableHead>Tipo Prod.</TableHead>
                                                <TableHead>Pedido</TableHead>
                                                <TableHead>No. Contenedor</TableHead>
                                                <TableHead>Placa</TableHead>
                                                <TableHead>Concepto</TableHead>
                                                <TableHead>Hora Inicio</TableHead>
                                                <TableHead>Hora Fin</TableHead>
                                                <TableHead>Cant.</TableHead>
                                                <TableHead>Dur. Total</TableHead>
                                                <TableHead>T. Operativo</TableHead>
                                                <TableHead>Novedades</TableHead>
                                                <TableHead>Productividad</TableHead>
                                                <TableHead className="text-right sticky right-0 bg-background/95 backdrop-blur-sm z-10">Acciones</TableHead>
                                            </TableRow></TableHeader>
                                                <TableBody>
                                                    {isLoading ? (<TableRow><TableCell colSpan={18}><Skeleton className="h-20 w-full" /></TableCell></TableRow>) : displayedData.length > 0 ? (
                                                        displayedData.map((row) => {
                                                            const indicator = getPerformanceIndicator(row);
                                                            const isPending = row.cantidadConcepto === -1;
                                                            return (
                                                                <TableRow key={row.id}>
                                                                    <TableCell className="text-xs">{format(new Date(row.fecha), 'dd/MM/yy')}</TableCell>
                                                                    <TableCell className="text-xs">{format(parseISO(row.createdAt), 'dd/MM/yy HH:mm')}</TableCell>
                                                                    <TableCell className="text-xs">{row.operario}</TableCell>
                                                                    <TableCell className="text-xs max-w-[150px] truncate" title={row.cliente}>{row.cliente}</TableCell>
                                                                    <TableCell className="text-xs">{row.tipoOperacion}</TableCell>
                                                                    <TableCell className="text-xs">{row.tipoProducto}</TableCell>
                                                                    <TableCell className="text-xs">{row.pedidoSislog}</TableCell>
                                                                    <TableCell className="text-xs">{row.contenedor}</TableCell>
                                                                    <TableCell className="text-xs">{row.placa}</TableCell>
                                                                    <TableCell className="text-xs">{row.conceptoLiquidado}</TableCell>
                                                                    <TableCell className="text-xs">{row.horaInicio}</TableCell>
                                                                    <TableCell className="text-xs">{row.horaFin}</TableCell>
                                                                    <TableCell className="text-xs text-right font-mono">
                                                                        {isPending ? (
                                                                            <Badge className="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-200">
                                                                                <ClockIcon className="mr-1.5 h-3 w-3" />
                                                                                Pendiente
                                                                            </Badge>
                                                                        ) : (
                                                                            <span>{row.cantidadConcepto > 0 ? row.cantidadConcepto.toFixed(2) : 'N/A'}</span>
                                                                        )}
                                                                    </TableCell><TableCell className="text-xs text-right font-medium">{formatDuration(row.totalDurationMinutes)}</TableCell><TableCell className="text-xs text-right font-medium">{formatDuration(row.operationalDurationMinutes)}</TableCell>
                                                                    <TableCell className="text-xs max-w-[150px]">
                                                                        <div className="flex flex-wrap gap-1">
                                                                            {row.novelties.map(n => (
                                                                                <Badge key={n.id} variant="secondary" className="font-normal">
                                                                                    {n.type}: {n.downtimeMinutes} min
                                                                                    <button onClick={() => setNoveltyToDelete({ rowId: row.id, noveltyId: n.id! })} className="ml-1 rounded-full p-0.5 hover:bg-destructive/20 text-destructive"><X className="h-3 w-3"/></button>
                                                                                </Badge>
                                                                            ))}
                                                                        </div>
                                                                    </TableCell>
                                                                    <TableCell className="text-xs text-right font-semibold">
                                                                        <Badge className={cn("flex items-center gap-1.5", indicator.className)}>
                                                                            <indicator.icon className="h-3 w-3" />
                                                                            {indicator.text}
                                                                        </Badge>
                                                                    </TableCell>
                                                                    <TableCell className="text-right sticky right-0 bg-background/95 backdrop-blur-sm z-10">
                                                                        <div className="flex items-center justify-end gap-2">
                                                                            {isPending && (
                                                                                <Button size="sm" onClick={() => handleOpenLegalizeDialog(row)} className="bg-primary hover:bg-primary/90 text-primary-foreground h-8">
                                                                                    <Edit2 className="mr-2 h-4 w-4"/>Legalizar
                                                                                </Button>
                                                                            )}
                                                                             {indicator.text === 'Lento' && (
                                                                                <Button variant="secondary" size="sm" onClick={() => handleOpenNoveltyDialog(row)} className="h-8">
                                                                                    <PlusCircle className="mr-2 h-4 w-4"/>Novedad
                                                                                </Button>
                                                                            )}
                                                                        </div>
                                                                    </TableCell>
                                                                </TableRow>
                                                            )})
                                                    ) : (<EmptyState searched={searched} title="No se encontraron operaciones" description="Use los filtros para generar un reporte de productividad." />)}
                                                </TableBody>
                                            </Table>
                                        </ScrollAreaViewport>
                                        <ScrollBar orientation="horizontal" />
                                     </ScrollArea>
                                     <div className="absolute top-1/2 -translate-y-1/2 flex justify-between w-full pointer-events-none">
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            className={cn("pointer-events-auto rounded-full h-8 w-8 -ml-4", canScrollLeft ? "opacity-100" : "opacity-0")}
                                            onClick={() => handleScroll('left')}
                                            aria-label="Scroll left"
                                        >
                                            <ChevronLeft className="h-5 w-5" />
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            className={cn("pointer-events-auto rounded-full h-8 w-8 -mr-4", canScrollRight ? "opacity-100" : "opacity-0")}
                                            onClick={() => handleScroll('right')}
                                            aria-label="Scroll right"
                                        >
                                            <ChevronRight className="h-5 w-5" />
                                        </Button>
                                    </div>
                                 </div>
                                 <div className="flex items-center justify-between space-x-2 py-4">
                                    <div className="flex-1 text-sm text-muted-foreground">{filteredReportData.length} operaciones mostradas.</div>
                                    <div className="flex items-center space-x-2"><p className="text-sm font-medium">Filas por página</p><Select value={`${itemsPerPage}`} onValueChange={(value) => { setItemsPerPage(Number(value)); setCurrentPage(1); }}><SelectTrigger className="h-8 w-[70px]"><SelectValue placeholder={itemsPerPage} /></SelectTrigger><SelectContent side="top">{[10, 20, 50, 100].map((pageSize) => (<SelectItem key={pageSize} value={`${pageSize}`}>{pageSize}</SelectItem>))}</SelectContent></Select></div>
                                    <div className="flex w-[100px] items-center justify-center text-sm font-medium">Página {currentPage} de {totalPages}</div>
                                    <div className="flex items-center space-x-2"><Button variant="outline" size="sm" onClick={() => setCurrentPage((prev) => prev - 1)} disabled={currentPage === 1}>Anterior</Button><Button variant="outline" size="sm" onClick={() => setCurrentPage((prev) => prev + 1)} disabled={currentPage === totalPages || totalPages === 0}>Siguiente</Button></div>
                                </div>
                            </TabsContent>
                            <TabsContent value="settlement" className="pt-4">
                                 <div className="flex justify-end gap-2 mb-4">
                                    <Button onClick={() => handleExportExcel('settlement')} disabled={isLoading || liquidationData.length === 0} variant="outline" size="sm">
                                        <File className="mr-2 h-4 w-4" /> Exportar a Excel
                                    </Button>
                                    <Button onClick={() => handleExportPDF('settlement')} disabled={isLoading || liquidationData.length === 0} variant="outline" size="sm">
                                        <FileDown className="mr-2 h-4 w-4" /> Exportar a PDF
                                    </Button>
                                </div>
                                 <div className="w-full overflow-x-auto rounded-md border">
                                    <Table>
                                        <TableHeader><TableRow>
                                            <TableHead>Mes</TableHead>
                                            <TableHead>Fecha Op.</TableHead>
                                            <TableHead>Pedido</TableHead>
                                            <TableHead>Contenedor</TableHead>
                                            <TableHead>Placa</TableHead>
                                            <TableHead>Cliente</TableHead>
                                            <TableHead>Concepto</TableHead>
                                            <TableHead>Cantidad</TableHead>
                                            <TableHead>Unidad</TableHead>
                                            <TableHead>H. Inicio</TableHead>
                                            <TableHead>H. Fin</TableHead>
                                            <TableHead>Duración</TableHead>
                                            <TableHead>Vlr. Unitario</TableHead>
                                            <TableHead>Vlr. Total</TableHead>
                                        </TableRow></TableHeader>
                                        <TableBody>
                                            {isLoading ? (<TableRow><TableCell colSpan={14}><Skeleton className="h-20 w-full" /></TableCell></TableRow>) : displayedLiquidationData.length > 0 ? (
                                                displayedLiquidationData.map((row) => {
                                                    const isPending = row.cantidadConcepto === -1;
                                                    return (
                                                        <TableRow key={row.id}>
                                                            <TableCell className="text-xs capitalize">{format(new Date(row.fecha), 'MMMM', { locale: es })}</TableCell>
                                                            <TableCell className="text-xs">{format(new Date(row.fecha), 'dd/MM/yy')}</TableCell>
                                                            <TableCell className="text-xs">{row.pedidoSislog}</TableCell>
                                                            <TableCell className="text-xs">{row.contenedor}</TableCell>
                                                            <TableCell className="text-xs">{row.placa}</TableCell>
                                                            <TableCell className="text-xs max-w-[150px] truncate" title={row.cliente}>{row.cliente}</TableCell>
                                                            <TableCell className="text-xs font-semibold">{row.conceptoLiquidado}</TableCell>
                                                            <TableCell className="text-xs font-mono text-right">{isPending ? 'Pendiente' : row.cantidadConcepto.toFixed(2)}</TableCell>
                                                            <TableCell className="text-xs">{isPending ? '' : row.unidadMedidaConcepto}</TableCell>
                                                            <TableCell className="text-xs">{row.horaInicio}</TableCell>
                                                            <TableCell className="text-xs">{row.horaFin}</TableCell>
                                                            <TableCell className="text-xs">{formatDuration(row.totalDurationMinutes)}</TableCell>
                                                            <TableCell className="text-xs font-mono text-right">{isPending ? 'N/A' : row.valorUnitario.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}</TableCell>
                                                            <TableCell className="text-xs font-mono text-right">{isPending ? 'N/A' : row.valorTotalConcepto.toLocaleString('es-CO', { style: 'currency', currency: 'COP' })}</TableCell>
                                                        </TableRow>
                                                    )
                                                })
                                            ) : (<EmptyState searched={searched} title="No se encontraron liquidaciones" description="No hay operaciones de cuadrilla con conceptos liquidables para los filtros seleccionados." />)}
                                            {!isLoading && liquidationData.length > 0 && (<TableRow className="font-bold bg-muted hover:bg-muted"><TableCell colSpan={13} className="text-right">TOTAL GENERAL LIQUIDACIÓN</TableCell><TableCell className="text-right">{totalLiquidacion.toLocaleString('es-CO', { style: 'currency', currency: 'COP' })}</TableCell></TableRow>)}
                                        </TableBody>
                                    </Table>
                                 </div>
                                  <div className="flex items-center justify-between space-x-2 py-4">
                                    <div className="flex-1 text-sm text-muted-foreground">{liquidationData.length} conceptos a liquidar.</div>
                                    <div className="flex items-center space-x-2"><p className="text-sm font-medium">Filas por página</p><Select value={`${itemsPerPage}`} onValueChange={(value) => { setItemsPerPage(Number(value)); setCurrentPage(1); }}><SelectTrigger className="h-8 w-[70px]"><SelectValue placeholder={itemsPerPage} /></SelectTrigger><SelectContent side="top">{[10, 20, 50, 100].map((pageSize) => (<SelectItem key={pageSize} value={`${pageSize}`}>{pageSize}</SelectItem>))}</SelectContent></Select></div>
                                    <div className="flex w-[100px] items-center justify-center text-sm font-medium">Página {currentPage} de {liquidationTotalPages}</div>
                                    <div className="flex items-center space-x-2"><Button variant="outline" size="sm" onClick={() => setCurrentPage((prev) => prev - 1)} disabled={currentPage === 1}>Anterior</Button><Button variant="outline" size="sm" onClick={() => setCurrentPage((prev) => prev + 1)} disabled={currentPage === liquidationTotalPages || liquidationTotalPages === 0}>Siguiente</Button></div>
                                </div>
                            </TabsContent>
                        </Tabs>
                    </CardContent>
                </Card>
            </div>
            
            <Dialog open={isNoveltyDialogOpen} onOpenChange={setIsNoveltyDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Registrar Novedad / Justificación</DialogTitle>
                        <DialogDescription>
                            Registre un evento para la operación del pedido <strong>{selectedRowForNovelty?.pedidoSislog}</strong>.
                        </DialogDescription>
                    </DialogHeader>
                     {selectedRowForNovelty && (
                        <Alert variant={selectedRowForNovelty.aplicaCuadrilla === 'si' ? "default" : "destructive"} className={cn(selectedRowForNovelty.aplicaCuadrilla === 'si' ? 'bg-blue-50 border-blue-200' : 'bg-yellow-50 border-yellow-200')}>
                            <Info className="h-4 w-4" />
                            <AlertTitle className={cn(selectedRowForNovelty.aplicaCuadrilla === 'si' ? 'text-blue-800' : 'text-yellow-800')}>
                                {selectedRowForNovelty.aplicaCuadrilla === 'si' ? 'Justificación de Productividad' : 'Novedad Informativa'}
                            </AlertTitle>
                            <AlertDescription className={cn(selectedRowForNovelty.aplicaCuadrilla === 'si' ? 'text-blue-700' : 'text-yellow-700')}>
                                {selectedRowForNovelty.aplicaCuadrilla === 'si' 
                                ? 'Los minutos ingresados se descontarán del tiempo total de la operación.'
                                : 'Los minutos ingresados no afectarán el cálculo de productividad de la cuadrilla.'}
                            </AlertDescription>
                        </Alert>
                    )}
                    <Form {...noveltyForm}>
                        <form onSubmit={noveltyForm.handleSubmit(onNoveltySubmit)} className="space-y-4 pt-4">
                             <FormField
                                control={noveltyForm.control}
                                name="type"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Tipo de Novedad</FormLabel>
                                         <div className="flex gap-2">
                                            <Input
                                                {...field}
                                                placeholder="Escriba o seleccione..."
                                                value={field.value}
                                                onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                                                className="flex-grow"
                                            />
                                            <Button type="button" variant="outline" onClick={() => setIsNoveltySelectorOpen(true)}>
                                                Seleccionar
                                            </Button>
                                        </div>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                             <FormField control={noveltyForm.control} name="downtimeMinutes" render={({ field }) => (<FormItem><FormLabel>Minutos de Inactividad</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormDescription>Si la novedad no implica una demora, ingrese 0.</FormDescription><FormMessage /></FormItem>)}/>
                             
                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={() => setIsNoveltyDialogOpen(false)}>Cancelar</Button>
                                <Button type="submit" disabled={isSubmittingNovelty}>
                                    {isSubmittingNovelty && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Agregar Novedad
                                </Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>

            <Dialog open={isLegalizeDialogOpen} onOpenChange={setIsLegalizeDialogOpen}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Legalizar Peso Bruto del Pedido {rowToLegalize?.pedidoSislog}</DialogTitle>
                  <DialogDescription>
                    Ingrese el peso bruto total de la operación para este formato.
                  </DialogDescription>
                </DialogHeader>
                <Form {...legalizeForm}>
                  <form onSubmit={legalizeForm.handleSubmit(onLegalizeSubmit)} className="space-y-4 pt-4">
                    <FormField
                      control={legalizeForm.control}
                      name="totalPesoBrutoKg"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Total Peso Bruto (kg)</FormLabel>
                          <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setIsLegalizeDialogOpen(false)}>Cancelar</Button>
                      <Button type="submit" disabled={isLegalizing}>
                        {isLegalizing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Guardar Peso
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>

            <AlertDialog open={!!noveltyToDelete} onOpenChange={() => setNoveltyToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Está seguro?</AlertDialogTitle>
                        <AlertDialogDesc>
                           Esta acción eliminará la novedad seleccionada de forma permanente.
                        </AlertDialogDesc>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction 
                            onClick={handleDeleteNoveltyConfirm} 
                            disabled={isDeletingNovelty}
                            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                        >
                            {isDeletingNovelty ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Sí, Eliminar Novedad
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <NoveltySelectorDialog
                open={isNoveltySelectorOpen}
                onOpenChange={setIsNoveltySelectorOpen}
                standardNoveltyTypes={standardNoveltyTypes}
                onSelect={(value) => noveltyForm.setValue('type', value, { shouldValidate: true })}
            />
        </div>
    );
}

function NoveltySelectorDialog({
    open,
    onOpenChange,
    standardNoveltyTypes,
    onSelect,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    standardNoveltyTypes: StandardNoveltyType[];
    onSelect: (value: string) => void;
}) {
    const [search, setSearch] = useState("");

    const filteredNovelties = useMemo(() => {
        if (!search) return standardNoveltyTypes;
        return standardNoveltyTypes.filter(n => n.name.toLowerCase().includes(search.toLowerCase()));
    }, [search, standardNoveltyTypes]);
    
    useEffect(() => {
        if (!open) setSearch("");
    }, [open]);

    const handleSelect = (value: string) => {
        onSelect(value.toUpperCase());
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Seleccionar Tipo de Novedad</DialogTitle>
                </DialogHeader>
                <div className="py-4">
                    <Input
                        placeholder="Buscar o crear novedad..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="mb-4"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && search.trim()) {
                            e.preventDefault();
                            handleSelect(search);
                          }
                        }}
                    />
                    <ScrollArea className="h-60">
                        {filteredNovelties.length > 0 ? (
                            filteredNovelties.map((novelty) => (
                                <Button
                                    key={novelty.id}
                                    variant="ghost"
                                    className="w-full justify-start"
                                    onClick={() => handleSelect(novelty.name)}
                                >
                                    {novelty.name}
                                </Button>
                            ))
                        ) : (
                            <div className="p-4 text-center text-sm text-muted-foreground">
                                No se encontraron coincidencias.
                            </div>
                        )}
                    </ScrollArea>
                </div>
                 <DialogFooter>
                    <Button
                        type="button"
                        onClick={() => handleSelect(search)}
                        disabled={!search.trim()}
                    >
                        Crear y usar "{search.trim().toUpperCase()}"
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}


    
    








