
"use client";

import * as React from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DayPicker } from 'react-day-picker';
import { format, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';

import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { addHoliday, deleteHoliday, type Holiday } from './actions';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ArrowLeft, Loader2, CalendarPlus, Trash2, ShieldAlert, PlusCircle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

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

export default function HolidayManagementComponent({ initialHolidays }: { initialHolidays: Holiday[] }) {
    const router = useRouter();
    const { toast } = useToast();
    const { permissions, loading: authLoading } = useAuth();
    
    const [holidays, setHolidays] = useState<Holiday[]>(initialHolidays);
    const [selectedDays, setSelectedDays] = useState<Date[] | undefined>();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [holidayToDelete, setHolidayToDelete] = useState<Holiday | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const handleAddHolidays = async () => {
        if (!selectedDays || selectedDays.length === 0) {
            toast({ variant: 'destructive', title: 'Error', description: 'Por favor, seleccione una o más fechas.' });
            return;
        }
        
        setIsSubmitting(true);
        let addedCount = 0;
        let existingCount = 0;
        const newHolidays: Holiday[] = [];

        for (const day of selectedDays) {
            const dateString = format(day, 'yyyy-MM-dd');
            if (holidays.some(h => h.date === dateString)) {
                existingCount++;
                continue;
            }
            const result = await addHoliday(dateString);
            if (result.success && result.newHoliday) {
                newHolidays.push(result.newHoliday);
                addedCount++;
            } else {
                toast({ variant: 'destructive', title: 'Error', description: `No se pudo agregar el festivo ${dateString}.` });
            }
        }
        
        if (addedCount > 0) {
            toast({ title: 'Éxito', description: `Se agregaron ${addedCount} nuevo(s) día(s) festivo(s).` });
            setHolidays(prev => [...prev, ...newHolidays].sort((a,b) => a.date.localeCompare(b.date)));
        }
        if (existingCount > 0) {
            toast({ title: 'Aviso', description: `${existingCount} día(s) ya existían y fueron omitidos.` });
        }
        
        setSelectedDays([]);
        setIsSubmitting(false);
    };

    const handleDeleteConfirm = async () => {
        if (!holidayToDelete) return;
        setIsDeleting(true);
        const result = await deleteHoliday(holidayToDelete.id);
        if (result.success) {
            toast({ title: 'Éxito', description: result.message });
            setHolidays(prev => prev.filter(h => h.id !== holidayToDelete.id));
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.message });
        }
        setHolidayToDelete(null);
        setIsDeleting(false);
    };

    if (authLoading) {
      return <div className="flex min-h-screen w-full items-center justify-center"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>
    }

    if (!permissions.canManageHolidays) {
        return (
            <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8 flex items-center justify-center">
                <div className="max-w-xl mx-auto text-center">
                    <AccessDenied />
                    <Button onClick={() => router.push('/')} className="mt-6"><ArrowLeft className="mr-2 h-4 w-4" />Volver al Inicio</Button>
                </div>
            </div>
        );
    }
    
    return (
        <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
            <div className="max-w-6xl mx-auto">
                <header className="mb-8">
                    <div className="relative flex items-center justify-center text-center">
                        <Button variant="ghost" className="absolute left-0" onClick={() => router.push('/calendario-facturacion')}>
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Volver al Calendario
                        </Button>
                        <div>
                            <div className="flex items-center justify-center gap-2">
                                <CalendarPlus className="h-8 w-8 text-primary" />
                                <h1 className="text-2xl font-bold text-primary">Gestión de Días Festivos</h1>
                            </div>
                            <p className="text-sm text-gray-500">Agregue o elimine los días festivos para el calendario de facturación.</p>
                        </div>
                    </div>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <Card>
                        <CardHeader>
                            <CardTitle>Seleccionar Días Festivos</CardTitle>
                            <CardDescription>Elija uno o más días en el calendario para marcarlos como festivos.</CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-col items-center">
                            <DayPicker
                                mode="multiple"
                                selected={selectedDays}
                                onSelect={setSelectedDays}
                                locale={es}
                                showOutsideDays
                                captionLayout="dropdown-buttons"
                                fromYear={new Date().getFullYear() - 1}
                                toYear={new Date().getFullYear() + 2}
                            />
                            <Button onClick={handleAddHolidays} disabled={isSubmitting || !selectedDays || selectedDays.length === 0} className="mt-4 w-full">
                                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                                Agregar Festivo(s)
                            </Button>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader>
                            <CardTitle>Festivos Actuales</CardTitle>
                            <CardDescription>Lista de los días festivos configurados.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <ScrollArea className="h-[400px] border rounded-md">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Fecha</TableHead>
                                            <TableHead className="text-right">Acciones</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {holidays.length > 0 ? (
                                            holidays.map((h) => (
                                                <TableRow key={h.id}>
                                                    <TableCell>{format(new Date(h.date.replace(/-/g, '/')), 'd \'de\' MMMM, yyyy', { locale: es })}</TableCell>
                                                    <TableCell className="text-right">
                                                        <Button variant="ghost" size="icon" title="Eliminar" onClick={() => setHolidayToDelete(h)}>
                                                            <Trash2 className="h-4 w-4 text-destructive" />
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={2} className="h-24 text-center">No hay días festivos configurados.</TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </ScrollArea>
                        </CardContent>
                    </Card>
                </div>
            </div>

            <AlertDialog open={!!holidayToDelete} onOpenChange={(open) => !open && setHolidayToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Está seguro?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta acción eliminará el día festivo: <strong>{holidayToDelete && format(new Date(holidayToDelete.date.replace(/-/g, '/')), 'd \'de\' MMMM, yyyy', { locale: es })}</strong>.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteConfirm} disabled={isDeleting} className="bg-destructive hover:bg-destructive/90">
                            {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Eliminar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
