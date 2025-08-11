
import { Suspense } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

import { getPedidosByObservation, type SpecialReportResult } from '@/app/actions/special-reports';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, FileSpreadsheet } from 'lucide-react';

function ReportTable({ title, data }: { title: string; data: SpecialReportResult[] }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>{title}</CardTitle>
                <CardDescription>
                    {data.length > 0 ? `Se encontraron ${data.length} formatos.` : 'No se encontraron formatos que cumplan este criterio.'}
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="rounded-md border h-96 overflow-auto">
                    <Table>
                        <TableHeader className="sticky top-0 bg-background z-10">
                            <TableRow>
                                <TableHead>Pedido SISLOG</TableHead>
                                <TableHead>Cliente</TableHead>
                                <TableHead>Fecha</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {data.length > 0 ? (
                                data.map((item, index) => (
                                    <TableRow key={`${item.pedidoSislog}-${index}`}>
                                        <TableCell className="font-medium">{item.pedidoSislog}</TableCell>
                                        <TableCell>{item.cliente}</TableCell>
                                        <TableCell>{format(new Date(item.fecha), 'dd/MM/yyyy', { locale: es })}</TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={3} className="h-24 text-center">
                                        No hay registros.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
}

async function SpecialReportsContent() {
    const [reestibadoData, salidaTunelData] = await Promise.all([
        getPedidosByObservation('REESTIBADO'),
        getPedidosByObservation('SALIDA PALETAS TUNEL'),
    ]);
    
    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <ReportTable title="Pedidos con Reestibado por Cuadrilla" data={reestibadoData} />
            <ReportTable title="Pedidos con Salida de Paletas de Túnel por Cuadrilla" data={salidaTunelData} />
        </div>
    );
}


export default function ReportesEspecialesPage() {
    return (
        <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
            <div className="max-w-7xl mx-auto">
                 <header className="mb-8">
                    <div className="relative flex items-center justify-center text-center">
                         <Button asChild variant="ghost" size="icon" className="absolute left-0 top-1/2 -translate-y-1/2">
                            <Link href="/">
                                <ArrowLeft className="h-6 w-6" />
                            </Link>
                        </Button>
                        <div>
                            <div className="flex items-center justify-center gap-2">
                                <FileSpreadsheet className="h-8 w-8 text-primary" />
                                <h1 className="text-2xl font-bold text-primary">Reportes Especiales de Liquidación</h1>
                            </div>
                             <p className="text-sm text-gray-500">Listados de formatos que cumplen con criterios específicos de liquidación por cuadrilla.</p>
                        </div>
                    </div>
                </header>

                <Suspense fallback={<div className="text-center">Cargando reportes...</div>}>
                    <SpecialReportsContent />
                </Suspense>
            </div>
        </div>
    );
}
