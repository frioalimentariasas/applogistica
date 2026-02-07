
"use client";

import * as React from 'react';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { DayPicker, type DateRange } from 'react-day-picker';
import { format, startOfMonth, endOfMonth, addMonths, subMonths, isSameDay, getDay } from 'date-fns';
import { es } from 'date-fns/locale';

import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { getBillingEvents, saveBillingEvent, deleteBillingEvent, type BillingEvent, type ClientStatus } from './actions';
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Loader2, Calendar as CalendarIcon, Plus, Edit, Trash2, Home, ChevronLeft, ChevronRight, CheckCircle, Clock, CircleAlert, Dot, ChevronsUpDown, Check, Settings, Printer } from 'lucide-react';
import { IndexCreationDialog } from '@/components/app/index-creation-dialog';
import { cn } from '@/lib/utils';

const clientStatusSchema = z.object({
  clientName: z.string(),
  status: z.enum(['pending', 'in_progress', 'completed']),
});

const eventSchema = z.object({
  clientStatuses: z.array(clientStatusSchema).min(1, 'Debe seleccionar al menos un cliente.'),
  note: z.string().max(300, 'La nota no puede exceder los 300 caracteres.').optional(),
});

type EventFormValues = z.infer<typeof eventSchema>;

const statusConfig = {
  pending: { label: 'Pendiente', color: 'bg-yellow-400', textColor: 'text-yellow-900', dayBg: 'bg-yellow-100' },
  in_progress: { label: 'En Proceso', color: 'bg-blue-400', textColor: 'text-blue-900', dayBg: 'bg-blue-100' },
  completed: { label: 'Facturado', color: 'bg-green-400', textColor: 'text-green-900', dayBg: 'bg-green-100' },
};

const PrintStyles = () => (
    <style jsx global>{`
        @media print {
            body {
                background-color: white !important;
                -webkit-print-color-adjust: exact;
                color-adjust: exact;
            }
            #main-header, #calendar-nav-controls {
                display: none;
            }
            #calendar-page-container {
                padding: 0;
                margin: 0;
            }
            #calendar-card {
                box-shadow: none;
                border: none;
            }
            #calendar-card-header {
                justify-content: center;
            }
            .rdp-cell {
                height: 6rem;
            }
            .rdp {
                margin: 0 auto;
            }
        }
    `}</style>
);


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

  const [isIndexErrorOpen, setIsIndexErrorOpen] = useState(false);
  const [indexErrorMessage, setIndexErrorMessage] = useState('');

  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);

  const form = useForm<EventFormValues>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      clientStatuses: [],
      note: '',
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
    const eventForDay = events.find(e => e.date === format(date, 'yyyy-MM-dd'));
    
    setSelectedDate(date);
    setEventToEdit(eventForDay || null);
    form.reset({
      clientStatuses: eventForDay?.clientStatuses || [],
      note: eventForDay?.note || '',
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
    try {
        const result = await deleteBillingEvent(eventToDelete.id);
        if (result.success) {
            toast({ title: 'Éxito', description: result.message });
            fetchEvents(currentMonth); // Refresh the calendar data
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        const msg = error instanceof Error ? error.message : "No se pudo eliminar el evento."
        toast({ variant: 'destructive', title: 'Error', description: msg });
    } finally {
        setIsDeleting(false);
        setEventToDelete(null);
    }
  };


  const DayContent = ({ date }: { date: Date }) => {
    const eventForDay = events.find(e => e.date === format(date, 'yyyy-MM-dd'));
    const statusesInDay = useMemo(() => {
      if (!eventForDay || !eventForDay.clientStatuses) return [];
      
      const isForAllClients = eventForDay.clientStatuses.length === 1 && eventForDay.clientStatuses[0].clientName === 'TODOS (Cualquier Cliente)';
      if (isForAllClients) {
          const status = eventForDay.clientStatuses[0].status as keyof typeof statusConfig;
          return [{ status, clients: ['Todos los clientes'] }];
      }

      const grouped: Record<string, string[]> = {};
      eventForDay.clientStatuses.forEach(cs => {
        if (!grouped[cs.status]) {
          grouped[cs.status] = [];
        }
        grouped[cs.status].push(cs.clientName);
      });
      return Object.entries(grouped).map(([status, clientList]) => ({
        status: status as keyof typeof statusConfig,
        clients: clientList
      }));
    }, [eventForDay]);

    const isHoliday = holidays.some(holiday => isSameDay(date, holiday));
    const isDaySunday = getDay(date) === 0;
    const isNonWorkingDay = isHoliday || isDaySunday;
    
    const dayStyle: React.CSSProperties = {};
    if (isNonWorkingDay && !eventForDay) {
        dayStyle.backgroundColor = 'rgba(254, 226, 226, 0.7)';
    }

    const handleDayClick = (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest('[data-delete-button]')) {
        return;
      }
      openEventDialog(date);
    };

    const handleDeleteClick = (e: React.MouseEvent, eventToDelete: BillingEvent) => {
      e.stopPropagation();
      if(permissions.canViewBillingCalendar) {
        setEventToDelete(eventToDelete);
      }
    };

    return (
        <div style={dayStyle} className="relative h-full flex flex-col p-1 group" onClick={handleDayClick}>
            <time dateTime={date.toISOString()} className={cn("self-end flex items-center justify-center h-6 w-6 rounded-full font-semibold", eventForDay && 'bg-primary text-primary-foreground', isNonWorkingDay && !eventForDay && 'text-red-800')}>
                {format(date, 'd')}
            </time>
             {eventForDay && permissions.canViewBillingCalendar && (
              <button
                data-delete-button
                onClick={(e) => handleDeleteClick(e, eventForDay)}
                className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity rounded-full p-1 hover:bg-destructive/20"
                aria-label="Eliminar evento"
                title="Eliminar evento"
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </button>
            )}
            {eventForDay && (
                 <div className="flex-grow mt-1 space-y-0.5 overflow-hidden">
                    {statusesInDay.map(({ status, clients }) => (
                      <div key={status} className="flex items-start gap-1.5">
                        <span className={cn("block h-2 w-2 shrink-0 rounded-full mt-1", statusConfig[status]?.color)}></span>
                        <div className="flex flex-wrap gap-x-1">
                          {clients.map((client, index) => (
                              <span key={index} className="text-xs truncate text-gray-700">{client}{index < clients.length - 1 ? ',' : ''}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
            )}
        </div>
    );
  };

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-8" id="calendar-page-container">
        <PrintStyles />
      <header className="mb-8" id="main-header">
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
                <div className="absolute right-0">
                    {permissions.canManageHolidays && (
                        <Button variant="outline" onClick={() => router.push('/gestion-festivos')}>
                            <Settings className="mr-2 h-4 w-4" /> Gestionar Festivos
                        </Button>
                    )}
                </div>
            </div>
        </header>
        
        <Card id="calendar-card">
            <CardHeader id="calendar-card-header" className="flex flex-row items-center justify-between">
                <h2 className="text-xl font-semibold capitalize">{format(currentMonth, 'MMMM yyyy', { locale: es })}</h2>
                <div className="flex items-center gap-1" id="calendar-nav-controls">
                    <Button variant="outline" size="sm" onClick={() => window.print()}>
                        <Printer className="mr-2 h-4 w-4" />
                        Imprimir
                    </Button>
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
                            formatters={{
                                formatWeekdayName: (day) => format(day, 'cccc', { locale: es }).charAt(0).toUpperCase() + format(day, 'cccc', { locale: es }).slice(1)
                            }}
                            modifiers={{ sunday: { dayOfWeek: [0] }, holiday: holidays }}
                            modifiersClassNames={{
                                sunday: 'day-sunday',
                                holiday: 'day-holiday',
                            }}
                            components={{ Day: DayContent }}
                            classNames={{
                                table: "w-full border-collapse",
                                head_cell: "w-[14.2%] p-2 text-base font-bold text-foreground",
                                row: "w-full",
                                cell: "h-32 border-2 border-black text-sm text-left align-top relative hover:bg-accent/50 cursor-pointer",
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
                    {Object.entries(statusConfig).map(([key, { label, color }]) => (
                        <div key={key} className="flex items-center gap-2">
                            <span className={cn('block h-3 w-3 rounded-full', color)}></span>
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
        />

        <AlertDialog open={!!eventToDelete} onOpenChange={(open) => !open && setEventToDelete(null)}>
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
    //</div>
  );
}

function EventDialog({ isOpen, onOpenChange, onSubmit, form, date, eventToEdit, clients }: {
    isOpen: boolean,
    onOpenChange: (open: boolean) => void,
    onSubmit: (data: EventFormValues) => void,
    form: ReturnType<typeof useForm<EventFormValues>>,
    date: Date | null,
    eventToEdit: BillingEvent | null,
    clients: ClientInfo[]
}) {
    const { formState: { isSubmitting } } = form;
    const { fields, replace } = useFieldArray({
      control: form.control,
      name: "clientStatuses",
    });

    const watchedClients = useMemo(() => fields.map(f => f.clientName), [fields]);
    const isAllClientsSelected = watchedClients.length === 1 && watchedClients[0] === 'TODOS (Cualquier Cliente)';

    const handleClientSelection = (selectedClients: string[]) => {
      if (selectedClients.includes('TODOS (Cualquier Cliente)')) {
        const existing = fields.find(f => f.clientName === 'TODOS (Cualquier Cliente)');
        replace([existing || { clientName: 'TODOS (Cualquier Cliente)', status: 'pending' as const }]);
      } else {
        const newClientStatuses = selectedClients.map(clientName => {
            const existing = fields.find(f => f.clientName === clientName);
            return existing || { clientName, status: 'pending' as const };
        });
        replace(newClientStatuses);
      }
    };
    
    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{eventToEdit ? 'Editar' : 'Programar'} Facturación</DialogTitle>
                    <DialogDescription>
                        {date && `Para la fecha: ${format(date, 'd \'de\' MMMM, yyyy', { locale: es })}`}
                    </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                        <ClientMultiSelectDialog
                            options={[{value: 'TODOS (Cualquier Cliente)', label: 'TODOS (Cualquier Cliente)'}, ...clients.map(c => ({value: c.razonSocial, label: c.razonSocial}))]}
                            selected={watchedClients}
                            onChange={handleClientSelection}
                            placeholder="Seleccione clientes..."
                        />
                        <FormMessage>{form.formState.errors.clientStatuses?.message}</FormMessage>
                        
                        <ScrollArea className="h-60 border rounded-md p-4">
                            <div className="space-y-4">
                                {fields.length > 0 ? fields.map((field, index) => (
                                    <div key={field.id} className="flex items-center justify-between gap-4">
                                      <Label className="flex-1 truncate font-semibold" title={field.clientName}>
                                          {field.clientName === 'TODOS (Cualquier Cliente)' ? 'Todos los Clientes' : field.clientName}
                                      </Label>
                                      <FormField
                                        control={form.control}
                                        name={`clientStatuses.${index}.status`}
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormControl>
                                              <RadioGroup onValueChange={field.onChange} value={field.value} className="flex gap-2">
                                                {Object.entries(statusConfig).map(([key, { color, label }]) => (
                                                  <TooltipProvider key={key}>
                                                    <Tooltip>
                                                      <TooltipTrigger asChild>
                                                        <FormItem className="flex items-center">
                                                            <FormControl>
                                                              <RadioGroupItem value={key} className={cn('h-6 w-6 border-2', field.value === key && color)} />
                                                            </FormControl>
                                                        </FormItem>
                                                      </TooltipTrigger>
                                                      <TooltipContent><p>{label}</p></TooltipContent>
                                                    </Tooltip>
                                                  </TooltipProvider>
                                                ))}
                                              </RadioGroup>
                                            </FormControl>
                                          </FormItem>
                                        )}
                                      />
                                    </div>
                                )) : (
                                    <p className="text-center text-muted-foreground pt-20">Seleccione clientes para asignarles un estado.</p>
                                )}
                            </div>
                        </ScrollArea>
                        
                        <FormField
                            control={form.control}
                            name="note"
                            render={({ field }) => (
                                <FormItem>
                                <FormLabel>Nota Adicional</FormLabel>
                                <FormControl>
                                    <Textarea placeholder="Añadir una nota o descripción para este evento..." {...field} />
                                </FormControl>
                                <FormMessage />
                                </FormItem>
                            )}
                        />
                         <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Guardar Evento
                            </Button>
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
    if (selected.includes('TODOS (Cualquier Cliente)')) return "TODOS (Cualquier Cliente)";
    if (selected.length === options.length - 1) return "Todos los clientes seleccionados"; // -1 for 'TODOS'
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
                      className="flex items-center space-x-3 p-2 rounded-md hover:bg-accent"
                    >
                      <Checkbox
                        id={`client-ms-${option.value}`}
                        checked={selected.includes(option.value)}
                        onCheckedChange={() => handleSelect(option.value)}
                        disabled={selected.includes('TODOS (Cualquier Cliente)') && option.value !== 'TODOS (Cualquier Cliente)'}
                      />
                      <Label
                        htmlFor={`client-ms-${option.value}`}
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
