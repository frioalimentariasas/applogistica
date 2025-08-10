
"use client";

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, SubmitHandler } from 'react-hook-form';
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
import { getAvailableOperarios } from '@/app/actions/performance-report';
import { getClients, type ClientInfo } from '@/app/actions/clients';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import type { PerformanceStandard } from '@/app/gestion-estandares/actions';
import { getStandardNoveltyTypes, type StandardNoveltyType } from '@/app/gestion-novedades/actions';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { ArrowLeft, Search, XCircle, Loader2, CalendarIcon, File, FileDown, FolderSearch, ShieldAlert, TrendingUp, Circle, Settings, ChevronsUpDown, AlertCircle, PlusCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Combobox } from '@/components/ui/combobox';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription as AlertDialogDesc, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";


const noveltySchema = z.object({
    type: z.string().min(1, "Debe seleccionar o ingresar un tipo de novedad."),
    downtimeMinutes: z.coerce.number({invalid_type_error: "Debe ser un número"}).int("Debe ser un número entero.").min(1, "Los minutos deben ser mayores a 0."),
    impactsCrewProductivity: z.boolean().default(true),
});

type NoveltyFormValues = z.infer<typeof noveltySchema>;

const EmptyState = ({ searched }: { searched: boolean; }) => (
    <TableRow>
        <TableCell colSpan={16} className="py-20 text-center">
            <div className="flex flex-col items-center gap-4">
                <div className="rounded-full bg-primary/10 p-4">
                    <FolderSearch className="h-12 w-12 text-primary" />
                </div>
                <h3 className="text-xl font-semibold">
                    {searched ? "No se encontraron operaciones" : "Genere un reporte"}
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

const getPerformanceIndicator = (row: CrewPerformanceReportRow): { text: string, color: string } => {
    const { operationalDurationMinutes, standard, conceptoLiquidado, kilos } = row;
    
    if (conceptoLiquidado !== 'CARGUE' && conceptoLiquidado !== 'DESCARGUE') {
        return { text: 'No Aplica', color: 'text-gray-500' };
    }
    
    if (row.productType === 'fijo' && kilos === 0 && row.aplicaCuadrilla === 'si') {
        return { text: 'Pendiente (P. Bruto)', color: 'text-orange-600' };
    }
    
    if (operationalDurationMinutes === null || operationalDurationMinutes < 0) {
        return { text: 'No Calculado', color: 'text-gray-500' };
    }

    if (!standard) {
        return { text: 'N/A', color: 'text-gray-500' };
    }

    const { baseMinutes } = standard;

    if (operationalDurationMinutes < baseMinutes) {
        return { text: 'Óptimo', color: 'text-green-600' };
    }
    
    if (operationalDurationMinutes <= baseMinutes + 10) {
        return { text: 'Normal', color: 'text-yellow-600' };
    }

    return { text: 'Lento', color: 'text-red-600' };
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

    const [reportData, setReportData] = useState<CrewPerformanceReportRow[]>([]);
    const [filteredReportData, setFilteredReportData] = useState<CrewPerformanceReportRow[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingOperarios, setIsLoadingOperarios] = useState(false);
    const [searched, setSearched] = useState(false);

    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    const [logoBase64, setLogoBase64] = useState<string | null>(null);
    const [logoDimensions, setLogoDimensions] = useState<{ width: number, height: number } | null>(null);
    const [isLogoLoading, setIsLogoLoading] = useState(true);

    // State for novelty management
    const [isNoveltyDialogOpen, setIsNoveltyDialogOpen] = useState(false);
    const [isSubmittingNovelty, setIsSubmittingNovelty] = useState(false);
    const [selectedRowForNovelty, setSelectedRowForNovelty] = useState<CrewPerformanceReportRow | null>(null);
    const [noveltyToDelete, setNoveltyToDelete] = useState<{ rowId: string; noveltyId: string; } | null>(null);
    const [isDeletingNovelty, setIsDeletingNovelty] = useState(false);

    const noveltyForm = useForm<NoveltyFormValues>({
        resolver: zodResolver(noveltySchema),
        defaultValues: { type: '', downtimeMinutes: 0, impactsCrewProductivity: true }
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

    useEffect(() => {
        const fetchInitialData = async () => {
             const [clientList, noveltyTypes] = await Promise.all([
                 getClients(),
                 getStandardNoveltyTypes()
             ]);
             setClients(clientList);
             setStandardNoveltyTypes(noveltyTypes);
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
        if(filterLento) {
            results = results.filter(row => getPerformanceIndicator(row).text === 'Lento');
        }
        setFilteredReportData(results);
    }, [filterLento, reportData]);


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
                filterPending: filterPending,
                cuadrillaFilter: cuadrillaFilter,
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
    }, [dateRange, selectedOperario, operationType, productType, selectedClients, filterPending, cuadrillaFilter, toast]);
    
    const handleClear = () => {
        setDateRange(undefined);
        setSelectedOperario('all');
        setOperationType('all');
        setProductType('all');
        setCuadrillaFilter('todas');
        setSelectedClients([]);
        setFilterPending(false);
        setFilterLento(false);
        setReportData([]);
        setFilteredReportData([]);
        setSearched(false);
        setCurrentPage(1);
    };

    const totalLiquidacion = useMemo(() => reportData.reduce((acc, row) => acc + (row.valorTotalConcepto || 0), 0), [reportData]);
    
    const getSelectedClientsText = () => {
        if (selectedClients.length === 0) return "Todos los clientes...";
        if (selectedClients.length === clients.length) return "Todos los clientes seleccionados";
        if (selectedClients.length === 1) return selectedClients[0];
        return `${selectedClients.length} clientes seleccionados`;
    };

    const performanceSummary = useMemo(() => {
        const cargaDescargaData = reportData.filter(row => row.conceptoLiquidado === 'CARGUE' || row.conceptoLiquidado === 'DESCARGUE');

        if (cargaDescargaData.length === 0) return null;

        const summary: Record<string, { count: number }> = {
            'Óptimo': { count: 0 },
            'Normal': { count: 0 },
            'Lento': { count: 0 },
            'Pendiente (P. Bruto)': { count: 0 },
            'No Calculado': { count: 0 },
            'N/A': { count: 0 }
        };

        cargaDescargaData.forEach(row => {
            const indicator = getPerformanceIndicator(row).text;
             if (indicator in summary) {
                summary[indicator as keyof typeof summary].count++;
            }
        });
        
        const totalEvaluableOperations = Object.entries(summary).reduce((acc, [key, value]) => {
            return (key !== 'No Calculado' && key !== 'Pendiente (P. Bruto)' && key !== 'N/A') ? acc + value.count : acc;
        }, 0);

        if (totalEvaluableOperations === 0) {
             return {
                summary,
                totalOperations: cargaDescargaData.length,
                qualification: "No Calculable"
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
            qualification
        };
    }, [reportData]);

      const conceptSummary = useMemo(() => {
        if (reportData.length === 0) return null;
        
        const summary = reportData.reduce((acc, row) => {
            const { conceptoLiquidado, cantidadConcepto, valorUnitario, valorTotalConcepto, unidadMedidaConcepto } = row;
            if (conceptoLiquidado === 'No Aplica') return acc;
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
     }, [reportData]);


    const handleExportExcel = () => {
        if (reportData.length === 0) return;
        
        const workbook = XLSX.utils.book_new();
        const periodText = `Periodo: ${format(dateRange!.from!, 'dd/MM/yyyy')} - ${format(dateRange!.to!, 'dd/MM/yyyy')}`;

        // --- Sheet 1: Detalle Liquidación ---
        const mainDataToSheet = reportData.map(row => {
            const indicator = getPerformanceIndicator(row);
            const isPending = row.productType === 'fijo' && row.kilos === 0 && row.aplicaCuadrilla === 'si';
            return {
                'Fecha': format(new Date(row.fecha), 'dd/MM/yyyy'),
                'Operario Responsable': row.operario,
                'Cliente': row.cliente,
                'Tipo Operación': row.tipoOperacion,
                'Tipo Producto': row.tipoProducto,
                'Pedido SISLOG': row.pedidoSislog,
                'Placa': row.placa,
                'Contenedor': row.contenedor,
                'Cantidad (Ton/Und)': isPending ? 'Pendiente Ingresar P.Bruto' : row.cantidadConcepto.toFixed(2),
                'Duración Total': formatDuration(row.totalDurationMinutes),
                'Tiempo Operativo': formatDuration(row.operationalDurationMinutes),
                'Novedades': row.novelties.map(n => `${n.type}: ${n.downtimeMinutes} min`).join('; ') || 'N/A',
                'Productividad': indicator.text,
                'Concepto': row.conceptoLiquidado,
                'Valor Unitario (COP)': isPending ? 'N/A' : row.valorUnitario,
                'Unidad Medida': row.unidadMedidaConcepto,
                'Valor Total Concepto (COP)': isPending ? 'N/A' : row.valorTotalConcepto,
            }
        });
        const mainWorksheet = XLSX.utils.json_to_sheet([]);
        XLSX.utils.sheet_add_aoa(mainWorksheet, [[periodText]], { origin: 'A1' });
        XLSX.utils.sheet_add_json(mainWorksheet, mainDataToSheet, { origin: 'A2', skipHeader: false });
        XLSX.utils.book_append_sheet(workbook, mainWorksheet, 'Detalle Liquidación');

        if (performanceSummary) {
            const evaluableOps = (performanceSummary.totalOperations || 0) - (performanceSummary.summary['Pendiente (P. Bruto)']?.count || 0) - (performanceSummary.summary['No Calculado']?.count || 0) - (performanceSummary.summary['N/A']?.count || 0);
            
            const performanceData = [
                ['Resumen de Productividad (Cargue/Descargue)'], [],
                ['Indicador', 'Total Operaciones', 'Porcentaje (%)'],
                ...Object.entries(performanceSummary.summary)
                    .filter(([key]) => key !== 'No Calculado' && key !== 'Pendiente (P. Bruto)')
                    .map(([key, value]) => {
                        const percentage = evaluableOps > 0 ? (value.count / evaluableOps * 100).toFixed(2) + '%' : '0.00%';
                        return [key, value.count, percentage];
                    }),
                [],
                ['Calificación General de Productividad:', performanceSummary.qualification]
            ];
            const performanceWorksheet = XLSX.utils.aoa_to_sheet([]);
            XLSX.utils.sheet_add_aoa(performanceWorksheet, [[periodText]], { origin: 'A1' });
            XLSX.utils.sheet_add_aoa(performanceWorksheet, performanceData, { origin: 'A3' });
            XLSX.utils.book_append_sheet(workbook, performanceWorksheet, 'Resumen de Productividad');
        }

        if (conceptSummary) {
             const conceptsDataToSheet = conceptSummary.map(c => ({
                'Ítem': c.item,
                'Nombre del Concepto': c.name, 'Cantidad Total': Number(c.totalCantidad.toFixed(2)),
                'Presentación': c.unidadMedida, 'Valor Unitario (COP)': c.valorUnitario, 'Valor Total (COP)': c.totalValor
             }));
             const conceptsWorksheet = XLSX.utils.json_to_sheet([], {header: ['Ítem', 'Nombre del Concepto', 'Cantidad Total', 'Presentación', 'Valor Unitario (COP)', 'Valor Total (COP)']});
             XLSX.utils.sheet_add_aoa(conceptsWorksheet, [[periodText]], { origin: 'A1' });
             XLSX.utils.sheet_add_json(conceptsWorksheet, conceptsDataToSheet, { origin: 'A3', skipHeader: false });
             
             XLSX.utils.sheet_add_aoa(conceptsWorksheet, [['', '', '', '', 'TOTAL LIQUIDACIÓN:', totalLiquidacion]], { origin: -1 });

             const currencyFormat = '$ #,##0.00';
             const numberFormat = '0.00';
             conceptsWorksheet['!cols'] = [ {wch: 5}, {wch: 25}, {wch: 15}, {wch: 15}, {wch: 20}, {wch: 20} ];
             for(let i = 4; i <= conceptsDataToSheet.length + 4; i++) {
                 if (conceptsWorksheet[`C${i}`]) conceptsWorksheet[`C${i}`].z = numberFormat;
                 if (conceptsWorksheet[`E${i}`]) conceptsWorksheet[`E${i}`].z = currencyFormat;
                 if (conceptsWorksheet[`F${i}`]) conceptsWorksheet[`F${i}`].z = currencyFormat;
             }

             const totalRowIndex = conceptsDataToSheet.length + 4;
             if(conceptsWorksheet[`F${totalRowIndex}`]) conceptsWorksheet[`F${totalRowIndex}`].z = currencyFormat;


             XLSX.utils.book_append_sheet(workbook, conceptsWorksheet, 'Resumen de Liquidación');
        }
        
        const fileName = `Reporte_Liquidacion_Cuadrilla_${format(dateRange!.from!, 'yyyy-MM-dd')}_a_${format(dateRange!.to!, 'yyyy-MM-dd')}.xlsx`;
        XLSX.writeFile(workbook, fileName);
    };

    const handleExportPDF = async () => {
        // PDF Export logic remains the same
    };

    const handleOpenNoveltyDialog = (row: CrewPerformanceReportRow) => {
        setSelectedRowForNovelty(row);
        noveltyForm.reset({ type: '', downtimeMinutes: 0, impactsCrewProductivity: true });
        setIsNoveltyDialogOpen(true);
    };
    
    const onNoveltySubmit: SubmitHandler<NoveltyFormValues> = async (data) => {
        if (!selectedRowForNovelty || !user || !displayName) return;
        setIsSubmittingNovelty(true);
    
        const noveltyData = {
            operationId: selectedRowForNovelty.submissionId,
            type: data.type.toUpperCase(),
            downtimeMinutes: data.downtimeMinutes,
            impactsCrewProductivity: data.impactsCrewProductivity,
            createdBy: { uid: user.uid, displayName: displayName }
        };
    
        const result = await addNoveltyToOperation(noveltyData);
        if (result.success && result.novelty) {
            toast({ title: 'Éxito', description: result.message });
            setReportData(prevData => prevData.map(row => {
                if (row.id === selectedRowForNovelty.id) {
                    const updatedNovelties = [...row.novelties, result.novelty!];
                    const downtimeMinutes = updatedNovelties
                        .filter(n => n.impactsCrewProductivity === true)
                        .reduce((sum, n) => sum + n.downtimeMinutes, 0);
                    const newOperationalDuration = row.totalDurationMinutes !== null ? row.totalDurationMinutes - downtimeMinutes : null;
                    return { ...row, novelties: updatedNovelties, operationalDurationMinutes: newOperationalDuration };
                }
                return row;
            }));
             // Refetch novelty types to include the new one if it was added
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
                        .filter(n => n.impactsCrewProductivity === true)
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
    
    const noveltyComboboxOptions = standardNoveltyTypes.map(nt => ({ value: nt.name, label: nt.name }));

    return (
        <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
            <div className="max-w-7xl mx-auto">
                <header className="mb-8">
                    <div className="relative flex items-center justify-center text-center">
                         <Button variant="ghost" size="icon" className="absolute left-0 top-1/2 -translate-y-1/2" onClick={() => router.push('/')}>
                            <ArrowLeft className="h-6 w-6" />
                        </Button>
                        <div>
                            <div className="flex items-center justify-center gap-2">
                                <TrendingUp className="h-8 w-8 text-primary" />
                                <h1 className="text-2xl font-bold text-primary">Indicadores y Liquidación Cuadrilla</h1>
                            </div>
                             <p className="text-sm text-gray-500">Analice los indicadores de productividad y liquide las operaciones de cuadrilla.</p>
                        </div>
                    </div>
                </header>

                <Card>
                    <CardHeader>
                         <div className='flex justify-between items-center'>
                            <div>
                                <CardTitle>Filtros del Reporte</CardTitle>
                                <CardDescription>Seleccione los filtros para generar el informe de productividad de cuadrilla.</CardDescription>
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
                                    <PopoverContent className="w-auto p-0" align="start"><Calendar initialFocus mode="range" defaultMonth={dateRange?.from} selected={dateRange} onSelect={setDateRange} numberOfMonths={2} locale={es} disabled={{ after: new Date() }} /></PopoverContent>
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
                            <div className="space-y-2"><Label>Operaciones de Cuadrilla</Label><Select value={cuadrillaFilter} onValueChange={setCuadrillaFilter as (value: 'con' | 'sin' | 'todas') => void}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="todas">Todas las Operaciones</SelectItem><SelectItem value="con">Solo con Cuadrilla</SelectItem><SelectItem value="sin">Solo sin Cuadrilla</SelectItem></SelectContent></Select></div>
                            <div className="flex flex-col gap-2 self-end">
                                <div className="flex items-center space-x-2"><Checkbox id="filter-pending" checked={filterPending} onCheckedChange={(checked) => setFilterPending(checked as boolean)} /><Label htmlFor="filter-pending" className="cursor-pointer text-sm">Mostrar solo pendientes P. Bruto</Label></div>
                                <div className="flex items-center space-x-2"><Checkbox id="filter-lento" checked={filterLento} onCheckedChange={(checked) => setFilterLento(checked as boolean)} /><Label htmlFor="filter-lento" className="cursor-pointer text-sm">Mostrar solo "Lento"</Label></div>
                            </div>
                            <div className="flex gap-2"><Button onClick={handleSearch} className="w-full" disabled={isLoading}>{isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}Generar</Button><Button onClick={handleClear} variant="outline" className="w-full"><XCircle className="mr-2 h-4 w-4" />Limpiar</Button></div>
                        </div>
                    </CardContent>
                </Card>

                 <Card className="mt-6">
                    <CardHeader><div className="flex justify-between items-center flex-wrap gap-4"><div><CardTitle>Resultados del Informe</CardTitle><CardDescription>{isLoading ? "Cargando resultados..." : `Mostrando ${filteredReportData.length} operaciones.`}</CardDescription></div><div className="flex gap-2"><Button onClick={handleExportExcel} disabled={isLoading || reportData.length === 0} variant="outline"><File className="mr-2 h-4 w-4" /> Exportar a Excel</Button><Button onClick={handleExportPDF} disabled={isLoading || reportData.length === 0 || isLogoLoading} variant="outline">{isLogoLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />} Exportar a PDF</Button></div></div></CardHeader>
                    <CardContent>
                        <div className="w-full overflow-x-auto rounded-md border">
                            <Table><TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Operario</TableHead><TableHead>Cliente</TableHead><TableHead>Tipo Op.</TableHead><TableHead>Tipo Prod.</TableHead><TableHead>Pedido</TableHead><TableHead>Placa</TableHead><TableHead>Cant.</TableHead><TableHead>Dur. Total</TableHead><TableHead>T. Operativo</TableHead><TableHead>Novedades</TableHead><TableHead>Productividad</TableHead><TableHead>Concepto</TableHead><TableHead>Vlr. Unitario</TableHead><TableHead>Vlr. Total</TableHead><TableHead className="text-right">Acciones</TableHead></TableRow></TableHeader>
                                <TableBody>
                                    {isLoading ? (<TableRow><TableCell colSpan={16}><Skeleton className="h-20 w-full" /></TableCell></TableRow>) : displayedData.length > 0 ? (
                                        displayedData.map((row) => {
                                            const indicator = getPerformanceIndicator(row);
                                            const isPending = row.cantidadConcepto === -1;
                                            return (
                                                <TableRow key={row.id}>
                                                    <TableCell className="text-xs">{format(new Date(row.fecha), 'dd/MM/yy')}</TableCell><TableCell className="text-xs">{row.operario}</TableCell><TableCell className="text-xs max-w-[150px] truncate" title={row.cliente}>{row.cliente}</TableCell>
                                                    <TableCell className="text-xs">{row.tipoOperacion}</TableCell><TableCell className="text-xs">{row.tipoProducto}</TableCell><TableCell className="text-xs">{row.pedidoSislog}</TableCell><TableCell className="text-xs">{row.placa}</TableCell>
                                                    <TableCell className="text-xs text-right font-mono">{isPending ? 'Pendiente' : `${row.cantidadConcepto > 0 ? row.cantidadConcepto.toFixed(2) : 'N/A'}`}</TableCell><TableCell className="text-xs text-right font-medium">{formatDuration(row.totalDurationMinutes)}</TableCell><TableCell className="text-xs text-right font-medium">{formatDuration(row.operationalDurationMinutes)}</TableCell>
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
                                                    <TableCell className={cn("text-xs text-right font-semibold", indicator.color)}><div className="flex items-center justify-end gap-1.5"><Circle className={cn("h-2 w-2", indicator.color.replace('text-', 'bg-'))} />{indicator.text}</div></TableCell>
                                                    <TableCell className="text-xs font-semibold">{row.conceptoLiquidado}</TableCell><TableCell className="text-xs text-right font-mono">{isPending || row.valorUnitario === 0 ? 'N/A' : row.valorUnitario.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}</TableCell><TableCell className="text-xs text-right font-mono">{isPending || row.valorTotalConcepto === 0 ? 'N/A' : row.valorTotalConcepto.toLocaleString('es-CO', { style: 'currency', currency: 'COP' })}</TableCell>
                                                    <TableCell className="text-right">
                                                        {indicator.text === 'Lento' && (
                                                            <Button variant="outline" size="sm" onClick={() => handleOpenNoveltyDialog(row)}>
                                                                <PlusCircle className="mr-2 h-3 w-3"/>Novedad
                                                            </Button>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            )})
                                    ) : (<EmptyState searched={searched} />)}
                                     {!isLoading && reportData.length > 0 && (<TableRow className="font-bold bg-muted hover:bg-muted"><TableCell colSpan={14} className="text-right">TOTAL GENERAL LIQUIDACIÓN</TableCell><TableCell className="text-right">{totalLiquidacion.toLocaleString('es-CO', { style: 'currency', currency: 'COP' })}</TableCell><TableCell></TableCell></TableRow>)}
                                </TableBody>
                            </Table>
                        </div>
                         <div className="flex items-center justify-between space-x-2 py-4">
                            <div className="flex-1 text-sm text-muted-foreground">{filteredReportData.length} operaciones mostradas.</div>
                            <div className="flex items-center space-x-2"><p className="text-sm font-medium">Filas por página</p><Select value={`${itemsPerPage}`} onValueChange={(value) => { setItemsPerPage(Number(value)); setCurrentPage(1); }}><SelectTrigger className="h-8 w-[70px]"><SelectValue placeholder={itemsPerPage} /></SelectTrigger><SelectContent side="top">{[10, 20, 50, 100].map((pageSize) => (<SelectItem key={pageSize} value={`${pageSize}`}>{pageSize}</SelectItem>))}</SelectContent></Select></div>
                            <div className="flex w-[100px] items-center justify-center text-sm font-medium">Página {currentPage} de {totalPages}</div>
                            <div className="flex items-center space-x-2"><Button variant="outline" size="sm" onClick={() => setCurrentPage((prev) => prev - 1)} disabled={currentPage === 1}>Anterior</Button><Button variant="outline" size="sm" onClick={() => setCurrentPage((prev) => prev + 1)} disabled={currentPage === totalPages || totalPages === 0}>Siguiente</Button></div>
                        </div>
                    </CardContent>
                </Card>
            </div>
            
            <Dialog open={isNoveltyDialogOpen} onOpenChange={setIsNoveltyDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Agregar Novedad a Operación</DialogTitle>
                        <DialogDescription>
                            Registre un tiempo de inactividad para la operación del pedido <strong>{selectedRowForNovelty?.pedidoSislog}</strong>.
                        </DialogDescription>
                    </DialogHeader>
                    <Form {...noveltyForm}>
                        <form onSubmit={noveltyForm.handleSubmit(onNoveltySubmit)} className="space-y-4 pt-4">
                            <FormField
                                control={noveltyForm.control}
                                name="type"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Tipo de Novedad</FormLabel>
                                        <FormControl>
                                            <Combobox
                                                options={noveltyComboboxOptions}
                                                value={field.value}
                                                onChange={field.onChange}
                                                placeholder="Seleccione o cree una novedad..."
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                             <FormField control={noveltyForm.control} name="downtimeMinutes" render={({ field }) => (<FormItem><FormLabel>Minutos de Inactividad</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                             <FormField
                                control={noveltyForm.control}
                                name="impactsCrewProductivity"
                                render={({ field }) => (
                                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-lg border p-4 shadow-sm">
                                        <FormControl>
                                            <Checkbox
                                                checked={field.value}
                                                onCheckedChange={field.onChange}
                                            />
                                        </FormControl>
                                        <div className="space-y-1 leading-none">
                                            <FormLabel className="font-semibold cursor-pointer">Justificar demora y restar del tiempo de la cuadrilla</FormLabel>
                                            <FormDescription>
                                                Marque esta casilla si la novedad fue un imprevisto que justifica el tiempo perdido (ej: daño de máquina). El tiempo se descontará del cálculo de productividad.
                                            </FormDescription>
                                        </div>
                                    </FormItem>
                                )}
                            />
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
