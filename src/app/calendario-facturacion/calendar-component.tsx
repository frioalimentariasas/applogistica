
"use client";

import * as React from 'react';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { DayPicker, type DateRange } from 'react-day-picker';
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';

import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { getBillingEvents, saveBillingEvent, deleteBillingEvent, type BillingEvent } from './actions';
import type { ClientInfo } from '@/app/actions/clients';
import { colombianHolidays } from '@/lib/holidays';

import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandList,
  CommandItem,
} from "@/components/ui/command";
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
import { ArrowLeft, Loader2, Calendar as CalendarIcon, Plus, Edit, Trash2, Home, ChevronsLeft, ChevronLeft, ChevronsRight, ChevronRight, CheckCircle, Clock, CircleAlert, Dot, ChevronsUpDown, Check } from 'lucide-react';
import { IndexCreationDialog } from '@/components/app/index-creation-dialog';
import { cn } from '@/lib/utils';


const eventSchema = z.object({
  clients: z.array(z.string()).min(1, 'Debe seleccionar al menos un cliente.'),
  note: z.string().max(300, 'La nota no puede exceder los 300 caracteres.').optional(),
  status: z.enum(['pending', 'in_progress', 'completed'], { required_error: 'Debe seleccionar un estado.' }),
});

type EventFormValues = z.infer<typeof eventSchema>;

const statusConfig = {
  pending: { label: 'Pendiente', color: 'bg-yellow-400', textColor: 'text-yellow-900', borderColor: 'border-yellow-500', icon: Clock },
  in_progress: { label: 'En Proceso', color: 'bg-blue-400', textColor: 'text-blue-900', borderColor: 'border-blue-500', icon: Loader2 },
  completed: { label: 'Facturado', color: 'bg-green-400', textColor: 'text-green-900', borderColor: 'border-green-500', icon: CheckCircle },
};

export default function CalendarComponent({ clients }: { clients: ClientInfo[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useAuth();
  
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [events, setEvents] = useState<BillingEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [isEventDialogOpen, setIsEventDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [eventToEdit, setEventToEdit] = useState<BillingEvent | null>(null);

  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [eventToDelete, setEventToDelete] = useState<string | null>(null);

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
      const fetchedEvents = await getBillingEvents(format(start, 'yyyy-MM-dd'), format(end, 'yyyy-MM-dd'));
      setEvents(fetchedEvents);
    } catch (error: any) {
        if (typeof error.message === 'string' && (error.message.includes('requires an index') || error.message.includes('needs an index'))) {
            setIndexErrorMessage(error.message);
            setIsIndexErrorOpen(true);
        } else {
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar los eventos del calendario.' });
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

    const result = await deleteBillingEvent(eventToDelete);
    if (result.success) {
      toast({ title: 'Éxito', description: result.message });
      setEvents(prev => prev.filter(e => e.id !== eventToDelete));
    } else {
      toast({ variant: 'destructive', title: 'Error', description: result.message });
    }
    setIsConfirmDeleteOpen(false);
    setEventToDelete(null);
  };
  
  const DayContent = ({ date, displayMonth }: { date: Date; displayMonth: Date, activeModifiers: {} }) => {
    const dayEvents = events.filter(e => e.date === format(date, 'yyyy-MM-dd'));
    
    return (
        <div className="relative h-full" onClick={() => openEventDialog(date)}>
            <time dateTime={date.toISOString()}>{format(date, 'd')}</time>
            <div className="absolute bottom-1 left-1 right-1 flex flex-wrap justify-center gap-1">
                {dayEvents.slice(0, 3).map(event => {
                    const statusInfo = statusConfig[event.status];
                    return (
                        <span key={event.id} title={event.note || statusInfo.label} className={`block h-2 w-2 rounded-full ${statusInfo.color}`}></span>
                    );
                })}
            </div>
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
            </div>
        </header>
        
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <h2 className="text-xl font-semibold">{format(currentMonth, 'MMMM yyyy', { locale: es })}</h2>
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
                            components={{
                                Day: (props) => <DayContent {...props} />,
                            }}
                            modifiers={{
                              holiday: colombianHolidays,
                              sunday: { dayOfWeek: [0] },
                            }}
                            classNames={{
                                table: "w-full border-collapse",
                                head_cell: "w-[14.2%] text-sm font-medium text-muted-foreground pb-2",
                                row: "w-full",
                                cell: "h-32 p-1 border text-sm text-left align-top relative hover:bg-accent/50 cursor-pointer",
                                day_today: "bg-accent text-accent-foreground",
                                day_outside: "text-muted-foreground opacity-50",
                                day_holiday: "bg-red-100/80 text-red-900 dark:bg-red-900/30 dark:text-red-300",
                                day_sunday: "bg-red-100/80 text-red-900 dark:bg-red-900/30 dark:text-red-300",
                            }}
                        />
                    ) : (
                        <div className="h-[498px] flex items-center justify-center">
                            <Loader2 className="h-8 w-8 animate-spin" />
                        </div>
                    )}
                </div>
                 <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
                    {Object.entries(statusConfig).map(([key, { label, color, textColor }]) => (
                        <div key={key} className="flex items-center gap-2">
                            <span className={`block h-3 w-3 rounded-full ${color}`}></span>
                            <span className="text-xs font-medium">{label}</span>
                        </div>
                    ))}
                    <div className="flex items-center gap-2">
                      <span className="block h-3 w-3 rounded-full bg-red-100 border border-red-300"></span>
                      <span className="text-xs font-medium">Domingo / Festivo</span>
                    </div>
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
            onDelete={() => {
                if (eventToEdit) {
                    setIsEventDialogOpen(false);
                    setEventToDelete(eventToEdit.id);
                    setIsConfirmDeleteOpen(true);
                }
            }}
        />

        <AlertDialog open={isConfirmDeleteOpen} onOpenChange={setIsConfirmDeleteOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>¿Está seguro?</AlertDialogTitle>
                    <AlertDialogDescription>Esta acción eliminará el evento de facturación permanentemente. No se puede deshacer.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteConfirm} className={buttonVariants({ variant: 'destructive' })}>
                        Eliminar
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
    onDelete: () => void,
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
                                    {Object.entries(statusConfig).map(([key, { label, color, icon: Icon }]) => (
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
                                    <Button type="button" variant="destructive" onClick={onDelete}>
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

  const filteredOptions = React.useMemo(() => {
    if (!search) return options;
    return options.filter((o) =>
      o.label.toLowerCase().includes(search.toLowerCase())
    );
  }, [search, options]);

  const handleSelect = (valueToToggle: string) => {
    const newSelection = selected.includes(valueToToggle)
      ? selected.filter(s => s !== valueToToggle)
      : [...selected, valueToToggle];
    onChange(newSelection);
  };
  
  const handleSelectAll = (isChecked: boolean) => {
    onChange(isChecked ? options.map(o => o.value) : []);
  };

  const getButtonLabel = () => {
    if (selected.length === 0) return placeholder;
    if (selected.length === 1) return selected[0];
    if (selected.length === options.length) return "Todos los clientes seleccionados";
    return `${selected.length} clientes seleccionados`;
  };
  
  const isAllSelected = selected.length === options.length;

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
            <Command>
              <CommandInput
                placeholder="Buscar cliente..."
                value={search}
                onValueChange={setSearch}
              />
              <CommandList>
                <CommandEmpty>No se encontraron clientes.</CommandEmpty>
                <CommandGroup>
                  <CommandItem onSelect={() => handleSelectAll(!isAllSelected)} className="font-semibold">
                    <Check className={cn("mr-2 h-4 w-4", isAllSelected ? "opacity-100" : "opacity-0")} />
                    Seleccionar Todos
                  </CommandItem>
                  <ScrollArea className="h-60">
                    {filteredOptions.map((option) => (
                      <CommandItem
                        key={option.value}
                        onSelect={() => handleSelect(option.value)}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            selected.includes(option.value)
                              ? "opacity-100"
                              : "opacity-0"
                          )}
                        />
                        {option.label}
                      </CommandItem>
                    ))}
                  </ScrollArea>
                </CommandGroup>
              </CommandList>
            </Command>
        </div>
        <DialogFooter className="p-6 pt-0">
            <Button onClick={() => setOpen(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
