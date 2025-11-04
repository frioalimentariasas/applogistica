
"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getContainerMovements, type ContainerMovement } from './actions';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Loader2, Search, TruckIcon, XCircle, Eye, AlertTriangle, ShieldAlert } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { IndexCreationDialog } from '@/components/app/index-creation-dialog';

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

export default function ContainerTraceabilityPage() {
    const { user, permissions, loading: authLoading } = useAuth();
    const router = useRouter();
    const { toast } = useToast();

    const [containerNumber, setContainerNumber] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [searchResult, setSearchResult] = useState<ContainerMovement[] | null>(null);
    const [searched, setSearched] = useState(false);
    
    const [isIndexErrorOpen, setIsIndexErrorOpen] = useState(false);
    const [indexErrorMessage, setIndexErrorMessage] = useState('');

    useEffect(() => {
        if (!authLoading && !user) {
            router.push('/login');
        }
    }, [user, authLoading, router]);

    const handleSearch = async () => {
        if (!containerNumber) {
            toast({
                variant: 'destructive',
                title: 'Faltan Datos',
                description: 'Por favor, ingrese un número de contenedor.',
            });
            return;
        }
        setIsLoading(true);
        setSearched(true);
        setSearchResult(null);
        try {
            const result = await getContainerMovements(containerNumber);
            setSearchResult(result);
            if (result.length === 0) {
                toast({
                    title: 'Sin Resultados',
                    description: `No se encontró ningún movimiento para el contenedor ${containerNumber}.`,
                });
            }
        } catch (error: any) {
            const errorMessage = error.message || "Ocurrió un error desconocido.";
            if (typeof errorMessage === 'string' && (errorMessage.includes('requires an index') || errorMessage.includes('needs an index'))) {
                setIndexErrorMessage(errorMessage);
                setIsIndexErrorOpen(true);
            } else {
                toast({
                    variant: 'destructive',
                    title: 'Error de Búsqueda',
                    description: errorMessage,
                });
            }
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleClear = () => {
        setContainerNumber('');
        setSearchResult(null);
        setSearched(false);
    };

    if (authLoading) {
        return (
            <div className="flex min-h-screen w-full items-center justify-center">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
        );
    }

    if (!user || !permissions.canViewContainerTraceability) {
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
            <div className="max-w-5xl mx-auto">
                <header className="mb-8">
                    <div className="relative flex items-center justify-center text-center">
                        <Button variant="ghost" size="icon" className="absolute left-0 top-1/2 -translate-y-1/2" onClick={() => router.push('/')}>
                            <ArrowLeft className="h-6 w-6" />
                        </Button>
                        <div>
                            <div className="flex items-center justify-center gap-2">
                                <TruckIcon className="h-8 w-8 text-primary" />
                                <h1 className="text-2xl font-bold text-primary">Trazabilidad de Contenedores</h1>
                            </div>
                            <p className="text-sm text-gray-500">Consulte el historial de movimientos de un contenedor específico.</p>
                        </div>
                    </div>
                </header>

                <Card className="mb-6">
                    <CardHeader>
                        <CardTitle>Filtros de Búsqueda</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                            <div className="space-y-2">
                                <Label htmlFor="container-number">Número de Contenedor</Label>
                                <Input
                                    id="container-number"
                                    placeholder="Ingrese el número..."
                                    value={containerNumber}
                                    onChange={(e) => setContainerNumber(e.target.value.toUpperCase())}
                                />
                            </div>
                            <div className="flex gap-2">
                                <Button onClick={handleSearch} className="w-full" disabled={isLoading}>
                                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                                    Buscar Trazabilidad
                                </Button>
                                <Button onClick={handleClear} variant="outline" className="w-full">
                                    <XCircle className="mr-2 h-4 w-4" />
                                    Limpiar
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {isLoading ? (
                    <div className="flex justify-center items-center h-48"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>
                ) : searched && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Historial de Movimientos para el Contenedor: {containerNumber}</CardTitle>
                        </CardHeader>
                        <CardContent>
                             <div className="rounded-md border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Fecha</TableHead>
                                            <TableHead>Tipo Movimiento</TableHead>
                                            <TableHead>Cliente</TableHead>
                                            <TableHead>Pedido SISLOG</TableHead>
                                            <TableHead>Placa</TableHead>
                                            <TableHead>Operario</TableHead>
                                            <TableHead className="text-right">Acciones</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {searchResult && searchResult.length > 0 ? (
                                            searchResult.map((mov) => (
                                                <TableRow key={mov.id}>
                                                    <TableCell>{format(new Date(mov.date), 'dd/MM/yyyy')}</TableCell>
                                                    <TableCell>{mov.type}</TableCell>
                                                    <TableCell>{mov.cliente}</TableCell>
                                                    <TableCell>{mov.pedidoSislog}</TableCell>
                                                    <TableCell>{mov.placa}</TableCell>
                                                    <TableCell>{mov.userDisplayName}</TableCell>
                                                    <TableCell className="text-right">
                                                        <Button asChild variant="ghost" size="icon">
                                                            <Link href={`/consultar-formatos/${mov.id}`} target="_blank">
                                                                <Eye className="h-4 w-4" />
                                                            </Link>
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={7} className="h-24 text-center">
                                                    No se encontraron movimientos para este contenedor.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                             </div>
                        </CardContent>
                    </Card>
                )}
            </div>
            <IndexCreationDialog 
                isOpen={isIndexErrorOpen}
                onOpenChange={setIsIndexErrorOpen}
                errorMessage={indexErrorMessage}
            />
        </div>
    );
}
