

"use client";

import * as React from 'react';
import { useState, useMemo } from 'react';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import * as ExcelJS from 'exceljs';
import { format } from 'date-fns';

import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { addBillingConcept, updateBillingConcept, deleteMultipleBillingConcepts, type BillingConcept } from './actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Loader2, PlusCircle, Edit, Trash2, ShieldAlert, DollarSign, ChevronsUpDown, Check, Info, Download, Clock } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import type { ClientInfo } from '@/app/actions/clients';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const conceptSchema = z.object({
  conceptName: z.string().min(3, { message: "El nombre del concepto es requerido (mín. 3 caracteres)."}),
  clientNames: z.array(z.string()).min(1, { message: 'Debe seleccionar al menos un cliente.' }),
  operationType: z.enum(['recepcion', 'despacho', 'TODAS'], { required_error: 'Debe seleccionar un tipo de operación.' }),
  productType: z.enum(['fijo', 'variable', 'TODAS'], { required_error: 'Debe seleccionar un tipo de producto.' }),
  unitOfMeasure: z.enum(['TONELADA', 'KILOGRAMOS', 'PALETA', 'UNIDAD', 'CAJA', 'SACO', 'CANASTILLA', 'HORA'], { required_error: 'Debe seleccionar una unidad de medida.'}),
  value: z.coerce.number().min(0).optional(),
  lunesASabadoTariff: z.coerce.number().min(0).optional(),
  domingoFestivoTariff: z.coerce.number().min(0).optional(),
  dayTariff: z.coerce.number().min(0).optional(),
  nightTariff: z.coerce.number().min(0).optional(),
  dayShiftEnd: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Formato HH:MM').optional(),
}).superRefine((data, ctx) => {
    const upperConceptName = data.conceptName?.toUpperCase();

    if (upperConceptName === 'JORNAL ORDINARIO') {
        if (data.lunesASabadoTariff === undefined || data.lunesASabadoTariff === null) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La tarifa de Lunes a Sábado es requerida.", path: ["lunesASabadoTariff"] });
        }
        if (data.domingoFestivoTariff === undefined || data.domingoFestivoTariff === null) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La tarifa de Domingo y Festivo es requerida.", path: ["domingoFestivoTariff"] });
        }
    } else if (upperConceptName === 'CARGUE' || upperConceptName === 'DESCARGUE') {
         if (data.dayTariff === undefined || data.dayTariff === null) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La tarifa diurna es requerida.", path: ["dayTariff"] });
        }
        if (data.nightTariff === undefined || data.nightTariff === null) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La tarifa nocturna es requerida.", path: ["nightTariff"] });
        }
        if (!data.dayShiftEnd) {
             ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La hora de fin del turno diurno es requerida.", path: ["dayShiftEnd"] });
        }
    } else {
        if (data.value === undefined || data.value === null) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "El valor unitario es requerido.", path: ["value"] });
        }
    }
});


type ConceptFormValues = z.infer<typeof conceptSchema>;

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

export default function ConceptManagementComponent({ initialClients, initialConcepts }: { initialClients: ClientInfo[], initialConcepts: BillingConcept[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const { permissions, loading: authLoading } = useAuth();
  
  const [concepts, setConcepts] = useState<BillingConcept[]>(initialConcepts);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [conceptToEdit, setConceptToEdit] = useState<BillingConcept | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isConfirmBulkDeleteOpen, setIsConfirmBulkDeleteOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  
  const addForm = useForm<ConceptFormValues>({
    resolver: zodResolver(conceptSchema),
    defaultValues: {
      conceptName: '',
      clientNames: ['TODOS (Cualquier Cliente)'],
      operationType: 'TODAS',
      productType: 'TODAS',
      unitOfMeasure: 'TONELADA',
      value: 0,
      dayShiftEnd: '18:00',
    },
  });

  const editForm = useForm<ConceptFormValues>({
    resolver: zodResolver(conceptSchema),
  });

  const clientOptions: ClientInfo[] = useMemo(() => [
    { id: 'TODOS', razonSocial: 'TODOS (Cualquier Cliente)' }, 
    ...initialClients
  ], [initialClients]);
  
  const onAddSubmit: SubmitHandler<ConceptFormValues> = async (data) => {
    setIsSubmitting(true);
    const result = await addBillingConcept({
        ...data,
        conceptName: data.conceptName.toUpperCase().trim(),
    });
    if (result.success && result.newConcept) {
      toast({ title: 'Éxito', description: result.message });
      setConcepts(prev => [...prev, result.newConcept!].sort((a,b) => a.conceptName.localeCompare(b.conceptName)));
      addForm.reset({
        conceptName: '',
        clientNames: ['TODOS (Cualquier Cliente)'],
        operationType: 'TODAS',
        productType: 'TODAS',
        unitOfMeasure: 'TONELADA',
        value: 0,
        dayShiftEnd: '18:00',
      });
    } else {
      toast({ variant: 'destructive', title: 'Error', description: result.message });
    }
    setIsSubmitting(false);
  };
  
  const onEditSubmit: SubmitHandler<ConceptFormValues> = async (data) => {
    if (!conceptToEdit) return;
    setIsEditing(true);
    const result = await updateBillingConcept(conceptToEdit.id, {
        ...data,
        conceptName: data.conceptName.toUpperCase().trim(),
    });
    if (result.success) {
      toast({ title: 'Éxito', description: result.message });
      setConcepts(prev => prev.map(s => s.id === conceptToEdit.id ? { ...data, conceptName: data.conceptName.toUpperCase().trim(), id: s.id } : s));
      setConceptToEdit(null);
    } else {
      toast({ variant: 'destructive', title: 'Error', description: result.message });
    }
    setIsEditing(false);
  };

  const handleBulkDeleteConfirm = async () => {
    if (selectedIds.size === 0) return;
    setIsBulkDeleting(true);
    const idsToDelete = Array.from(selectedIds);
    const result = await deleteMultipleBillingConcepts(idsToDelete);
    if (result.success) {
      toast({ title: 'Éxito', description: result.message });
      setConcepts(prev => prev.filter(s => !selectedIds.has(s.id)));
      setSelectedIds(new Set());
    } else {
      toast({ variant: 'destructive', title: 'Error', description: result.message });
    }
    setIsConfirmBulkDeleteOpen(false);
    setIsBulkDeleting(false);
  };

  const openEditDialog = (concept: BillingConcept) => {
    setConceptToEdit(concept);
    editForm.reset(concept);
  };

  const handleRowSelect = (id: string, checked: boolean) => {
    const newSet = new Set(selectedIds);
    if (checked) newSet.add(id); else newSet.delete(id);
    setSelectedIds(newSet);
  };

  const isAllSelected = useMemo(() => {
    if (concepts.length === 0) return false;
    return concepts.every(s => selectedIds.has(s.id));
  }, [selectedIds, concepts]);
  
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(concepts.map(s => s.id)));
    } else {
      setSelectedIds(new Set());
    }
  };
  
  const handleExportExcel = async () => {
    if (concepts.length === 0) {
        toast({
            variant: "destructive",
            title: "No hay datos para exportar",
            description: "No hay conceptos definidos para generar el archivo Excel.",
        });
        return;
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Conceptos Liquidación Cuadrilla');

    const headerFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A90C8' } };
    const headerFont: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };

    worksheet.columns = [
        { header: 'Nombre del Concepto', key: 'conceptName', width: 30 },
        { header: 'Cliente(s)', key: 'clientNames', width: 40 },
        { header: 'Tipo Operación', key: 'operationType', width: 20 },
        { header: 'Tipo Producto', key: 'productType', width: 20 },
        { header: 'Unidad de Medida', key: 'unitOfMeasure', width: 20 },
        { header: 'Valor Unitario', key: 'value', width: 20 },
        { header: 'Tarifa L-S', key: 'lunesASabadoTariff', width: 20 },
        { header: 'Tarifa D-F', key: 'domingoFestivoTariff', width: 20 },
        { header: 'Tarifa Diurna', key: 'dayTariff', width: 20 },
        { header: 'Tarifa Nocturna', key: 'nightTariff', width: 20 },
        { header: 'Fin Turno Diurno', key: 'dayShiftEnd', width: 20 },
    ];
    
    const headerRow = worksheet.getRow(1);
    headerRow.values = (worksheet.columns as any[]).map(c => c.header);
    headerRow.eachCell(cell => {
      cell.fill = headerFill;
      cell.font = headerFont;
      cell.alignment = { horizontal: 'center' };
    });


    concepts.forEach(concept => {
        worksheet.addRow({
            conceptName: concept.conceptName,
            clientNames: concept.clientNames.join(', '),
            operationType: concept.operationType,
            productType: concept.productType,
            unitOfMeasure: concept.unitOfMeasure,
            value: concept.conceptName !== 'JORNAL ORDINARIO' && concept.conceptName !== 'CARGUE' && concept.conceptName !== 'DESCARGUE' ? concept.value : '',
            lunesASabadoTariff: concept.conceptName === 'JORNAL ORDINARIO' ? concept.lunesASabadoTariff : '',
            domingoFestivoTariff: concept.conceptName === 'JORNAL ORDINARIO' ? concept.domingoFestivoTariff : '',
            dayTariff: concept.conceptName === 'CARGUE' || concept.conceptName === 'DESCARGUE' ? concept.dayTariff : '',
            nightTariff: concept.conceptName === 'CARGUE' || concept.conceptName === 'DESCARGUE' ? concept.nightTariff : '',
            dayShiftEnd: concept.conceptName === 'CARGUE' || concept.conceptName === 'DESCARGUE' ? concept.dayShiftEnd : '',
        });
        const lastRow = worksheet.lastRow!;
        lastRow.getCell('value').numFmt = '"$"#,##0.00';
        lastRow.getCell('lunesASabadoTariff').numFmt = '"$"#,##0.00';
        lastRow.getCell('domingoFestivoTariff').numFmt = '"$"#,##0.00';
        lastRow.getCell('dayTariff').numFmt = '"$"#,##0.00';
        lastRow.getCell('nightTariff').numFmt = '"$"#,##0.00';
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = 'Conceptos_Liquidacion_Cuadrilla.xlsx';
    link.click();
  };

  if (authLoading) {
      return <div className="flex min-h-screen w-full items-center justify-center"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>
  }

  if (!permissions.canManageLiquidationConcepts) {
      return (
          <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8 flex items-center justify-center">
              <div className="max-w-xl mx-auto text-center">
                  <AccessDenied />
                  <Button onClick={() => router.push('/crew-performance-report')} className="mt-6"><ArrowLeft className="mr-2 h-4 w-4" />Volver al Inicio</Button>
              </div>
          </div>
      );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <div className="relative flex items-center justify-center text-center">
            <Button variant="ghost" size="icon" className="absolute left-0 top-1/2 -translate-y-1/2" onClick={() => router.push('/crew-performance-report')}>
              <ArrowLeft className="h-6 w-6" />
            </Button>
            <div>
              <div className="flex items-center justify-center gap-2">
                <DollarSign className="h-8 w-8 text-primary" />
                <h1 className="text-2xl font-bold text-primary">Gestión de Conceptos de Liquidación Cuadrilla</h1>
              </div>
              <p className="text-sm text-gray-500">Defina los conceptos y valores para la liquidación de las operaciones de cuadrilla.</p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1">
                <Card>
                    <CardHeader>
                        <CardTitle>Nuevo Concepto de Liquidación</CardTitle>
                        <CardDescription>Cree una regla de cobro para una operación.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Form {...addForm}>
                            <form onSubmit={addForm.handleSubmit(onAddSubmit)} className="space-y-4">
                                <ConceptFormFields form={addForm} clientOptions={clientOptions} />
                                <Button type="submit" disabled={isSubmitting} className="w-full">
                                    {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                                    Guardar Concepto
                                </Button>
                            </form>
                        </Form>
                    </CardContent>
                </Card>
            </div>
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <CardTitle>Conceptos Actuales</CardTitle>
                        <div className="flex gap-2">
                            {selectedIds.size > 0 && (
                                <Button onClick={() => setIsConfirmBulkDeleteOpen(true)} variant="destructive" size="sm" disabled={isBulkDeleting}>
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Eliminar ({selectedIds.size})
                                </Button>
                            )}
                            <Button onClick={handleExportExcel} variant="outline" size="sm" disabled={concepts.length === 0}>
                                <Download className="mr-2 h-4 w-4" />
                                Exportar a Excel
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <ScrollArea className="h-[500px]">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-12"><Checkbox checked={isAllSelected} onCheckedChange={(checked) => handleSelectAll(checked === true)} /></TableHead>
                                        <TableHead>Concepto</TableHead>
                                        <TableHead>U. Medida</TableHead>
                                        <TableHead>Valor</TableHead>
                                        <TableHead className="text-right">Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {concepts.length > 0 ? (
                                        concepts.map((c) => (
                                        <TableRow key={c.id} data-state={selectedIds.has(c.id) && "selected"}>
                                            <TableCell><Checkbox checked={selectedIds.has(c.id)} onCheckedChange={(checked) => handleRowSelect(c.id, checked === true)} /></TableCell>
                                            <TableCell>
                                                <div className="font-medium flex items-center gap-2">
                                                    {c.conceptName}
                                                </div>
                                                <div className="text-xs text-muted-foreground max-w-[250px] truncate" title={(c.clientNames || []).join(', ')}>
                                                    {(c.clientNames || []).join(', ')} / {c.operationType} / {c.productType}
                                                </div>
                                            </TableCell>
                                            <TableCell>{c.unitOfMeasure}</TableCell>
                                            <TableCell>
                                                {c.conceptName === 'JORNAL ORDINARIO' ? (
                                                    <div className="text-xs">
                                                        <p>L-S: {c.lunesASabadoTariff?.toLocaleString('es-CO', {style: 'currency', currency: 'COP'})}</p>
                                                        <p>D-F: {c.domingoFestivoTariff?.toLocaleString('es-CO', {style: 'currency', currency: 'COP'})}</p>
                                                    </div>
                                                ) : c.conceptName === 'CARGUE' || c.conceptName === 'DESCARGUE' ? (
                                                     <div className="text-xs">
                                                        <p>Día: {c.dayTariff?.toLocaleString('es-CO', {style: 'currency', currency: 'COP'})}</p>
                                                        <p>Noche: {c.nightTariff?.toLocaleString('es-CO', {style: 'currency', currency: 'COP'})}</p>
                                                    </div>
                                                ) : (
                                                    c.value?.toLocaleString('es-CO', {style: 'currency', currency: 'COP'})
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="ghost" size="icon" onClick={() => openEditDialog(c)}><Edit className="h-4 w-4 text-blue-600" /></Button>
                                            </TableCell>
                                        </TableRow>
                                        ))
                                    ) : (
                                        <TableRow><TableCell colSpan={5} className="h-24 text-center">No hay conceptos definidos.</TableCell></TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </ScrollArea>
                    </div>
                </CardContent>
              </Card>
            </div>
        </div>
      </div>
      
      {/* Edit Dialog */}
      <Dialog open={!!conceptToEdit} onOpenChange={(isOpen) => { if (!isOpen) setConceptToEdit(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Concepto de Liquidación</DialogTitle></DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4 pt-4">
                <ConceptFormFields form={editForm} clientOptions={clientOptions} />
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setConceptToEdit(null)}>Cancelar</Button>
                    <Button type="submit" disabled={isEditing}>{isEditing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Guardar Cambios</Button>
                </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      
      <AlertDialog open={isConfirmBulkDeleteOpen} onOpenChange={setIsConfirmBulkDeleteOpen}>
          <AlertDialogContent>
              <AlertDialogHeader>
                  <AlertDialogTitle>¿Confirmar eliminación masiva?</AlertDialogTitle>
                  <AlertDialogDescription>Esta acción no se puede deshacer. Se eliminarán permanentemente <strong>{selectedIds.size}</strong> concepto(s) seleccionados.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleBulkDeleteConfirm} disabled={isBulkDeleting} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                      {isBulkDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Sí, eliminar seleccionados
                  </AlertDialogAction>
              </AlertDialogFooter>
          </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ConceptFormFields({ form, clientOptions }: { form: any, clientOptions: ClientInfo[] }) {
    const watchedConceptName = form.watch('conceptName');
    const upperConceptName = watchedConceptName?.toUpperCase();
    const isJornal = upperConceptName === 'JORNAL ORDINARIO';
    const isCargueDescargue = upperConceptName === 'CARGUE' || upperConceptName === 'DESCARGUE';

    return (
        <div className="space-y-4">
            <FormField control={form.control} name="conceptName" render={({ field }) => (<FormItem><FormLabel>Nombre del Concepto</FormLabel><FormControl><Input placeholder="Ej: REESTIBADO" {...field} onChange={e => field.onChange(e.target.value.toUpperCase())} /></FormControl><FormMessage /></FormItem>)}/>
            <FormField
                control={form.control}
                name="clientNames"
                render={({ field }) => (
                <FormItem>
                    <FormLabel>Aplicar a Cliente(s)</FormLabel>
                    <ClientMultiSelectDialog
                        options={clientOptions.map(c => ({value: c.razonSocial, label: c.razonSocial}))}
                        selected={field.value}
                        onChange={field.onChange}
                        placeholder="Seleccione clientes..."
                    />
                    <FormMessage />
                </FormItem>
                )}
            />
            <FormField control={form.control} name="operationType" render={({ field }) => (<FormItem><FormLabel>Tipo de Operación</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent><SelectItem value="TODAS">TODAS</SelectItem><SelectItem value="recepcion">Recepción</SelectItem><SelectItem value="despacho">Despacho</SelectItem></SelectContent></Select><FormMessage /></FormItem>)}/>
            <FormField control={form.control} name="productType" render={({ field }) => (<FormItem><FormLabel>Tipo de Producto</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent><SelectItem value="TODAS">TODOS</SelectItem><SelectItem value="fijo">Peso Fijo</SelectItem><SelectItem value="variable">Peso Variable</SelectItem></SelectContent></Select><FormMessage /></FormItem>)}/>
            <FormField control={form.control} name="unitOfMeasure" render={({ field }) => (<FormItem><FormLabel>Unidad de Medida</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent><SelectItem value="TONELADA">TONELADA</SelectItem><SelectItem value="KILOGRAMOS">KILOGRAMOS</SelectItem><SelectItem value="PALETA">PALETA</SelectItem><SelectItem value="UNIDAD">UNIDAD</SelectItem><SelectItem value="CAJA">CAJA</SelectItem><SelectItem value="SACO">SACO</SelectItem><SelectItem value="CANASTILLA">CANASTILLA</SelectItem><SelectItem value="HORA">HORA</SelectItem></SelectContent></Select><FormMessage /></FormItem>)}/>
             {isJornal ? (
                <>
                    <FormField control={form.control} name="lunesASabadoTariff" render={({ field }) => (<FormItem><FormLabel>Tarifa Lunes a Sábado (COP)</FormLabel><FormControl><Input type="number" step="0.01" {...field} value={field.value ?? 0} /></FormControl><FormMessage /></FormItem>)}/>
                    <FormField control={form.control} name="domingoFestivoTariff" render={({ field }) => (<FormItem><FormLabel>Tarifa Domingo y Festivo (COP)</FormLabel><FormControl><Input type="number" step="0.01" {...field} value={field.value ?? 0} /></FormControl><FormMessage /></FormItem>)}/>
                </>
            ) : isCargueDescargue ? (
                 <>
                    <FormField control={form.control} name="dayTariff" render={({ field }) => (<FormItem><FormLabel>Tarifa Diurna (COP)</FormLabel><FormControl><Input type="number" step="0.01" {...field} value={field.value ?? 0} /></FormControl><FormMessage /></FormItem>)}/>
                    <FormField control={form.control} name="nightTariff" render={({ field }) => (<FormItem><FormLabel>Tarifa Nocturna/Festiva (COP)</FormLabel><FormControl><Input type="number" step="0.01" {...field} value={field.value ?? 0} /></FormControl><FormMessage /></FormItem>)}/>
                     <FormField control={form.control} name="dayShiftEnd" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Hora Fin Turno Diurno</FormLabel>
                            <div className="flex items-center gap-2">
                                <FormControl>
                                    <Input type="time" placeholder="HH:MM" {...field} className="flex-grow" />
                                </FormControl>
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild><Button type="button" variant="ghost" size="icon"><Info className="h-4 w-4" /></Button></TooltipTrigger>
                                        <TooltipContent><p>Las operaciones que terminen después de esta hora se considerarán nocturnas.</p></TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            </div>
                            <FormMessage />
                        </FormItem>
                    )}/>
                </>
            ) : (
                <FormField control={form.control} name="value" render={({ field }) => (<FormItem><FormLabel>Valor Unitario (COP)</FormLabel><FormControl><Input type="number" step="0.01" {...field} value={field.value ?? 0} /></FormControl><FormMessage /></FormItem>)}/>
            )}
        </div>
    )
}

function ClientMultiSelectDialog({
  options,
  selected,
  onChange,
  placeholder,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filteredOptions = useMemo(() => {
    if (!search) return options;
    return options.filter((o) =>
      o.label.toLowerCase().includes(search.toLowerCase())
    );
  }, [search, options]);

  const handleSelect = (valueToToggle: string) => {
    const isTodos = valueToToggle === 'TODOS (Cualquier Cliente)';
    
    if (isTodos) {
      onChange(selected.includes(valueToToggle) ? [] : [valueToToggle]);
    } else {
      const newSelection = selected.includes(valueToToggle)
        ? selected.filter(s => s !== valueToToggle)
        : [...selected.filter(s => s !== 'TODOS (Cualquier Cliente)'), valueToToggle];
      onChange(newSelection);
    }
  };

  const getButtonLabel = () => {
    if (selected.length === 0) return placeholder;
    if (selected.length === 1) return selected[0];
    if (selected.length === options.length) return "Todos los clientes seleccionados";
    return `${selected.length} clientes seleccionados`;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between text-left font-normal"
        >
          <span className="truncate">{getButtonLabel()}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </DialogTrigger>
      <DialogContent className="p-0">
        <DialogHeader className="p-6 pb-2">
            <DialogTitle>Seleccionar Cliente(s)</DialogTitle>
            <DialogDescription>Seleccione los clientes para este concepto.</DialogDescription>
        </DialogHeader>
        <div className="p-6 pt-0">
            <Input
                placeholder="Buscar cliente..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="mb-4"
            />
            <ScrollArea className="h-60">
                <div className="space-y-1 pr-4">
                {filteredOptions.map((option) => (
                    <div
                        key={option.value}
                        className="flex items-center space-x-2 p-2 rounded-md hover:bg-accent"
                    >
                        <Checkbox
                            id={`client-${option.value}`}
                            checked={selected.includes(option.value)}
                            onCheckedChange={() => handleSelect(option.value)}
                        />
                        <Label
                            htmlFor={`client-${option.value}`}
                            className="w-full cursor-pointer"
                        >
                            {option.label}
                        </Label>
                    </div>
                ))}
                </div>
            </ScrollArea>
        </div>
        <DialogFooter className="p-6 pt-0">
            <Button onClick={() => setOpen(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
