

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
import { getAvailableOperarios } from '@/app/actions/performance-report';
import { getClients, type ClientInfo } from '@/app/actions/clients';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { ArrowLeft, Search, XCircle, Loader2, CalendarIcon, File, FileDown, FolderSearch, Users, ShieldAlert, TrendingUp, Circle, Settings, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';


const EmptyState = ({ searched }: { searched: boolean; }) => (
    <TableRow>
        <TableCell colSpan={14} className="py-20 text-center">
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

const getPerformanceIndicator = (row: CrewPerformanceReportRow): { text: string, color: string } => {
    const { duracionMinutos, kilos, standard, conceptoLiquidado, cantidadConcepto } = row;

    if (cantidadConcepto === -1 && (conceptoLiquidado === 'CARGUE' || conceptoLiquidado === 'DESCARGUE')) {
        return { text: 'Pendiente (P. Bruto)', color: 'text-orange-600' };
    }

    if (conceptoLiquidado !== 'CARGUE' && conceptoLiquidado !== 'DESCARGUE') {
        return { text: 'No Aplica', color: 'text-gray-500' };
    }

    if (kilos === 0 || duracionMinutos === null || duracionMinutos < 0) {
        return { text: 'No Calculado', color: 'text-gray-500' };
    }
    if (!standard) {
        return { text: 'N/A', color: 'text-gray-500' };
    }

    const standardTime = standard.baseMinutes;
    
    // si la duración de la operación es menor que el tiempo estándar el indicador es óptimo
    if (duracionMinutos < standardTime) {
        return { text: 'Óptimo', color: 'text-green-600' };
    }
    
    // si la operación es igual o hasta 10 minutos mayor al estándar el indicador es Normal
    if (duracionMinutos >= standardTime && duracionMinutos <= standardTime + 10) {
        return { text: 'Normal', color: 'text-yellow-600' };
    }

    // si es mayor pasado esos 10 min adicionales al estándar el indicador es lento
    return { text: 'Lento', color: 'text-red-600' };
};


const formatTons = (kilos: number): number => {
    return Number((kilos / 1000).toFixed(2));
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
    
    // New state for client filter
    const [clients, setClients] = useState<ClientInfo[]>([]);
    const [selectedClients, setSelectedClients] = useState<string[]>([]);
    const [isClientDialogOpen, setClientDialogOpen] = useState(false);
    const [clientSearch, setClientSearch] = useState('');
    const [filterPending, setFilterPending] = useState(false);

    const [reportData, setReportData] = useState<CrewPerformanceReportRow[]>([]);
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
    
    const filteredClients = useMemo(() => {
        if (!clientSearch) return clients;
        return clients.filter(c => c.razonSocial.toLowerCase().includes(clientSearch.toLowerCase()));
    }, [clientSearch, clients]);

    useEffect(() => {
        const fetchInitialData = async () => {
             const [operarios, clientList] = await Promise.all([
                 getAvailableOperarios(format(dateRange?.from || today, 'yyyy-MM-dd'), format(dateRange?.to || today, 'yyyy-MM-dd')),
                 getClients()
             ]);
             setAvailableOperarios(operarios);
             setClients(clientList);
        };
        if (dateRange?.from && dateRange?.to) {
            fetchInitialData();
        }
    }, [dateRange]);

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
            };

            const results = await getCrewPerformanceReport(criteria);
            
            setReportData(results);
            
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
    }, [dateRange, selectedOperario, operationType, productType, selectedClients, filterPending, toast]);
    
    const handleClear = () => {
        setDateRange(undefined);
        setSelectedOperario('all');
        setOperationType('all');
        setProductType('all');
        setSelectedClients([]);
        setFilterPending(false);
        setReportData([]);
        setSearched(false);
        setCurrentPage(1);
    };
    
    const dataForExport = useMemo(() => {
        return reportData.filter(row => getPerformanceIndicator(row).text !== 'N/A' && row.cantidadConcepto !== -1);
    }, [reportData]);

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
        };

        cargaDescargaData.forEach(row => {
            const indicator = getPerformanceIndicator(row).text;
             if (indicator in summary) {
                summary[indicator as keyof typeof summary].count++;
            }
        });
        
        const totalEvaluableOperations = Object.entries(summary).reduce((acc, [key, value]) => {
            return (key !== 'No Calculado' && key !== 'Pendiente (P. Bruto)') ? acc + value.count : acc;
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
            if (!acc[conceptoLiquidado]) {
                const firstValidEntry = reportData.find(r => r.conceptoLiquidado === conceptoLiquidado && r.valorUnitario > 0);
                acc[conceptoLiquidado] = {
                    totalCantidad: 0,
                    totalValor: 0,
                    unidadMedida: unidadMedidaConcepto,
                    valorUnitario: firstValidEntry ? firstValidEntry.valorUnitario : 0, 
                };
            }
            if (cantidadConcepto !== -1) { // Exclude pending
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
            const isPending = row.cantidadConcepto === -1;
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
                'Duración': formatDuration(row.duracionMinutos),
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

        // --- Sheet 2: Resumen de Productividad ---
        if (performanceSummary) {
            const evaluableOps = (performanceSummary.totalOperations || 0) - (performanceSummary.summary['Pendiente (P. Bruto)']?.count || 0) - (performanceSummary.summary['No Calculado']?.count || 0);
            
            const performanceData = [
                ['Resumen de Productividad (Cargue/Descargue)'],
                [],
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

        // --- Sheet 3: Resumen de Liquidación Conceptos ---
        if (conceptSummary) {
             const conceptsDataToSheet = conceptSummary.map(c => ({
                'Ítem': c.item,
                'Nombre del Concepto': c.name,
                'Cantidad Total': Number(c.totalCantidad.toFixed(2)),
                'Presentación': c.unidadMedida,
                'Valor Unitario (COP)': c.valorUnitario,
                'Valor Total (COP)': c.totalValor
             }));
             const conceptsWorksheet = XLSX.utils.json_to_sheet([], {header: ['Ítem', 'Nombre del Concepto', 'Cantidad Total', 'Presentación', 'Valor Unitario (COP)', 'Valor Total (COP)']});
             XLSX.utils.sheet_add_aoa(conceptsWorksheet, [[periodText]], { origin: 'A1' });
             XLSX.utils.sheet_add_json(conceptsWorksheet, conceptsDataToSheet, { origin: 'A3', skipHeader: false });
             
             // Add total row
             XLSX.utils.sheet_add_aoa(conceptsWorksheet, [
                ['', '', '', '', 'TOTAL LIQUIDACIÓN:', totalLiquidacion]
             ], { origin: -1 });

             // Apply number formatting
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
        if (reportData.length === 0 || !logoBase64 || !logoDimensions) return;
        
        const doc = new jsPDF({ orientation: 'landscape' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();

        const addHeader = (doc: jsPDF, pageNumber: number, totalPages: number) => {
            const logoWidth = 60;
            const aspectRatio = logoDimensions.width / logoDimensions.height;
            const logoHeight = logoWidth / aspectRatio;
            const logoX = (pageWidth - logoWidth) / 2;
            doc.addImage(logoBase64, 'PNG', logoX, 10, logoWidth, logoHeight);
    
            const titleY = 10 + logoHeight + 5;
            
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.text(`Informe de Liquidación de Cuadrilla`, pageWidth / 2, titleY, { align: 'center' });
            
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(0, 0, 0); // Black color
            doc.text(`Periodo: ${format(dateRange!.from!, 'dd/MM/yyyy')} - ${format(dateRange!.to!, 'dd/MM/yyyy')}`, pageWidth / 2, titleY + 10, {align: 'center'});
            
            // Page number
            doc.setFontSize(8);
            doc.text(`Página ${pageNumber} de ${totalPages}`, pageWidth - 14, pageHeight - 10, { align: 'right' });
        };

        const drawSummaryTable = (doc: jsPDF, title: string, headers: string[][], body: any[][], foot?: any[][]) => {
            autoTable(doc, {
                head: [[{ content: title, styles: { halign: 'center', fillColor: [33, 150, 243], textColor: 255, fontStyle: 'bold' } }]],
                body: [],
                theme: 'plain',
                startY: 55
            });
            autoTable(doc, {
                 startY: (doc as any).lastAutoTable.finalY,
                 head: headers,
                 body: body,
                 foot: foot,
                 theme: 'grid',
                 headStyles: { fillColor: [226, 232, 240], textColor: 0, fontStyle: 'bold' },
                 footStyles: { fillColor: [226, 232, 240], textColor: 0, fontStyle: 'bold' }
            });
        };
        
        // --- Page 1: Detailed Report ---
        autoTable(doc, {
            head: [['Fecha', 'Operario', 'Cliente', 'Tipo Op.', 'Tipo Prod.', 'Pedido', 'Placa', 'Cant.', 'Duración', 'Productividad', 'Concepto', 'Vlr. Unit', 'Vlr. Total']],
            body: reportData.map(row => {
                const indicator = getPerformanceIndicator(row);
                const isPending = row.cantidadConcepto === -1;
                return [
                    format(new Date(row.fecha), 'dd/MM/yy'),
                    row.operario,
                    row.cliente,
                    row.tipoOperacion,
                    row.tipoProducto,
                    row.pedidoSislog,
                    row.placa,
                    isPending ? 'Pendiente' : `${row.cantidadConcepto.toFixed(2)} ${row.unidadMedidaConcepto}`,
                    formatDuration(row.duracionMinutos),
                    indicator.text,
                    row.conceptoLiquidado,
                    isPending ? 'N/A' : row.valorUnitario.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }),
                    isPending ? 'N/A' : row.valorTotalConcepto.toLocaleString('es-CO', { style: 'currency', currency: 'COP' }),
                ]
            }),
            theme: 'grid',
            styles: { fontSize: 6, cellPadding: 1, overflow: 'linebreak' },
            headStyles: { fillColor: [33, 150, 243], fontSize: 6, cellPadding: 1 },
            didDrawPage: (data) => {
                addHeader(doc, data.pageNumber, (doc as any).internal.getNumberOfPages());
            },
            startY: 55
        });
        
        // --- Page 2: Productivity Summary ---
        if (performanceSummary) {
            doc.addPage();
            const evaluableOps = (performanceSummary.totalOperations || 0) - (performanceSummary.summary['Pendiente (P. Bruto)']?.count || 0);
            const performanceBody = Object.entries(performanceSummary.summary)
                .filter(([key]) => key !== 'No Calculado' && key !== 'Pendiente (P. Bruto)')
                .map(([key, value]) => {
                    const percentage = evaluableOps > 0 ? (value.count / evaluableOps * 100).toFixed(2) + '%' : '0.00%';
                    return [key, value.count, percentage];
                });

             drawSummaryTable(
                doc,
                'Resumen de Productividad (Cargue/Descargue)',
                [['Indicador', 'Total Operaciones', 'Porcentaje (%)']],
                performanceBody,
                [['Calificación General:', {content: performanceSummary.qualification, colSpan: 2, styles: {halign: 'left'}}]]
            );
        }

        // --- Page 3: Concepts Summary ---
        if (conceptSummary) {
            doc.addPage();
            const conceptsBody = conceptSummary.map(c => [
                c.item,
                c.name,
                `${c.totalCantidad.toFixed(2)}`,
                c.unidadMedida,
                c.valorUnitario.toLocaleString('es-CO', { style: 'currency', currency: 'COP' }),
                c.totalValor.toLocaleString('es-CO', { style: 'currency', currency: 'COP' })
            ]);
            drawSummaryTable(
                doc,
                'Resumen de Conceptos Liquidados',
                [['Ítem', 'Nombre del Concepto', 'Cantidad Total', 'Presentación', 'Valor Unitario (COP)', 'Valor Total (COP)']],
                conceptsBody,
                [['', '', '', '', { content: 'TOTAL LIQUIDACIÓN:', styles: { halign: 'right' } }, { content: totalLiquidacion.toLocaleString('es-CO', { style: 'currency', currency: 'COP' }) }]]
            );
        }

        // Final loop to add headers to summary pages
        const totalPages = (doc as any).internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            addHeader(doc, i, totalPages);
        }

        const fileName = `Reporte_Liquidacion_Cuadrilla_${format(dateRange!.from!, 'yyyy-MM-dd')}_a_${format(dateRange!.to!, 'yyyy-MM-dd')}.pdf`;
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
                                <Label>Cliente(s)</Label>
                                <Dialog open={isClientDialogOpen} onOpenChange={setClientDialogOpen}>
                                    <DialogTrigger asChild>
                                        <Button variant="outline" className="w-full justify-between text-left font-normal">
                                            <span className="truncate">{getSelectedClientsText()}</span>
                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent>
                                        <DialogHeader>
                                            <DialogTitle>Seleccionar Cliente(s)</DialogTitle>
                                            <DialogDescription>Deje la selección vacía para incluir a todos los clientes.</DialogDescription>
                                        </DialogHeader>
                                        <Input
                                            placeholder="Buscar cliente..."
                                            value={clientSearch}
                                            onChange={(e) => setClientSearch(e.target.value)}
                                            className="my-4"
                                        />
                                        <ScrollArea className="h-72">
                                            <div className="space-y-1">
                                                <div className="flex items-center space-x-2 rounded-md p-2 hover:bg-accent border-b">
                                                    <Checkbox
                                                        id="select-all-clients"
                                                        checked={selectedClients.length === clients.length}
                                                        onCheckedChange={(checked) => {
                                                            setSelectedClients(checked ? clients.map(c => c.razonSocial) : []);
                                                        }}
                                                    />
                                                    <Label htmlFor="select-all-clients" className="w-full cursor-pointer font-semibold">Seleccionar Todos</Label>
                                                </div>
                                                {filteredClients.map((client) => (
                                                    <div key={client.id} className="flex items-center space-x-2 rounded-md p-2 hover:bg-accent">
                                                        <Checkbox
                                                            id={`client-${client.id}`}
                                                            checked={selectedClients.includes(client.razonSocial)}
                                                            onCheckedChange={(checked) => {
                                                                setSelectedClients(prev =>
                                                                    checked
                                                                        ? [...prev, client.razonSocial]
                                                                        : prev.filter(s => s !== client.razonSocial)
                                                                )
                                                            }}
                                                        />
                                                        <Label htmlFor={`client-${client.id}`} className="w-full cursor-pointer">{client.razonSocial}</Label>
                                                    </div>
                                                ))}
                                            </div>
                                        </ScrollArea>
                                        <DialogFooter>
                                            <Button onClick={() => setClientDialogOpen(false)}>Cerrar</Button>
                                        </DialogFooter>
                                    </DialogContent>
                                </Dialog>
                            </div>
                             <div className="space-y-2">
                                <Label>Operario</Label>
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
                             <div className="flex items-center space-x-2 self-end pb-2">
                                <Checkbox
                                    id="filter-pending"
                                    checked={filterPending}
                                    onCheckedChange={(checked) => setFilterPending(checked as boolean)}
                                />
                                <Label htmlFor="filter-pending" className="cursor-pointer">
                                    Mostrar solo pendientes de Peso Bruto
                                </Label>
                            </div>
                            <div className="flex gap-2 xl:col-start-4">
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
                                    {isLoading ? "Cargando resultados..." : `Mostrando ${reportData.length} conceptos liquidados.`}
                                </CardDescription>
                            </div>
                            <div className="flex gap-2">
                                <Button onClick={handleExportExcel} disabled={isLoading || reportData.length === 0} variant="outline"><File className="mr-2 h-4 w-4" /> Exportar a Excel</Button>
                                <Button onClick={handleExportPDF} disabled={isLoading || reportData.length === 0 || isLogoLoading} variant="outline">{isLogoLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />} Exportar a PDF</Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="w-full overflow-x-auto rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Fecha</TableHead>
                                        <TableHead>Operario</TableHead>
                                        <TableHead>Cliente</TableHead>
                                        <TableHead>Tipo Op.</TableHead>
                                        <TableHead>Tipo Prod.</TableHead>
                                        <TableHead>Pedido</TableHead>
                                        <TableHead>Placa</TableHead>
                                        <TableHead>Contenedor</TableHead>
                                        <TableHead className="text-right">Cantidad (Ton/Und)</TableHead>
                                        <TableHead className="text-right">Duración</TableHead>
                                        <TableHead className="text-right">Productividad</TableHead>
                                        <TableHead>Concepto</TableHead>
                                        <TableHead className="text-right">Vlr. Unitario</TableHead>
                                        <TableHead className="text-right">Vlr. Total Concepto</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading ? (
                                        <TableRow><TableCell colSpan={14}><Skeleton className="h-20 w-full" /></TableCell></TableRow>
                                    ) : displayedData.length > 0 ? (
                                        displayedData.map((row) => {
                                            const indicator = getPerformanceIndicator(row);
                                            const isPending = row.cantidadConcepto === -1;
                                            return (
                                                <TableRow key={row.id}>
                                                    <TableCell className="text-xs">{format(new Date(row.fecha), 'dd/MM/yyyy')}</TableCell>
                                                    <TableCell className="text-xs">{row.operario}</TableCell>
                                                    <TableCell className="text-xs max-w-[150px] truncate" title={row.cliente}>{row.cliente}</TableCell>
                                                    <TableCell className="text-xs">{row.tipoOperacion}</TableCell>
                                                    <TableCell className="text-xs">{row.tipoProducto}</TableCell>
                                                    <TableCell className="text-xs">{row.pedidoSislog}</TableCell>
                                                    <TableCell className="text-xs">{row.placa}</TableCell>
                                                    <TableCell className="text-xs">{row.contenedor}</TableCell>
                                                    <TableCell className="text-xs text-right font-mono">{isPending ? 'Pendiente Ingresar P.Bruto' : row.cantidadConcepto.toFixed(2)}</TableCell>
                                                    <TableCell className="text-xs text-right font-medium">{formatDuration(row.duracionMinutos)}</TableCell>
                                                    <TableCell className={cn("text-xs text-right font-semibold", indicator.color)}>
                                                        <div className="flex items-center justify-end gap-1.5">
                                                            <Circle className={cn("h-2 w-2", indicator.color.replace('text-', 'bg-'))} />
                                                            {indicator.text}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-xs font-semibold">{row.conceptoLiquidado}</TableCell>
                                                     <TableCell className="text-xs text-right font-mono">
                                                        {isPending ? 'N/A' : row.valorUnitario.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}
                                                     </TableCell>
                                                     <TableCell className="text-xs text-right font-mono">
                                                        {isPending ? 'N/A' : row.valorTotalConcepto.toLocaleString('es-CO', { style: 'currency', currency: 'COP' })}
                                                     </TableCell>
                                                </TableRow>
                                            )
                                        })
                                    ) : (
                                        <EmptyState searched={searched} />
                                    )}
                                     {!isLoading && reportData.length > 0 && (
                                        <TableRow className="font-bold bg-muted hover:bg-muted">
                                            <TableCell colSpan={13} className="text-right">TOTAL GENERAL LIQUIDACIÓN</TableCell>
                                            <TableCell className="text-right">{totalLiquidacion.toLocaleString('es-CO', { style: 'currency', currency: 'COP' })}</TableCell>
                                        </TableRow>
                                     )}
                                </TableBody>
                            </Table>
                        </div>
                         <div className="flex items-center justify-between space-x-2 py-4">
                            <div className="flex-1 text-sm text-muted-foreground">{reportData.length} conceptos liquidados en total.</div>
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

    

    



    


