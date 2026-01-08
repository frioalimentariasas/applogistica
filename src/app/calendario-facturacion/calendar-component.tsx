
"use client";

import * as React from 'react';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { DayPicker, type DateRange } from 'react-day-picker';
import { format, startOfMonth, endOfMonth, addMonths, subMonths, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';

import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { getBillingEvents, saveBillingEvent, deleteBillingEvent, type BillingEvent } from './actions';
import { getHolidaysInRange } from '../gestion-festivos/actions';
import type { ClientInfo } from '@/app/actions/clients';

import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Loader2, Calendar as CalendarIcon, Plus, Edit, Trash2, Home, ChevronLeft, ChevronRight, CheckCircle, Clock, CircleAlert, Dot, ChevronsUpDown, Check, Settings } from 'lucide-react';
import { IndexCreationDialog } from '@/components/app/index-creation-dialog';
import { cn } from '@/lib/utils';


const eventSchema = z.object({
  clients: z.array(z.string()).min(1, 'Debe seleccionar al menos un cliente.'),
  note: z.string().max(300, 'La nota no puede exceder los 300 caracteres.').optional(),
  status: z.enum(['pending', 'in_progress', 'completed'], { required_error: 'Debe seleccionar un estado.' }),
});

type EventFormValues = z.infer<typeof eventSchema>;

const statusConfig = {
  pending: { label: 'Pendiente', color: 'bg-yellow-400', textColor: 'text-yellow-900', dayBg: 'bg-yellow-100' },
  in_progress: { label: 'En Proceso', color: 'bg-blue-400', textColor: 'text-blue-900', dayBg: 'bg-blue-100' },
  completed: { label: 'Facturado', color: 'bg-green-400', textColor: 'text-green-900', dayBg: 'bg-green-100' },
};

export default function CalendarComponent({ clients }: { clients: ClientInfo[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const { permissions } = useAuth();
  
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [events, setEvents] = useState<BillingEvent[]>([]);
  const [holidays, setHolidays] = useState<Date[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [isEventDialogOpen, setIsEventDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [eventToEdit, setEventToEdit] = useState<BillingEvent | null>(null);

  const [eventToDelete, setEventToDelete] = useState<BillingEvent | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);

  const [isIndexErrorOpen, setIsIndexErrorOpen] = useState(false);
  const [indexErrorMessage, setIndexErrorMessage] = useState('');

  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);

  const form = useForm<EventFormValues>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      clients: [],
      note: '',
      status: 'pending',
    },
  });

  const fetchEvents = useCallback(async (month: Date) => {
    setIsLoading(true);
    try {
      const start = startOfMonth(month);
      const end = endOfMonth(month);
      const [fetchedEvents, fetchedHolidays] = await Promise.all([
        getBillingEvents(format(start, 'yyyy-MM-dd'), format(end, 'yyyy-MM-dd')),
        getHolidaysInRange(format(start, 'yyyy-MM-dd'), format(end, 'yyyy-MM-dd')),
      ]);
      setEvents(fetchedEvents);
      setHolidays(fetchedHolidays.map(h => new Date(h.date.replace(/-/g, '/'))));
    } catch (error: any) {
        if (typeof error.message === 'string' && (error.message.includes('requires an index') || error.message.includes('needs an index'))) {
            setIndexErrorMessage(error.message);
            setIsIndexErrorOpen(true);
        } else {
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar los datos del calendario.' });
        }
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (isClient) {
      fetchEvents(currentMonth);
    }
  }, [currentMonth, fetchEvents, isClient]);

  const openEventDialog = (date: Date) => {
    const dayEvents = events.filter(e => e.date === format(date, 'yyyy-MM-dd'));
    const event = dayEvents[0];
    
    setSelectedDate(date);
    setEventToEdit(event || null);
    form.reset({
      clients: event?.clients || [],
      note: event?.note || '',
      status: event?.status || 'pending',
    });
    setIsEventDialogOpen(true);
  };
  
  const onSubmit = async (data: EventFormValues) => {
    if (!selectedDate) return;
    
    const payload = {
        date: format(selectedDate, 'yyyy-MM-dd'),
        ...data,
    };
    const result = await saveBillingEvent(payload, eventToEdit?.id);

    if(result.success) {
        toast({ title: 'Éxito', description: result.message });
        setIsEventDialogOpen(false);
        fetchEvents(currentMonth);
    } else {
        toast({ variant: 'destructive', title: 'Error', description: result.message });
    }
  };

  const handleDeleteConfirm = async () => {
    if (!eventToDelete) return;
    setIsDeleting(true);
    const result = await deleteBillingEvent(eventToDelete.id);
    if (result.success) {
      toast({ title: 'Éxito', description: result.message });
      setEvents(prev => prev.filter(e => e.id !== eventToDelete!.id));
      setIsEventDialogOpen(false); // Ensure main dialog is closed
    } else {
      toast({ variant: 'destructive', title: 'Error', description: result.message });
    }
    setEventToDelete(null);
    setIsConfirmDeleteOpen(false); // Close confirmation dialog
    setIsDeleting(false);
  };

  const DayContent = ({ date, activeModifiers }: { date: Date, activeModifiers: any }) => {
    const dayEvents = events.filter(e => e.date === format(date, 'yyyy-MM-dd'));
    const event = dayEvents[0];
    const statusInfo = event ? statusConfig[event.status] : null;

    const allClientsSelected = event?.clients.includes('TODOS (Cualquier Cliente)');

    const isHoliday = holidays.some(holiday => isSameDay(date, holiday));
    const isDaySunday = activeModifiers && activeModifiers.sunday;
    const isNonWorkingDay = isHoliday || isDaySunday;
    
    const dayStyle: React.CSSProperties = {};
    if (isNonWorkingDay && !statusInfo) {
        dayStyle.backgroundColor = 'rgba(254, 226, 226, 0.7)'; // Tailwind's red-100/70
    }
     if (activeModifiers?.selected) {
      dayStyle.backgroundColor = 'var(--accent)';
      dayStyle.color = 'var(--accent-foreground)';
    }

    return (
        <div style={dayStyle} className="relative h-full flex flex-col p-1" onClick={() => openEventDialog(date)}>
            <time dateTime={date.toISOString()} className={cn("self-end flex items-center justify-center h-6 w-6 rounded-full font-semibold", statusInfo && `${statusInfo.dayBg} ${statusInfo.textColor}`, isNonWorkingDay && !statusInfo && 'text-red-800', activeModifiers?.selected && 'bg-primary text-primary-foreground')}>
                {format(date, 'd')}
            </time>
            {event && (
                 <div className="flex-grow mt-1 space-y-0.5 overflow-hidden">
                    {allClientsSelected ? (
                        <div className="flex items-center gap-1.5">
                            <span className={cn("block h-2 w-2 shrink-0 rounded-full", statusInfo?.color)}></span>
                            <span className="text-xs font-bold truncate text-gray-700">TODOS LOS CLIENTES</span>
                        </div>
                    ) : (
                        event.clients.map((client, index) => (
                            <div key={index} className="flex items-center gap-1.5">
                                <span className={cn("block h-2 w-2 shrink-0 rounded-full", statusInfo?.color)}></span>
                                <span className="text-xs truncate text-gray-700">{client}</span>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
  };

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
            <div className="relative flex items-center justify-center text-center">
                 <Button variant="ghost" className="absolute left-0" onClick={() => router.push('/')}>
                    <Home className="mr-2 h-4 w-4" /> Ir al Inicio
                </Button>
                <div>
                    <div className="flex items-center justify-center gap-2">
                        <CalendarIcon className="h-8 w-8 text-primary" />
                        <h1 className="text-2xl font-bold text-primary">Calendario de Facturación</h1>
                    </div>
                    <p className="text-sm text-gray-500">Programe y visualice las tareas de liquidación de clientes.</p>
                </div>
                 {permissions.canManageHolidays && (
                    <Button variant="outline" className="absolute right-0" onClick={() => router.push('/gestion-festivos')}>
                        <Settings className="mr-2 h-4 w-4" /> Gestionar Festivos
                    </Button>
                )}
            </div>
        </header>
        
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <h2 className="text-xl font-semibold capitalize">{format(currentMonth, 'MMMM yyyy', { locale: es })}</h2>
                <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" onClick={() => setCurrentMonth(new Date())}>Hoy</Button>
                    <Button variant="outline" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}><ChevronLeft className="h-4 w-4" /></Button>
                    <Button variant="outline" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}><ChevronRight className="h-4 w-4" /></Button>
                </div>
            </CardHeader>
            <CardContent>
                <div className="rounded-md border">
                    {isClient ? (
                        <DayPicker
                            month={currentMonth}
                            onMonthChange={setCurrentMonth}
                            locale={es}
                            showOutsideDays
                            fixedWeeks
                            modifiers={{ sunday: { dayOfWeek: [0] }, holiday: holidays }}
                            modifiersClassNames={{
                                sunday: 'day-sunday',
                                holiday: 'day-holiday',
                            }}
                            components={{ Day: DayContent }}
                            classNames={{
                                table: "w-full border-collapse",
                                head_cell: "w-[14.2%] text-sm font-medium text-muted-foreground pb-2",
                                row: "w-full",
                                cell: "h-32 border text-sm text-left align-top relative hover:bg-accent/50 cursor-pointer",
                                day: "h-full w-full",
                                day_today: "bg-accent/50 text-accent-foreground",
                            }}
                        />
                    ) : (
                        <div className="h-[498px] flex items-center justify-center">
                            <Loader2 className="h-8 w-8 animate-spin" />
                        </div>
                    )}
                </div>
                 <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
                    <div className="flex items-center gap-2">
                      <span className="block h-3 w-3 rounded-full" style={{ backgroundColor: 'rgba(254, 226, 226, 0.7)' }}></span>
                      <span className="text-xs font-medium">Dominical y/o Festivo</span>
                    </div>
                    {Object.entries(statusConfig).map(([key, { label, dayBg }]) => (
                        <div key={key} className="flex items-center gap-2">
                            <span className={cn('block h-3 w-3 rounded-full', dayBg)}></span>
                            <span className="text-xs font-medium">{label}</span>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>

        <EventDialog 
            isOpen={isEventDialogOpen}
            onOpenChange={setIsEventDialogOpen}
            onSubmit={onSubmit}
            form={form}
            date={selectedDate}
            eventToEdit={eventToEdit}
            clients={clients}
            onDelete={(event) => {
              setEventToDelete(event);
              setIsConfirmDeleteOpen(true);
            }}
        />

        <AlertDialog open={isConfirmDeleteOpen} onOpenChange={setIsConfirmDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Está seguro?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acción eliminará el evento de facturación permanentemente. No se puede deshacer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteConfirm} disabled={isDeleting} className={buttonVariants({ variant: 'destructive' })}>
                {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                Sí, Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        
        <IndexCreationDialog isOpen={isIndexErrorOpen} onOpenChange={setIsIndexErrorOpen} errorMessage={indexErrorMessage} />
      </div>
    </div>
  );
}

function EventDialog({ isOpen, onOpenChange, onSubmit, form, date, eventToEdit, clients, onDelete }: {
    isOpen: boolean,
    onOpenChange: (open: boolean) => void,
    onSubmit: (data: EventFormValues) => void,
    form: ReturnType<typeof useForm<EventFormValues>>,
    date: Date | null,
    eventToEdit: BillingEvent | null,
    clients: ClientInfo[],
    onDelete: (event: BillingEvent) => void,
}) {
    const { formState: { isSubmitting } } = form;

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{eventToEdit ? 'Editar' : 'Programar'} Facturación</DialogTitle>
                    <DialogDescription>
                        {date && `Para la fecha: ${format(date, 'd \'de\' MMMM, yyyy', { locale: es })}`}
                    </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormField
                            control={form.control}
                            name="clients"
                            render={({ field }) => (
                                <FormItem>
                                <FormLabel>Cliente(s)</FormLabel>
                                <ClientMultiSelectDialog
                                    options={clients.map(c => ({value: c.razonSocial, label: c.razonSocial}))}
                                    selected={field.value}
                                    onChange={field.onChange}
                                    placeholder="Seleccione clientes..."
                                />
                                <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="note"
                            render={({ field }) => (
                                <FormItem>
                                <FormLabel>Nota</FormLabel>
                                <FormControl>
                                    <Textarea placeholder="Añadir una nota o descripción..." {...field} />
                                </FormControl>
                                <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="status"
                            render={({ field }) => (
                                <FormItem className="space-y-3">
                                <FormLabel>Estado</FormLabel>
                                <FormControl>
                                    <RadioGroup
                                    onValueChange={field.onChange}
                                    value={field.value}
                                    className="flex flex-col space-y-1"
                                    >
                                    {Object.entries(statusConfig).map(([key, { label, color }]) => (
                                        <FormItem key={key} className="flex items-center space-x-3 space-y-0">
                                        <FormControl>
                                            <RadioGroupItem value={key} />
                                        </FormControl>
                                        <Label className="font-normal flex items-center gap-2">
                                            <span className={`block h-3 w-3 rounded-full ${color}`}></span>
                                            {label}
                                        </Label>
                                        </FormItem>
                                    ))}
                                    </RadioGroup>
                                </FormControl>
                                <FormMessage />
                                </FormItem>
                            )}
                        />
                         <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-between pt-4">
                            <div>
                                {eventToEdit && (
                                  <Button type="button" variant="destructive" onClick={() => onDelete(eventToEdit)}>
                                    <Trash2 className="mr-2 h-4 w-4"/>
                                    Eliminar
                                  </Button>
                                )}
                            </div>
                            <div className="flex gap-2">
                                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                                <Button type="submit" disabled={isSubmitting}>
                                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Guardar
                                </Button>
                            </div>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
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
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const allClientOptions = React.useMemo(() => [
    { value: 'TODOS (Cualquier Cliente)', label: 'TODOS (Cualquier Cliente)' }, 
    ...options
  ], [options]);

  const filteredOptions = React.useMemo(() => {
    if (!search) return allClientOptions;
    return allClientOptions.filter((o) =>
      o.label.toLowerCase().includes(search.toLowerCase())
    );
  }, [search, allClientOptions]);

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
  
  const isAllSelected = selected.length === options.length && !selected.includes('TODOS (Cualquier Cliente)');

  const handleSelectAll = (isChecked: boolean) => {
    onChange(isChecked ? options.map(o => o.value) : []);
  };

  const getButtonLabel = () => {
    if (selected.length === 0) return placeholder;
    if (selected.includes('TODOS (Cualquier Cliente)')) return 'TODOS (Cualquier Cliente)';
    if (selected.length === 1) return selected[0];
    if (isAllSelected) return "Todos los clientes seleccionados";
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
            <DialogDescription>Seleccione los clientes para este evento de facturación.</DialogDescription>
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
                  {filteredOptions.length === 0 && <p className="text-center text-sm text-muted-foreground">No se encontraron clientes.</p>}
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

