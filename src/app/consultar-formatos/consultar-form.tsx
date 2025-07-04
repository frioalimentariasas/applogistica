
"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

import { searchSubmissions, SubmissionResult, SearchCriteria, deleteSubmission } from '@/app/actions/consultar-formatos';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import type { ClientInfo } from '@/app/actions/clients';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ArrowLeft, Search, XCircle, Loader2, FileSearch, Eye, Edit, Trash2, CalendarIcon, FolderSearch, ChevronsUpDown } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';


const ResultsSkeleton = () => (
  <>
    {Array.from({ length: 5 }).map((_, index) => (
      <TableRow key={index}>
        <TableCell><Skeleton className="h-5 w-[120px] rounded-md" /></TableCell>
        <TableCell><Skeleton className="h-5 w-[100px] rounded-md" /></TableCell>
        <TableCell><Skeleton className="h-5 w-[80px] rounded-md" /></TableCell>
        <TableCell><Skeleton className="h-5 w-[100px] rounded-md" /></TableCell>
        <TableCell><Skeleton className="h-5 w-[150px] rounded-md" /></TableCell>
        <TableCell><Skeleton className="h-5 w-[120px] rounded-md" /></TableCell>
        <TableCell className="text-right">
          <div className="flex justify-end gap-2">
            <Skeleton className="h-8 w-8 rounded-md" />
            <Skeleton className="h-8 w-8 rounded-md" />
            <Skeleton className="h-8 w-8 rounded-md" />
          </div>
        </TableCell>
      </TableRow>
    ))}
  </>
);

const EmptyState = ({ searched }: { searched: boolean }) => (
    <TableRow>
        <TableCell colSpan={7} className="py-20 text-center">
            <div className="flex flex-col items-center gap-4">
                <div className="rounded-full bg-primary/10 p-4">
                    <FolderSearch className="h-12 w-12 text-primary" />
                </div>
                <h3 className="text-xl font-semibold">
                    {searched ? "No se encontraron resultados" : "Realice una búsqueda"}
                </h3>
                <p className="text-muted-foreground">
                    {searched
                        ? "Intente con diferentes filtros para encontrar lo que busca."
                        : "Utilice los filtros de arriba para buscar entre los formatos guardados."}
                </p>
            </div>
        </TableCell>
    </TableRow>
);

const SESSION_STORAGE_KEY = 'consultarFormatosCriteria';

export default function ConsultarFormatosComponent({ clients }: { clients: ClientInfo[] }) {
    const router = useRouter();
    const { toast } = useToast();
    const { user } = useAuth();
    
    const [criteria, setCriteria] = useState<Omit<SearchCriteria, 'requestingUser' | 'searchDateStart' | 'searchDateEnd'>>({
        pedidoSislog: '',
        nombreCliente: '',
        operationType: undefined,
    });
    const [date, setDate] = useState<Date | undefined>(undefined);
    const [results, setResults] = useState<SubmissionResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [searched, setSearched] = useState(false);
    const [submissionToDelete, setSubmissionToDelete] = useState<SubmissionResult | null>(null);
    const [isClientDialogOpen, setClientDialogOpen] = useState(false);
    const [clientSearch, setClientSearch] = useState("");

    const operarioEmails = [
        'frioal.operario1@gmail.com',
        'frioal.operario2@gmail.com',
        'frioal.operario3@gmail.com',
        'frioal.operario4@gmail.com'
    ];
    const viewerEmails = [
        'facturacion@frioalimentaria.com.co',
        'procesos@frioalimentaria.com.co'
    ];
    const isOperario = user && operarioEmails.includes(user.email || '');
    const isViewer = user && viewerEmails.includes(user.email || '');

    const filteredClients = useMemo(() => {
        if (!clientSearch) return clients;
        return clients.filter(c => c.razonSocial.toLowerCase().includes(clientSearch.toLowerCase()));
    }, [clientSearch, clients]);

    const runSearch = useCallback(async (searchCriteria: SearchCriteria, isAutoSearch = false) => {
        setIsLoading(true);
        setSearched(true);
        try {
            const searchResults = await searchSubmissions(searchCriteria);
            setResults(searchResults);

            if (!isAutoSearch) {
                const isDefaultSearch = !searchCriteria.pedidoSislog && !searchCriteria.nombreCliente && !searchCriteria.searchDateStart && !searchCriteria.operationType;
                if (isDefaultSearch && searchResults.length > 0) {
                     toast({
                        title: "Mostrando resultados de la última semana",
                        description: "Para ver más información, utilice los filtros disponibles.",
                    });
                } else if (searchResults.length === 0 && !isDefaultSearch) {
                    toast({
                        title: "Sin resultados",
                        description: "No se encontraron formatos con los criterios de búsqueda proporcionados.",
                    });
                }
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Ocurrió un error desconocido.";
            toast({
                variant: 'destructive',
                title: 'Error en la búsqueda',
                description: errorMessage,
            });
        } finally {
            setIsLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        if (user) {
            const savedCriteriaJSON = sessionStorage.getItem(SESSION_STORAGE_KEY);
            if (savedCriteriaJSON) {
                const savedCriteria = JSON.parse(savedCriteriaJSON);
                
                const restoredCriteria: Omit<SearchCriteria, 'requestingUser' | 'searchDateStart' | 'searchDateEnd'> = {
                    pedidoSislog: savedCriteria.pedidoSislog || '',
                    nombreCliente: savedCriteria.nombreCliente || '',
                    operationType: savedCriteria.operationType,
                };
                const restoredDate = savedCriteria.searchDateStart ? parseISO(savedCriteria.searchDateStart) : undefined;
                
                setCriteria(restoredCriteria);
                setDate(restoredDate);

                const finalCriteria: SearchCriteria = {
                    ...restoredCriteria,
                    searchDateStart: savedCriteria.searchDateStart,
                    searchDateEnd: savedCriteria.searchDateEnd,
                    requestingUser: user ? { id: user.uid, email: user.email || '' } : undefined,
                };
                runSearch(finalCriteria, true);
            }
        }
    }, [user, runSearch]);

    const handleSearch = () => {
        let searchDateStart: string | undefined;
        let searchDateEnd: string | undefined;

        if (date) {
            const startOfDay = new Date(date);
            startOfDay.setHours(0, 0, 0, 0);
            searchDateStart = startOfDay.toISOString();

            const endOfDay = new Date(date);
            endOfDay.setHours(23, 59, 59, 999);
            searchDateEnd = endOfDay.toISOString();
        }

        const finalCriteria: SearchCriteria = {
            ...criteria,
            searchDateStart,
            searchDateEnd,
            requestingUser: user ? { id: user.uid, email: user.email || '' } : undefined,
        };
        
        const criteriaToSave = {
            pedidoSislog: criteria.pedidoSislog,
            nombreCliente: criteria.nombreCliente,
            operationType: criteria.operationType,
            searchDateStart,
            searchDateEnd,
        };
        sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(criteriaToSave));

        runSearch(finalCriteria);
    };

    const handleClear = () => {
        setCriteria({
            pedidoSislog: '',
            nombreCliente: '',
            operationType: undefined,
        });
        setDate(undefined);
        setResults([]);
        setSearched(false);
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
    };

    const handleConfirmDelete = async () => {
        if (!submissionToDelete) return;
        setIsDeleting(true);
        try {
            const result = await deleteSubmission(submissionToDelete.id);
            if (result.success) {
                toast({ title: 'Éxito', description: result.message });
                setResults(prev => prev.filter(r => r.id !== submissionToDelete.id));
            } else {
                throw new Error(result.message);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Ocurrió un error desconocido.";
            toast({ variant: 'destructive', title: 'Error al eliminar', description: errorMessage });
        } finally {
            setIsDeleting(false);
            setSubmissionToDelete(null);
        }
    };
    
    const getFormTypeName = (formType: string) => {
        if (formType.startsWith('fixed-weight-')) return 'Peso Fijo';
        if (formType.startsWith('variable-weight-')) return 'Peso Variable';
        return formType;
    };
    
    const getOperationTypeName = (formType: string) => {
        if (formType.includes('recepcion') || formType.includes('reception')) return 'Recepción';
        if (formType.includes('despacho')) return 'Despacho';
        return 'N/A';
    };

    const getEditUrl = (submission: SubmissionResult) => {
        const { id, formType } = submission;
        const operation = formType.includes('recepcion') || formType.includes('reception') ? 'recepcion' : 'despacho';
        
        if (formType.startsWith('fixed-weight-')) {
            return `/fixed-weight-form?operation=${operation}&id=${id}`;
        }
        if (formType.startsWith('variable-weight-recepcion')) {
            return `/variable-weight-reception-form?operation=recepcion&id=${id}`;
        }
        if (formType.startsWith('variable-weight-despacho')) {
            return `/variable-weight-form?operation=despacho&id=${id}`;
        }
        
        return `/consultar-formatos`;
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
                                <FileSearch className="h-8 w-8 text-primary" />
                                <h1 className="text-2xl font-bold text-primary">Consultar Formatos Guardados</h1>
                            </div>
                             <p className="text-sm text-gray-500">Busque y visualice los formatos que han sido enviados.</p>
                        </div>
                    </div>
                </header>
                
                <Card className="mb-6">
                    <CardHeader>
                        <CardTitle>Filtros de Búsqueda</CardTitle>
                        <CardDescription>Utilice uno o más filtros para encontrar los formatos que necesita.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
                            <div className="space-y-2">
                                <Label htmlFor="pedidoSislog">Pedido SISLOG</Label>
                                <Input 
                                    id="pedidoSislog"
                                    placeholder="Pedido SISLOG"
                                    value={criteria.pedidoSislog}
                                    onChange={(e) => setCriteria({...criteria, pedidoSislog: e.target.value})}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Nombre del Cliente</Label>
                                <Dialog open={isClientDialogOpen} onOpenChange={setClientDialogOpen}>
                                    <DialogTrigger asChild>
                                        <Button variant="outline" className="w-full justify-between text-left font-normal">
                                            {criteria.nombreCliente || "Seleccione un cliente"}
                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent className="sm:max-w-[425px]">
                                        <DialogHeader>
                                            <DialogTitle>Seleccionar Cliente</DialogTitle>
                                            <AlertDialogDescription>Busque y seleccione un cliente para filtrar los resultados.</AlertDialogDescription>
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
                                                                setCriteria({ ...criteria, nombreCliente: client.razonSocial });
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
                                <Label htmlFor="fechaCreacion">Fecha de Creación</Label>
                                 <Popover>
                                    <PopoverTrigger asChild>
                                    <Button
                                        variant={"outline"}
                                        className="w-full justify-start text-left font-normal"
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {date ? format(date, "PPP", { locale: es }) : <span>Seleccione una fecha</span>}
                                    </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0">
                                    <Calendar
                                        mode="single"
                                        selected={date}
                                        onSelect={setDate}
                                        initialFocus
                                    />
                                    </PopoverContent>
                                </Popover>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="operationType">Tipo de Operación</Label>
                                <Select
                                    value={criteria.operationType || 'all'}
                                    onValueChange={(value) => setCriteria({ ...criteria, operationType: value === 'all' ? undefined : (value as 'recepcion' | 'despacho') })}
                                    disabled={isLoading}
                                >
                                    <SelectTrigger id="operationType">
                                        <SelectValue placeholder="Todos" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Todos</SelectItem>
                                        <SelectItem value="recepcion">Recepción</SelectItem>
                                        <SelectItem value="despacho">Despacho</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex gap-2">
                                <Button onClick={handleSearch} className="w-full" disabled={isLoading}>
                                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                                    Buscar
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
                        <CardTitle>Resultados de la Búsqueda</CardTitle>
                        <CardDescription>
                             {isLoading ? "Cargando resultados..." : `Se encontraron ${results.length} formatos.`}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Fecha Creación</TableHead>
                                        <TableHead>Tipo Formato</TableHead>
                                        <TableHead>Operación</TableHead>
                                        <TableHead>Pedido SISLOG</TableHead>
                                        <TableHead>Cliente</TableHead>
                                        <TableHead>Operario</TableHead>
                                        <TableHead className="text-right">Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading ? (
                                        <ResultsSkeleton />
                                    ) : results.length > 0 ? (
                                        results.map((sub) => (
                                            <TableRow key={sub.id}>
                                                <TableCell>{format(parseISO(sub.createdAt), 'dd/MM/yyyy HH:mm', { locale: es })}</TableCell>
                                                <TableCell>{getFormTypeName(sub.formType)}</TableCell>
                                                <TableCell>{getOperationTypeName(sub.formType)}</TableCell>
                                                <TableCell>{sub.formData.pedidoSislog}</TableCell>
                                                <TableCell>{sub.formData.nombreCliente || sub.formData.cliente}</TableCell>
                                                <TableCell>{sub.userDisplayName}</TableCell>
                                                <TableCell className="text-right">
                                                    <TooltipProvider delayDuration={100}>
                                                        <div className="flex items-center justify-end gap-1">
                                                            {isOperario ? (
                                                                <Tooltip>
                                                                    <TooltipTrigger asChild>
                                                                        <Button asChild variant="ghost" size="icon">
                                                                            <Link href={getEditUrl(sub)}>
                                                                                <Edit className="h-4 w-4 text-blue-600" />
                                                                                <span className="sr-only">Editar</span>
                                                                            </Link>
                                                                        </Button>
                                                                    </TooltipTrigger>
                                                                    <TooltipContent><p>Editar Formulario</p></TooltipContent>
                                                                </Tooltip>
                                                            ) : isViewer ? (
                                                                <Tooltip>
                                                                    <TooltipTrigger asChild>
                                                                        <Button asChild variant="ghost" size="icon">
                                                                            <Link href={`/consultar-formatos/${sub.id}`}>
                                                                                <Eye className="h-4 w-4" />
                                                                                <span className="sr-only">Ver detalles</span>
                                                                            </Link>
                                                                        </Button>
                                                                    </TooltipTrigger>
                                                                    <TooltipContent><p>Ver Detalle</p></TooltipContent>
                                                                </Tooltip>
                                                            ) : (
                                                                <>
                                                                    <Tooltip>
                                                                        <TooltipTrigger asChild>
                                                                            <Button asChild variant="ghost" size="icon">
                                                                                <Link href={`/consultar-formatos/${sub.id}`}>
                                                                                    <Eye className="h-4 w-4" />
                                                                                    <span className="sr-only">Ver detalles</span>
                                                                                </Link>
                                                                            </Button>
                                                                        </TooltipTrigger>
                                                                        <TooltipContent><p>Ver Detalle</p></TooltipContent>
                                                                    </Tooltip>
                                                                    <Tooltip>
                                                                        <TooltipTrigger asChild>
                                                                            <Button asChild variant="ghost" size="icon">
                                                                                <Link href={getEditUrl(sub)}>
                                                                                    <Edit className="h-4 w-4 text-blue-600" />
                                                                                    <span className="sr-only">Editar</span>
                                                                                </Link>
                                                                            </Button>
                                                                        </TooltipTrigger>
                                                                        <TooltipContent><p>Editar Formulario</p></TooltipContent>
                                                                    </Tooltip>
                                                                    <Tooltip>
                                                                        <TooltipTrigger asChild>
                                                                            <Button variant="ghost" size="icon" onClick={() => setSubmissionToDelete(sub)}>
                                                                                <Trash2 className="h-4 w-4 text-destructive" />
                                                                                <span className="sr-only">Eliminar</span>
                                                                            </Button>
                                                                        </TooltipTrigger>
                                                                        <TooltipContent><p>Eliminar Formulario</p></TooltipContent>
                                                                    </Tooltip>
                                                                </>
                                                            )}
                                                        </div>
                                                    </TooltipProvider>
                                                </TableCell>
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
            </div>
            
            <AlertDialog open={!!submissionToDelete} onOpenChange={(open) => !open && setSubmissionToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                    <AlertDialogTitle>¿Está seguro que desea eliminar este formato?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Esta acción no se puede deshacer. Se eliminará permanentemente el registro del formulario y todos los archivos adjuntos asociados.
                    </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setSubmissionToDelete(null)}>Cancelar</AlertDialogCancel>
                    <AlertDialogAction 
                        onClick={handleConfirmDelete} 
                        disabled={isDeleting}
                        className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                    >
                        {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Eliminar
                    </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
