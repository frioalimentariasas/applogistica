
"use client";

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { DateRange } from 'react-day-picker';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

import { searchPendingLegalization, type PendingLegalizationResult } from '@/app/actions/pending-legalization';
import { useToast } from '@/hooks/use-toast';
import type { ClientInfo } from '@/app/actions/clients';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft, Search, XCircle, Loader2, CalendarIcon, ChevronsUpDown, Edit } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IndexCreationDialog } from '@/components/app/index-creation-dialog';

const ResultsSkeleton = () => (
    <>
      {Array.from({ length: 3 }).map((_, index) => (
        <TableRow key={index}>
          <TableCell><Skeleton className="h-5 w-24 rounded-md" /></TableCell>
          <TableCell><Skeleton className="h-5 w-32 rounded-md" /></TableCell>
          <TableCell><Skeleton className="h-5 w-48 rounded-md" /></TableCell>
          <TableCell><Skeleton className="h-5 w-24 rounded-md" /></TableCell>
          <TableCell className="text-right"><Skeleton className="h-8 w-8 rounded-md float-right" /></TableCell>
        </TableRow>
      ))}
    </>
);

export default function LegalizarFormComponent({ clients }: { clients: ClientInfo[] }) {
    const router = useRouter();
    const { toast } = useToast();
    
    const [pedidoSislog, setPedidoSislog] = useState('');
    const [nombreCliente, setNombreCliente] = useState<string>('');
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    
    const [results, setResults] = useState<PendingLegalizationResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searched, setSearched] = useState(false);

    const [isClientDialogOpen, setClientDialogOpen] = useState(false);
    const [clientSearch, setClientSearch] = useState("");

    const [isIndexErrorOpen, setIsIndexErrorOpen] = useState(false);
    const [indexErrorMessage, setIndexErrorMessage] = useState('');

    const filteredClients = useMemo(() => {
        if (!clientSearch) return clients;
        return clients.filter(c => c.razonSocial.toLowerCase().includes(clientSearch.toLowerCase()));
    }, [clientSearch, clients]);
    
    const handleSearch = async () => {
        if (!dateRange?.from || !dateRange?.to) {
            toast({ variant: 'destructive', title: 'Filtro incompleto', description: 'Por favor, seleccione un rango de fechas.' });
            return;
        }

        setIsLoading(true);
        setSearched(true);
        try {
            const criteria = {
                searchDateStart: format(dateRange.from, 'yyyy-MM-dd'),
                searchDateEnd: format(dateRange.to, 'yyyy-MM-dd'),
                nombreCliente: nombreCliente || undefined,
                pedidoSislog: pedidoSislog || undefined,
            };
            const searchResults = await searchPendingLegalization(criteria);
            setResults(searchResults);
            if (searchResults.length === 0) {
                 toast({ title: "Sin resultados", description: "No se encontraron formatos pendientes para los filtros seleccionados." });
            }
        } catch (error: any) {
            const errorMessage = error.message || "Ocurrió un error desconocido.";
            if (typeof errorMessage === 'string' && (errorMessage.includes('requires an index') || errorMessage.includes('needs an index'))) {
                setIndexErrorMessage(errorMessage);
                setIsIndexErrorOpen(true);
            } else {
                toast({ variant: 'destructive', title: 'Error en la búsqueda', description: errorMessage });
            }
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleClear = () => {
        setPedidoSislog('');
        setNombreCliente('');
        setDateRange(undefined);
        setResults([]);
        setSearched(false);
    };

    const getEditUrl = (submission: PendingLegalizationResult) => {
        const { id, formType } = submission;
        const operation = formType.includes('recepcion') ? 'recepcion' : 'despacho';
        return `/fixed-weight-form?operation=${operation}&id=${id}`;
    };

    return (
        <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
            <div className="max-w-5xl mx-auto">
                <header className="mb-6 md:mb-8">
                    <div className="relative flex items-center justify-center text-center">
                        <Button variant="ghost" size="icon" className="absolute left-0 top-1/2 -translate-y-1/2" onClick={() => router.push('/')}>
                            <ArrowLeft className="h-6 w-6" />
                        </Button>
                        <div>
                            <h1 className="text-xl md:text-2xl font-bold text-primary">Formatos Pendientes de Legalizar Peso Bruto</h1>
                            <p className="text-xs md:text-sm text-gray-500">Busque formatos de peso fijo pendientes por ingresar el Peso Bruto Total.</p>
                        </div>
                    </div>
                </header>

                <Card className="mb-6">
                    <CardHeader>
                        <CardTitle>Filtros de Búsqueda</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                            <div className="space-y-2">
                                <Label htmlFor="dateRange">Rango de Fechas</Label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button id="dateRange" variant={"outline"} className={cn("w-full justify-start text-left font-normal", !dateRange && "text-muted-foreground")}>
                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                            {dateRange?.from ? (dateRange.to ? (<>{format(dateRange.from, "LLL dd, y", { locale: es })} - {format(dateRange.to, "LLL dd, y", { locale: es })}</>) : (format(dateRange.from, "LLL dd, y", { locale: es }))) : (<span>Seleccione un rango</span>)}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start"><Calendar initialFocus mode="range" defaultMonth={dateRange?.from} selected={dateRange} onSelect={setDateRange} numberOfMonths={2} locale={es} /></PopoverContent>
                                </Popover>
                            </div>
                            <div className="space-y-2">
                                <Label>Cliente</Label>
                                <Dialog open={isClientDialogOpen} onOpenChange={setClientDialogOpen}>
                                    <DialogTrigger asChild>
                                        <Button variant="outline" className="w-full justify-between text-left font-normal">
                                            {nombreCliente || "Seleccione un cliente"}
                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent className="sm:max-w-[425px]">
                                        <DialogHeader><DialogTitle>Seleccionar Cliente</DialogTitle></DialogHeader>
                                        <div className="p-4">
                                            <Input placeholder="Buscar cliente..." value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} className="mb-4" />
                                            <ScrollArea className="h-72"><div className="space-y-1">
                                                <Button variant="ghost" className="w-full justify-start" onClick={() => { setNombreCliente(''); setClientDialogOpen(false); setClientSearch(''); }}>-- Todos --</Button>
                                                {filteredClients.map((client) => (<Button key={client.id} variant="ghost" className="w-full justify-start" onClick={() => { setNombreCliente(client.razonSocial); setClientDialogOpen(false); setClientSearch(''); }}>{client.razonSocial}</Button>))}
                                            </div></ScrollArea>
                                        </div>
                                    </DialogContent>
                                </Dialog>
                            </div>
                             <div className="space-y-2">
                                <Label htmlFor="pedidoSislog">Pedido SISLOG</Label>
                                <Input id="pedidoSislog" placeholder="Buscar por pedido..." value={pedidoSislog} onChange={(e) => setPedidoSislog(e.target.value)} />
                            </div>
                            <div className="flex gap-2">
                                <Button onClick={handleSearch} className="w-full" disabled={isLoading}><Search className="mr-2 h-4 w-4" />Buscar</Button>
                                <Button onClick={handleClear} variant="outline" className="w-full"><XCircle className="mr-2 h-4 w-4" />Limpiar</Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                
                <Card>
                    <CardHeader><CardTitle>Resultados</CardTitle></CardHeader>
                    <CardContent>
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Fecha Operación</TableHead>
                                        <TableHead>Pedido SISLOG</TableHead>
                                        <TableHead>Cliente</TableHead>
                                        <TableHead>Operario</TableHead>
                                        <TableHead className="text-right">Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading ? <ResultsSkeleton /> : results.length > 0 ? (
                                        results.map((sub) => (
                                            <TableRow key={sub.id}>
                                                <TableCell>{format(parseISO(sub.formData.fecha), 'dd/MM/yyyy', { locale: es })}</TableCell>
                                                <TableCell>{sub.formData.pedidoSislog}</TableCell>
                                                <TableCell>{sub.formData.nombreCliente || sub.formData.cliente}</TableCell>
                                                <TableCell>{sub.userDisplayName}</TableCell>
                                                <TableCell className="text-right">
                                                    <Button onClick={() => router.push(getEditUrl(sub))}>
                                                        <Edit className="mr-2 h-4 w-4" />
                                                        Legalizar
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={5} className="h-24 text-center">
                                                {searched ? 'No se encontraron formatos pendientes.' : 'Realice una búsqueda para ver los resultados.'}
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </div>
            <IndexCreationDialog isOpen={isIndexErrorOpen} onOpenChange={setIsIndexErrorOpen} errorMessage={indexErrorMessage} />
        </div>
    );
}
