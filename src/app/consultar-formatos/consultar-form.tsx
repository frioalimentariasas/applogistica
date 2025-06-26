
"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

import { searchSubmissions, SubmissionResult, SearchCriteria } from '@/app/actions/consultar-formatos';
import { useToast } from '@/hooks/use-toast';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Search, XCircle, Loader2, FileSearch, Eye } from 'lucide-react';
import { CalendarIcon } from 'lucide-react';

export default function ConsultarFormatosComponent() {
    const router = useRouter();
    const { toast } = useToast();
    
    const [criteria, setCriteria] = useState<SearchCriteria>({
        pedidoSislog: '',
        nombreCliente: '',
        fechaCreacion: undefined,
    });
    const [date, setDate] = useState<Date | undefined>(undefined);
    const [results, setResults] = useState<SubmissionResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searched, setSearched] = useState(false);

    const handleSearch = async () => {
        setIsLoading(true);
        setSearched(true);
        try {
            const finalCriteria = {
                ...criteria,
                fechaCreacion: date ? date.toISOString().split('T')[0] : undefined
            };

            const searchResults = await searchSubmissions(finalCriteria);
            setResults(searchResults);

            if(searchResults.length === 0) {
                toast({
                    title: "Sin resultados",
                    description: "No se encontraron formatos con los criterios de búsqueda proporcionados.",
                });
            }
        } catch (error) {
            console.error(error);
            const errorMessage = error instanceof Error ? error.message : "Ocurrió un error desconocido.";
            toast({
                variant: 'destructive',
                title: 'Error en la búsqueda',
                description: errorMessage,
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleClear = () => {
        setCriteria({
            pedidoSislog: '',
            nombreCliente: '',
            fechaCreacion: undefined,
        });
        setDate(undefined);
        setResults([]);
        setSearched(false);
    };
    
    const getFormTypeName = (formType: string) => {
        if (formType.startsWith('fixed-weight-')) return 'Peso Fijo';
        if (formType.startsWith('variable-weight-')) return 'Peso Variable';
        return formType;
    };
    
    const getOperationTypeName = (formType: string) => {
        if (formType.includes('recepcion')) return 'Recepción';
        if (formType.includes('despacho')) return 'Despacho';
        return 'N/A';
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
                             <p className="text-sm text-gray-500">Busque y visualice los formularios que han sido enviados.</p>
                        </div>
                    </div>
                </header>
                
                <Card className="mb-6">
                    <CardHeader>
                        <CardTitle>Filtros de Búsqueda</CardTitle>
                        <CardDescription>Utilice uno o más filtros para encontrar los formatos que necesita.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                            <div className="space-y-2">
                                <Label htmlFor="pedidoSislog">Pedido SISLOG</Label>
                                <Input 
                                    id="pedidoSislog"
                                    placeholder="Número de pedido"
                                    value={criteria.pedidoSislog}
                                    onChange={(e) => setCriteria({...criteria, pedidoSislog: e.target.value})}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="nombreCliente">Nombre del Cliente</Label>
                                <Input 
                                    id="nombreCliente"
                                    placeholder="Nombre del cliente"
                                    value={criteria.nombreCliente}
                                    onChange={(e) => setCriteria({...criteria, nombreCliente: e.target.value})}
                                />
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
                        <CardTitle>Resultados</CardTitle>
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
                                        <TableRow>
                                            <TableCell colSpan={7} className="h-24 text-center">
                                                <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                                                <p className="text-muted-foreground">Buscando...</p>
                                            </TableCell>
                                        </TableRow>
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
                                                    <Button variant="ghost" size="icon" onClick={() => toast({ title: "Próximamente", description: "La vista detallada estará disponible pronto." })}>
                                                        <Eye className="h-4 w-4" />
                                                        <span className="sr-only">Ver detalles</span>
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                                                {searched ? "No se encontraron resultados." : "Ingrese criterios de búsqueda y presione Buscar."}
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
