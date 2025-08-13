

"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, SubmitHandler, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import Link from 'next/link';
import { DateRange } from 'react-day-picker';
import { format, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

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

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea, ScrollAreaViewport, ScrollBar } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { ArrowLeft, Search, XCircle, Loader2, CalendarIcon, File, FileDown, FolderSearch, ShieldAlert, TrendingUp, Circle, Settings, ChevronsUpDown, AlertCircle, PlusCircle, X, Edit2, CheckCircle2, ClockIcon, AlertTriangleIcon, DollarSign, Activity, FileSpreadsheet, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge, badgeVariants } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription as AlertDialogDesc, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';


const noveltySchema = z.object({
    type: z.string().min(1, "Debe seleccionar o ingresar un tipo de novedad."),
    downtimeMinutes: z.coerce.number({invalid_type_error: "Debe ser un número"}).int("Debe ser un número entero.").min(0, "Los minutos no pueden ser negativos."),
    purpose: z.enum(['justification', 'settlement'], { required_error: 'Debe seleccionar un propósito.' }),
});

type NoveltyFormValues = z.infer<typeof noveltySchema>;

const legalizeProductSchema = z.object({
  codigo: z.string(),
  descripcion: z.string(),
  pesoBrutoKg: z.coerce.number({ required_error: 'Requerido', invalid_type_error: 'Numérico' }).min(0, '>= 0'),
  pesoNetoKg: z.coerce.number({ required_error: 'Requerido', invalid_type_error: 'Numérico' }).min(0, '>= 0'),
});

const legalizeFormSchema = z.object({
  productos: z.array(legalizeProductSchema),
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
    const { operationalDurationMinutes, totalDurationMinutes, standard, cantidadConcepto, tipoOperacion } = row;

    if (tipoOperacion !== 'Recepción' && tipoOperacion !== 'Despacho') {
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
    const [isNoveltySelectorOpen, setIsNoveltySelectorOpen] = useState(false); // New state
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
        defaultValues: { type: '', downtimeMinutes: 0, purpose: 'justification' }
    });
    
    const legalizeForm = useForm<LegalizeFormValues>({
      resolver: zodResolver(legalizeFormSchema),
      defaultValues: {
        productos: [],
      },
    });

    const { fields: legalizeFields } = useFieldArray({
      control: legalizeForm.control,
      name: 'productos',
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
        if (!conceptSearch) return allBillingConcepts.map(c => c.conceptName);
        return allBillingConcepts.map(c => c.conceptName).filter(name => name.toLowerCase().includes(conceptSearch.toLowerCase()));
    }, [conceptSearch, allBillingConcepts]);

    const liquidationData = useMemo(() => {
        return filteredReportData.filter(row => row.valorTotalConcepto > 0 || (row.aplicaCuadrilla === 'si' && (row.conceptoLiquidado === 'CARGUE' || row.conceptoLiquidado === 'DESCARGUE')));
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
                 getBillingConcepts()
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
        
        if (filterPending) {
            results = results.filter(row => row.cantidadConcepto === -1);
        }
        
        if(filterLento) {
            results = results.filter(row => getPerformanceIndicator(row).text === 'Lento');
        }

        setFilteredReportData(results);
    }, [filterPending, filterLento, reportData]);
    
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
    
    useEffect(() => {
        const el = scrollViewportRef.current;
        if (el) {
            handleCheckScroll();
            el.addEventListener('scroll', handleCheckScroll);
            window.addEventListener('resize', handleCheckScroll);
            const handleKeyDown = (e: KeyboardEvent) => {
                if (e.key === 'ArrowLeft') {
                    handleScroll('left');
                } else if (e.key === 'ArrowRight') {
                    handleScroll('right');
                }
            };
            window.addEventListener('keydown', handleKeyDown);

            return () => {
                el.removeEventListener('scroll', handleCheckScroll);
                window.removeEventListener('resize', handleCheckScroll);
                window.removeEventListener('keydown', handleKeyDown);
            };
        }
    }, [handleCheckScroll, displayedData]);

    const handleScroll = (direction: 'left' | 'right') => {
        const el = scrollViewportRef.current;
        if (el) {
            const scrollAmount = direction === 'left' ? -300 : 300;
            el.scrollBy({ left: scrollAmount, behavior: 'smooth' });
        }
    };


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
                clientNames: selectedClients.length > 0 ? selectedClients : undefined,
                cuadrillaFilter: cuadrillaFilter,
                conceptos: selectedConcepts.length > 0 ? selectedConcepts : undefined,
            };

            const results = await getCrewPerformanceReport(criteria);
            
            setReportData(results);
            
            if (results.length === 0) {
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
    }, [dateRange, selectedOperario, operationType, productType, selectedClients, cuadrillaFilter, selectedConcepts, toast]);
    
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
        if (selectedConcepts.length === 0) return "Todos los conceptos...";
        if (selectedConcepts.length === allBillingConcepts.length) return "Todos los conceptos";
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

        const optimoPercent = (summary['Óptimo'].count / totalEvaluableOperations) * 100;
        const normalPercent = (summary['Normal'].count / totalEvaluableOperations) * 100;
        const lentoPercent = (summary['Lento'].count / totalEvaluableOperations) * 100;

        let qualification = 'Regular';
        if (optimoPercent >= 80) {
            qualification = 'Excelente';
        } else if ((optimoPercent + normalPercent) >= 80) {
            qualification = 'Bueno';
        } else if (lentoPercent > 20) {
            qualification = 'Necesita Mejora';
        }

        return {
            summary,
            totalOperations: cargaDescargaData.length,
            qualification,
            totalEvaluable: totalEvaluableOperations,
        };
    }, [reportData]);

      const conceptSummary = useMemo(() => {
        if (reportData.length === 0) return null;
        
        const summary = liquidationData.reduce((acc, row) => {
            const { conceptoLiquidado, cantidadConcepto, valorUnitario, valorTotalConcepto, unidadMedidaConcepto } = row;
            if (conceptoLiquidado === 'N/A' || row.valorTotalConcepto === 0) return acc;
            if (!acc[conceptoLiquidado]) {
                const firstValidEntry = reportData.find(r => r.conceptoLiquidado === conceptoLiquidado && r.valorUnitario > 0);
                acc[conceptoLiquidado] = {
                    totalCantidad: 0,
                    totalValor: 0,
                    unidadMedida: unidadMedidaConcepto,
                    valorUnitario: firstValidEntry ? firstValidEntry.valorUnitario : 0, 
                };
            }
            if (row.productType !== 'fijo' || (row.productType === 'fijo' && row.kilos > 0)) {
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


    const handleExportExcel = (type: 'productivity' | 'settlement') => {
        if (type === 'productivity' && filteredReportData.length > 0) {
            const wb = XLSX.utils.book_new();

            // Sheet 1: Detalle
            const detailData = filteredReportData.map(row => ({
                'Fecha': format(new Date(row.fecha), 'dd/MM/yy'),
                'Operario': row.operario,
                'Cliente': row.cliente,
                'Tipo Op.': row.tipoOperacion,
                'Tipo Prod.': row.tipoProducto,
                'Pedido': row.pedidoSislog,
                'No. Contenedor': row.contenedor,
                'Placa': row.placa,
                'Concepto': row.conceptoLiquidado,
                'Hora Inicio': row.horaInicio,
                'Hora Fin': row.horaFin,
                'Cantidad (Ton)': row.cantidadConcepto === -1 ? 'Pendiente' : row.cantidadConcepto.toFixed(2),
                'Duración Total': formatDuration(row.totalDurationMinutes),
                'T. Operativo': formatDuration(row.operationalDurationMinutes),
                'Productividad': getPerformanceIndicator(row).text,
                'Novedades': row.novelties.map(n => `${n.type} (${n.downtimeMinutes} min)`).join(', '),
            }));
            const wsDetail = XLSX.utils.json_to_sheet(detailData);
            XLSX.utils.book_append_sheet(wb, wsDetail, "Detalle Productividad");

            // Sheet 2: Resumen
            if (performanceSummary) {
                const summarySheetData = [
                    ["Estado", "Cantidad de Operaciones", "% sobre Total Evaluado"],
                    ...Object.entries(performanceSummary.summary)
                        .filter(([key]) => key !== 'No Aplica' && key !== 'Sin Tiempo')
                        .map(([key, value]) => [
                            key,
                            value.count,
                            performanceSummary.totalEvaluable > 0 ? (value.count / performanceSummary.totalEvaluable * 100).toFixed(2) + '%' : '0.00%'
                        ]),
                    [],
                    ["Total Op. Evaluadas", performanceSummary.totalEvaluable],
                    ["Calificación del Periodo", performanceSummary.qualification],
                ];
                const wsSummary = XLSX.utils.aoa_to_sheet(summarySheetData);
                XLSX.utils.book_append_sheet(wb, wsSummary, "Resumen Productividad");
            }
            
            // Sheet 3: Novedades
            const noveltiesData = filteredReportData.filter(row => row.novelties.length > 0);
            if (noveltiesData.length > 0) {
                const noveltiesExport = noveltiesData.flatMap(row => row.novelties.map(n => ({
                    'Fecha': format(new Date(row.fecha), 'dd/MM/yy'),
                    'Pedido': row.pedidoSislog,
                    'Cliente': row.cliente,
                    'Novedad': n.type,
                    'Minutos': n.downtimeMinutes,
                    'Propósito': n.purpose === 'justification' ? 'Justificación' : 'Liquidación'
                })));
                const wsNovelties = XLSX.utils.json_to_sheet(noveltiesExport);
                XLSX.utils.book_append_sheet(wb, wsNovelties, "Novedades");
            } else {
                const wsNovelties = XLSX.utils.json_to_sheet([{"Mensaje": "No se registraron novedades en el periodo consultado."}]);
                XLSX.utils.book_append_sheet(wb, wsNovelties, "Novedades");
            }

            XLSX.writeFile(wb, "Reporte_Analisis_Productividad.xlsx");

        } else if (type === 'settlement' && liquidationData.length > 0) {
            const data = liquidationData.map(row => ({
                'Fecha': format(new Date(row.fecha), 'dd/MM/yy'),
                'Cliente': row.cliente,
                'Pedido': row.pedidoSislog,
                'Concepto': row.conceptoLiquidado,
                'Cantidad': row.cantidadConcepto === -1 ? 'Pendiente' : `${row.cantidadConcepto.toFixed(2)} ${row.unidadMedidaConcepto}`,
                'Valor Unitario': row.valorUnitario,
                'Valor Total': row.valorTotalConcepto,
            }));
             const totalRow = {
                'Fecha': 'TOTAL GENERAL',
                'Cliente': '', 'Pedido': '', 'Concepto': '', 'Cantidad': '', 'Valor Unitario': '',
                'Valor Total': totalLiquidacion,
            };
            const ws = XLSX.utils.json_to_sheet([...data, totalRow]);
            ws['!cols'] = [ {wch:10}, {wch:25}, {wch:12}, {wch:20}, {wch:15}, {wch:15}, {wch:15} ];
            for (let i = 2; i <= data.length + 2; i++) {
                if (ws[`F${i}`]) ws[`F${i}`].z = '"$"#,##0.00';
                if (ws[`G${i}`]) ws[`G${i}`].z = '"$"#,##0.00';
            }
            
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Liquidacion");
            XLSX.writeFile(wb, "Reporte_Liquidacion_Cuadrilla.xlsx");
        }
    };
    
    const handleExportPDF = (type: 'productivity' | 'settlement') => {
        const doc = new jsPDF({ orientation: 'landscape' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        let finalY = 15;

        const addHeader = (title: string) => {
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.text(title, pageWidth / 2, 15, { align: 'center' });
            finalY = 25;
        }

        const addFooter = () => {
             const pageCount = (doc as any).internal.getNumberOfPages();
             for (let i = 1; i <= pageCount; i++) {
                 doc.setPage(i);
                 doc.setFontSize(8);
                 doc.setTextColor(150);
                 doc.text(`Página ${i} de ${pageCount}`, pageWidth - 20, pageHeight - 10, { align: 'right' });
             }
        }

        if (type === 'productivity' && filteredReportData.length > 0) {
            addHeader("Reporte de Análisis de Productividad");
            
            // 1. Resumen
            if (performanceSummary) {
                doc.setFontSize(11);
                doc.setFont('helvetica', 'bold');
                doc.text("Resumen de Productividad (Cargue/Descargue)", 14, finalY);
                finalY += 5;
                autoTable(doc, {
                    startY: finalY,
                    head: [['Estado', 'Cantidad', '% sobre Total']],
                    body: Object.entries(performanceSummary.summary)
                        .filter(([key]) => key !== 'No Aplica' && key !== 'Sin Tiempo')
                        .map(([key, value]) => [
                            key,
                            value.count,
                            performanceSummary.totalEvaluable > 0 ? (value.count / performanceSummary.totalEvaluable * 100).toFixed(2) + '%' : '0.00%'
                        ]),
                    foot: [
                        ['Total Evaluadas', performanceSummary.totalEvaluable, ''],
                        ['Calificación', performanceSummary.qualification, '']
                    ],
                    theme: 'grid',
                    styles: { fontSize: 8 },
                    headStyles: { fillColor: '#e2e8f0', textColor: '#000' }
                });
                finalY = (doc as any).autoTable.previous.finalY + 10;
            }

            // 2. Novedades
            const noveltiesData = filteredReportData.filter(row => row.novelties.length > 0);
             if (noveltiesData.length > 0) {
                 if(finalY + 40 > pageHeight) { doc.addPage(); finalY = 15; }
                 doc.setFontSize(11);
                 doc.setFont('helvetica', 'bold');
                 doc.text("Operaciones con Novedades", 14, finalY);
                 finalY += 5;
                const noveltiesExport = noveltiesData.flatMap(row => row.novelties.map(n => [
                    format(new Date(row.fecha), 'dd/MM/yy'),
                    row.pedidoSislog,
                    row.cliente,
                    n.type,
                    n.downtimeMinutes + ' min',
                    n.purpose === 'justification' ? 'Justificación' : 'Liquidación'
                ]));
                autoTable(doc, {
                    startY: finalY,
                    head: [['Fecha', 'Pedido', 'Cliente', 'Novedad', 'Minutos', 'Propósito']],
                    body: noveltiesExport,
                    theme: 'grid',
                    styles: { fontSize: 8 }
                });
                finalY = (doc as any).autoTable.previous.finalY + 10;
            }

            // 3. Detalle
             if(finalY + 40 > pageHeight) { doc.addPage(); finalY = 15; }
             doc.setFontSize(11);
             doc.setFont('helvetica', 'bold');
             doc.text("Detalle de Operaciones", 14, finalY);
             finalY += 5;
            autoTable(doc, {
                startY: finalY,
                head: [['Fecha', 'Operario', 'Cliente', 'Tipo Op.', 'Pedido', 'Contenedor', 'Placa', 'Concepto', 'H. Inicio', 'H. Fin', 'Cant.', 'T. Operativo', 'Productividad']],
                body: filteredReportData.map(row => [
                    format(new Date(row.fecha), 'dd/MM/yy'),
                    row.operario,
                    row.cliente,
                    row.tipoOperacion,
                    row.pedidoSislog,
                    row.contenedor,
                    row.placa,
                    row.conceptoLiquidado,
                    row.horaInicio,
                    row.horaFin,
                    row.cantidadConcepto === -1 ? 'Pendiente' : row.cantidadConcepto.toFixed(2) + ' Ton',
                    formatDuration(row.operationalDurationMinutes),
                    getPerformanceIndicator(row).text,
                ]),
                styles: { fontSize: 6, cellPadding: 1 },
                headStyles: { fontSize: 6, cellPadding: 1 },
                columnStyles: { cliente: { cellWidth: 35 } }
            });
            addFooter();
            doc.save("Reporte_Analisis_Productividad.pdf");

        } else if (type === 'settlement' && liquidationData.length > 0) {
            addHeader("Reporte de Liquidación de Cuadrilla");
            autoTable(doc, {
                startY: 20,
                head: [['Fecha', 'Cliente', 'Pedido', 'Concepto', 'Cantidad', 'Vlr. Unitario', 'Vlr. Total']],
                body: liquidationData.map(row => [
                    format(new Date(row.fecha), 'dd/MM/yy'),
                    row.cliente,
                    row.pedidoSislog,
                    row.conceptoLiquidado,
                    row.cantidadConcepto === -1 ? 'Pendiente' : `${row.cantidadConcepto.toFixed(2)} ${row.unidadMedidaConcepto}`,
                    row.valorUnitario.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }),
                    row.valorTotalConcepto.toLocaleString('es-CO', { style: 'currency', currency: 'COP' }),
                ]),
                foot: [[
                    { content: 'TOTAL GENERAL', colSpan: 6, styles: { halign: 'right' } },
                    { content: totalLiquidacion.toLocaleString('es-CO', { style: 'currency', currency: 'COP' }), styles: { halign: 'right' } }
                ]]
            });
            addFooter();
            doc.save("Reporte_Liquidacion_Cuadrilla.pdf");
        }
    };

    const handleOpenNoveltyDialog = (row: CrewPerformanceReportRow) => {
        setSelectedRowForNovelty(row);
        noveltyForm.reset({ type: '', downtimeMinutes: 0, purpose: 'justification' });
        setIsNoveltyDialogOpen(true);
    };
    
    const onNoveltySubmit: SubmitHandler<NoveltyFormValues> = async (data) => {
        if (!selectedRowForNovelty || !user || !displayName) return;
        setIsSubmittingNovelty(true);
    
        const noveltyData = {
            operationId: selectedRowForNovelty.submissionId,
            type: data.type.toUpperCase(),
            downtimeMinutes: data.downtimeMinutes,
            purpose: data.purpose,
            createdBy: { uid: user.uid, displayName: displayName }
        };
    
        const result = await addNoveltyToOperation(noveltyData);
        if (result.success && result.novelty) {
            toast({ title: 'Éxito', description: result.message });
            setReportData(prevData => prevData.map(row => {
                if (row.id === selectedRowForNovelty.id) {
                    const updatedNovelties = [...row.novelties, result.novelty!];
                    const downtimeMinutes = updatedNovelties
                        .filter(n => n.purpose === 'justification')
                        .reduce((sum, n) => sum + n.downtimeMinutes, 0);
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
                    const downtimeMinutes = updatedNovelties
                        .filter(n => n.purpose === 'justification')
                        .reduce((sum, n) => sum + n.downtimeMinutes, 0);
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
            productos: row.productos.map(p => ({
                codigo: p.codigo,
                descripcion: p.descripcion,
                pesoBrutoKg: p.pesoBrutoKg || 0,
                pesoNetoKg: p.pesoNetoKg || 0,
            }))
        });
        setIsLegalizeDialogOpen(true);
    };
    
    const onLegalizeSubmit: SubmitHandler<LegalizeFormValues> = async (data) => {
        if (!rowToLegalize) return;
        setIsLegalizing(true);
        const result = await legalizeWeights(rowToLegalize.submissionId, data.productos);
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
                         <div className='flex justify-between items-center'>
                            <div>
                                <CardTitle>Filtros del Reporte</CardTitle>
                                <CardDescription>Seleccione los filtros para generar los informes.</CardDescription>
                            </div>
                            <Button asChild variant="outline">
                                <Link href="/gestion-estandares">
                                    <Settings className="mr-2 h-4 w-4" />
                                    Gestionar Estándares
                                </Link>
                            </Button>
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
                                                <div className="flex items-center space-x-2 rounded-md p-2 hover:bg-accent border-b"><Checkbox id="select-all-concepts" checked={selectedConcepts.length === allBillingConcepts.length} onCheckedChange={(checked) => { setSelectedConcepts(checked ? allBillingConcepts.map(c => c.conceptName) : []); }} /><Label htmlFor="select-all-concepts" className="w-full cursor-pointer font-semibold">Seleccionar Todos</Label></div>
                                                {filteredConcepts.map((conceptName) => (<div key={conceptName} className="flex items-center space-x-2 rounded-md p-2 hover:bg-accent"><Checkbox id={`concept-${conceptName}`} checked={selectedConcepts.includes(conceptName)} onCheckedChange={(checked) => { setSelectedConcepts(prev => checked ? [...prev, conceptName] : prev.filter(s => s !== conceptName) ) }} /><Label htmlFor={`concept-${conceptName}`} className="w-full cursor-pointer">{conceptName}</Label></div>))}
                                            </div>
                                        </ScrollArea>
                                        <DialogFooter><Button onClick={() => setIsConceptDialogOpen(false)}>Cerrar</Button></DialogFooter>
                                    </DialogContent>
                                </Dialog>
                            </div>
                            <div className="space-y-2"><Label>Operaciones de Cuadrilla</Label><Select value={cuadrillaFilter} onValueChange={setCuadrillaFilter as (value: 'con' | 'sin' | 'todas') => void}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="todas">Todas las Operaciones</SelectItem><SelectItem value="con">Solo con Cuadrilla</SelectItem><SelectItem value="sin">Solo sin Cuadrilla</SelectItem></SelectContent></Select></div>
                             <div className="flex flex-col gap-2 self-end pb-2">
                                <div className="flex items-center space-x-2">
                                    <Checkbox id="filter-pending" checked={filterPending} onCheckedChange={(checked) => setFilterPending(checked as boolean)} />
                                    <Label htmlFor="filter-pending" className="cursor-pointer text-sm font-normal">Mostrar solo pendientes P. Bruto</Label>
                                </div>
                                 <div className="flex items-center space-x-2">
                                    <Checkbox id="filter-lento" checked={filterLento} onCheckedChange={(checked) => setFilterLento(checked as boolean)} />
                                    <Label htmlFor="filter-lento" className="cursor-pointer text-sm font-normal">Mostrar solo para justificar</Label>
                                </div>
                            </div>
                            <div className="flex gap-2 xl:col-span-4"><Button onClick={handleSearch} className="w-full" disabled={isLoading}>{isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}Generar</Button><Button onClick={handleClear} variant="outline" className="w-full"><XCircle className="mr-2 h-4 w-4" />Limpiar</Button></div>
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
                                        <ScrollAreaViewport ref={scrollViewportRef}>
                                            <Table><TableHeader><TableRow>
                                                <TableHead>Fecha</TableHead>
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
                                                    {isLoading ? (<TableRow><TableCell colSpan={17}><Skeleton className="h-20 w-full" /></TableCell></TableRow>) : displayedData.length > 0 ? (
                                                        displayedData.map((row) => {
                                                            const indicator = getPerformanceIndicator(row);
                                                            const isPending = row.cantidadConcepto === -1;
                                                            return (
                                                                <TableRow key={row.id}>
                                                                    <TableCell className="text-xs">{format(new Date(row.fecha), 'dd/MM/yy')}</TableCell>
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
                                        <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Cliente</TableHead><TableHead>Pedido</TableHead><TableHead>Concepto</TableHead><TableHead>Cant.</TableHead><TableHead>Vlr. Unitario</TableHead><TableHead>Vlr. Total</TableHead></TableRow></TableHeader>
                                        <TableBody>
                                            {isLoading ? (<TableRow><TableCell colSpan={7}><Skeleton className="h-20 w-full" /></TableCell></TableRow>) : displayedLiquidationData.length > 0 ? (
                                                displayedLiquidationData.map((row) => {
                                                    const isPending = row.cantidadConcepto === -1;
                                                    return (
                                                        <TableRow key={row.id}>
                                                            <TableCell className="text-xs">{format(new Date(row.fecha), 'dd/MM/yy')}</TableCell>
                                                            <TableCell className="text-xs max-w-[150px] truncate" title={row.cliente}>{row.cliente}</TableCell>
                                                            <TableCell className="text-xs">{row.pedidoSislog}</TableCell>
                                                            <TableCell className="text-xs font-semibold">{row.conceptoLiquidado}</TableCell>
                                                            <TableCell className="text-xs font-mono">{isPending ? 'Pendiente' : `${row.cantidadConcepto.toFixed(2)} ${row.unidadMedidaConcepto}`}</TableCell>
                                                            <TableCell className="text-xs font-mono">{isPending ? 'N/A' : row.valorUnitario.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}</TableCell>
                                                            <TableCell className="text-xs font-mono">{isPending ? 'N/A' : row.valorTotalConcepto.toLocaleString('es-CO', { style: 'currency', currency: 'COP' })}</TableCell>
                                                        </TableRow>
                                                    )
                                                })
                                            ) : (<EmptyState searched={searched} title="No se encontraron liquidaciones" description="No hay operaciones de cuadrilla con conceptos liquidables para los filtros seleccionados." />)}
                                            {!isLoading && liquidationData.length > 0 && (<TableRow className="font-bold bg-muted hover:bg-muted"><TableCell colSpan={6} className="text-right">TOTAL GENERAL LIQUIDACIÓN</TableCell><TableCell className="text-right">{totalLiquidacion.toLocaleString('es-CO', { style: 'currency', currency: 'COP' })}</TableCell></TableRow>)}
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
                    <Form {...noveltyForm}>
                        <form onSubmit={noveltyForm.handleSubmit(onNoveltySubmit)} className="space-y-4 pt-4">
                            <FormField
                                control={noveltyForm.control}
                                name="type"
                                render={({ field }) => (
                                    <FormItem className="flex flex-col">
                                        <FormLabel>Tipo de Novedad</FormLabel>
                                         <Button type="button" variant="outline" className="w-full justify-between" onClick={() => setIsNoveltySelectorOpen(true)}>
                                            {field.value || "Seleccione o escriba una novedad..."}
                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={noveltyForm.control}
                                name="purpose"
                                render={({ field }) => (
                                    <FormItem className="space-y-3">
                                        <FormLabel>Propósito de la Novedad</FormLabel>
                                        <FormControl>
                                            <Select onValueChange={field.onChange} value={field.value}>
                                                <SelectTrigger><SelectValue/></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="justification">Justificar Demora (Afecta Productividad)</SelectItem>
                                                    <SelectItem value="settlement">Novedad para Liquidación (No afecta Productividad)</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </FormControl>
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

            <NoveltySelectorDialog
                open={isNoveltySelectorOpen}
                onOpenChange={setIsNoveltySelectorOpen}
                standardNoveltyTypes={standardNoveltyTypes}
                onSelect={(value) => noveltyForm.setValue('type', value, { shouldValidate: true })}
            />

            <Dialog open={isLegalizeDialogOpen} onOpenChange={setIsLegalizeDialogOpen}>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Legalizar Pesos del Pedido {rowToLegalize?.pedidoSislog}</DialogTitle>
                  <DialogDescription>
                    Ingrese el peso bruto y neto para cada producto del formato.
                  </DialogDescription>
                </DialogHeader>
                <Form {...legalizeForm}>
                  <form onSubmit={legalizeForm.handleSubmit(onLegalizeSubmit)} className="space-y-4 pt-4">
                    <ScrollArea className="h-72">
                      <div className="space-y-4 pr-6">
                        {legalizeFields.map((field, index) => (
                          <div key={field.id} className="p-4 border rounded-lg">
                            <p className="font-semibold text-sm">{field.descripcion}</p>
                            <p className="text-xs text-muted-foreground mb-2">Código: {field.codigo}</p>
                            <div className="grid grid-cols-2 gap-4">
                              <FormField
                                control={legalizeForm.control}
                                name={`productos.${index}.pesoBrutoKg`}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Peso Bruto (kg)</FormLabel>
                                    <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                              <FormField
                                control={legalizeForm.control}
                                name={`productos.${index}.pesoNetoKg`}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Peso Neto (kg)</FormLabel>
                                    <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setIsLegalizeDialogOpen(false)}>Cancelar</Button>
                      <Button type="submit" disabled={isLegalizing}>
                        {isLegalizing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Guardar Pesos
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
  







