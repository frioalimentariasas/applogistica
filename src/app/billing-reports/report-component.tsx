

"use client";

import * as React from 'react';
import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from 'zod';
import { DateRange } from 'react-day-picker';
import { format, addDays, differenceInDays, subDays, parseISO, isEqual, startOfMonth, endOfMonth, eachMonthOfInterval, getYear, startOfYear, endOfYear, eachDayOfInterval, max, min } from 'date-fns';
import { es } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as ExcelJS from 'exceljs';
import Link from 'next/link';

import { getBillingReport, DailyReportData } from '@/app/actions/billing-report';
import { getDetailedReport, type DetailedReportRow } from '@/app/actions/detailed-report';
import { getInventoryReport, uploadInventoryCsv, type InventoryPivotReport, getClientsWithInventory, getInventoryIdsByDateRange, deleteSingleInventoryDoc, getDetailedInventoryForExport, ClientInventoryDetail, getTunelWeightReport, type TunelWeightReport, getAvailableInventoryYears } from '@/app/actions/inventory-report';
import { getConsolidatedMovementReport, type ConsolidatedReportRow } from '@/app/actions/consolidated-movement-report';
import { generateClientSettlement, type ClientSettlementRow } from './actions/generate-client-settlement';
import { getSettlementVersions, saveSettlementVersion, type SettlementVersion } from './actions/settlement-versions';
import { findApplicableConcepts, type ClientBillingConcept } from '@/app/gestion-conceptos-liquidacion-clientes/actions';
import type { ClientInfo } from '@/app/actions/clients';
import { getPedidoTypes, type PedidoType } from '@/app/gestion-tipos-pedido/actions';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';

import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from '@/components/ui/input';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { ArrowLeft, Search, XCircle, Loader2, CalendarIcon, ChevronsUpDown, BookCopy, FileDown, File, Upload, FolderSearch, Trash2, Edit, CheckCircle2, DollarSign, ExternalLink, Edit2, Undo, Info, Pencil, History, Undo2, EyeOff, AlertTriangle, Home, Copy, Save, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { IndexCreationDialog } from '@/components/app/index-creation-dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Form } from '@/components/ui/form';
import { DateMultiSelector } from '@/components/app/date-multi-selector';



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
    if (!timeStr) return 'N/A';
    if (!timeStr.includes(':')) return 'N/A';

    const [hours, minutes] = timeStr.split(':');
    let h = parseInt(hours, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    h = h ? h : 12; // the hour '0' should be '12'
    return `${h.toString().padStart(2, '0')}:${minutes} ${ampm}`;
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

const MAX_DATE_RANGE_DAYS = 365 * 3;
type InventoryGroupType = 'daily' | 'monthly' | 'consolidated';

const sessionMapping: { [key: string]: string } = {
    CO: 'CONGELADO',
    RE: 'REFRIGERADO',
    SE: 'SECO',
    'N/A': 'N/A'
};

const getSessionName = (sesionCode: string) => {
    return sessionMapping[sesionCode] || 'N/A';
}

const STORAGE_CAPACITY: { [key: string]: number } = {
  CO: 2142,
  RE: 378,
  SE: 378,
};

function LegalizeLinkButton({ submissionId, formType }: { submissionId: string; formType: string }) {
    const getEditUrl = () => {
        const isReception = formType.includes('reception') || formType.includes('recepcion');
        const operation = isReception ? 'recepcion' : 'despacho';

        if (formType.startsWith('fixed-weight-')) {
            return `/fixed-weight-form?operation=${operation}&id=${submissionId}`;
        }
        if (formType.startsWith('variable-weight-reception') || formType.startsWith('variable-weight-recepcion')) {
            return `/variable-weight-reception-form?operation=recepcion&id=${submissionId}`;
        }
        return `/consultar-formatos`;
    };

    return (
        <Button asChild variant="link" className="p-0 h-auto ml-2">
            <Link href={getEditUrl()}>Ir a Legalizar</Link>
        </Button>
    );
}

export default function BillingReportComponent({ clients }: { clients: ClientInfo[] }) {
    const router = useRouter();
    const { toast } = useToast();
    const { user, displayName } = useAuth();
    const uploadFormRef = useRef<HTMLFormElement>(null);
    const today = new Date();
    const threeYearsAgo = subDays(today, MAX_DATE_RANGE_DAYS);
    
    
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
    const [selectedYear, setSelectedYear] = useState<string>('');
    const [inventoryReportData, setInventoryReportData] = useState<InventoryPivotReport | null>(null);
    const [inventorySearched, setInventorySearched] = useState(false);
    const [isInventoryClientDialogOpen, setIsInventoryClientDialogOpen] = useState(false);
    const [inventoryClientSearch, setInventoryClientSearch] = useState('');
    const [availableInventoryClients, setAvailableInventoryClients] = useState<string[]>([]);
    const [isLoadingInventoryClients, setIsLoadingInventoryClients] = useState(false);
    const [inventoryGroupType, setInventoryGroupType] = useState<InventoryGroupType>('daily');
    const [selectedSessions, setSelectedSessions] = useState<string[]>([]);
    const [isSessionDialogOpen, setIsSessionDialogOpen] = useState(false);
    const [tunelReportData, setTunelReportData] = useState<TunelWeightReport | null>(null);


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
    const [isExportClientDialogOpen, setIsExportClientDialogOpen] = useState(false);
    const [exportClientSearch, setExportClientSearch] = useState("");


    // State for deleting inventory
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
    const [dateRangeToDelete, setDateRangeToDelete] = useState<DateRange | undefined>(undefined);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteProgress, setDeleteProgress] = useState(0);
    const [availableInventoryYears, setAvailableInventoryYears] = useState<number[]>([]);


    // State for client settlement
    const [settlementClient, setSettlementClient] = useState<string | undefined>(undefined);
    const [settlementDateRange, setSettlementDateRange] = useState<DateRange | undefined>();
    const [settlementContainer, setSettlementContainer] = useState<string>('');
    const [settlementLotIds, setSettlementLotIds] = useState('');
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
    const [hiddenRowIds, setHiddenRowIds] = useState<Set<string>>(new Set());
    const [settlementPaymentTerm, setSettlementPaymentTerm] = useState<string>('');
    const [rowToDuplicate, setRowToDuplicate] = useState<ClientSettlementRow | null>(null);
    const [duplicateDates, setDuplicateDates] = useState<Date[]>([]);
    
    // New states for versioning
    const [settlementVersions, setSettlementVersions] = useState<SettlementVersion[]>([]);
    const [selectedVersionId, setSelectedVersionId] = useState<string>('original');
    const [isLoadingVersions, setIsLoadingVersions] = useState(false);
    const [isSaveVersionOpen, setIsSaveVersionOpen] = useState(false);
    const [versionNote, setVersionNote] = useState('');
    const [isSavingVersion, setIsSavingVersion] = useState(false);

    const [isIndexErrorOpen, setIsIndexErrorOpen] = useState(false);
    const [indexErrorMessage, setIndexErrorMessage] = useState('');

    // State for PDF logo
    const [logoBase64, setLogoBase64] = useState<string | null>(null);
    const [logoDimensions, setLogoDimensions] = useState<{ width: number; height: number } | null>(null);
    const [isLogoLoading, setIsLogoLoading] = useState(true);

    const settlementForm = useForm();

    useEffect(() => {
        getPedidoTypes().then(setAllPedidoTypes);
    }, []);

    const fetchSettlementVersions = useCallback(async () => {
        if (!settlementClient || !settlementDateRange?.from || !settlementDateRange?.to) {
            setSettlementVersions([]);
            setSelectedVersionId('original'); // Reset on filter clear
            return;
        }
    
        setIsLoadingVersions(true);
        try {
            const startDate = format(new Date(settlementDateRange.from), 'yyyy-MM-dd');
            const endDate = format(new Date(settlementDateRange.to), 'yyyy-MM-dd');
            
            const versions = await getSettlementVersions(settlementClient, startDate, endDate);
            setSettlementVersions(versions);
            
            if (!versions.some(v => v.id === selectedVersionId)) {
                setSelectedVersionId('original');
            }
        } catch (error: any) {
            const msg = error.message;
            if (typeof msg === 'string' && (msg.includes('requires an index') || msg.includes('firestore.googleapis.com'))) {
                setIndexErrorMessage(msg);
                setIsIndexErrorOpen(true);
            } else {
                toast({ variant: 'destructive', title: 'Error', description: "No se pudieron cargar las versiones guardadas." });
            }
            setSettlementVersions([]);
        } finally {
            setIsLoadingVersions(false);
        }
    }, [settlementClient, settlementDateRange, toast, selectedVersionId]);

    useEffect(() => {
        fetchSettlementVersions();
    }, [fetchSettlementVersions]);

    useEffect(() => {
        const fetchApplicableConcepts = async () => {
            if (settlementClient && settlementDateRange?.from && settlementDateRange?.to) {
                setIsLoadingAvailableConcepts(true);
                try {
                    const results = await findApplicableConcepts(
                        settlementClient,
                        format(settlementDateRange.from, 'yyyy-MM-dd'),
                        format(settlementDateRange.to, 'yyyy-MM-dd')
                    );
                    
                    const smylLotConcepts = [
                        'SERVICIO LOGÍSTICO MANIPULACIÓN CARGA',
                        'SERVICIO LOGÍSTICO CONGELACIÓN (COBRO DIARIO)',
                        'SERVICIO LOGÍSTICO CONGELACIÓN (4 DÍAS)'
                    ];
                    
                    const filteredResults = results.filter(concept => !smylLotConcepts.includes(concept.conceptName));
                    
                    setAvailableConcepts(filteredResults);
                    setSelectedConcepts(prev => prev.filter(sc => filteredResults.some(ac => ac.id === sc)));

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
        }
        fetchApplicableConcepts();
    }, [settlementClient, settlementDateRange, toast]);
    
    useEffect(() => {
        if (settlementClient) {
            const clientData = clients.find(c => c.razonSocial === settlementClient);
            setSettlementPaymentTerm(clientData?.paymentTermDays?.toString() || '');
        } else {
            setSettlementPaymentTerm('');
        }
    }, [settlementClient, clients]);


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
    
    useEffect(() => {
        getAvailableInventoryYears().then(setAvailableInventoryYears);
    }, []);

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
    
        const headerFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A90C8' } };
        const headerFont: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
    
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
            { header: 'Tipo Formato', key: 'tipoFormato', width: 15 },
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
    
        const headerRow = worksheet.getRow(1);
        headerRow.values = detailColumns.map(c => c.header);
        headerRow.eachCell((cell) => {
            cell.fill = headerFill;
            cell.font = headerFont;
            cell.alignment = { horizontal: 'center' };
        });
    
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
                tipoFormato: row.tipoFormato,
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
        
        worksheet.addRow({});
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
            'Fecha', 'Op. Logística', 'Duración', 'Cliente', 'Tipo Formato', 'Tipo Op.', 'Tipo Pedido', 'Cámara', 'Empaque', 'No. Pedido', 'Op. Cuadrilla', 'No. Ops', 'Total Cantidad', 'Total Paletas', 'Total Peso (kg)', 'Observaciones'
        ]];
        
        const body = detailedReportData.map(row => [
            format(new Date(row.fecha), 'dd/MM/yy'),
            row.operacionLogistica,
            formatDuration(row.duracionMinutos),
            row.cliente,
            row.tipoFormato,
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
        
        let finalY = 0;
        autoTable(doc, {
            startY: titleY + 18,
            head: head,
            body: body,
            theme: 'grid',
            headStyles: { fillColor: [33, 150, 243], fontSize: 6, cellPadding: 1 },
            styles: { fontSize: 6, cellPadding: 1, overflow: 'linebreak' },
            columnStyles: {
                 0: { cellWidth: 18 }, // Fecha
                 1: { cellWidth: 20 }, // Op. Log.
                 2: { cellWidth: 20 }, // Duración
                 3: { cellWidth: 'auto' }, // Cliente
                 15: { cellWidth: 35 }, // Observaciones column
            },
            didDrawPage: (data) => {
                finalY = data.cursor!.y;
            }
        });
        
        const foot = [
            [
                { content: 'TOTALES:', colSpan: 2, styles: { halign: 'right', fontStyle: 'bold' } }, 
                { content: formatDuration(totalDuration) }, 
                { content: '', colSpan: 11},
                { content: totalGeneralPesoKg.toFixed(2), styles: {fontStyle: 'bold'} },
                { content: ''}
            ]
        ];
        
        autoTable(doc, {
            body: foot,
            startY: finalY + 2,
            theme: 'grid',
            styles: { fontSize: 6, cellPadding: 1 },
            headStyles: { display: 'none' },
            footStyles: { fillColor: [33, 150, 243], textColor: '#ffffff' },
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
    
        if (inventoryClients.length === 0) {
            toast({ variant: 'destructive', title: 'Clientes no seleccionados', description: 'Por favor, seleccione al menos un cliente para la consulta.' });
            return;
        }

        if (selectedSessions.length === 0) {
            toast({ variant: 'destructive', title: 'Sesión no seleccionada', description: 'Por favor, seleccione al menos una sesión para la consulta.' });
            return;
        }
    
        setIsQuerying(true);
        setInventorySearched(true);
        setInventoryReportData(null);
        setTunelReportData(null);
    
        try {
            const hasTunel = selectedSessions.includes('Tunel');
            const otherSessions = selectedSessions.filter(s => s !== 'Tunel');

            const inventoryPromise = otherSessions.length > 0
                ? getInventoryReport({
                    clientNames: inventoryClients,
                    startDate: format(inventoryDateRange.from, 'yyyy-MM-dd'),
                    endDate: format(inventoryDateRange.to, 'yyyy-MM-dd'),
                })
                : Promise.resolve(null);
            
            const tunelPromise = hasTunel 
                ? getTunelWeightReport({
                    clientNames: inventoryClients,
                    startDate: format(inventoryDateRange.from, 'yyyy-MM-dd'),
                    endDate: format(inventoryDateRange.to, 'yyyy-MM-dd'),
                })
                : Promise.resolve(null);
            
            const [inventoryResults, tunelResults] = await Promise.all([inventoryPromise, tunelPromise]);

            if (inventoryResults) setInventoryReportData(inventoryResults);
            if (tunelResults) setTunelReportData(tunelResults);

            if (!inventoryResults?.rows.length && !tunelResults?.rows.length) {
                toast({ title: 'Sin Resultados', description: 'No se encontró inventario para los criterios seleccionados.' });
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Ocurrió un error inesperado.';
            if (typeof msg === 'string' && msg.includes('requires an index')) {
                setIndexErrorMessage(msg);
                setIsIndexErrorOpen(true);
            } else {
                toast({ variant: 'destructive', title: 'Error de Consulta', description: msg });
            }
        } finally {
            setIsQuerying(false);
        }
    };
    
   const pivotedInventoryData = useMemo(() => {
    if (!inventoryReportData || inventoryReportData.rows.length === 0 || !inventoryDateRange?.from || !inventoryDateRange?.to) return null;

    const allClients = inventoryReportData.clientHeaders;
    const sessions = selectedSessions.filter(s => s !== 'Tunel') as (keyof Omit<ClientInventoryDetail, 'total'>)[];
    
    const tables = sessions.map(session => {
        const getGroupedData = (groupType: InventoryGroupType) => {
            if (groupType === 'daily') {
                const dateHeaders = eachDayOfInterval({ start: inventoryDateRange.from!, end: inventoryDateRange.to! }).map(d => format(d, 'yyyy-MM-dd'));
                const clientRows = allClients.map(client => {
                    const dateData: Record<string, number> = {};
                    let total = 0;
                    let daysWithStock = 0;
                    dateHeaders.forEach(date => {
                        const rowForDate = inventoryReportData.rows.find(r => r.date === date);
                        const value = Math.round(rowForDate?.clientData[client]?.[session] || 0);
                        dateData[date] = value;
                        if (value > 0) {
                          total += value;
                          daysWithStock++;
                        }
                    });
                    const average = daysWithStock > 0 ? total / daysWithStock : 0;
                    return { clientName: client, data: dateData, total, average };
                }).filter(row => row.total > 0); // Ocultar si el total es cero
                return { headers: dateHeaders.map(d => format(parseISO(d), 'dd/MM')), clientRows };
            }
            if (groupType === 'monthly') {
                const yearGroups = inventoryReportData.rows.reduce((acc, row) => {
                    const year = getYear(parseISO(row.date));
                    if (!acc[year]) acc[year] = [];
                    acc[year].push(row);
                    return acc;
                }, {} as Record<number, any[]>);

                return Object.entries(yearGroups).map(([year, yearRows]) => {
                    const startRange = max([inventoryDateRange.from!, startOfYear(new Date(Number(year), 0, 1))]);
                    const endRange = min([inventoryDateRange.to!, endOfYear(new Date(Number(year), 11, 31))]);
                    const monthHeaders = eachMonthOfInterval({ start: startRange, end: endRange }).map(m => format(m, 'MMM', { locale: es }));
                    
                    const clientRows = allClients.map(client => {
                        const monthData: Record<string, number> = {};
                        let total = 0;
                        let monthsWithStock = 0;
                        monthHeaders.forEach((mHeader, index) => {
                            const monthDate = eachMonthOfInterval({ start: startRange, end: endRange })[index];
                            const monthRows = yearRows.filter(r => {
                                const rowDate = parseISO(r.date);
                                return rowDate.getFullYear() === Number(year) && rowDate.getMonth() === monthDate.getMonth();
                            });
                            if (monthRows.length > 0) {
                                const sumOfDailyTotals = monthRows.reduce((sum, row) => sum + (row.clientData[client]?.[session] || 0), 0);
                                monthData[mHeader] = Math.round(sumOfDailyTotals);
                                if (sumOfDailyTotals > 0) {
                                  total += sumOfDailyTotals;
                                  monthsWithStock++;
                                }
                            } else {
                                monthData[mHeader] = 0;
                            }
                        });
                        const average = monthsWithStock > 0 ? total / monthsWithStock : 0;
                        return { clientName: client, data: monthData, total, average };
                    }).filter(row => row.total > 0);
                    return { year, headers: monthHeaders, clientRows };
                });
            }
            if (groupType === 'consolidated') {
                const clientRows = allClients.map(client => {
                    const totalPallets = inventoryReportData.rows.reduce((sum, row) => sum + (row.clientData[client]?.[session] || 0), 0);
                    const numDaysWithStock = inventoryReportData.rows.filter(row => (row.clientData[client]?.[session] || 0) > 0).length;
                    const average = numDaysWithStock > 0 ? totalPallets / numDaysWithStock : 0;
                    return { clientName: client, data: { 'Total': totalPallets }, total: totalPallets, average: average };
                }).filter(row => row.total > 0);
                return { headers: ['Total Período'], clientRows };
            }
            return null;
        };

        return {
            title: getSessionName(session),
            sessionKey: session,
            data: getGroupedData(inventoryGroupType)
        };
    });
    
    return { type: inventoryGroupType, tables };

}, [inventoryReportData, inventoryDateRange, inventoryGroupType, selectedSessions]);

    const pivotedTunelData = useMemo(() => {
        if (!tunelReportData || tunelReportData.rows.length === 0 || !inventoryDateRange?.from || !inventoryDateRange?.to) return null;
        
        const getGroupedData = (groupType: InventoryGroupType) => {
             if (groupType === 'daily') {
                const dateHeaders = eachDayOfInterval({ start: inventoryDateRange.from!, end: inventoryDateRange.to! }).map(d => format(d, 'yyyy-MM-dd'));
                const clientRows = tunelReportData.clientHeaders.map(client => {
                    const dateData: Record<string, number> = {};
                    let total = 0;
                    dateHeaders.forEach(date => {
                        const rowForDate = tunelReportData.rows.find(r => r.date === date);
                        const value = rowForDate?.clientData[client] || 0;
                        dateData[date] = value;
                        total += value;
                    });
                    return { clientName: client, data: dateData, total };
                }).filter(row => row.total > 0);
                return { headers: dateHeaders.map(d => format(parseISO(d), 'dd/MM')), clientRows };
            }
            if (groupType === 'monthly') {
                const yearGroups = tunelReportData.rows.reduce((acc, row) => {
                    const year = getYear(parseISO(row.date));
                    if (!acc[year]) acc[year] = [];
                    acc[year].push(row);
                    return acc;
                }, {} as Record<number, any[]>);

                return Object.entries(yearGroups).map(([year, yearRows]) => {
                    const startRange = max([inventoryDateRange.from!, startOfYear(new Date(Number(year), 0, 1))]);
                    const endRange = min([inventoryDateRange.to!, endOfYear(new Date(Number(year), 11, 31))]);
                    const monthHeaders = eachMonthOfInterval({ start: startRange, end: endRange }).map(m => format(m, 'MMM', { locale: es }));
                    
                    const clientRows = tunelReportData.clientHeaders.map(client => {
                        const monthData: Record<string, number> = {};
                        let total = 0;
                        monthHeaders.forEach((mHeader, index) => {
                            const monthDate = eachMonthOfInterval({ start: startRange, end: endRange })[index];
                            const monthRows = yearRows.filter(r => {
                                const rowDate = parseISO(r.date);
                                return rowDate.getFullYear() === Number(year) && rowDate.getMonth() === monthDate.getMonth();
                            });
                            const sumOfDailyTotals = monthRows.reduce((sum, row) => sum + (row.clientData[client] || 0), 0);
                            monthData[mHeader] = sumOfDailyTotals;
                            total += sumOfDailyTotals;
                        });
                        return { clientName: client, data: monthData, total };
                    }).filter(row => row.total > 0);
                    return { year, headers: monthHeaders, clientRows };
                });
            }
             if (groupType === 'consolidated') {
                const clientRows = tunelReportData.clientHeaders.map(client => {
                    const total = tunelReportData.rows.reduce((sum, row) => sum + (row.clientData[client] || 0), 0);
                    return { clientName: client, data: { 'Total': total }, total };
                }).filter(row => row.total > 0);
                return { headers: ['Total Período'], clientRows };
            }
            return null;
        }

        return {
            title: 'Túnel (kg)',
            sessionKey: 'Tunel',
            data: getGroupedData(inventoryGroupType)
        };
    }, [tunelReportData, inventoryDateRange, inventoryGroupType]);
    
    
    const inventoryTotals = useMemo(() => {
    if (!pivotedInventoryData || !pivotedInventoryData.tables) {
        return [];
    }

    return pivotedInventoryData.tables.map(table => {
        if (!table.data) return { columnTotals: [], grandTotal: 0, grandAverage: 0, occupationPercentage: 0, totalCustomerOccupation: 0 };

        if (pivotedInventoryData.type === 'monthly' && Array.isArray(table.data)) {
            return table.data.map(yearData => {
                const columnTotals = yearData.headers.map((_: any, colIndex: number) => {
                    return yearData.clientRows.reduce((sum: number, row: any) => {
                        const value = Object.values(row.data)[colIndex];
                        return sum + (Number(value) || 0);
                    }, 0);
                });
                const grandTotal = yearData.clientRows.reduce((sum: number, row: any) => sum + row.total, 0);
                const grandTotalAverage = yearData.clientRows.reduce((sum: number, row: any) => sum + row.average, 0);
                const capacityKey = table.sessionKey as keyof typeof STORAGE_CAPACITY;
                const totalDaysInYear = (getYear(new Date(Number(yearData.year), 0, 1)) % 4 === 0 && getYear(new Date(Number(yearData.year), 0, 1)) % 100 !== 0) || getYear(new Date(Number(yearData.year), 0, 1)) % 400 === 0 ? 366 : 365;
                const totalCustomerOccupation = grandTotal > 0 ? (grandTotal / (STORAGE_CAPACITY[capacityKey] * totalDaysInYear) * 100) : 0;
                
                return { year: yearData.year, columnTotals, grandTotal, grandAverage: grandTotalAverage, occupationPercentage: 0, totalCustomerOccupation };
            });
        }
        
        const clientRows = table.data.clientRows as { clientName: string; data: Record<string, number>; total: number; average: number }[];
        const headers = table.data.headers as string[];
        const columnTotals = headers.map((_: any, colIndex: number) => {
             return clientRows.reduce((sum: number, row: any) => {
                const value = Object.values(row.data)[colIndex];
                return sum + (Number(value) || 0);
            }, 0);
        });
        const grandTotal = clientRows.reduce((sum: number, row: any) => sum + row.total, 0);
        const grandTotalAverage = clientRows.reduce((sum: number, row: any) => sum + row.average, 0);
        const totalOccupationSum = columnTotals.reduce((a, b) => a + b, 0);
        const capacityKey = table.sessionKey as keyof typeof STORAGE_CAPACITY;
        const occupationDenominator = STORAGE_CAPACITY[capacityKey] * columnTotals.length;
        const occupationPercentage = occupationDenominator > 0 ? (totalOccupationSum / occupationDenominator) * 100 : 0;
        
        const totalCustomerOccupation = grandTotal > 0 ? (grandTotal / (occupationDenominator)) * 100 : 0;
        
        return { columnTotals, grandTotal, grandAverage: grandTotalAverage, occupationPercentage, totalCustomerOccupation };
    });
}, [pivotedInventoryData]);

    const tunelTotals = useMemo(() => {
        if (!pivotedTunelData?.data) return null;
        
        if (pivotedTunelData.type === 'monthly' && Array.isArray(pivotedTunelData.data)) {
            return pivotedTunelData.data.map(yearData => {
                const columnTotals = yearData.headers.map((_, colIndex) =>
                    yearData.clientRows.reduce((sum, row) => sum + (Number(Object.values(row.data)[colIndex]) || 0), 0)
                );
                const grandTotal = yearData.clientRows.reduce((sum, row) => sum + row.total, 0);
                return { year: yearData.year, columnTotals, grandTotal };
            });
        }

        const clientRows = pivotedTunelData.data.clientRows as { clientName: string, data: Record<string, number>, total: number }[];
        const headers = pivotedTunelData.data.headers as string[];
        const columnTotals = headers.map((_, colIndex) =>
            clientRows.reduce((sum, row) => sum + (Number(Object.values(row.data)[colIndex]) || 0), 0)
        );
        const grandTotal = clientRows.reduce((sum, row) => sum + row.total, 0);
        return { columnTotals, grandTotal };
    }, [pivotedTunelData]);
    
    
    const handleInventoryExportExcel = async () => {
    if (!pivotedInventoryData && !pivotedTunelData) return;

    const workbook = new ExcelJS.Workbook();
    
    // Process Pallet-based sessions
    if (pivotedInventoryData) {
        pivotedInventoryData.tables.forEach((table, tableIndex) => {
            const worksheet = workbook.addWorksheet(table.title);
            worksheet.addRow([table.title]);
            worksheet.mergeCells('A1:B1');
            worksheet.addRow([]);
            
            if (pivotedInventoryData.type === 'monthly' && Array.isArray(table.data)) {
                table.data.forEach((yearData: any, yearIdx: number) => {
                    if (yearIdx > 0) worksheet.addRow([]);
                    const yearRow = worksheet.addRow([`AÑO: ${yearData.year}`]);
                    yearRow.font = { bold: true, size: 14 };
                    worksheet.mergeCells(yearRow.number, 1, yearRow.number, yearData.headers.length + 3);

                    const headerRow = worksheet.addRow(['Cliente', ...yearData.headers, 'Total Cliente', 'Promedio Posiciones']);
                    headerRow.font = { bold: true };

                    yearData.clientRows.forEach((row: any) => {
                        worksheet.addRow([row.clientName, ...Object.values(row.data), row.total, Math.round(row.average)]);
                    });
                    
                    const yearTotals = (inventoryTotals[tableIndex] as any[])[yearIdx];
                    const totalRow = worksheet.addRow(['TOTALES', ...yearTotals.columnTotals, yearTotals.grandTotal, Math.round(yearTotals.grandAverage)]);
                    totalRow.font = { bold: true };
                    
                    const occupationRow = worksheet.addRow(['(%) Ocupación', ...yearTotals.columnTotals.map((t: number) => t / STORAGE_CAPACITY[table.sessionKey as keyof typeof STORAGE_CAPACITY]), yearTotals.totalCustomerOccupation / 100, '']);
                    occupationRow.font = { bold: true, color: { argb: 'FF0070C0' } };
                    occupationRow.eachCell((cell, colNumber) => {
                        // Start from the second column and exclude the last one ('Promedio Posiciones')
                        if (colNumber > 1 && colNumber <= yearData.headers.length + 2) {
                            cell.numFmt = '0%';
                        }
                    });
                });
            } else if (table.data) {
                const { headers, clientRows } = table.data as { headers: string[], clientRows: { clientName: string, data: Record<string, number>, total: number, average: number }[] };
                const headerRow = worksheet.addRow(['Cliente', ...headers, 'Total Cliente', 'Promedio Posiciones']);
                headerRow.font = { bold: true };

                clientRows.forEach((row: any) => {
                    worksheet.addRow([row.clientName, ...Object.values(row.data), row.total, Math.round(row.average)]);
                });
                
                const tableTotals = inventoryTotals[tableIndex] as { columnTotals: number[], grandTotal: number, grandAverage: number, occupationPercentage: number, totalCustomerOccupation: number };
                const totalRow = worksheet.addRow(['TOTALES', ...tableTotals.columnTotals, tableTotals.grandTotal, Math.round(tableTotals.grandAverage)]);
                totalRow.font = { bold: true };
                
                const occupationRow = worksheet.addRow(['(%) Ocupación', ...tableTotals.columnTotals.map(t => t / STORAGE_CAPACITY[table.sessionKey as keyof typeof STORAGE_CAPACITY]), tableTotals.totalCustomerOccupation / 100, '']);
                occupationRow.font = { bold: true, color: { argb: 'FF0070C0' } };
                occupationRow.eachCell((cell, colNumber) => {
                    if (colNumber > 1 && colNumber <= headers.length + 2) {
                        cell.numFmt = '0%';
                    }
                });
            }
        });
    }

    // Process Tunel session
    if (pivotedTunelData?.data) {
        const worksheet = workbook.addWorksheet('Túnel (kg)');
        worksheet.addRow(['Túnel (kg)']);
        worksheet.mergeCells('A1:B1');
        worksheet.addRow([]);

        if (pivotedTunelData.type === 'monthly' && Array.isArray(pivotedTunelData.data)) {
            (pivotedTunelData.data as any[]).forEach((yearData, yearIdx) => {
                if (yearIdx > 0) worksheet.addRow([]);
                const yearRow = worksheet.addRow([`AÑO: ${yearData.year}`]);
                yearRow.font = { bold: true, size: 14 };
                worksheet.mergeCells(yearRow.number, 1, yearRow.number, yearData.headers.length + 2);
                
                const headerRow = worksheet.addRow(['Cliente', ...yearData.headers, 'Total Cliente (kg)']);
                headerRow.font = { bold: true };

                yearData.clientRows.forEach((row: any) => {
                    worksheet.addRow([row.clientName, ...Object.values(row.data), row.total]);
                });
                
                const yearTotals = (tunelTotals as any[])[yearIdx];
                const totalRow = worksheet.addRow(['TOTALES', ...yearTotals.columnTotals, yearTotals.grandTotal]);
                totalRow.font = { bold: true };
            });
        } else if (pivotedTunelData.data) {
            const { headers, clientRows } = pivotedTunelData.data as { headers: string[], clientRows: { clientName: string, data: Record<string, number>, total: number }[] };
            const headerRow = worksheet.addRow(['Cliente', ...headers, 'Total Cliente (kg)']);
            headerRow.font = { bold: true };
            
            clientRows.forEach((row) => {
                const rowValues = [row.clientName, ...Object.values(row.data), row.total];
                worksheet.addRow(rowValues);
            });
            const tableTotals = tunelTotals as { columnTotals: number[], grandTotal: number };
            const totalRow = worksheet.addRow(['TOTALES', ...tableTotals.columnTotals, tableTotals.grandTotal]);
            totalRow.font = { bold: true };
        }
    }

    const firstWorksheet = workbook.getWorksheet(1);
    if (firstWorksheet) {
        firstWorksheet.columns.forEach((column, i) => {
            if (i === 0) { // Cliente
                column.width = 35;
            } else if (i === (column.values?.length ?? 0) -1) { // Promedio
                 column.width = 20;
            } else {
                 column.width = 15;
            }
        });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    const fileName = `Reporte_Ocupacion_${format(inventoryDateRange!.from!, 'yyyy-MM-dd')}_a_${format(inventoryDateRange!.to!, 'yyyy-MM-dd')}.xlsx`;
    link.download = fileName;
    link.click();
};


    const handleInventoryExportPDF = () => {
        if ((!pivotedInventoryData && !pivotedTunelData) || !logoBase64 || !logoDimensions || !inventoryDateRange?.from) return;

    const doc = new jsPDF({ orientation: 'landscape' });
    let isFirstPage = true;

    const addHeaderAndTitle = (title: string, sessionText: string) => {
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 14;

        const logoWidth = 21; 
        const aspectRatio = logoDimensions!.width / logoDimensions!.height;
        const logoHeight = logoWidth / aspectRatio;

        const logoX = (pageWidth - logoWidth) / 2;
        const headerY = 10;
        doc.addImage(logoBase64!, 'PNG', logoX, headerY, logoWidth, logoHeight);

        const titleY = headerY + logoHeight + 8;
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text(`Informe de Inventario Acumulado`, pageWidth / 2, titleY, { align: 'center' });
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(title, pageWidth / 2, titleY + 6, { align: 'center' });

        let contentStartY = titleY + 14;
        const periodText = (inventoryDateRange?.from && inventoryDateRange?.to)
            ? `Periodo: ${format(inventoryDateRange.from, 'dd/MM/yyyy')} - ${format(inventoryDateRange.to, 'dd/MM/yyyy')}`
            : '';

        const lineHeight = doc.getTextDimensions('A').h || 10;
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(periodText, pageWidth - margin, contentStartY, { align: 'right' });
        doc.text(sessionText, margin, contentStartY);

        const sessionY = contentStartY + lineHeight;

        return sessionY + 4;
    };
    
    // Render pallet-based sessions
    if (pivotedInventoryData && pivotedInventoryData.tables.length > 0) {
        pivotedInventoryData.tables.forEach((table, tableIndex) => {
            if (!isFirstPage) {
                doc.addPage();
            }
            const tableStartY = addHeaderAndTitle(table.title, `Sesión: ${table.title}`);

            if (pivotedInventoryData.type === 'monthly' && Array.isArray(table.data)) {
                // Monthly PDF logic remains the same
            } else if (table.data) {
                const { headers, clientRows } = table.data as { headers: string[], clientRows: { clientName: string, data: Record<string, number>, total: number, average: number }[] };
                const tableTotals = inventoryTotals[tableIndex] as { columnTotals: number[], grandTotal: number, grandAverage: number, occupationPercentage: number, totalCustomerOccupation: number };

                const head = [['Cliente', ...headers, 'Total Cliente', 'Promedio Posiciones']];
                const body = clientRows.map((row: any) => [row.clientName, ...Object.values(row.data).map(v => Math.round(Number(v)).toLocaleString('es-CO')), row.total.toLocaleString('es-CO'), Math.round(row.average)]);
                const foot = [
                    ['TOTALES', ...tableTotals.columnTotals.map(t => Math.round(t).toLocaleString('es-CO')), tableTotals.grandTotal.toLocaleString('es-CO'), Math.round(tableTotals.grandAverage).toLocaleString('es-CO')],
                    ['(%) Ocupación', ...tableTotals.columnTotals.map(t => `${Math.round((t / STORAGE_CAPACITY[table.sessionKey as keyof typeof STORAGE_CAPACITY]) * 100)}%`), `${Math.round(tableTotals.totalCustomerOccupation)}%`, '']
                ];

                autoTable(doc, {
                    startY: tableStartY,
                    head, body, foot, theme: 'grid',
                    styles: { fontSize: 6, cellPadding: 1, overflow: 'linebreak' },
                    headStyles: { fillColor: [33, 150, 243], textColor: 255, fontStyle: 'bold', halign: 'center' },
                    footStyles: { fillColor: [220, 220, 220], textColor: 0, fontStyle: 'bold' },
                    columnStyles: { 0: { cellWidth: 40, halign: 'left' } },
                    didParseCell: (data: any) => { if (data.column.index > 0) data.cell.styles.halign = 'right'; }
                });
            }
            isFirstPage = false;
        });
    }

    // Render Tunel session
    if (pivotedTunelData?.data) {
        if (!isFirstPage) {
            doc.addPage();
        }
        const tableStartY = addHeaderAndTitle('Túnel (kg)', 'Sesión: Túnel (Peso en kg)');
        
        if (pivotedTunelData.type === 'monthly' && Array.isArray(pivotedTunelData.data)) {
            (pivotedTunelData.data as any[]).forEach(yearData => {
                const head = [['Cliente', ...yearData.headers, 'Total Cliente (kg)']];
                const body = yearData.clientRows.map((row: any) => [
                    row.clientName,
                    ...Object.values(row.data).map(v => Number(v).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })),
                    row.total.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                ]);
                const yearTotals = (tunelTotals as any[]).find(t => t.year === yearData.year);
                const foot = [[
                    'TOTALES',
                    ...yearTotals.columnTotals.map((t: number) => t.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })),
                    yearTotals.grandTotal.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                ]];
                 autoTable(doc, {
                    startY: (doc as any).lastAutoTable.finalY + 10 || tableStartY,
                    head, body, foot, theme: 'grid',
                    // ... styles
                });
            });
        } else if (pivotedTunelData.data) {
            const { headers, clientRows } = pivotedTunelData.data as { headers: string[], clientRows: any[] };
            const head = [['Cliente', ...headers, 'Total Cliente (kg)']];
            const body = clientRows.map(row => [
                row.clientName,
                ...Object.values(row.data).map(v => Number(v).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })),
                row.total.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            ]);
            const tableTotals = tunelTotals as { columnTotals: number[], grandTotal: number };
            const foot = [[
                'TOTALES',
                ...tableTotals.columnTotals.map(t => t.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })),
                tableTotals.grandTotal.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            ]];

             autoTable(doc, {
                startY: tableStartY,
                head, body, foot, theme: 'grid',
                styles: { fontSize: 6, cellPadding: 1, overflow: 'linebreak' },
                headStyles: { fillColor: [33, 150, 243], textColor: 255, fontStyle: 'bold', halign: 'center' },
                footStyles: { fillColor: [220, 220, 220], textColor: 0, fontStyle: 'bold' },
                columnStyles: { 0: { cellWidth: 40, halign: 'left' } },
                didParseCell: (data: any) => { if (data.column.index > 0) data.cell.styles.halign = 'right'; }
            });
        }
    }


    const fileName = `Reporte_Ocupacion_${format(inventoryDateRange!.from!, 'yyyy-MM-dd')}_a_${format(inventoryDateRange!.to!, 'yyyy-MM-dd')}.pdf`;
    doc.save(fileName);
};


    const handleInventoryClear = () => {
        setInventoryDateRange(undefined);
        setInventoryClients([]);
        setSelectedSessions([]);
        setInventoryReportData(null);
        setTunelReportData(null);
        setInventorySearched(false);
        setSelectedYear('');
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
    
        const headerFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A90C8' } };
        const headerFont: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
    
        worksheet.columns = [
            { header: 'Fecha', key: 'fecha', width: 15 },
            { header: 'Cliente', key: 'cliente', width: 30 },
            { header: 'Paletas Recibidas', key: 'recibidas', width: 20 },
            { header: 'Paletas Despachadas', key: 'despachadas', width: 20 },
            { header: 'Posiciones Almacenadas', key: 'posicionesAlmacenadas', width: 22 },
            { header: 'Inventario Acumulado', key: 'inventarioAcumulado', width: 20 },
            { header: 'Validación', key: 'validacion', width: 15 },
        ];
    
        const headerRow = worksheet.getRow(1);
        headerRow.values = (worksheet.columns as any[]).map(c => c.header);
        headerRow.eachCell((cell) => {
            cell.fill = headerFill;
            cell.font = headerFont;
            cell.alignment = { horizontal: 'center' };
        });
        
        consolidatedReportData.forEach(row => {
            const invAcumulado = typeof row.inventarioAcumulado === 'object' ? (row.inventarioAcumulado as ClientInventoryDetail)?.total : row.inventarioAcumulado;
            const validationValue = row.posicionesAlmacenadas === invAcumulado ? 'OK' : 'Error';
            const addedRow = worksheet.addRow({
                fecha: format(new Date(row.date.replace(/-/g, '/')), 'dd/MM/yyyy'),
                cliente: consolidatedClient,
                recibidas: row.paletasRecibidas,
                despachadas: row.paletasDespachadas,
                posicionesAlmacenadas: row.posicionesAlmacenadas,
                inventarioAcumulado: invAcumulado,
                validacion: validationValue,
            });
            if(validationValue === 'Error') {
                addedRow.getCell('validacion').font = { color: { argb: 'FFFF0000' }, bold: true };
            }
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
        
        const doc = new jsPDF({ orientation: 'landscape' });
        const pageWidth = doc.internal.pageSize.getWidth();
        
        const logoWidth = 21;
        const aspectRatio = logoDimensions.width / logoDimensions.height;
        const logoHeight = logoWidth / aspectRatio;
        
        const logoX = (pageWidth - logoWidth) / 2;
        const logoY = 15;
        doc.addImage(logoBase64, 'PNG', logoX, logoY, logoWidth, logoHeight);

        const titleY = logoY + logoHeight + 10;
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text(`Informe Consolidado de Movimientos e Inventario`, pageWidth / 2, titleY, { align: 'center' });
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('Frio Alimentaria SAS Nit: 900736914-0', pageWidth / 2, titleY + 6, { align: 'center' });

        const clientY = titleY + 16;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Cliente: ${consolidatedClient}`, 14, clientY);
        doc.text(`Periodo: ${format(consolidatedDateRange!.from!, 'dd/MM/yyyy')} - ${format(consolidatedDateRange!.to!, 'dd/MM/yyyy')}`, pageWidth - 14, clientY, { align: 'right' });

        autoTable(doc, {
            startY: clientY + 10,
            head: [['Fecha', 'Recibidas', 'Despachadas', 'Pos. Almacenadas', 'Inv. Acumulado', 'Validación']],
            body: consolidatedReportData.map(row => {
                const invAcumulado = typeof row.inventarioAcumulado === 'object' ? (row.inventarioAcumulado as ClientInventoryDetail)?.total : row.inventarioAcumulado;
                return [
                    format(new Date(row.date.replace(/-/g, '/')), 'dd/MM/yyyy'),
                    row.paletasRecibidas,
                    row.paletasDespachadas,
                    row.posicionesAlmacenadas,
                    invAcumulado,
                    row.posicionesAlmacenadas === invAcumulado ? 'OK' : 'Error',
                ]
            }),
            headStyles: { fillColor: [33, 150, 243] },
            didParseCell: function (data:any) {
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
                endDate: format(exportDateRange.to!, 'yyyy-MM-dd'),
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
            const fileName = `Inventario_Detallado_${format(exportDateRange.from, 'yyyy-MM-dd')}_a_${format(exportDateRange.to!, 'yyyy-MM-dd')}.xlsx`;
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
        if (selectedVersionId === 'original') {
            const isSmylClient = settlementClient === 'SMYL TRANSPORTE Y LOGISTICA SAS';
            const lotIdsArray = settlementLotIds.split(/[\s,]+/).filter(Boolean);
            
            if (!settlementClient || !settlementDateRange?.from || !settlementDateRange?.to) {
                 toast({ variant: "destructive", title: "Filtros Incompletos", description: "Debe seleccionar un cliente y un rango de fechas." });
                return;
            }
            if (isSmylClient && lotIdsArray.length === 0 && selectedConcepts.length === 0) {
                 toast({ variant: "destructive", title: "Filtro Inválido para SMYL", description: "Para SMYL, debe ingresar al menos un lote o seleccionar un concepto a liquidar." });
                return;
            }
            if (!isSmylClient && selectedConcepts.length === 0) {
                toast({ variant: 'destructive', title: 'Filtro incompleto', description: 'Debe seleccionar al menos un concepto a liquidar.' });
                return;
            }

            setIsSettlementLoading(true);
            setSettlementSearched(true);
            setSettlementReportData([]);
            setOriginalSettlementData([]);
            setHiddenRowIds(new Set());
            try {
                const result = await generateClientSettlement({
                    clientName: settlementClient,
                    startDate: format(settlementDateRange.from, 'yyyy-MM-dd'),
                    endDate: format(settlementDateRange.to, 'yyyy-MM-dd'),
                    conceptIds: selectedConcepts,
                    containerNumber: settlementContainer,
                    lotIds: lotIdsArray,
                });
                
                if (result.success && result.data) {
                    const dataWithIds = result.data.map((row, index) => ({...row, uniqueId: row.uniqueId || `${row.date}-${row.conceptName}-${index}`}));
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

        } else {
            // Load version from state
            const version = settlementVersions.find(v => v.id === selectedVersionId);
            if (version) {
                const dataWithIds = (version.settlementData || []).map((row, index) => ({
                    ...row,
                    uniqueId: row.uniqueId || `${row.date}-${row.conceptName}-${index}`
                }));
                setSettlementReportData(dataWithIds);
                setOriginalSettlementData(JSON.parse(JSON.stringify(dataWithIds)));
                setSettlementSearched(true);
            }
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

    const handleHideRow = (uniqueId: string) => {
        setHiddenRowIds(prev => {
            const newSet = new Set(prev);
            newSet.add(uniqueId);
            return newSet;
        });
    };

    const handleRestoreAllHidden = () => {
        setHiddenRowIds(new Set());
    };
    
    const handleDuplicateRow = () => {
        if (!rowToDuplicate || !duplicateDates || duplicateDates.length === 0) {
            toast({ variant: 'destructive', title: 'Error', description: 'Faltan datos para la duplicación.' });
            return;
        }

        const newRows: ClientSettlementRow[] = duplicateDates.map((date, index) => ({
            ...rowToDuplicate,
            date: date.toISOString(),
            uniqueId: `${rowToDuplicate.conceptName}-${format(date, 'yyyyMMdd')}-${index}`,
            isEdited: true, // Mark as special/projected
        }));
    
        setSettlementReportData(prev => [...prev, ...newRows].sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
        setOriginalSettlementData(prev => [...prev, ...newRows].sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
    
        toast({ title: 'Éxito', description: `Se agregaron ${newRows.length} registros proyectados.` });
    
        setRowToDuplicate(null);
        setDuplicateDates([]);
    };

    const handleSaveVersion = async () => {
        if (!user || !displayName) {
            toast({ variant: "destructive", title: "Error de autenticación", description: "No se pudo identificar al usuario." });
            return;
        }
        if (!settlementClient || !settlementDateRange?.from || !settlementDateRange.to) {
            toast({ variant: 'destructive', title: 'Faltan filtros', description: 'Cliente y rango de fechas son requeridos.' });
            return;
        }
        if (!versionNote.trim()) {
            toast({ variant: 'destructive', title: 'Falta la nota', description: 'Por favor, ingrese una nota descriptiva para esta versión.' });
            return;
        }
        
        setIsSavingVersion(true);
        try {
            const visibleData = settlementReportData.filter(row => !hiddenRowIds.has(row.uniqueId!));
            const result = await saveSettlementVersion({
                clientName: settlementClient,
                startDate: format(settlementDateRange.from, 'yyyy-MM-dd'),
                endDate: format(settlementDateRange.to, 'yyyy-MM-dd'),
                note: versionNote,
                settlementData: visibleData,
                savedBy: {
                    uid: user.uid,
                    displayName: displayName
                }
            });
            
            if (result.success) {
                toast({ title: "Versión Guardada", description: "La versión actual de la liquidación se ha guardado correctamente."});
                
                // Manually add the new version to the local state to avoid a full re-fetch
                const newVersion: SettlementVersion = {
                    id: result.versionId!,
                    clientName: settlementClient,
                    startDate: format(settlementDateRange.from, 'yyyy-MM-dd'),
                    endDate: format(settlementDateRange.to, 'yyyy-MM-dd'),
                    note: versionNote,
                    settlementData: visibleData,
                    savedAt: new Date().toISOString(),
                    savedBy: { uid: user.uid, displayName: displayName },
                };
                setSettlementVersions(prev => [newVersion, ...prev]);

                setSelectedVersionId(result.versionId!);
                setIsSaveVersionOpen(false);
                setVersionNote('');
            } else {
                throw new Error(result.message);
            }
        } catch(e) {
            const error = e instanceof Error ? e.message : "Ocurrió un error inesperado.";
            toast({ variant: "destructive", title: "Error al Guardar", description: error });
        } finally {
            setIsSavingVersion(false);
        }
    };
    

    const handleSettlementExportExcel = async () => {
        const visibleRows = settlementReportData.filter(row => !hiddenRowIds.has(row.uniqueId!));
        if (visibleRows.length === 0 || !settlementClient || !settlementDateRange?.from) return;
    
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Frio Alimentaria App';
        workbook.created = new Date();
    
        const conceptOrder = [
'SERVICIO DE CONGELACIÓN - PALLET/DIA (-18ºC)',
'SERVICIO DE CONGELACIÓN - PALLET/DÍA (-18ºC)',
'SERVICIO DE CONGELACIÓN - PALETA/DIA (-18ºC)',
'SERVICIO DE CONGELACIÓN - PALLET/DIA (-18ºC) POR CONTENEDOR',
'SERVICIO LOGÍSTICO MANIPULACIÓN CARGA',
'SERVICIO LOGÍSTICO CONGELACIÓN (4 DÍAS)',
'SERVICIO LOGÍSTICO CONGELACIÓN (COBRO DIARIO)',
'SERVICIO LOGÍSTICO MANIPULACIÓN CARGA (CARGUE Y ALMACENAMIENTO 1 DÍA)',
'SERVICIO LOGÍSTICO MANIPULACIÓN CARGA VEHICULO LIVIANO (CARGUE Y ALMACENAMIENTO 1 DÍA)',
'POSICIONES FIJAS CÁMARA CONGELADOS',
'SERVICIO DE CONGELACIÓN - UBICACIÓN/DIA (-18ºC)',
'SERVICIO DE REFRIGERACIÓN - PALLET/DIA (0°C A 4ºC)',
'SERVICIO DE REFRIGERACIÓN - PALLET/DIA (0°C A 4ºC) POR CONTENEDOR',
'SERVICIO DE SECO -PALLET/DIA',
'SERVICIO DE SECO -PALLET/DIA POR CONTENEDOR',
'OPERACIÓN CARGUE',
'OPERACIÓN CARGUE/TONELADAS',
'OPERACIÓN DESCARGUE',
'OPERACIÓN DESCARGUE/TONELADAS',
'SERVICIO DE TUNEL DE CONGELACIÓN RAPIDA',
'MOVIMIENTO ENTRADA PRODUCTOS - PALLET (CONGELADO)',
'MOVIMIENTO ENTRADA PRODUCTOS - PALLET/CONGELADO',
'MOVIMIENTO ENTRADA PRODUCTO - PALETA',
'MOVIMIENTO ENTRADA PRODUCTOS - PALLET',
'MOVIMIENTO ENTRADA PRODUCTOS PALLET',
'MOVIMIENTO ENTRADA PRODUCTOS - PALLET/REFRIGERADO',
'MOVIMIENTO ENTRADA PRODUCTOS - PALLET (SECO)',
'MOVIMIENTO SALIDA PRODUCTOS - PALLET (CONGELADO)',
'MOVIMIENTO SALIDA PRODUCTOS - PALLET/CONGELADO',
'MOVIMIENTO SALIDA PRODUCTO - PALETA',
'MOVIMIENTO SALIDA PRODUCTOS - PALLET',
'MOVIMIENTO SALIDA PRODUCTOS PALLET',
'MOVIMIENTO SALIDA PRODUCTOS - PALLET/REFRIGERADO',
'MOVIMIENTO SALIDA PRODUCTOS - PALLET (SECO)',
'SERVICIO ALISTAMIENTO (UNIDAD)',
'SERVICIO DE ALISTAMIENTO (UNIDAD)',
'SERVICIO DE ALISTAMIENTO CAJAS',
'TOMA DE PESOS POR ETIQUETA HRS',
'REESTIBADO',
'CONEXIÓN ELÉCTRICA CONTENEDOR',
'ALQUILER DE AREA PARA EMPAQUE/DIA',
'ALQUILER DE ÁREA PARA EMPAQUE/DIA',
'SERVICIO APOYO JORNAL',
'SERVICIO DE APOYO JORNAL',
'SERVICIO EMPAQUE EN SACOS',
'IMPRESIÓN FACTURAS',
'TRANSBORDO CANASTILLA',
'ALQUILER IMPRESORA ETIQUETADO',
'FMM DE INGRESO ZFPC',
'FMM DE INGRESO ZFPC (MANUAL)',
'FMM DE INGRESO ZFPC NACIONAL',
'FMM DE SALIDA ZFPC',
'FMM DE SALIDA ZFPC (MANUAL)',
'FMM DE SALIDA ZFPC NACIONAL',
'ARIN DE INGRESO ZFPC',
'ARIN DE INGRESO ZFPC (MANUAL)',
'ARIN DE INGRESO ZFPC NACIONAL',
'ARIN DE SALIDA ZFPC',
'ARIN DE SALIDA ZFPC (MANUAL)',
'ARIN DE SALIDA ZFPC NACIONAL',
'TIEMPO EXTRA ZFPC',
'INSPECCIÓN ZFPC',
'IN-HOUSE INSPECTOR ZFPC',
'HORA EXTRA DIURNA',
'HORA EXTRA NOCTURNA',
'HORA EXTRA DIURNA DOMINGO Y FESTIVO',
'HORA EXTRA NOCTURNA DOMINGO Y FESTIVO',
'ALIMENTACIÓN',
'TRANSPORTE EXTRAORDINARIO',
'TRANSPORTE DOMINICAL Y FESTIVO',
'TIEMPO EXTRA FRIOAL (FIJO)',
'TIEMPO EXTRA FRIOAL',
'HORA EXTRA DIURNA (SUPERVISOR)',
'HORA EXTRA DIURNA (MONTACARGUISTA NORMAL)',
'HORA EXTRA DIURNA (OPERARIO)',
'HORA EXTRA DIURNA (ASISTENTE)',
'HORA EXTRA DIURNA DOMINGO Y FESTIVO (SUPERVISOR)',
'HORA EXTRA DIURNA DOMINGO Y FESTIVO (ASISTENTE)',
'HORA EXTRA DIURNA DOMINGO Y FESTIVO (MONTACARGUISTA TRILATERAL)',
'HORA EXTRA DIURNA DOMINGO Y FESTIVO (MONTACARGUISTA NORMAL)',
'HORA EXTRA DIURNA DOMINGO Y FESTIVO (OPERARIO)',
'HORA EXTRA NOCTURNA (SUPERVISOR)',
'HORA EXTRA NOCTURNA (MONTACARGUISTA NORMAL)',
'HORA EXTRA NOCTURNA (OPERARIO)',
'HORA EXTRA NOCTURNA (ASISTENTE)',
'HORA EXTRA NOCTURNA DOMINGO Y FESTIVO (SUPERVISOR)',
'HORA EXTRA NOCTURNA DOMINGO Y FESTIVO (ASISTENTE)',
'HORA EXTRA NOCTURNA DOMINGO Y FESTIVO (MONTACARGUISTA TRILATERAL)',
'HORA EXTRA NOCTURNA DOMINGO Y FESTIVO (MONTACARGUISTA NORMAL)',
'HORA EXTRA NOCTURNA DOMINGO Y FESTIVO (OPERARIO)',
'ETIQUETADO POR CAJA - UNIDAD SUMINISTRA FAL',
'ETIQUETADO POR CAJA/ UNIDAD',
'ETIQUETADO POR CAJA/ UNIDAD FAL COLOCA ETIQUETA',
'ESTIBA MADERA RECICLADA',
'SERVICIO DE INSPECCIÓN POR CAJA'
    ];
    
        const addHeaderAndTitle = (ws: ExcelJS.Worksheet, title: string, columns: any[]) => {
            const titleRow = ws.getRow(2);
            titleRow.getCell(1).value = title;
            titleRow.font = { bold: true, size: 16 };
            titleRow.getCell(1).alignment = { horizontal: 'center' };
            ws.mergeCells(2, 1, 2, columns.length);
        
            const clientRow = ws.getRow(3);
            clientRow.getCell(1).value = `Cliente: ${settlementClient}`;
            clientRow.font = { bold: true };
            clientRow.getCell(1).alignment = { horizontal: 'center' };
            ws.mergeCells(3, 1, 3, columns.length);
            if (settlementDateRange?.from && settlementDateRange.to) {
                const periodText = `Periodo: ${format(settlementDateRange.from, 'dd/MM/yyyy', { locale: es })} - ${format(settlementDateRange.to, 'dd/MM/yyyy', { locale: es })}`;
                const periodRow = ws.getRow(4);
                periodRow.getCell(1).value = periodText;
                periodRow.font = { bold: true };
                periodRow.getCell(1).alignment = { horizontal: 'center' };
                ws.mergeCells(4, 1, 4, columns.length);
            }
        };

        const headerFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A90C8' } };
        const headerFont: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    
        const summaryWorksheet = workbook.addWorksheet('Resumen Liquidación de Servicios Clientes');
        const summaryColumns = [
            { header: 'Item', key: 'item', width: 10 },
            { header: 'Concepto', key: 'concept', width: 50 },
            { header: 'Total Cantidad', key: 'totalQuantity', width: 20 },
            { header: 'Unidad', key: 'unitOfMeasure', width: 15 },
            { header: 'Valor Unitario', key: 'unitValue', width: 20 },
            { header: 'Valor Total', key: 'totalValue', width: 20 },
        ];
        
        summaryWorksheet.columns = summaryColumns.map(c => ({ key: c.key, width: c.width }));
        summaryWorksheet.getRow(1).hidden = true;
        addHeaderAndTitle(summaryWorksheet, "Resumen Liquidación de Servicios Clientes", summaryColumns);
    
        const summaryHeaderRow = summaryWorksheet.getRow(5);
        summaryHeaderRow.values = summaryColumns.map(c => c.header);
        summaryHeaderRow.eachCell((cell) => {
            cell.fill = headerFill;
            cell.font = headerFont;
            cell.alignment = { horizontal: 'center' };
        });
        
        const summaryByConcept = visibleRows.reduce((acc, row) => {
            let conceptKey: string;
            let conceptName: string;
            let unitOfMeasure: string;
    
            if ((row.conceptName === 'OPERACIÓN CARGUE' || row.conceptName === 'OPERACIÓN DESCARGUE') && row.operacionLogistica !== 'N/A') {
                conceptName = `${row.conceptName} (${row.operacionLogistica})`;
                unitOfMeasure = row.tipoVehiculo;
                conceptKey = `${row.conceptName}-${row.operacionLogistica}-${unitOfMeasure}`;
            } else if (row.conceptName === 'TIEMPO EXTRA FRIOAL (FIJO)') {
                conceptName = row.conceptName;
                unitOfMeasure = 'HORA';
                conceptKey = row.conceptName;
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
        const totalGeneralQuantity = sortedSummary.reduce((sum, item) => sum + item.totalQuantity, 0);
        totalSumRow.getCell(2).value = 'TOTALES GENERALES:';
        totalSumRow.getCell(2).font = { bold: true, size: 12 };
        totalSumRow.getCell(2).alignment = { horizontal: 'right' };
        totalSumRow.getCell(3).value = totalGeneralQuantity;
        totalSumRow.getCell(3).numFmt = '#,##0.00';
        totalSumRow.getCell(3).font = { bold: true, size: 12 };
        totalSumRow.getCell(6).value = settlementTotalGeneral;
        totalSumRow.getCell(6).numFmt = '$ #,##0.00';
        totalSumRow.getCell(6).font = { bold: true, size: 12 };

        const smylConceptNames = ['SERVICIO LOGÍSTICO MANIPULACIÓN CARGA', 'SERVICIO LOGÍSTICO CONGELACIÓN (COBRO DIARIO)'];
        if (settlementClient === 'SMYL TRANSPORTE Y LOGISTICA SAS' && visibleRows.some(row => smylConceptNames.includes(row.conceptName))) {
            const containerNumbers = [...new Set(
                visibleRows
                    .filter(row => smylConceptNames.includes(row.conceptName) && row.container && row.container !== 'N/A' && row.container !== 'NO APLICA')
                    .map(row => row.container)
            )];

            if (containerNumbers.length > 0) {
                summaryWorksheet.addRow([]); // Spacer
                const containerRow = summaryWorksheet.addRow([]);
                containerRow.getCell(1).value = 'Contenedor(es):';
                containerRow.getCell(1).font = { bold: true };
                containerRow.getCell(2).value = containerNumbers.join(', ');
                summaryWorksheet.mergeCells(containerRow.number, 2, containerRow.number, 6);
            }
        }
    
        const detailWorksheet = workbook.addWorksheet('Detalle Liquidación de Servicios Clientes');
        
        const detailColumns = [
            { header: 'Fecha', key: 'date', width: 15 },
            { header: 'Concepto', key: 'conceptName', width: 40 },
            { header: 'Detalle Concepto', key: 'subConceptName', width: 40 },
            { header: 'No. Personas', key: 'numeroPersonas', width: 15 },
            { header: 'Total Paletas', key: 'totalPaletas', width: 15 },
            { header: 'Placa', key: 'placa', width: 15 },
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
            { header: 'Justificación', key: 'justification', width: 50 },
        ];
    
        detailWorksheet.columns = detailColumns.map(c => ({ key: c.key, width: c.width }));
        detailWorksheet.getRow(1).hidden = true;
        addHeaderAndTitle(detailWorksheet, "Detalle Liquidación de Servicios Clientes", detailColumns);
        
        const detailHeaderRow = detailWorksheet.getRow(5);
        detailHeaderRow.values = detailColumns.map(c => c.header);
        detailHeaderRow.eachCell((cell) => {
            cell.fill = headerFill;
            cell.font = headerFont;
            cell.alignment = { horizontal: 'center' };
        });

        const groupedByConcept = visibleRows.reduce((acc, row) => {
            const conceptKey = row.conceptName;
            if (!acc[conceptKey]) {
                acc[conceptKey] = { rows: [], subtotalValor: 0, subtotalCantidad: 0, order: conceptOrder.indexOf(conceptKey) };
            }
            acc[conceptKey].rows.push(row);
            acc[conceptKey].subtotalCantidad += row.quantity;
            acc[conceptKey].subtotalValor += row.totalValue;
            return acc;
        }, {} as Record<string, { rows: ClientSettlementRow[], subtotalCantidad: number, subtotalValor: number, order: number }>);
    
        const zfpcSubConceptOrder = [
            'HORA EXTRA DIURNA',
            'HORA EXTRA NOCTURNA',
            'HORA EXTRA DIURNA DOMINGO Y FESTIVO',
            'HORA EXTRA NOCTURNA DOMINGO Y FESTIVO',
            'ALIMENTACIÓN',
            'TRANSPORTE EXTRAORDINARIO',
            'TRANSPORTE DOMINICAL Y FESTIVO',
        ];

        const sortedConceptKeys = Object.keys(groupedByConcept).sort((a, b) => {
            const orderA = groupedByConcept[a].order === -1 ? Infinity : groupedByConcept[a].order;
            const orderB = groupedByConcept[b].order === -1 ? Infinity : groupedByConcept[b].order;
            if (orderA !== orderB) return orderA - orderB;
            return a.localeCompare(b);
        });
    
        sortedConceptKeys.forEach(conceptName => {
            const group = groupedByConcept[conceptName];

            const isContainerConcept = [
                'SERVICIO DE REFRIGERACIÓN - PALLET/DIA (0°C A 4ºC) POR CONTENEDOR',
                'SERVICIO DE CONGELACIÓN - PALLET/DÍA (-18ºC) POR CONTENEDOR',
                'SERVICIO DE SECO -PALLET/DIA POR CONTENEDOR'
            ].includes(conceptName);

            if (isContainerConcept) {
                // Further group by container
                const containerGroups = group.rows.reduce((acc, row) => {
                    const containerKey = row.container || 'SIN_CONTENEDOR';
                    if (!acc[containerKey]) {
                        acc[containerKey] = { rows: [], subtotalCantidad: 0, subtotalValor: 0 };
                    }
                    acc[containerKey].rows.push(row);
                    acc[containerKey].subtotalCantidad += row.quantity;
                    acc[containerKey].subtotalValor += row.totalValue;
                    return acc;
                }, {} as Record<string, { rows: ClientSettlementRow[], subtotalCantidad: number, subtotalValor: number }>);
                
                const containerHeaderRow = detailWorksheet.addRow([]);
                containerHeaderRow.getCell('A').value = conceptName;
                containerHeaderRow.font = { bold: true };
                containerHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } };
                detailWorksheet.mergeCells(containerHeaderRow.number, 1, containerHeaderRow.number, detailColumns.length);


                Object.entries(containerGroups).forEach(([containerKey, containerData]) => {
                    const subHeaderRow = detailWorksheet.addRow([]);
                    subHeaderRow.getCell('B').value = `Contenedor: ${containerKey}`;
                    subHeaderRow.font = { bold: true };
                    subHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
                    detailWorksheet.mergeCells(subHeaderRow.number, 2, subHeaderRow.number, detailColumns.length);

                    containerData.rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).forEach(row => {
                        detailWorksheet.addRow({
                            date: format(parseISO(row.date), 'dd/MM/yyyy'),
                            quantity: row.quantity,
                            unitValue: row.unitValue,
                            totalValue: row.totalValue,
                            justification: row.justification || '',
                            ...row,
                        }).eachCell((cell, colNumber) => { /* Formatting */ });
                    });
                    
                    const containerSubtotalRow = detailWorksheet.addRow([]);
                    containerSubtotalRow.getCell('conceptName').value = `Subtotal Contenedor ${containerKey}:`;
                    containerSubtotalRow.getCell('quantity').value = containerData.subtotalCantidad;
                    containerSubtotalRow.getCell('totalValue').value = containerData.subtotalValor;
                    containerSubtotalRow.font = { bold: true };
                    containerSubtotalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6E6E6' } };
                });

            } else {
                 const sortedRowsForConcept = group.rows.sort((a,b) => {
                    const dateComparison = new Date(a.date).getTime() - new Date(b.date).getTime();
                    if (dateComparison !== 0) return dateComparison;

                    // Custom sort logic for TIEMPO EXTRA ZFPC
                    if (a.conceptName === 'TIEMPO EXTRA ZFPC') {
                        const subOrderA = zfpcSubConceptOrder.indexOf(a.subConceptName || '');
                        const subOrderB = zfpcSubConceptOrder.indexOf(b.subConceptName || '');
                        const finalOrderA = subOrderA === -1 ? Infinity : subOrderA;
                        const finalOrderB = subOrderB === -1 ? Infinity : subOrderB;
                        if(finalOrderA !== finalOrderB) return finalOrderA - finalOrderB;
                    }
                    
                    return (a.subConceptName || '').localeCompare(b.subConceptName || '');
                });
                
                sortedRowsForConcept.forEach(row => {
                     detailWorksheet.addRow({
                        date: format(parseISO(row.date), 'dd/MM/yyyy'),
                        conceptName: row.conceptName,
                        subConceptName: row.subConceptName,
                        numeroPersonas: row.numeroPersonas,
                        totalPaletas: row.totalPaletas > 0 ? row.totalPaletas : '',
                        placa: row.placa,
                        container: row.container,
                        camara: getSessionName(row.camara),
                        pedidoSislog: row.pedidoSislog,
                        operacionLogistica: row.operacionLogistica,
                        tipoVehiculo: (row.conceptName === 'OPERACIÓN CARGUE' || row.conceptName === 'OPERACIÓN DESCARGUE') ? row.tipoVehiculo : 'N/A',
                        horaInicio: formatTime12Hour(row.horaInicio),
                        horaFin: formatTime12Hour(row.horaFin),
                        quantity: row.quantity,
                        unitOfMeasure: row.unitOfMeasure,
                        unitValue: row.unitValue,
                        totalValue: row.totalValue,
                        justification: row.justification || '',
                    }).eachCell((cell, colNumber) => {
                        const colKey = detailColumns[colNumber - 1].key;
                        if (['quantity', 'unitValue', 'totalValue'].includes(colKey)) {
                            cell.numFmt = colKey === 'quantity' ? '#,##0.00' : '$ #,##0.00';
                        }
                    });
                });
        
                const subtotalRow = detailWorksheet.addRow([]);
                subtotalRow.getCell('conceptName').value = `Subtotal ${conceptName}:`;
                subtotalRow.getCell('conceptName').font = { bold: true };
                subtotalRow.getCell('conceptName').alignment = { horizontal: 'right' };
                subtotalRow.getCell('quantity').value = group.subtotalCantidad;
                subtotalRow.getCell('quantity').numFmt = '#,##0.00';
                subtotalRow.getCell('quantity').font = { bold: true };
                subtotalRow.getCell('totalValue').value = group.subtotalValor;
                subtotalRow.getCell('totalValue').numFmt = '$ #,##0.00';
                subtotalRow.getCell('totalValue').font = { bold: true };
                subtotalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } };
            }
        });
    
        const totalGeneralDetalleRow = detailWorksheet.addRow([]);
        const totalGeneralDetalleCantidad = visibleRows.reduce((sum, row) => sum + row.quantity, 0);

        totalGeneralDetalleRow.getCell('conceptName').value = 'TOTAL GENERAL:';
        totalGeneralDetalleRow.getCell('conceptName').font = { bold: true, size: 12 };
        totalGeneralDetalleRow.getCell('conceptName').alignment = { horizontal: 'right' };
        totalGeneralDetalleRow.getCell('quantity').value = totalGeneralDetalleCantidad;
        totalGeneralDetalleRow.getCell('quantity').numFmt = '#,##0.00';
        totalGeneralDetalleRow.getCell('quantity').font = { bold: true, size: 12 };
        totalGeneralDetalleRow.getCell('totalValue').value = settlementTotalGeneral;
        totalGeneralDetalleRow.getCell('totalValue').numFmt = '$ #,##0.00';
        totalGeneralDetalleRow.getCell('totalValue').font = { bold: true, size: 12 };
        totalGeneralDetalleRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC5E0B3' } };
    
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        const fileName = `FA-GFC-F13_Liquidacion_Servicios_Cliente_${settlementClient.replace(/\s/g, '_')}_${format(settlementDateRange!.from!, 'yyyy-MM-dd')}_a_${format(settlementDateRange!.to!, 'yyyy-MM-dd')}.xlsx`;
        link.download = fileName;
        link.click();
    };
    
    const handleSettlementExportPDF = () => {
        const visibleRows = settlementReportData.filter(row => !hiddenRowIds.has(row.uniqueId!));
        if (visibleRows.length === 0 || !settlementClient || !settlementDateRange?.from || isLogoLoading || !logoBase64 || !logoDimensions) return;
    
        const doc = new jsPDF({ orientation: 'landscape' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 14;

const conceptOrder = [
'SERVICIO DE CONGELACIÓN - PALLET/DIA (-18ºC)',
'SERVICIO DE CONGELACIÓN - PALLET/DÍA (-18ºC)',
'SERVICIO DE CONGELACIÓN - PALETA/DIA (-18ºC)',
'SERVICIO DE CONGELACIÓN - PALLET/DIA (-18ºC) POR CONTENEDOR',
'SERVICIO LOGÍSTICO MANIPULACIÓN CARGA',
'SERVICIO LOGÍSTICO CONGELACIÓN (4 DÍAS)',
'SERVICIO LOGÍSTICO CONGELACIÓN (COBRO DIARIO)',
'SERVICIO LOGÍSTICO MANIPULACIÓN CARGA (CARGUE Y ALMACENAMIENTO 1 DÍA)',
'SERVICIO LOGÍSTICO MANIPULACIÓN CARGA VEHICULO LIVIANO (CARGUE Y ALMACENAMIENTO 1 DÍA)',
'POSICIONES FIJAS CÁMARA CONGELADOS',
'SERVICIO DE CONGELACIÓN - UBICACIÓN/DIA (-18ºC)',
'SERVICIO DE REFRIGERACIÓN - PALLET/DIA (0°C A 4ºC)',
'SERVICIO DE REFRIGERACIÓN - PALLET/DIA (0°C A 4ºC) POR CONTENEDOR',
'SERVICIO DE SECO -PALLET/DIA',
'SERVICIO DE SECO -PALLET/DIA POR CONTENEDOR',
'OPERACIÓN CARGUE',
'OPERACIÓN CARGUE/TONELADAS',
'OPERACIÓN DESCARGUE',
'OPERACIÓN DESCARGUE/TONELADAS',
'SERVICIO DE TUNEL DE CONGELACIÓN RAPIDA',
'MOVIMIENTO ENTRADA PRODUCTOS - PALLET (CONGELADO)',
'MOVIMIENTO ENTRADA PRODUCTOS - PALLET/CONGELADO',
'MOVIMIENTO ENTRADA PRODUCTO - PALETA',
'MOVIMIENTO ENTRADA PRODUCTOS - PALLET',
'MOVIMIENTO ENTRADA PRODUCTOS PALLET',
'MOVIMIENTO ENTRADA PRODUCTOS - PALLET/REFRIGERADO',
'MOVIMIENTO ENTRADA PRODUCTOS - PALLET (SECO)',
'MOVIMIENTO SALIDA PRODUCTOS - PALLET (CONGELADO)',
'MOVIMIENTO SALIDA PRODUCTOS - PALLET/CONGELADO',
'MOVIMIENTO SALIDA PRODUCTO - PALETA',
'MOVIMIENTO SALIDA PRODUCTOS - PALLET',
'MOVIMIENTO SALIDA PRODUCTOS PALLET',
'MOVIMIENTO SALIDA PRODUCTOS - PALLET/REFRIGERADO',
'MOVIMIENTO SALIDA PRODUCTOS - PALLET (SECO)',
'SERVICIO ALISTAMIENTO (UNIDAD)',
'SERVICIO DE ALISTAMIENTO (UNIDAD)',
'SERVICIO DE ALISTAMIENTO CAJAS',
'TOMA DE PESOS POR ETIQUETA HRS',
'REESTIBADO',
'CONEXIÓN ELÉCTRICA CONTENEDOR',
'ALQUILER DE AREA PARA EMPAQUE/DIA',
'ALQUILER DE ÁREA PARA EMPAQUE/DIA',
'SERVICIO APOYO JORNAL',
'SERVICIO DE APOYO JORNAL',
'SERVICIO EMPAQUE EN SACOS',
'IMPRESIÓN FACTURAS',
'TRANSBORDO CANASTILLA',
'ALQUILER IMPRESORA ETIQUETADO',
'FMM DE INGRESO ZFPC',
'FMM DE INGRESO ZFPC (MANUAL)',
'FMM DE INGRESO ZFPC NACIONAL',
'FMM DE SALIDA ZFPC',
'FMM DE SALIDA ZFPC (MANUAL)',
'FMM DE SALIDA ZFPC NACIONAL',
'ARIN DE INGRESO ZFPC',
'ARIN DE INGRESO ZFPC (MANUAL)',
'ARIN DE INGRESO ZFPC NACIONAL',
'ARIN DE SALIDA ZFPC',
'ARIN DE SALIDA ZFPC (MANUAL)',
'ARIN DE SALIDA ZFPC NACIONAL',
'TIEMPO EXTRA ZFPC',
'INSPECCIÓN ZFPC',
'IN-HOUSE INSPECTOR ZFPC',
'HORA EXTRA DIURNA',
'HORA EXTRA NOCTURNA',
'HORA EXTRA DIURNA DOMINGO Y FESTIVO',
'HORA EXTRA NOCTURNA DOMINGO Y FESTIVO',
'ALIMENTACIÓN',
'TRANSPORTE EXTRAORDINARIO',
'TRANSPORTE DOMINICAL Y FESTIVO',
'TIEMPO EXTRA FRIOAL (FIJO)',
'TIEMPO EXTRA FRIOAL',
'HORA EXTRA DIURNA (SUPERVISOR)',
'HORA EXTRA DIURNA (MONTACARGUISTA NORMAL)',
'HORA EXTRA DIURNA (OPERARIO)',
'HORA EXTRA DIURNA (ASISTENTE)',
'HORA EXTRA DIURNA DOMINGO Y FESTIVO (SUPERVISOR)',
'HORA EXTRA DIURNA DOMINGO Y FESTIVO (ASISTENTE)',
'HORA EXTRA DIURNA DOMINGO Y FESTIVO (MONTACARGUISTA TRILATERAL)',
'HORA EXTRA DIURNA DOMINGO Y FESTIVO (MONTACARGUISTA NORMAL)',
'HORA EXTRA DIURNA DOMINGO Y FESTIVO (OPERARIO)',
'HORA EXTRA NOCTURNA (SUPERVISOR)',
'HORA EXTRA NOCTURNA (MONTACARGUISTA NORMAL)',
'HORA EXTRA NOCTURNA (OPERARIO)',
'HORA EXTRA NOCTURNA (ASISTENTE)',
'HORA EXTRA NOCTURNA DOMINGO Y FESTIVO (SUPERVISOR)',
'HORA EXTRA NOCTURNA DOMINGO Y FESTIVO (ASISTENTE)',
'HORA EXTRA NOCTURNA DOMINGO Y FESTIVO (MONTACARGUISTA TRILATERAL)',
'HORA EXTRA NOCTURNA DOMINGO Y FESTIVO (MONTACARGUISTA NORMAL)',
'HORA EXTRA NOCTURNA DOMINGO Y FESTIVO (OPERARIO)',
'ETIQUETADO POR CAJA - UNIDAD SUMINISTRA FAL',
'ETIQUETADO POR CAJA/ UNIDAD',
'ETIQUETADO POR CAJA/ UNIDAD FAL COLOCA ETIQUETA',
'ESTIBA MADERA RECICLADA',
'SERVICIO DE INSPECCIÓN POR CAJA'
        ];

        const zfpcSubConceptOrder = [
            'HORA EXTRA DIURNA',
            'HORA EXTRA NOCTURNA',
            'HORA EXTRA DIURNA DOMINGO Y FESTIVO',
            'HORA EXTRA NOCTURNA DOMINGO Y FESTIVO',
            'ALIMENTACION',
            'TRANSPORTE EXTRAORDINARIO',
            'TRANSPORTE DOMINICAL Y FESTIVO',
        ];


        const addInfoBox = (docInstance: jsPDF) => {
            const tableWidth = 55;
            const startX = pageWidth - margin - tableWidth;
        
            autoTable(docInstance, {
                startY: 10,
                margin: { left: startX },
                tableWidth: tableWidth,
                body: [
                    [{ content: 'CÓDIGO:', styles: { fontStyle: 'bold' } }, 'FA-GFC-F13'],
                    [{ content: 'VERSIÓN:', styles: { fontStyle: 'bold' } }, '01'],
                    [{ content: 'FECHA:', styles: { fontStyle: 'bold' } }, '15/10/2025'],
                ],
                theme: 'grid',
                styles: {
                    fontSize: 7,
                    cellPadding: 1.5,
                    fillColor: [232, 232, 232],
                    textColor: '#000000',
                    lineColor: '#cccccc',
                    lineWidth: 0.1,
                },
                columnStyles: {
                    0: { cellWidth: 25, fontStyle: 'bold' },
                    1: { cellWidth: 'auto' },
                },
            });
        };

        const addHeader = (docInstance: jsPDF, pageTitle: string) => {
            addInfoBox(docInstance);
            const logoWidth = 21;
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

        // Resumen
        let lastY = addHeader(doc, "Resumen Liquidación de Servicios Clientes");
        
        const isLogisticsClient = settlementClient === 'LOGISTICS & INTERNATIONAL TRADE SAS';
        const isMultiContainerSummary = !settlementContainer && visibleRows.some(row => row.conceptName.includes("POR CONTENEDOR"));

        const summaryByConcept = visibleRows.reduce((acc, row) => {
            let conceptKey: string;
            let conceptName: string;
            let unitOfMeasure: string;
            let containerKeyPart = (isMultiContainerSummary && row.conceptName.includes("POR CONTENEDOR")) ? row.container : "GENERAL";


            if (isLogisticsClient && settlementContainer) {
                conceptName = row.conceptName + (row.subConceptName ? ` (${row.subConceptName})` : '');
                unitOfMeasure = row.unitOfMeasure;
                conceptKey = `${row.conceptName}-${row.subConceptName || ''}-${unitOfMeasure}`;
            } else if ((row.conceptName === 'OPERACIÓN CARGUE' || row.conceptName === 'OPERACIÓN DESCARGUE') && row.operacionLogistica !== 'N/A') {
                conceptName = `${row.conceptName} (${row.operacionLogistica})`;
                unitOfMeasure = row.tipoVehiculo;
                conceptKey = `${row.conceptName}-${row.operacionLogistica}-${unitOfMeasure}`;
            } else if (row.conceptName === 'TIEMPO EXTRA FRIOAL (FIJO)') {
                conceptName = row.conceptName;
                unitOfMeasure = 'HORA';
                conceptKey = row.conceptName;
            } else {
                conceptName = row.conceptName + (row.subConceptName ? ` (${row.subConceptName})` : '');
                unitOfMeasure = row.unitOfMeasure;
                conceptKey = `${containerKeyPart}-${row.conceptName}-${row.subConceptName || ''}-${unitOfMeasure}`;
            }

            if (!acc[conceptKey]) {
                acc[conceptKey] = { 
                    concept: conceptName, 
                    totalQuantity: 0, 
                    totalValue: 0, 
                    unitOfMeasure: unitOfMeasure, 
                    order: conceptOrder.indexOf(row.conceptName),
                    container: containerKeyPart,
                };
            }
            acc[conceptKey].totalQuantity += row.quantity;
            acc[conceptKey].totalValue += row.totalValue;
            return acc;
        }, {} as Record<string, { concept: string; totalQuantity: number; totalValue: number; unitOfMeasure: string; order: number; container?: string }>);
    
        const sortedSummary = Object.values(summaryByConcept).sort((a, b) => {
            const orderA = a.order === -1 ? Infinity : a.order;
            const orderB = b.order === -1 ? Infinity : b.order;
            if (orderA !== orderB) return orderA - orderB;
            return a.concept.localeCompare(b.concept);
        });

        const totalGeneralQuantity = sortedSummary.reduce((sum, item) => sum + item.totalQuantity, 0);
        
        if (isMultiContainerSummary) {
            const summaryByContainer = sortedSummary.reduce((acc, item) => {
                const key = item.container || 'SIN_CONTENEDOR';
                if (!acc[key]) acc[key] = [];
                acc[key].push(item);
                return acc;
            }, {} as Record<string, typeof sortedSummary>);

            Object.entries(summaryByContainer).forEach(([containerId, items]) => {
                if (lastY > pageHeight - 150) {
                    doc.addPage();
                    lastY = addHeader(doc, "Resumen Liquidación de Servicios Clientes");
                }
                
                doc.setFontSize(11);
                doc.setFont('helvetica', 'bold');
                doc.text(`Resumen Contenedor: ${containerId}`, margin + 30, lastY + 10);
                lastY += 15;
                
                const containerTotal = items.reduce((sum, item) => sum + item.totalValue, 0);
                const containerBody = items.map((item, index) => [
                    index + 1, item.concept,
                    item.totalQuantity.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                    item.unitOfMeasure,
                    item.totalValue.toLocaleString('es-CO', { style: 'currency', currency: 'COP' })
                ]);
                
                autoTable(doc, {
                    head: [['#', 'Concepto', 'Total Cantidad', 'Unidad', 'Total Valor']],
                    body: containerBody,
                    foot: [[
                        { content: `TOTAL CONTENEDOR:`, colSpan: 4, styles: { halign: 'right', fontStyle: 'bold' } },
                        { content: containerTotal.toLocaleString('es-CO', { style: 'currency', currency: 'COP' }), styles: { halign: 'right', fontStyle: 'bold' } }
                    ]],
                    startY: lastY,
                    theme: 'grid',
                    headStyles: { fillColor: [220, 220, 220], textColor: 0, fontSize: 9 },
                    footStyles: { fillColor: [220, 220, 220], textColor: 0 },
                    styles: { fontSize: 8, cellPadding: 1.5 },
                    // --- INICIO DE LA LÍNEA A AJUSTAR ---
                    margin: { left: 30 }, // Ajusta este valor según necesites (ej. 20, 40, etc.)
                    // --- FIN DE LA LÍNEA A AJUSTAR ---
                });
                lastY = (doc as any).lastAutoTable.finalY + 10;
            });
        } else {
             const summaryHead = isLogisticsClient
                ? [['#', 'Concepto', 'Contenedor', 'Total Cantidad', 'Unidad', 'Total Valor']]
                : [['#', 'Concepto', 'Total Cantidad', 'Unidad', 'Total Valor']];

            const summaryBody = sortedSummary.map((item, index) => {
                const rowData = [
                    index + 1,
                    item.concept,
                ];
                if (isLogisticsClient) {
                    rowData.push(item.container || 'N/A');
                }
                rowData.push(
                    item.totalQuantity.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                    item.unitOfMeasure,
                    item.totalValue.toLocaleString('es-CO', { style: 'currency', currency: 'COP' })
                );
                return rowData;
            });

            const totalRowColSpan = isLogisticsClient ? 3 : 2;

            const summaryBodyWithTotal = [
                ...summaryBody,
                [
                    { content: 'TOTALES:', colSpan: totalRowColSpan, styles: { halign: 'right', fontStyle: 'bold', fillColor: [26, 144, 200], textColor: '#ffffff' } },
                    { content: totalGeneralQuantity.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), styles: { halign: 'right', fontStyle: 'bold', fillColor: [26, 144, 200], textColor: '#ffffff' } },
                    { content: '', styles: {fillColor: [26, 144, 200]} },
                    { content: settlementTotalGeneral.toLocaleString('es-CO', { style: 'currency', currency: 'COP' }), styles: { halign: 'right', fontStyle: 'bold', fillColor: [26, 144, 200], textColor: '#ffffff' } }
                ]
            ];
            
            const summaryColumnStyles: { [key: number]: any } = {
                0: { cellWidth: 10 },
                [totalRowColSpan]: { halign: 'right' }, // Total Cantidad
                [totalRowColSpan + 2]: { halign: 'right' }, // Total Valor
            };
            if (settlementContainer) {
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.text(`Resumen Contenedor: ${settlementContainer}`, margin + 30, lastY + 10);
            lastY += 15;
            }

            autoTable(doc, {
                head: summaryHead,
                body: summaryBodyWithTotal,
                startY: lastY,
                margin: { left: isLogisticsClient ? 30 : 30 },
                pageBreak: 'auto',
                theme: 'grid',
                headStyles: { fillColor: [26, 144, 200], fontSize: 10 },
                styles: { fontSize: 9, cellPadding: 1.5 },
                columnStyles: summaryColumnStyles,
                didParseCell: function(data:any) {
                    if(data.row.raw[0].content === 'TOTALES:') {
                        if(data.row.cells[0]) data.row.cells[0].styles.fillColor = [26, 144, 200];
                        if(data.row.cells[totalRowColSpan]) data.row.cells[totalRowColSpan].styles.fillColor = [26, 144, 200];
                        if(data.row.cells[totalRowColSpan + 1]) data.row.cells[totalRowColSpan + 1].styles.fillColor = [26, 144, 200];
                        if(data.row.cells[totalRowColSpan + 2]) data.row.cells[totalRowColSpan + 2].styles.fillColor = [26, 144, 200];
                    }
                },
            });
            lastY = (doc as any).lastAutoTable.finalY || 0;
        }

        let finalY = lastY;
        const smylConceptNames = ['SERVICIO LOGÍSTICO MANIPULACIÓN CARGA', 'SERVICIO LOGÍSTICO CONGELACIÓN (COBRO DIARIO)'];
        if (settlementClient === 'SMYL TRANSPORTE Y LOGISTICA SAS' && visibleRows.some(row => smylConceptNames.includes(row.conceptName))) {
            const containerNumbers = [...new Set(
                visibleRows
                    .filter(row => smylConceptNames.includes(row.conceptName) && row.container && row.container !== 'N/A' && row.container !== 'NO APLICA')
                    .map(row => row.container)
            )];

            if (containerNumbers.length > 0) {
                 doc.setFontSize(10);
                 doc.setFont('helvetica', 'bold');
                 doc.text('Contenedor(es):', margin, finalY + 8);
                 doc.setFont('helvetica', 'normal');
                 doc.text(containerNumbers.join(', '), margin + 35, finalY + 8);
                 finalY += 8;
            }
        }
         if (settlementPaymentTerm) {
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            
            let paymentTermText = '';
            const termAsNumber = parseInt(settlementPaymentTerm, 10);

            if (!isNaN(termAsNumber)) {
                paymentTermText = `PLAZO DE VENCIMIENTO: ${termAsNumber} DÍAS`;
            } else {
                paymentTermText = `PLAZO DE VENCIMIENTO: ${settlementPaymentTerm.toUpperCase()}`;
            }
            doc.text(paymentTermText, margin + 20, finalY + 15);
        }

        // Detalle
        doc.addPage();
        lastY = addHeader(doc, "Detalle Liquidación de Servicios Clientes");

        const detailBody: any[] = [];
        const generateDetailRow = (row: ClientSettlementRow) => [
            format(parseISO(row.date), 'dd/MM/yyyy'),
            row.subConceptName || '', row.numeroPersonas || '', row.totalPaletas > 0 ? row.totalPaletas : '', getSessionName(row.camara),
            row.placa, row.container, row.pedidoSislog, row.operacionLogistica, row.tipoVehiculo, formatTime12Hour(row.horaInicio),
            formatTime12Hour(row.horaFin), row.quantity.toLocaleString('es-CO', { minimumFractionDigits: 2 }),
            row.unitOfMeasure, row.unitValue.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }),
            row.totalValue.toLocaleString('es-CO', { style: 'currency', currency: 'COP' }),
            row.justification || '',
        ];

        const groupedByLotAndConcept = visibleRows.reduce((acc, row) => {
            const lotKey = row.lotId || `CONCEPTO-${row.conceptName}`;
            if (!acc[lotKey]) {
                acc[lotKey] = { lotId: row.lotId, conceptName: row.conceptName, rows: [], order: conceptOrder.indexOf(row.conceptName) };
            }
            acc[lotKey].rows.push(row);
            return acc;
        }, {} as Record<string, { lotId?: string; conceptName: string; rows: ClientSettlementRow[]; order: number; }>);
        
        const sortedGroupKeys = Object.keys(groupedByLotAndConcept).sort((a, b) => {
            const groupA = groupedByLotAndConcept[a];
            const groupB = groupedByLotAndConcept[b];
            
            const orderA = groupA.order === -1 ? Infinity : groupA.order;
            const orderB = groupB.order === -1 ? Infinity : groupB.order;
            if (orderA !== orderB) return orderA - orderB;

            const lotCompare = (groupA.lotId || groupA.conceptName).localeCompare(groupB.lotId || groupB.conceptName);
            if(lotCompare !== 0) return lotCompare;
            
            return groupA.conceptName.localeCompare(b.conceptName);
        });

        for (const groupKey of sortedGroupKeys) {
             const group = groupedByLotAndConcept[groupKey];
             let groupTitle = group.lotId ? `Lote/Contenedor: ${group.lotId}` : group.conceptName;
             
             // If not a lot-based concept, just show the concept name as the header
             if (!group.lotId) {
                detailBody.push([{ content: groupTitle, colSpan: 17, styles: { fontStyle: 'bold', fillColor: '#dceaf5', textColor: '#000' } }]);
             }
            
            const sortedRowsForGroup = group.rows.sort((a, b) => {
                const dateComparison = new Date(a.date).getTime() - new Date(b.date).getTime();
                if (dateComparison !== 0) return dateComparison;
                
                    // Custom sort logic for TIEMPO EXTRA ZFPC
                    if (a.conceptName === 'TIEMPO EXTRA ZFPC') {
                        const subOrderA = zfpcSubConceptOrder.indexOf(a.subConceptName || '');
                        const subOrderB = zfpcSubConceptOrder.indexOf(b.subConceptName || '');
                        const finalOrderA = subOrderA === -1 ? Infinity : subOrderA;
                        const finalOrderB = subOrderB === -1 ? Infinity : subOrderB;
                        if(finalOrderA !== finalOrderB) return finalOrderA - finalOrderB;
                    }
                return (a.subConceptName || '').localeCompare(b.subConceptName || '');
            });
            
            // Add a header for the lot if it exists
            if (group.lotId) {
                detailBody.push([{ content: groupTitle, colSpan: 17, styles: { fontStyle: 'bold', fillColor: '#dceaf5', textColor: '#000' } }]);
            }
            
            sortedRowsForGroup.forEach(row => {
                detailBody.push(generateDetailRow(row));
            });

             const groupSubtotalCantidad = group.rows.reduce((sum, row) => sum + (row.quantity || 0), 0);
             const groupSubtotalValor = group.rows.reduce((sum, row) => sum + (row.totalValue || 0), 0);
             
             detailBody.push([
                { content: `Subtotal ${group.lotId ? `Lote ${group.lotId}` : group.conceptName}:`, colSpan: 12, styles: { halign: 'right', fontStyle: 'bold' } },
                { content: groupSubtotalCantidad.toLocaleString('es-CO', { minimumFractionDigits: 2 }), styles: { halign: 'right', fontStyle: 'bold' } },
                { content: '', colSpan: 2 },
                { content: groupSubtotalValor.toLocaleString('es-CO', { style: 'currency', currency: 'COP' }), styles: { halign: 'right', fontStyle: 'bold' } },
                { content: '' }
            ]);
        }
        
        autoTable(doc, {
            head: [['Fecha', 'Detalle', 'Pers.', 'Pal.', 'Cámara', 'Placa', 'Contenedor', 'Pedido', 'Op. Log.', 'T. Vehículo', 'H. Inicio', 'H. Fin', 'Cant.', 'Unidad', 'Vlr. Unit.', 'Vlr. Total', 'Justificación']],
            body: detailBody,
            foot: [[
                { content: 'TOTAL GENERAL:', colSpan: 12, styles: { halign: 'right', fontStyle: 'bold', fillColor: [26, 144, 200], textColor: '#ffffff' } },
                { content: totalGeneralQuantity.toLocaleString('es-CO', { minimumFractionDigits: 2 }), styles: { halign: 'right', fontStyle: 'bold', fillColor: [26, 144, 200], textColor: '#ffffff' } },
                { content: '', colSpan: 2, styles: {fillColor: [26, 144, 200]} },
                { content: settlementTotalGeneral.toLocaleString('es-CO', { style: 'currency', currency: 'COP' }), styles: { halign: 'right', fontStyle: 'bold', fillColor: [26, 144, 200], textColor: '#ffffff' } },
                { content: '', styles: {fillColor: [26, 144, 200]}}
            ]],
            startY: lastY,
            margin: { left: 20, right: 10 },
            pageBreak: 'auto',
            headStyles: { fillColor: [26, 144, 200], fontSize: 7, cellPadding: 1 },
            styles: { fontSize: 7, cellPadding: 1 },
            columnStyles: { 12: { halign: 'right' }, 14: { halign: 'right' }, 15: { halign: 'right' } },
            footStyles: { fontStyle: 'bold' },

            didDrawPage: function (data) {
                const doc = data.doc;
                // No obtenemos el total de páginas aquí
                const pageWidth = doc.internal.pageSize.getWidth();
                const pageHeight = doc.internal.pageSize.getHeight();

                doc.setFontSize(8);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(150);
                },
    
                });
    
                const totalPages = (doc as any).internal.getNumberOfPages();
                for (let i = 1; i <= totalPages; i++) {
                doc.setPage(i);
                doc.text(doc.internal.getCurrentPageInfo().pageNumber + " de " + totalPages, doc.internal.pageSize.getWidth() / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' });
    }

        const fileName = `FA-GFC-F13_Liquidacion_Servicios_Cliente_${settlementClient.replace(/\s/g, '_')}_${format(settlementDateRange!.from!, 'yyyy-MM-dd')}_a_${format(settlementDateRange!.to!, 'yyyy-MM-dd')}.pdf`;
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
    
    const visibleSettlementData = useMemo(() => {
        return settlementReportData.filter(row => !hiddenRowIds.has(row.uniqueId!));
    }, [settlementReportData, hiddenRowIds]);

    const settlementGroupedData = useMemo(() => {
        const conceptOrder = [
'SERVICIO DE CONGELACIÓN - PALLET/DIA (-18ºC)',
'SERVICIO DE CONGELACIÓN - PALLET/DÍA (-18ºC)',
'SERVICIO DE CONGELACIÓN - PALETA/DIA (-18ºC)',
'SERVICIO DE CONGELACIÓN - PALLET/DIA (-18ºC) POR CONTENEDOR',
'SERVICIO LOGÍSTICO MANIPULACIÓN CARGA',
'SERVICIO LOGÍSTICO CONGELACIÓN (4 DÍAS)',
'SERVICIO LOGÍSTICO CONGELACIÓN (COBRO DIARIO)',
'SERVICIO LOGÍSTICO MANIPULACIÓN CARGA (CARGUE Y ALMACENAMIENTO 1 DÍA)',
'SERVICIO LOGÍSTICO MANIPULACIÓN CARGA VEHICULO LIVIANO (CARGUE Y ALMACENAMIENTO 1 DÍA)',
'POSICIONES FIJAS CÁMARA CONGELADOS',
'SERVICIO DE CONGELACIÓN - UBICACIÓN/DIA (-18ºC)',
'SERVICIO DE REFRIGERACIÓN - PALLET/DIA (0°C A 4ºC)',
'SERVICIO DE REFRIGERACIÓN - PALLET/DIA (0°C A 4ºC) POR CONTENEDOR',
'SERVICIO DE SECO -PALLET/DIA',
'SERVICIO DE SECO -PALLET/DIA POR CONTENEDOR',
'OPERACIÓN CARGUE',
'OPERACIÓN CARGUE/TONELADAS',
'OPERACIÓN DESCARGUE',
'OPERACIÓN DESCARGUE/TONELADAS',
'SERVICIO DE TUNEL DE CONGELACIÓN RAPIDA',
'MOVIMIENTO ENTRADA PRODUCTOS - PALLET (CONGELADO)',
'MOVIMIENTO ENTRADA PRODUCTOS - PALLET/CONGELADO',
'MOVIMIENTO ENTRADA PRODUCTO - PALETA',
'MOVIMIENTO ENTRADA PRODUCTOS - PALLET',
'MOVIMIENTO ENTRADA PRODUCTOS PALLET',
'MOVIMIENTO ENTRADA PRODUCTOS - PALLET/REFRIGERADO',
'MOVIMIENTO ENTRADA PRODUCTOS - PALLET (SECO)',
'MOVIMIENTO SALIDA PRODUCTOS - PALLET (CONGELADO)',
'MOVIMIENTO SALIDA PRODUCTOS - PALLET/CONGELADO',
'MOVIMIENTO SALIDA PRODUCTO - PALETA',
'MOVIMIENTO SALIDA PRODUCTOS - PALLET',
'MOVIMIENTO SALIDA PRODUCTOS PALLET',
'MOVIMIENTO SALIDA PRODUCTOS - PALLET/REFRIGERADO',
'MOVIMIENTO SALIDA PRODUCTOS - PALLET (SECO)',
'SERVICIO ALISTAMIENTO (UNIDAD)',
'SERVICIO DE ALISTAMIENTO (UNIDAD)',
'SERVICIO DE ALISTAMIENTO CAJAS',
'TOMA DE PESOS POR ETIQUETA HRS',
'REESTIBADO',
'CONEXIÓN ELÉCTRICA CONTENEDOR',
'ALQUILER DE AREA PARA EMPAQUE/DIA',
'ALQUILER DE ÁREA PARA EMPAQUE/DIA',
'SERVICIO APOYO JORNAL',
'SERVICIO DE APOYO JORNAL',
'SERVICIO EMPAQUE EN SACOS',
'IMPRESIÓN FACTURAS',
'TRANSBORDO CANASTILLA',
'ALQUILER IMPRESORA ETIQUETADO',
'FMM DE INGRESO ZFPC',
'FMM DE INGRESO ZFPC (MANUAL)',
'FMM DE INGRESO ZFPC NACIONAL',
'FMM DE SALIDA ZFPC',
'FMM DE SALIDA ZFPC (MANUAL)',
'FMM DE SALIDA ZFPC NACIONAL',
'ARIN DE INGRESO ZFPC',
'ARIN DE INGRESO ZFPC (MANUAL)',
'ARIN DE INGRESO ZFPC NACIONAL',
'ARIN DE SALIDA ZFPC',
'ARIN DE SALIDA ZFPC (MANUAL)',
'ARIN DE SALIDA ZFPC NACIONAL',
'TIEMPO EXTRA ZFPC',
'INSPECCIÓN ZFPC',
'IN-HOUSE INSPECTOR ZFPC',
'HORA EXTRA DIURNA',
'HORA EXTRA NOCTURNA',
'HORA EXTRA DIURNA DOMINGO Y FESTIVO',
'HORA EXTRA NOCTURNA DOMINGO Y FESTIVO',
'ALIMENTACIÓN',
'TRANSPORTE EXTRAORDINARIO',
'TRANSPORTE DOMINICAL Y FESTIVO',
'TIEMPO EXTRA FRIOAL (FIJO)',
'TIEMPO EXTRA FRIOAL',
'HORA EXTRA DIURNA (SUPERVISOR)',
'HORA EXTRA DIURNA (MONTACARGUISTA NORMAL)',
'HORA EXTRA DIURNA (OPERARIO)',
'HORA EXTRA DIURNA (ASISTENTE)',
'HORA EXTRA NOCTURNA (SUPERVISOR)',
'HORA EXTRA NOCTURNA (MONTACARGUISTA NORMAL)',
'HORA EXTRA NOCTURNA (OPERARIO)',
'HORA EXTRA NOCTURNA (ASISTENTE)',
'ETIQUETADO POR CAJA - UNIDAD SUMINISTRA FAL',
'ETIQUETADO POR CAJA/ UNIDAD',
'ETIQUETADO POR CAJA/ UNIDAD FAL COLOCA ETIQUETA',
'ESTIBA MADERA RECICLADA',
'SERVICIO DE INSPECCIÓN POR CAJA'
        ];
        
        const zfpcSubConceptOrder = [
            'HORA EXTRA DIURNA',
            'HORA EXTRA NOCTURNA',
            'HORA EXTRA DIURNA DOMINGO Y FESTIVO',
            'HORA EXTRA NOCTURNA DOMINGO Y FESTIVO',
            'ALIMENTACION',
            'TRANSPORTE EXTRAORDINARIO',
            'TRANSPORTE DOMINICAL Y FESTIVO',
        ];

        const grouped = visibleSettlementData.reduce((acc, row) => {
            const conceptKey = row.conceptName;
            if (!acc[conceptKey]) {
                acc[conceptKey] = { rows: [], subtotalCantidad: 0, subtotalValor: 0 };
            }
            acc[conceptKey].rows.push(row);
            acc[conceptKey].subtotalCantidad += row.quantity || 0;
            acc[conceptKey].subtotalValor += row.totalValue || 0;
            return acc;
        }, {} as Record<string, { rows: ClientSettlementRow[], subtotalCantidad: number, subtotalValor: number }>);
        
        const sortedKeys = Object.keys(grouped).sort((a, b) => {
            const orderA = conceptOrder.indexOf(a);
            const orderB = conceptOrder.indexOf(b);
            const finalOrderA = orderA === -1 ? Infinity : orderA;
            const finalOrderB = orderB === -1 ? Infinity : orderB;

            if (finalOrderA !== finalOrderB) {
                return finalOrderA - finalOrderB;
            }
            return a.localeCompare(b);
        });

        const sortedGroupedData: Record<string, { rows: ClientSettlementRow[], subtotalCantidad: number, subtotalValor: number }> = {};
        sortedKeys.forEach(key => {
            const group = grouped[key];
            if (key === 'TIEMPO EXTRA ZFPC') {
                group.rows.sort((a, b) => {
                    const orderA = zfpcSubConceptOrder.indexOf(a.subConceptName || '');
                    const orderB = zfpcSubConceptOrder.indexOf(b.subConceptName || '');
                    return (orderA === -1 ? Infinity : orderA) - (orderB === -1 ? Infinity : orderB);
                });
            }
            sortedGroupedData[key] = group;
        });

        return sortedGroupedData;
    }, [visibleSettlementData]);
    
    const settlementTotalGeneral = useMemo(() => {
        return visibleSettlementData.reduce((sum, row) => sum + (row.totalValue || 0), 0);
    }, [visibleSettlementData]);

    const showSmylLotInput = useMemo(() => {
        return settlementClient === 'SMYL TRANSPORTE Y LOGISTICA SAS';
    }, [settlementClient]);
    
    const isConceptSelectorDisabled = useMemo(() => {
        return showSmylLotInput && settlementLotIds.trim() !== '';
    }, [showSmylLotInput, settlementLotIds]);
    
    const handleYearSelect = (yearStr: string) => {
        if (!yearStr) {
            setSelectedYear('');
            setInventoryDateRange(undefined);
            return;
        }
        const year = parseInt(yearStr, 10);
        setSelectedYear(yearStr);
        setInventoryDateRange({
            from: startOfYear(new Date(year, 0, 1)),
            to: endOfYear(new Date(year, 11, 31)),
        });
    };
    
    return (
        <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
            <div className="max-w-screen-2xl mx-auto">
                <header className="mb-8">
                    <div className="relative flex items-center justify-center">
                        <Button variant="ghost" className="absolute left-0" onClick={() => router.push('/')}>
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Volver
                        </Button>
                        <div className="text-center">
                            <Button variant="ghost" className="mb-2" onClick={() => router.push('/')}>
                                <Home className="mr-2 h-4 w-4" />
                                Ir al Inicio
                            </Button>
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
                        <TabsTrigger value="inventory">Inventario Acumulado/Informe Ocupación</TabsTrigger>
                        <TabsTrigger value="consolidated-report">Consolidado Movimientos/Inventario</TabsTrigger>
                        <TabsTrigger value="client-settlement">Liquidación de Servicios Clientes</TabsTrigger>
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
                                                        }} numberOfMonths={2} locale={es} disabled={{ after: today, before: threeYearsAgo }} />
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
                                                <TableHead className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm">Tipo Formato</TableHead>
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
                                                <TableRow><TableCell colSpan={20}><Skeleton className="h-20 w-full" /></TableCell></TableRow>
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
                                                        <TableCell>{row.tipoFormato}</TableCell>
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
                                                            disabled={{ after: today, before: threeYearsAgo }}
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

                                <div className="space-y-4">
                                    <Label className="font-semibold text-base">Consultar inventario Acumulado (Informe de ocupación)</Label>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                                        <div className="space-y-2">
                                            <Label>Rango de Fechas</Label>
                                            <Popover>
                                                <PopoverTrigger asChild>
                                                    <Button
                                                        variant={"outline"}
                                                        className={cn("w-full justify-start text-left font-normal", !inventoryDateRange && "text-muted-foreground")}
                                                        onClick={() => setSelectedYear('')}
                                                    >
                                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                                        {inventoryDateRange?.from ? (
                                                            inventoryDateRange.to ? (
                                                                <>{format(inventoryDateRange.from, "LLL dd, y", { locale: es })} - {format(inventoryDateRange.to, "LLL dd, y", { locale: es })}</>
                                                            ) : ( format(inventoryDateRange.from, "LLL dd, y", { locale: es }) )
                                                        ) : ( <span>Seleccione un rango</span> )}
                                                    </Button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-auto p-0">
                                                    <Calendar
                                                        captionLayout="dropdown-buttons"
                                                        fromYear={getYear(threeYearsAgo)}
                                                        toYear={getYear(today)}
                                                        mode="range"
                                                        selected={inventoryDateRange}
                                                        onSelect={(range) => {
                                                            if (range?.from && range?.to && differenceInDays(range.to, range.from) > MAX_DATE_RANGE_DAYS) {
                                                                toast({ variant: 'destructive', title: 'Rango muy amplio', description: `Por favor, seleccione un rango de no más de ${MAX_DATE_RANGE_DAYS} días.` });
                                                            } else {
                                                                setInventoryDateRange(range);
                                                                setSelectedYear(''); // Clear year selection
                                                            }
                                                        }}
                                                        defaultMonth={inventoryDateRange?.from}
                                                        numberOfMonths={2}
                                                        locale={es}
                                                        disabled={{ after: today, before: threeYearsAgo }}
                                                    />
                                                </PopoverContent>
                                            </Popover>
                                        </div>
                                        <div className="space-y-2">
                                            <Label>O seleccione un año</Label>
                                            <Select value={selectedYear} onValueChange={handleYearSelect}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Seleccionar año..." />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {availableInventoryYears.map(year => (
                                                        <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                    </div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
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
                                            <Label>Sesión</Label>
                                            <Dialog open={isSessionDialogOpen} onOpenChange={setIsSessionDialogOpen}>
                                                <DialogTrigger asChild>
                                                    <Button variant="outline" className="w-full justify-between font-normal" disabled={isQuerying}>
                                                        <span className="truncate">
                                                            {selectedSessions.length === 0 ? "Seleccionar sesiones..." : 
                                                            selectedSessions.length === 4 ? "Todas las sesiones" :
                                                            selectedSessions.length === 1 ? selectedSessions[0] : `${selectedSessions.length} sesiones seleccionadas`}
                                                        </span>
                                                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                    </Button>
                                                </DialogTrigger>
                                                <DialogContent>
                                                    <DialogHeader>
                                                        <DialogTitle>Seleccionar Sesiones</DialogTitle>
                                                    </DialogHeader>
                                                    <div className="py-4 space-y-2">
                                                        {(['CO', 'RE', 'SE', 'Tunel'] as const).map(session => (
                                                            <div key={session} className="flex items-center space-x-3">
                                                                <Checkbox 
                                                                    id={`session-${session}`}
                                                                    checked={selectedSessions.includes(session)}
                                                                    onCheckedChange={(checked) => {
                                                                        setSelectedSessions(prev => checked ? [...prev, session] : prev.filter(s => s !== session))
                                                                    }}
                                                                />
                                                                <Label htmlFor={`session-${session}`} className="font-normal cursor-pointer">
                                                                    {session} - {session === 'Tunel' ? 'Peso en Túnel (kg)' : getSessionName(session)}
                                                                </Label>
                                                            </div>
                                                        ))}
                                                    </div>
                                                    <DialogFooter>
                                                        <Button onClick={() => setIsSessionDialogOpen(false)}>Cerrar</Button>
                                                    </DialogFooter>
                                                </DialogContent>
                                            </Dialog>
                                            <p className="text-xs text-muted-foreground">
                                                Seleccione una o más sesiones para el informe.
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 pt-4">
                                        <Button onClick={handleInventorySearch} className="w-full self-end" disabled={isQuerying || !inventoryDateRange?.from || !inventoryDateRange?.to || isLoadingInventoryClients || selectedSessions.length === 0 || inventoryClients.length === 0}>
                                            {isQuerying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                                            Consultar
                                        </Button>
                                        <Button onClick={handleInventoryClear} variant="outline" className="w-full self-end">
                                            <XCircle className="h-4 w-4" />
                                            Limpiar
                                        </Button>
                                    </div>
                                </div>
                                
                                {inventorySearched && (
                                    <div className="mt-6">
                                        <div className="flex justify-between items-center flex-wrap gap-4 mb-4">
                                            <div>
                                              <h3 className="text-lg font-semibold">Resultados del Inventario</h3>
                                                <RadioGroup defaultValue="daily" value={inventoryGroupType} onValueChange={(value: InventoryGroupType) => setInventoryGroupType(value)} className="flex items-center space-x-4 mt-2">
                                                    <div className="flex items-center space-x-2">
                                                        <RadioGroupItem value="daily" id="group-daily" />
                                                        <Label htmlFor="group-daily">Diario</Label>
                                                    </div>
                                                    <div className="flex items-center space-x-2">
                                                        <RadioGroupItem value="monthly" id="group-monthly" />
                                                        <Label htmlFor="group-monthly">Mensual</Label>
                                                    </div>
                                                    <div className="flex items-center space-x-2">
                                                        <RadioGroupItem value="consolidated" id="group-consolidated" />
                                                        <Label htmlFor="group-consolidated">Consolidado</Label>
                                                    </div>
                                                </RadioGroup>
                                            </div>
                                            <div className="flex gap-2">
                                                <Button 
                                                    onClick={handleInventoryExportExcel} 
                                                    disabled={isQuerying || (!pivotedInventoryData && !pivotedTunelData)}
                                                    variant="outline"
                                                >
                                                    <File className="mr-2 h-4 w-4" /> Exportar a Excel
                                                </Button>
                                                <Button 
                                                    onClick={handleInventoryExportPDF} 
                                                    disabled={isQuerying || (!pivotedInventoryData && !pivotedTunelData) || isLogoLoading}
                                                    variant="outline"
                                                >
                                                    {isLogoLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
                                                    Exportar a PDF
                                                </Button>
                                            </div>
                                        </div>
                                        
                                        <div className="space-y-8">
                                            {isQuerying ? (
                                                <div className="flex justify-center items-center h-48"><Skeleton className="h-20 w-full" /></div>
                                            ) : (pivotedInventoryData?.tables?.length || pivotedTunelData) ? (
                                              <>
                                                {pivotedInventoryData && pivotedInventoryData.tables.map((table, tableIndex) => (
                                                    <Card key={table.title}>
                                                        <CardHeader>
                                                            <CardTitle>{table.title}</CardTitle>
                                                        </CardHeader>
                                                        <CardContent>
                                                            <ScrollArea className="w-full whitespace-nowrap rounded-md border">
                                                            {pivotedInventoryData.type === 'monthly' && Array.isArray(table.data) ? (
                                                                table.data.map((yearData: any, yearIdx: number) => (
                                                                    <div key={yearData.year} className="mb-6 last:mb-0">
                                                                        <h4 className="p-4 text-lg font-semibold bg-muted">{`AÑO: ${yearData.year}`}</h4>
                                                                        <Table>
                                                                            <TableHeader>
                                                                                <TableRow>
                                                                                    <TableHead className="sticky left-0 z-10 bg-background/95 backdrop-blur-sm">Cliente</TableHead>
                                                                                    {yearData.headers.map((h:any) => <TableHead key={h} className="text-right">{h}</TableHead>)}
                                                                                    <TableHead className="sticky right-0 bg-background/95 backdrop-blur-sm text-right font-bold">Total Cliente</TableHead>
                                                                                    <TableHead className="sticky right-0 bg-background/95 backdrop-blur-sm text-right font-bold">Promedio Posiciones</TableHead>
                                                                                </TableRow>
                                                                            </TableHeader>
                                                                            <TableBody>
                                                                                {yearData.clientRows.map((row: any) => (
                                                                                    <TableRow key={row.clientName}>
                                                                                        <TableCell className="font-medium sticky left-0 z-10 bg-background/95 backdrop-blur-sm">{row.clientName}</TableCell>
                                                                                        {Object.values(row.data).map((value: any, i) => <TableCell key={i} className="text-right font-mono">{Math.round(value).toLocaleString('es-CO')}</TableCell>)}
                                                                                        <TableCell className="sticky right-0 bg-background/95 backdrop-blur-sm text-right font-bold">{Math.round(row.total).toLocaleString('es-CO')}</TableCell>
                                                                                        <TableCell className="sticky right-0 bg-background/95 backdrop-blur-sm text-right font-mono">{Math.round(row.average)}</TableCell>
                                                                                    </TableRow>
                                                                                ))}
                                                                                <TableRow className="bg-primary/90 hover:bg-primary/90 text-primary-foreground font-bold">
                                                                                    <TableCell className="sticky left-0 z-10 bg-primary/90">TOTALES</TableCell>
                                                                                    {(inventoryTotals[tableIndex] as any)[yearIdx].columnTotals.map((total: any, i: any) => <TableCell key={i} className="text-right font-mono">{Math.round(total).toLocaleString('es-CO')}</TableCell>)}
                                                                                    <TableCell className="sticky right-0 bg-primary/90 text-right font-bold">{Math.round((inventoryTotals[tableIndex] as any)[yearIdx].grandTotal).toLocaleString('es-CO')}</TableCell>
                                                                                    <TableCell className="sticky right-0 bg-primary/90 text-right font-mono">{Math.round((inventoryTotals[tableIndex] as any)[yearIdx].grandAverage).toLocaleString('es-CO')}</TableCell>
                                                                                </TableRow>
                                                                                <TableRow className="bg-sky-100 hover:bg-sky-100 text-sky-900 font-bold">
                                                                                    <TableCell className="sticky left-0 z-10 bg-sky-100">(%) Ocupación</TableCell>
                                                                                    {(inventoryTotals[tableIndex] as any)[yearIdx].columnTotals.map((total: any, i: any) => <TableCell key={i} className="text-right font-mono">{`${Math.round((total / STORAGE_CAPACITY[table.sessionKey as keyof typeof STORAGE_CAPACITY]) * 100)}%`}</TableCell>)}
                                                                                    <TableCell className="sticky right-0 bg-sky-100 text-right font-bold">{`${Math.round((inventoryTotals[tableIndex] as any)[yearIdx].totalCustomerOccupation)}%`}</TableCell>
                                                                                    <TableCell className="sticky right-0 bg-sky-100 text-right font-mono"></TableCell>
                                                                                </TableRow>
                                                                            </TableBody>
                                                                        </Table>
                                                                    </div>
                                                                ))
                                                            ) : table.data ? (
                                                                <Table>
                                                                    <TableHeader>
                                                                        <TableRow>
                                                                            <TableHead className="sticky left-0 z-10 bg-background/95 backdrop-blur-sm">Cliente</TableHead>
                                                                            {(table.data as { headers: string[] }).headers.map((h:any) => <TableHead key={h} className="text-right">{h}</TableHead>)}
                                                                            <TableHead className="sticky right-0 bg-background/95 backdrop-blur-sm text-right font-bold">Total Cliente</TableHead>
                                                                            <TableHead className="sticky right-0 bg-background/95 backdrop-blur-sm text-right font-bold">Promedio Posiciones</TableHead>
                                                                        </TableRow>
                                                                    </TableHeader>
                                                                    <TableBody>
                                                                        {(table.data as { clientRows: any[] }).clientRows.map((row: any) => (
                                                                            <TableRow key={row.clientName}>
                                                                                <TableCell className="font-medium sticky left-0 z-10 bg-background/95 backdrop-blur-sm">{row.clientName}</TableCell>
                                                                                {Object.values(row.data).map((value: any, i) => <TableCell key={i} className="text-right font-mono">{Math.round(value).toLocaleString('es-CO')}</TableCell>)}
                                                                                <TableCell className="sticky right-0 bg-background/95 backdrop-blur-sm text-right font-bold">{Math.round(row.total).toLocaleString('es-CO')}</TableCell>
                                                                                <TableCell className="sticky right-0 bg-background/95 backdrop-blur-sm text-right font-mono">{Math.round(row.average)}</TableCell>
                                                                            </TableRow>
                                                                        ))}
                                                                        <TableRow className="bg-primary/90 hover:bg-primary/90 text-primary-foreground font-bold">
                                                                            <TableCell className="sticky left-0 z-10 bg-primary/90">TOTALES</TableCell>
                                                                            {(inventoryTotals[tableIndex] as any).columnTotals.map((total: any, i: any) => <TableCell key={i} className="text-right font-mono">{Math.round(total).toLocaleString('es-CO')}</TableCell>)}
                                                                            <TableCell className="sticky right-0 bg-primary/90 text-right font-bold">{Math.round((inventoryTotals[tableIndex] as any).grandTotal).toLocaleString('es-CO')}</TableCell>
                                                                            <TableCell className="sticky right-0 bg-primary/90 text-right font-mono">{Math.round((inventoryTotals[tableIndex] as any).grandAverage).toLocaleString('es-CO')}</TableCell>
                                                                        </TableRow>
                                                                        <TableRow className="bg-sky-100 hover:bg-sky-100 text-sky-900 font-bold">
                                                                            <TableCell className="sticky left-0 z-10 bg-sky-100">(%) Ocupación</TableCell>
                                                                            {(inventoryTotals[tableIndex] as any).columnTotals.map((total: any, i: any) => <TableCell key={i} className="text-right font-mono">{`${Math.round((total / STORAGE_CAPACITY[table.sessionKey as keyof typeof STORAGE_CAPACITY]) * 100)}%`}</TableCell>)}
                                                                            <TableCell className="sticky right-0 bg-sky-100 text-right font-bold">{`${Math.round((inventoryTotals[tableIndex] as any).totalCustomerOccupation)}%`}</TableCell>
                                                                            <TableCell className="sticky right-0 bg-sky-100 text-right font-mono"></TableCell>
                                                                        </TableRow>
                                                                    </TableBody>
                                                                </Table>
                                                            ) : null}
                                                            <ScrollBar orientation="horizontal" />
                                                            </ScrollArea>
                                                        </CardContent>
                                                    </Card>
                                                ))}

                                                {pivotedTunelData && pivotedTunelData.data && (
                                                     <Card>
                                                        <CardHeader>
                                                            <CardTitle>{pivotedTunelData.title}</CardTitle>
                                                        </CardHeader>
                                                        <CardContent>
                                                            <ScrollArea className="w-full whitespace-nowrap rounded-md border">
                                                                <Table>
                                                                    <TableHeader>
                                                                        <TableRow>
                                                                            <TableHead className="sticky left-0 z-10 bg-background/95 backdrop-blur-sm">Cliente</TableHead>
                                                                            {(pivotedTunelData.data as any).headers.map((h: string) => <TableHead key={h} className="text-right">{h}</TableHead>)}
                                                                            <TableHead className="sticky right-0 bg-background/95 backdrop-blur-sm text-right font-bold">Total Cliente (kg)</TableHead>
                                                                        </TableRow>
                                                                    </TableHeader>
                                                                    <TableBody>
                                                                        {(pivotedTunelData.data as any).clientRows.map((row: any) => (
                                                                            <TableRow key={row.clientName}>
                                                                                <TableCell className="font-medium sticky left-0 z-10 bg-background/95 backdrop-blur-sm">{row.clientName}</TableCell>
                                                                                {Object.values(row.data).map((value: any, i) => <TableCell key={i} className="text-right font-mono">{Number(value).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>)}
                                                                                <TableCell className="sticky right-0 bg-background/95 backdrop-blur-sm text-right font-bold">{row.total.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                                                            </TableRow>
                                                                        ))}
                                                                         <TableRow className="bg-primary/90 hover:bg-primary/90 text-primary-foreground font-bold">
                                                                            <TableCell className="sticky left-0 z-10 bg-primary/90">TOTALES</TableCell>
                                                                            {(tunelTotals as any).columnTotals.map((total: any, i: any) => <TableCell key={i} className="text-right font-mono">{total.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>)}
                                                                            <TableCell className="sticky right-0 bg-primary/90 text-right font-bold">{(tunelTotals as any).grandTotal.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                                                        </TableRow>
                                                                    </TableBody>
                                                                </Table>
                                                                <ScrollBar orientation="horizontal" />
                                                            </ScrollArea>
                                                        </CardContent>
                                                    </Card>
                                                )}
                                              </>
                                            ) : (
                                                <Card><CardContent className="py-20 text-center text-muted-foreground">No se encontraron registros de inventario para su selección.</CardContent></Card>
                                            )}
                                        </div>
                                    </div>
                                )}
                                <Card className="mt-6">
                                    <CardHeader>
                                        <CardTitle>Exportar Inventario Detallado a Excel</CardTitle>
                                        <p className="text-sm text-muted-foreground">Genere un archivo Excel con el detalle completo del inventario para un cliente y rango de fechas específico.</p>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                                            <div className="space-y-2 lg:col-span-2">
                                                <Label>Cliente(s)</Label>
                                                <Dialog open={isExportClientDialogOpen} onOpenChange={setIsExportClientDialogOpen}>
                                                    <DialogTrigger asChild>
                                                        <Button variant="outline" className="w-full justify-between font-normal">
                                                            <span className="truncate">{getExportClientsText()}</span>
                                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                        </Button>
                                                    </DialogTrigger>
                                                    <DialogContent className="sm:max-w-[425px]">
                                                        <DialogHeader>
                                                            <DialogTitle>Seleccionar Cliente(s)</DialogTitle>
                                                            <p className="text-sm text-muted-foreground">Seleccione los clientes para la exportación detallada.</p>
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
                                                            <Button onClick={() => setIsExportClientDialogOpen(false)}>Cerrar</Button>
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
                                                        <Calendar initialFocus mode="range" defaultMonth={exportDateRange?.from} selected={exportDateRange} onSelect={setExportDateRange} numberOfMonths={2} locale={es} disabled={{ after: today, before: threeYearsAgo }} />
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
                                <p className="text-sm text-muted-foreground">Seleccione cliente, rango de fechas y sesión para ver el informe consolidado.</p>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end mb-4">
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
                                                            }} numberOfMonths={2} locale={es} disabled={{ after: today, before: threeYearsAgo }} />
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
                                                    const invAcumulado = typeof row.inventarioAcumulado === 'object' ? (row.inventarioAcumulado as ClientInventoryDetail)?.total : row.inventarioAcumulado;
                                                    const isValid = row.posicionesAlmacenadas === invAcumulado;
                                                    return (
                                                        <TableRow key={row.date}>
                                                            <TableCell className="font-medium">{format(new Date(row.date.replace(/-/g, '/')), 'dd/MM/yyyy')}</TableCell>
                                                            <TableCell className="text-right">{row.paletasRecibidas}</TableCell>
                                                            <TableCell className="text-right">{row.paletasDespachadas}</TableCell>
                                                            <TableCell className="text-right font-semibold">{row.posicionesAlmacenadas}</TableCell>
                                                            <TableCell className="text-right">{invAcumulado}</TableCell>
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
                                <CardTitle>Liquidación de Servicios Clientes</CardTitle>
                                <p className="text-sm text-muted-foreground">Genere un reporte de liquidación para los servicios prestados a un cliente.</p>
                            </CardHeader>
                            <CardContent>
                                <Form {...settlementForm}>
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end mb-4">
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
                                            <Label>Rango de Fechas</Label>
                                            <Popover>
                                                <PopoverTrigger asChild><Button variant={"outline"} className={cn("w-full justify-between text-left font-normal", !settlementDateRange && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4" />{settlementDateRange?.from ? (settlementDateRange.to ? (<>{format(settlementDateRange.from, "LLL dd, y", { locale: es })} - {format(settlementDateRange.to, "LLL dd, y", { locale: es })}</>) : (format(settlementDateRange.from, "LLL dd, y", { locale: es }))) : (<span>Seleccione un rango</span>)}</Button></PopoverTrigger>
                                                <PopoverContent className="w-auto p-0" align="start"><Calendar initialFocus mode="range" defaultMonth={settlementDateRange?.from} selected={settlementDateRange} onSelect={(range) => {
                                                    if (range?.from && range?.to && differenceInDays(range.to, range.from) > MAX_DATE_RANGE_DAYS) {
                                                        toast({ variant: 'destructive', title: 'Rango muy amplio', description: `Por favor, seleccione un rango de no más de ${MAX_DATE_RANGE_DAYS} días.` });
                                                    } else {
                                                        setSettlementDateRange(range);
                                                    }
                                                }} numberOfMonths={2} locale={es} disabled={{ before: threeYearsAgo }} /></PopoverContent>
                                            </Popover>
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="payment-term">Plazo de Vencimiento</Label>
                                            <Input
                                                id="payment-term"
                                                placeholder="Ej: 30 o Contado"
                                                value={settlementPaymentTerm}
                                                onChange={(e) => setSettlementPaymentTerm(e.target.value)}
                                                disabled={!settlementClient}
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end mb-6">
                                        <div className="space-y-2">
                                            <Label>Versión de Liquidación</Label>
                                            <Select value={selectedVersionId} onValueChange={setSelectedVersionId} disabled={isLoadingVersions}>
                                                <SelectTrigger className={cn(isLoadingVersions && "animate-pulse")}>
                                                    {isLoadingVersions ? <span>Cargando versiones...</span> : <SelectValue />}
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="original">Calcular Original</SelectItem>
                                                    {settlementVersions.map(v => (
                                                        <SelectItem key={v.id} value={v.id}>
                                                            {`${format(parseISO(v.savedAt), 'dd/MM/yy HH:mm')} - ${v.note} (${v.savedBy.displayName})`}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Conceptos a Liquidar</Label>
                                            <Dialog open={isSettlementConceptDialogOpen} onOpenChange={setIsSettlementConceptDialogOpen}>
                                                <DialogTrigger asChild>
                                                    <Button
                                                        variant="outline"
                                                        className="w-full justify-between"
                                                        disabled={selectedVersionId !== 'original' || isConceptSelectorDisabled || !settlementClient || !settlementDateRange}
                                                    >
                                                        <span className="truncate">{selectedConcepts.length === 0 ? "Seleccionar conceptos..." : `${selectedConcepts.length} seleccionados`}</span>
                                                        {isLoadingAvailableConcepts ? <Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin" /> : <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50"/>}
                                                    </Button>
                                                </DialogTrigger>
                                                <DialogContent>
                                                    <DialogHeader>
                                                        <DialogTitle>Seleccionar Conceptos</DialogTitle>
                                                        <p className="text-sm text-muted-foreground">
                                                            Marque los conceptos a liquidar.
                                                            {isConceptSelectorDisabled && <p className="text-destructive font-semibold mt-2">La selección está deshabilitada porque ha ingresado un lote de SMYL.</p>}
                                                        </p>
                                                    </DialogHeader>
                                                    <ScrollArea className="h-72 mt-4"><div className="space-y-2 pr-4">
                                                        {isLoadingAvailableConcepts ? (
                                                            <div className="flex justify-center items-center h-full"><Loader2 className="h-6 w-6 animate-spin" /></div>
                                                        ) : availableConcepts.length > 0 ? (
                                                            <>
                                                                <div className="flex items-center space-x-3 p-2 border-b">
                                                                    <Checkbox
                                                                        id="select-all-concepts-client"
                                                                        checked={availableConcepts.length > 0 && selectedConcepts.length === availableConcepts.length}
                                                                        onCheckedChange={(checked) => {
                                                                            setSelectedConcepts(checked ? availableConcepts.map(c => c.id) : []);
                                                                        }}
                                                                    />
                                                                    <Label htmlFor="select-all-concepts-client" className="text-sm font-medium leading-none cursor-pointer">
                                                                        Seleccionar Todos
                                                                    </Label>
                                                                </div>
                                                                {availableConcepts.map(c => (<div key={c.id} className="flex items-center space-x-3"><Checkbox id={`concept-${c.id}`} checked={selectedConcepts.includes(c.id)} onCheckedChange={checked => setSelectedConcepts(prev => checked ? [...prev, c.id] : prev.filter(id => id !== c.id))} /><label htmlFor={`concept-${c.id}`} className="text-sm font-medium leading-none cursor-pointer">{c.conceptName}</label></div>))}
                                                            </>
                                                        ) : (
                                                            <p className="text-sm text-muted-foreground text-center py-10">No hay conceptos aplicables para este cliente y rango de fechas.</p>
                                                        )}
                                                    </div></ScrollArea>
                                                <DialogFooter><Button onClick={() => setIsSettlementConceptDialogOpen(false)}>Cerrar</Button></DialogFooter>
                                                </DialogContent>
                                            </Dialog>
                                        </div>
                                    </div>
                                    <div className={cn("grid grid-cols-1 md:grid-cols-2 gap-4 items-end mb-6", showSmylLotInput ? 'md:grid-cols-3' : 'md:grid-cols-2')}>
                                        <div className="space-y-2">
                                            <Label>No. Contenedor (Opcional)</Label>
                                            <Input placeholder="Filtrar por contenedor" value={settlementContainer} onChange={(e) => setSettlementContainer(e.target.value)} />
                                        </div>
                                        {showSmylLotInput && (
                                            <div className="space-y-2 md:col-span-3">
                                                <Label>Lote(s) de SMYL (Opcional)</Label>
                                                <Textarea placeholder="Ingrese uno o más lotes, separados por comas o espacios" value={settlementLotIds} onChange={(e) => setSettlementLotIds(e.target.value.toUpperCase())} />
                                                <p className="text-xs text-muted-foreground">Si ingresa un lote, solo se liquidarán los conceptos de manipulación y almacenamiento para ese lote.</p>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex gap-2">
                                         <Button onClick={handleSettlementSearch} className="w-full" disabled={isSettlementLoading || !settlementClient || !settlementDateRange}>
                                            {isSettlementLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : selectedVersionId === 'original' ? <Search className="mr-2 h-4 w-4" /> : <Download className="mr-2 h-4 w-4"/>}
                                            {selectedVersionId === 'original' ? 'Liquidar' : 'Cargar Versión'}
                                        </Button>
                                        <Button onClick={() => { setSettlementClient(undefined); setSettlementDateRange(undefined); setSelectedConcepts([]); setSettlementReportData([]); setSettlementSearched(false); setSettlementContainer(''); setSettlementLotIds(''); setHiddenRowIds(new Set()); setSelectedVersionId('original'); setOriginalSettlementData([]); }} variant="outline" className="w-full"><XCircle className="mr-2 h-4 w-4" />Limpiar</Button>
                                    </div>
                                </div>
                                </Form>
                                {settlementSearched && (
                                    <>
                                     <Alert className="my-4">
                                        <Info className="h-4 w-4" />
                                        <AlertTitle>Modo de Visualización</AlertTitle>
                                        <AlertDescription>
                                            {selectedVersionId === 'original'
                                                ? "Mostrando liquidación calculada en tiempo real. Los cambios no se guardarán hasta que cree una nueva versión."
                                                : `Estás viendo una versión guardada. Para realizar un nuevo cálculo, seleccione 'Calcular Original' en la lista de versiones y haga clic en 'Liquidar'."`
                                            }
                                        </AlertDescription>
                                    </Alert>
                                    <div className="flex justify-between items-center gap-2 my-4">
                                        <div className="flex items-center gap-2">
                                            {hiddenRowIds.size > 0 && (
                                                <Button onClick={handleRestoreAllHidden} variant="outline" size="sm">
                                                    <History className="mr-2 h-4 w-4" />
                                                    Restaurar Ocultos ({hiddenRowIds.size})
                                                </Button>
                                            )}
                                        </div>
                                        <div className="flex gap-2">
                                            <Dialog open={isSaveVersionOpen} onOpenChange={setIsSaveVersionOpen}>
                                                <DialogTrigger asChild>
                                                    <Button variant="default" disabled={isSettlementLoading || visibleSettlementData.length === 0}><Save className="mr-2 h-4 w-4" />Guardar Versión</Button>
                                                </DialogTrigger>
                                                <DialogContent>
                                                    <DialogHeader>
                                                        <DialogTitle>Guardar Versión de Liquidación</DialogTitle>
                                                        <DialogDescription>Agregue una nota descriptiva para identificar esta versión.</DialogDescription>
                                                    </DialogHeader>
                                                    <Textarea placeholder="Ej: Ajuste final para factura mayo" value={versionNote} onChange={e => setVersionNote(e.target.value)} />
                                                    <DialogFooter>
                                                        <Button variant="outline" onClick={() => setIsSaveVersionOpen(false)}>Cancelar</Button>
                                                        <Button onClick={handleSaveVersion} disabled={isSavingVersion || !versionNote.trim() || !user}>
                                                            {isSavingVersion ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                                            Guardar
                                                        </Button>
                                                    </DialogFooter>
                                                </DialogContent>
                                            </Dialog>
                                            <Button onClick={handleSettlementExportExcel} disabled={isSettlementLoading || settlementReportData.length === 0} variant="outline"><File className="mr-2 h-4 w-4" />Exportar a Excel</Button>
                                            <Button onClick={handleSettlementExportPDF} disabled={isSettlementLoading || settlementReportData.length === 0 || isLogoLoading} variant="outline">
                                                {isLogoLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
                                                Exportar a PDF
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="rounded-md border">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead className="text-xs p-2">Fecha</TableHead>
                                                    <TableHead className="text-xs p-2">Concepto</TableHead>
                                                    <TableHead className="text-xs p-2">Detalle</TableHead>
                                                    <TableHead className="text-xs p-2">No. Pers.</TableHead>
                                                    <TableHead className="text-xs p-2">#Paletas</TableHead>
                                                    <TableHead className="text-xs p-2">Placa</TableHead>
                                                    <TableHead className="text-xs p-2">Cámara</TableHead>
                                                    <TableHead className="text-xs p-2">Contenedor</TableHead>
                                                    <TableHead className="text-xs p-2">Pedido</TableHead>
                                                    <TableHead className="text-xs p-2">Op. Log.</TableHead>
                                                    <TableHead className="text-xs p-2">T. Vehículo</TableHead>
                                                    <TableHead className="text-xs p-2">H. Inicio</TableHead>
                                                    <TableHead className="text-xs p-2">H. Fin</TableHead>
                                                    <TableHead className="text-xs p-2">Cantidad</TableHead>
                                                    <TableHead className="text-xs p-2">Unidad</TableHead>
                                                    <TableHead className="text-right text-xs p-2">Vlr. Unit.</TableHead>
                                                    <TableHead className="text-right text-xs p-2">Vlr. Total</TableHead>
                                                    <TableHead className="text-xs p-2">Justificación</TableHead>
                                                    <TableHead className="text-right text-xs p-2">Acciones</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            
                                                {isSettlementLoading ? (
                                                    <TableBody>
                                                    {Array.from({length: 3}).map((_, i) => <TableRow key={i}><TableCell colSpan={18}><Skeleton className="h-8 w-full"/></TableCell></TableRow>)}
                                                    </TableBody>
                                                ) : Object.keys(settlementGroupedData).length > 0 ? (
                                                    <>
                                                        {Object.keys(settlementGroupedData).map(conceptName => {
                                                            const group = settlementGroupedData[conceptName];
                                                            
                                                            const isContainerConcept = [
                                                                'SERVICIO DE REFRIGERACIÓN - PALLET/DIA (0°C A 4ºC) POR CONTENEDOR',
                                                                'SERVICIO DE CONGELACIÓN - PALLET/DÍA (-18ºC) POR CONTENEDOR',
                                                                'SERVICIO DE SECO -PALLET/DIA POR CONTENEDOR'
                                                            ].includes(conceptName);
                                                            
                                                            const renderGroup = (rows: ClientSettlementRow[], title: string, subtotalLabel: string) => (
                                                                <tbody key={title}>
                                                                    {title && (
                                                                        <TableRow className="bg-muted hover:bg-muted/90">
                                                                            <TableCell colSpan={19} className="font-semibold text-primary text-sm p-2">{title}</TableCell>
                                                                        </TableRow>
                                                                    )}
                                                                    {rows.map((row) => {
                                                                        const isProjected = row.isEdited && !originalSettlementData.some(originalRow => originalRow.uniqueId === row.uniqueId);
                                                                        return (
                                                                        <TableRow key={row.uniqueId} data-state={row.isEdited ? "edited" : ""}>
                                                                        {row.isPending ? (
                                                                            <>
                                                                                <TableCell className="text-xs p-2">{format(parseISO(row.date), 'dd/MM/yyyy', { locale: es })}</TableCell>
                                                                                <TableCell className="text-xs p-2 whitespace-normal font-semibold">{row.conceptName}</TableCell>
                                                                                <TableCell colSpan={17}>
                                                                                    <Alert variant="destructive" className="py-2 px-3">
                                                                                        <AlertTriangle className="h-4 w-4" />
                                                                                        <AlertDescription className="flex items-center">
                                                                                            Pendiente Legalizar Peso Bruto.
                                                                                            <LegalizeLinkButton submissionId={row.submissionId!} formType={row.formType || ''} />
                                                                                        </AlertDescription>
                                                                                    </Alert>
                                                                                </TableCell>
                                                                            </>
                                                                        ) : (
                                                                            <>
                                                                                <TableCell className="text-xs p-2">{format(parseISO(row.date), 'dd/MM/yyyy', { locale: es })}</TableCell>
                                                                                <TableCell className="text-xs p-2 whitespace-normal">{row.conceptName}</TableCell>
                                                                                <TableCell className="text-xs p-2 whitespace-normal">{row.subConceptName}</TableCell>
                                                                                <TableCell className="text-xs p-2">{row.conceptName !== 'POSICIONES FIJAS CÁMARA CONGELADOS' ? row.numeroPersonas || '' : ''}</TableCell>
                                                                                <TableCell className="text-xs p-2">{row.totalPaletas > 0 ? row.totalPaletas : ''}</TableCell>
                                                                                <TableCell className="text-xs p-2">{row.placa}</TableCell>
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
                                                                                <TableCell className="text-xs p-2 max-w-[150px] truncate" title={row.justification}>{row.justification}</TableCell>
                                                                                <TableCell className="text-right p-1">
                                                                                    <div className="flex items-center justify-end gap-0">
                                                                                        {row.isEdited && !isProjected && (
                                                                                            <Button variant="ghost" size="sm" onClick={() => handleRestoreRow(row.uniqueId!)} title="Restaurar fila original">
                                                                                                <Undo2 className="h-4 w-4" />
                                                                                            </Button>
                                                                                        )}
                                                                                        <Button variant="ghost" size="icon" onClick={() => { setRowToEdit(row); setIsEditSettlementRowOpen(true); }} title="Editar fila">
                                                                                            <Edit2 className="h-4 w-4" />
                                                                                        </Button>
                                                                                        <Button variant="ghost" size="icon" onClick={() => handleHideRow(row.uniqueId!)} title="Ocultar fila">
                                                                                            <EyeOff className="h-4 w-4 text-muted-foreground" />
                                                                                        </Button>
                                                                                        {(row.conceptName.includes('SERVICIO DE CONGELACIÓN') || row.conceptName.includes('SERVICIO DE REFRIGERACIÓN')) && (
                                                                                            <Button variant="ghost" size="icon" onClick={() => setRowToDuplicate(row)} title="Duplicar registro">
                                                                                                <Copy className="h-4 w-4 text-sky-600" />
                                                                                            </Button>
                                                                                        )}
                                                                                    </div>
                                                                                </TableCell>
                                                                            </>
                                                                        )}
                                                                    </TableRow>
                                                                        );
                                                                    })}
                                                                    {subtotalLabel && (
                                                                        <TableRow className="bg-muted/70 hover:bg-muted/70 font-semibold">
                                                                            <TableCell colSpan={13} className="text-right text-xs p-2">{subtotalLabel}</TableCell>
                                                                            <TableCell className="text-xs p-2 text-right">{rows.reduce((s, r) => s + r.quantity, 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</TableCell>
                                                                            <TableCell colSpan={2}></TableCell>
                                                                            <TableCell className="text-right text-xs p-2">{rows.reduce((s, r) => s + r.totalValue, 0).toLocaleString('es-CO', { style: 'currency', currency: 'COP' })}</TableCell>
                                                                            <TableCell colSpan={2}></TableCell>
                                                                        </TableRow>
                                                                    )}
                                                                </tbody>
                                                            );
                                                            
                                                            if (isContainerConcept) {
                                                                const containerGroups = group.rows.reduce((acc, row) => {
                                                                    const containerKey = row.container || 'SIN_CONTENEDOR';
                                                                    if (!acc[containerKey]) {
                                                                        acc[containerKey] = [];
                                                                    }
                                                                    acc[containerKey].push(row);
                                                                    return acc;
                                                                }, {} as Record<string, ClientSettlementRow[]>);

                                                                return (
                                                                    <React.Fragment key={conceptName}>
                                                                        {Object.entries(containerGroups).map(([containerKey, rows]) => {
                                                                            const containerSubtotalLabel = `Subtotal Contenedor ${containerKey}:`;
                                                                            return renderGroup(rows, `${conceptName} - Contenedor: ${containerKey}`, containerSubtotalLabel);
                                                                        })}
                                                                    </React.Fragment>
                                                                );
                                                            } else {
                                                                return renderGroup(group.rows, conceptName, `Subtotal ${conceptName}:`);
                                                            }
                                                        })}
                                                        <TableBody>
                                                        <TableRow className="bg-primary hover:bg-primary text-primary-foreground font-bold text-base">
                                                            <TableCell colSpan={13} className="text-right p-2">TOTAL GENERAL:</TableCell>
                                                            <TableCell className="text-right p-2">{visibleSettlementData.reduce((sum, row) => sum + row.quantity, 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</TableCell>
                                                            <TableCell colSpan={2}></TableCell>
                                                            <TableCell className="text-right p-2">{settlementTotalGeneral.toLocaleString('es-CO', {style: 'currency', currency: 'COP'})}</TableCell>
                                                            <TableCell colSpan={2}></TableCell>
                                                        </TableRow>
                                                        </TableBody>
                                                    </>
                                                ) : (
                                                    <TableBody>
                                                    <TableRow><TableCell colSpan={19} className="h-24 text-center">No se encontraron datos para liquidar.</TableCell></TableRow>
                                                    </TableBody>
                                                )}
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
                        <p className="text-sm text-muted-foreground">
                            Esta acción no se puede deshacer. Se eliminarán permanentemente los registros de inventario para el rango:
                            <br />
                            <strong className="text-foreground">
                                {dateRangeToDelete?.from && format(dateRangeToDelete.from, "PPP", { locale: es })} - {dateRangeToDelete?.to && format(dateRangeToDelete.to, "PPP", { locale: es })}
                            </strong>.
                        </p>
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
            <Dialog open={!!rowToDuplicate} onOpenChange={(open) => {if (!open) {setRowToDuplicate(null); }}}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Duplicar Registro para Proyección</DialogTitle>
                        <DialogDescription>
                            Seleccione las fechas a las que desea duplicar este registro.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                        <Card className="bg-muted/50">
                            <CardHeader className="pb-2"><CardTitle className="text-base">Registro Original</CardTitle></CardHeader>
                            <CardContent className="text-sm space-y-1">
                                <p><strong>Fecha:</strong> {rowToDuplicate && format(parseISO(rowToDuplicate.date), 'dd/MM/yyyy')}</p>
                                <p><strong>Concepto:</strong> {rowToDuplicate?.conceptName}</p>
                                <p><strong>Cantidad:</strong> {rowToDuplicate?.quantity.toLocaleString('es-CO')}</p>
                                <p><strong>Valor:</strong> {rowToDuplicate?.totalValue.toLocaleString('es-CO', { style: 'currency', currency: 'COP' })}</p>
                            </CardContent>
                        </Card>
                        <div className="space-y-2">
                             <Label>Duplicar en las fechas:</Label>
                            <DateMultiSelector
                                value={duplicateDates}
                                onChange={setDuplicateDates}
                                calendarProps={{
                                    disabled: (date) => !settlementDateRange?.from || date < settlementDateRange.from
                                }}
                             />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRowToDuplicate(null)}>Cancelar</Button>
                        <Button onClick={handleDuplicateRow} disabled={duplicateDates.length === 0}>Duplicar Registros</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
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
        const numPersonas = Number(editedRow.numeroPersonas) || 1;
        const newTotal = (editedRow.quantity || 0) * (editedRow.unitValue || 0) * numPersonas;
        onSave({ ...editedRow, totalValue: newTotal });
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setEditedRow(prev => ({ ...prev, [name]: name === 'quantity' || name === 'unitValue' || name === 'numeroPersonas' ? parseFloat(value) : value }));
    };

    const handleSelectChange = (name: keyof ClientSettlementRow, value: string) => {
        setEditedRow(prev => ({ ...prev, [name]: value }));
    }

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Editar Liquidación Manualmente</DialogTitle>
                    <p className="text-sm text-muted-foreground">Ajuste los valores para este registro. El cambio solo se aplicará a esta liquidación.</p>
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
                                    <SelectItem value="N/A">No Aplica</SelectItem>
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
                            <Label htmlFor="numeroPersonas">No. Personas</Label>
                            <Input id="numeroPersonas" name="numeroPersonas" type="number" value={editedRow.numeroPersonas} onChange={handleChange} />
                        </div>
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
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="unitValue">Valor Unitario</Label>
                        <Input id="unitValue" name="unitValue" type="number" value={editedRow.unitValue} onChange={handleChange} />
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="justification">Comentarios de justificación</Label>
                        <Textarea id="justification" name="justification" placeholder="Opcional: explique por qué se realizó este cambio manual." value={editedRow.justification || ''} onChange={handleChange} />
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
