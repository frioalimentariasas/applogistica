
"use client";

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { DateRange } from 'react-day-picker';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import type { ClientInfo } from '@/app/actions/clients';
import { searchVersions, updateVersionNote, deleteVersions, type VersionSearchResult } from './actions';
import { IndexCreationDialog } from '@/components/app/index-creation-dialog';

import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Search, XCircle, Loader2, CalendarIcon, FolderSearch, ChevronsUpDown, FileCog, Edit2, Trash2, Home } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';

export default function VersionManagementComponent({ clients }: { clients: ClientInfo[] }) {
    const router = useRouter();
    const { toast } = useToast();
    const [dateRange, setDateRange] = useState<DateRange | undefined>();
    const [selectedClient, setSelectedClient] = useState<string>('');
    const [results, setResults] = useState<VersionSearchResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searched, setSearched] = useState(false);
    
    const [versionToEdit, setVersionToEdit] = useState<VersionSearchResult | null>(null);
    const [newNote, setNewNote] = useState('');
    const [isEditing, setIsEditing] = useState(false);
    
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isConfirmBulkDeleteOpen, setIsConfirmBulkDeleteOpen] = useState(false);
    const [isBulkDeleting, setIsBulkDeleting] = useState(false);

    const [isIndexErrorOpen, setIsIndexErrorOpen] = useState(false);
    const [indexErrorMessage, setIndexErrorMessage] = useState('');

    const handleSearch = async () => {
        setIsLoading(true);
        setSearched(true);
        try {
            const criteria = {
                clientName: selectedClient || undefined,
                dateRange: dateRange?.from && dateRange?.to ? { from: dateRange.from, to: dateRange.to } : undefined,
            };
            const searchResults = await searchVersions(criteria);
            setResults(searchResults);
            if (searchResults.length === 0) {
                 toast({ title: "Sin resultados", description: "No se encontraron versiones para los filtros." });
            }
        } catch (error: any) {
             const errorMessage = error.message || "Ocurrió un error desconocido.";
            if (typeof errorMessage === 'string' && errorMessage.includes('requires an index')) {
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
        setDateRange(undefined);
        setSelectedClient('');
        setResults([]);
        setSearched(false);
    };

    const handleEditNote = async () => {
        if (!versionToEdit || !newNote.trim()) return;
        setIsEditing(true);
        const result = await updateVersionNote(versionToEdit.id, newNote);
        if (result.success) {
            toast({ title: 'Éxito', description: result.message });
            setResults(prev => prev.map(v => v.id === versionToEdit.id ? {...v, note: newNote} : v));
            setVersionToEdit(null);
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.message });
        }
        setIsEditing(false);
    };

    const handleBulkDeleteConfirm = async () => {
        if (selectedIds.size === 0) return;
        setIsBulkDeleting(true);
        const idsToDelete = Array.from(selectedIds);
        const result = await deleteVersions(idsToDelete);
        if (result.success) {
            toast({ title: 'Éxito', description: result.message });
            setResults(prev => prev.filter(v => !selectedIds.has(v.id)));
            setSelectedIds(new Set());
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.message });
        }
        setIsConfirmBulkDeleteOpen(false);
        setIsBulkDeleting(false);
    };
    
    const handleRowSelect = (id: string, checked: boolean) => {
        const newSet = new Set(selectedIds);
        if (checked) newSet.add(id); else newSet.delete(id);
        setSelectedIds(newSet);
    };

    const isAllDisplayedSelected = useMemo(() => {
        if (results.length === 0) return false;
        return results.every(v => selectedIds.has(v.id));
    }, [results, selectedIds]);

    const handleSelectAll = (checked: boolean) => {
        setSelectedIds(checked ? new Set(results.map(v => v.id)) : new Set());
    };

    return (
        <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
            <div className="max-w-7xl mx-auto">
                <header className="mb-8">
                    <div className="relative flex items-center justify-center text-center">
                        <Button variant="ghost" className="absolute left-0" onClick={() => router.push('/')}>
                            <Home className="mr-2 h-4 w-4" />
                            Ir al Inicio
                        </Button>
                        <div>
                            <div className="flex items-center justify-center gap-2">
                                <FileCog className="h-8 w-8 text-primary" />
                                <h1 className="text-2xl font-bold text-primary">Control de Versiones de Liquidación</h1>
                            </div>
                            <p className="text-sm text-gray-500">Busque, edite y elimine las versiones guardadas de liquidaciones.</p>
                        </div>
                    </div>
                </header>

                <Card className="mb-6">
                    <CardHeader>
                        <CardTitle>Filtros de Búsqueda</CardTitle>
                    </CardHeader>
                    <CardContent>
                         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                             <div className="space-y-2 lg:col-span-2">
                                <Label>Rango de Fechas (de la liquidación)</Label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !dateRange && "text-muted-foreground")}>
                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                            {dateRange?.from ? (dateRange.to ? (<>{format(dateRange.from, "LLL dd, y", { locale: es })} - {format(dateRange.to, "LLL dd, y", { locale: es })}</>) : (format(dateRange.from, "LLL dd, y", { locale: es }))) : (<span>Todos los rangos</span>)}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start"><Calendar initialFocus mode="range" defaultMonth={dateRange?.from} selected={dateRange} onSelect={setDateRange} numberOfMonths={2} locale={es} /></PopoverContent>
                                </Popover>
                            </div>
                            <div className="space-y-2">
                                <Label>Cliente</Label>
                                <Select value={selectedClient} onValueChange={setSelectedClient}>
                                    <SelectTrigger><SelectValue placeholder="Todos los clientes" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="">Todos los clientes</SelectItem>
                                        {clients.map(c => <SelectItem key={c.id} value={c.razonSocial}>{c.razonSocial}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex gap-2">
                                <Button onClick={handleSearch} className="w-full" disabled={isLoading}><Search className="mr-2 h-4 w-4" />Buscar</Button>
                                <Button onClick={handleClear} variant="outline" className="w-full"><XCircle className="mr-2 h-4 w-4" />Limpiar</Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <div className="flex justify-between items-center">
                            <CardTitle>Versiones Guardadas</CardTitle>
                            {selectedIds.size > 0 && (
                                <Button onClick={() => setIsConfirmBulkDeleteOpen(true)} variant="destructive" size="sm" disabled={isBulkDeleting}>
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Eliminar ({selectedIds.size})
                                </Button>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-12"><Checkbox checked={isAllDisplayedSelected} onCheckedChange={(checked) => handleSelectAll(checked === true)} /></TableHead>
                                        <TableHead>Cliente</TableHead>
                                        <TableHead>Rango Liquidación</TableHead>
                                        <TableHead>Guardado Por</TableHead>
                                        <TableHead>Fecha Guardado</TableHead>
                                        <TableHead>Nota</TableHead>
                                        <TableHead className="text-right">Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                {isLoading ? (
                                    <TableRow><TableCell colSpan={7} className="h-24 text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" /></TableCell></TableRow>
                                ) : results.length > 0 ? (
                                    results.map((version) => (
                                        <TableRow key={version.id}>
                                            <TableCell><Checkbox checked={selectedIds.has(version.id)} onCheckedChange={(checked) => handleRowSelect(version.id, !!checked)} /></TableCell>
                                            <TableCell>{version.clientName}</TableCell>
                                            <TableCell>{format(parseISO(version.startDate), 'dd/MM/yy')} - {format(parseISO(version.endDate), 'dd/MM/yy')}</TableCell>
                                            <TableCell>{version.savedBy.displayName}</TableCell>
                                            <TableCell>{format(parseISO(version.savedAt), 'dd/MM/yy HH:mm')}</TableCell>
                                            <TableCell className="max-w-xs truncate" title={version.note}>{version.note}</TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="ghost" size="icon" onClick={() => { setVersionToEdit(version); setNewNote(version.note); }}><Edit2 className="h-4 w-4 text-blue-600" /></Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow><TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                                        {searched ? 'No se encontraron versiones para los filtros seleccionados.' : 'Realice una búsqueda para ver los resultados.'}
                                    </TableCell></TableRow>
                                )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>

                 <Dialog open={!!versionToEdit} onOpenChange={(isOpen) => !isOpen && setVersionToEdit(null)}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Editar Nota de la Versión</DialogTitle>
                            <DialogDescription>Modifique la nota descriptiva para esta versión guardada.</DialogDescription>
                        </DialogHeader>
                        <div className="py-4">
                            <Label htmlFor="note">Nota</Label>
                            <Textarea id="note" value={newNote} onChange={(e) => setNewNote(e.target.value)} />
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setVersionToEdit(null)}>Cancelar</Button>
                            <Button onClick={handleEditNote} disabled={isEditing}>
                                {isEditing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Guardar
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                <AlertDialog open={isConfirmBulkDeleteOpen} onOpenChange={setIsConfirmBulkDeleteOpen}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>¿Confirmar eliminación?</AlertDialogTitle>
                            <AlertDialogDescription>Se eliminarán permanentemente <strong>{selectedIds.size}</strong> versión(es) guardada(s). Esta acción no se puede deshacer.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={handleBulkDeleteConfirm} disabled={isBulkDeleting} className={buttonVariants({variant: 'destructive'})}>
                                {isBulkDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Sí, eliminar
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
                
                <IndexCreationDialog isOpen={isIndexErrorOpen} onOpenChange={setIsIndexErrorOpen} errorMessage={indexErrorMessage} />
            </div>
        </div>
    );
}
