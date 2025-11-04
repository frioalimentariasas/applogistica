
"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getClients, type ClientInfo } from '@/app/actions/clients';
import { getPalletMovements, type PalletMovement, type PalletTraceabilityResult } from '@/app/actions/pallet-traceability';

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

export default function PalletMovementReportPage() {
    const { user, permissions, loading: authLoading } = useAuth();
    const router = useRouter();
    const { toast } = useToast();

    const [clients, setClients] = useState<ClientInfo[]>([]);
    const [selectedClient, setSelectedClient] = useState('');
    const [palletCode, setPalletCode] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [searchResult, setSearchResult] = useState<PalletTraceabilityResult | null>(null);
    const [searched, setSearched] = useState(false);
    
    const [isIndexErrorOpen, setIsIndexErrorOpen] = useState(false);
    const [indexErrorMessage, setIndexErrorMessage] = useState('');

    useEffect(() => {
        if (!authLoading && !user) {
            router.push('/login');
        }
    }, [user, authLoading, router]);

    useEffect(() => {
        if (user && permissions.canViewPalletTraceability) {
            getClients().then(setClients);
        }
    }, [user, permissions.canViewPalletTraceability]);

    const handleSearch = async () => {
        if (!selectedClient || !palletCode) {
            toast({
                variant: 'destructive',
                title: 'Faltan Datos',
                description: 'Por favor, seleccione un cliente e ingrese un código de paleta.',
            });
            return;
        }
        setIsLoading(true);
        setSearched(true);
        setSearchResult(null);
        try {
            const result = await getPalletMovements(palletCode, selectedClient);
            setSearchResult(result);
            if (!result.reception && result.dispatches.length === 0) {
                toast({
                    title: 'Sin Resultados',
                    description: `No se encontró ningún movimiento para la paleta ${palletCode} del cliente seleccionado.`,
                });
            }
        } catch (error: any) {
            if (typeof error.message === 'string' && (error.message.includes('requires an index') || error.message.includes('needs an index'))) {
                setIndexErrorMessage(error.message);
                setIsIndexErrorOpen(true);
            } else {
                toast({
                    variant: 'destructive',
                    title: 'Error de Búsqueda',
                    description: error.message,
                });
            }
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleClear = () => {
        setSelectedClient('');
        setPalletCode('');
        setSearchResult(null);
        setSearched(false);
    };

    if (authLoading || (user && permissions.canViewPalletTraceability && clients.length === 0 && !searched)) {
        return (
            <div className="flex min-h-screen w-full items-center justify-center">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
        );
    }
    
    if (!user || !permissions.canViewPalletTraceability) {
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
            <div className="max-w-4xl mx-auto">
                <header className="mb-8">
                    <div className="relative flex items-center justify-center text-center">
                        <Button variant="ghost" size="icon" className="absolute left-0 top-1/2 -translate-y-1/2" onClick={() => router.push('/')}>
                            <ArrowLeft className="h-6 w-6" />
                        </Button>
                        <div>
                            <div className="flex items-center justify-center gap-2">
                                <TruckIcon className="h-8 w-8 text-primary" />
                                <h1 className="text-2xl font-bold text-primary">Trazabilidad de Paletas</h1>
                            </div>
                            <p className="text-sm text-gray-500">Consulte el historial de movimientos de una paleta específica.</p>
                        </div>
                    </div>
                </header>

                <Card className="mb-6">
                    <CardHeader>
                        <CardTitle>Filtros de Búsqueda</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                            <div className="space-y-2 md:col-span-2">
                                <Label htmlFor="client-select">Cliente</Label>
                                <Select value={selectedClient} onValueChange={setSelectedClient}>
                                    <SelectTrigger id="client-select">
                                        <SelectValue placeholder="Seleccione un cliente..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {clients.map(c => <SelectItem key={c.id} value={c.razonSocial}>{c.razonSocial}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="pallet-code">Código de Paleta</Label>
                                <Input
                                    id="pallet-code"
                                    placeholder="Ingrese el código..."
                                    value={palletCode}
                                    onChange={(e) => setPalletCode(e.target.value)}
                                />
                            </div>
                            <div className="flex gap-2 md:col-span-3">
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
                    <>
                        {searchResult?.reception ? (
                            <MovementCard movement={searchResult.reception} />
                        ) : (
                            <Alert variant="destructive">
                                <AlertTriangle className="h-4 w-4" />
                                <AlertTitle>Recepción no encontrada</AlertTitle>
                                <AlertDescription>
                                    No se encontró el formulario de recepción para la paleta <strong>{palletCode}</strong> del cliente seleccionado. Los despachos no se pueden validar sin una recepción.
                                </AlertDescription>
                            </Alert>
                        )}
                        
                        {searchResult && searchResult.dispatches.length > 0 && (
                            <div className="mt-6">
                                <h3 className="text-lg font-semibold mb-2">Despachos Asociados ({searchResult.dispatches.length})</h3>
                                <div className="space-y-4">
                                    {searchResult.dispatches.map(dispatch => (
                                        <MovementCard key={dispatch.id} movement={dispatch} />
                                    ))}
                                </div>
                            </div>
                        )}

                        {searchResult && !searchResult.reception && searchResult.dispatches.length === 0 && (
                             <Card className="mt-6 text-center py-12">
                                <CardContent>
                                    <p className="text-muted-foreground">No se encontraron movimientos para esta paleta.</p>
                                </CardContent>
                             </Card>
                        )}
                    </>
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

const MovementCard = ({ movement }: { movement: PalletMovement }) => {
    return (
        <Card className={movement.type === 'Recepción' ? 'bg-blue-50 border-blue-200' : ''}>
            <CardHeader>
                <div className="flex justify-between items-center">
                    <CardTitle className="text-lg">{movement.type}</CardTitle>
                    <Button asChild variant="outline" size="sm">
                        <Link href={`/consultar-formatos/${movement.id}`} target="_blank">
                            <Eye className="mr-2 h-4 w-4" /> Ver Formato
                        </Link>
                    </Button>
                </div>
                <CardDescription>
                    <strong>Fecha:</strong> {format(new Date(movement.date), 'dd/MM/yyyy')} | <strong>Pedido SISLOG:</strong> {movement.pedidoSislog} | <strong>Operario:</strong> {movement.userDisplayName}
                </CardDescription>
            </CardHeader>
            <CardContent>
                <h4 className="font-semibold mb-2">Items de la Paleta en esta Operación:</h4>
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Código</TableHead>
                                <TableHead>Descripción</TableHead>
                                <TableHead>Lote</TableHead>
                                <TableHead className="text-right">Cantidad</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {movement.items.map((item, index) => (
                                <TableRow key={index}>
                                    <TableCell>{item.codigo}</TableCell>
                                    <TableCell>{item.descripcion}</TableCell>
                                    <TableCell>{item.lote}</TableCell>
                                    <TableCell className="text-right">{item.cantidadPorPaleta}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
}
