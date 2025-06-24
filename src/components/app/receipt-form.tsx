"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { CalendarIcon, PlusCircle, Sparkles, Loader2 } from "lucide-react";
import { suggestProducts } from "@/ai/flows/suggest-products";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { LogEntry, Receipt } from "@/lib/types";

const formSchema = z.object({
  date: z.date({
    required_error: "La fecha es obligatoria.",
  }),
  supplier: z.string().min(1, "El proveedor es obligatorio."),
  productCode: z.string().min(1, "El código de producto es obligatorio."),
  description: z.string().min(3, "La descripción debe tener al menos 3 caracteres."),
  quantity: z.coerce.number().int().positive("La cantidad debe ser un número positivo."),
});

type ReceiptFormProps = {
  onAddReceipt: (data: Omit<Receipt, "id" | "type">) => void;
  allEntries: LogEntry[];
};

export function ReceiptForm({ onAddReceipt, allEntries }: ReceiptFormProps) {
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      supplier: "",
      productCode: "",
      description: "",
      quantity: 1,
    },
  });

  const existingProducts = useMemo(() => {
    return [...new Set(allEntries.map((entry) => entry.productCode))];
  }, [allEntries]);
  
  const descriptionValue = form.watch("description");

  const fetchSuggestions = useCallback(async (desc: string) => {
    if (desc.length < 3) {
      setSuggestions([]);
      return;
    }
    setIsLoadingSuggestions(true);
    try {
      const result = await suggestProducts({
        description: desc,
        existingProducts: existingProducts,
      });
      setSuggestions(result);
    } catch (error) {
      console.error("Failed to fetch suggestions:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudieron obtener las sugerencias de IA.",
      });
    } finally {
      setIsLoadingSuggestions(false);
    }
  }, [existingProducts, toast]);

  useEffect(() => {
    const handler = setTimeout(() => {
      if (descriptionValue) {
        fetchSuggestions(descriptionValue);
      }
    }, 500); // 500ms debounce

    return () => {
      clearTimeout(handler);
    };
  }, [descriptionValue, fetchSuggestions]);

  function onSubmit(values: z.infer<typeof formSchema>) {
    onAddReceipt({
      ...values,
      date: values.date.toISOString(),
    });
    toast({
      title: "Éxito",
      description: "Recibo registrado correctamente.",
    });
    form.reset();
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <PlusCircle className="mr-2 h-4 w-4" />
          Registrar Recibo
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Registrar Nuevo Recibo</DialogTitle>
          <DialogDescription>
            Rellene los datos para registrar la entrada de un nuevo producto.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Fecha de Recibo</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant={"outline"}
                          className={cn(
                            "w-full pl-3 text-left font-normal",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          {field.value ? (
                            format(field.value, "PPP")
                          ) : (
                            <span>Seleccione una fecha</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        disabled={(date) =>
                          date > new Date() || date < new Date("1900-01-01")
                        }
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="supplier"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Proveedor</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: Acme Inc." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descripción de Producto</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: Tornillos de acero inoxidable" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
             {isLoadingSuggestions && <div className="flex items-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Buscando sugerencias...</div>}
             {suggestions.length > 0 && (
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Sparkles className="h-4 w-4 text-accent-foreground" />
                        <span>Sugerencias de IA:</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                    {suggestions.map((suggestion) => (
                        <Button
                        key={suggestion}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            form.setValue("productCode", suggestion, { shouldValidate: true });
                            setSuggestions([]);
                        }}
                        >
                        {suggestion}
                        </Button>
                    ))}
                    </div>
                </div>
            )}
            <FormField
              control={form.control}
              name="productCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Código de Producto</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: SKU-12345" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="quantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cantidad</FormLabel>
                  <FormControl>
                    <Input type="number" min="1" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end">
              <Button type="submit">Guardar Recibo</Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
