
"use client";

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';

import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { updatePerformanceStandard, type PerformanceStandardMap } from './actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Loader2, TrendingUp, Save, ShieldAlert } from 'lucide-react';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

const standardSchema = z.object({
  'recepcion-fijo': z.coerce.number().min(1, "Debe ser mayor a 0."),
  'recepcion-variable': z.coerce.number().min(1, "Debe ser mayor a 0."),
  'despacho-fijo': z.coerce.number().min(1, "Debe ser mayor a 0."),
  'despacho-variable': z.coerce.number().min(1, "Debe ser mayor a 0."),
});

type StandardFormValues = z.infer<typeof standardSchema>;

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

export default function StandardManagementComponent({ initialStandards }: { initialStandards: PerformanceStandardMap | null }) {
  const router = useRouter();
  const { toast } = useToast();
  const { permissions, loading: authLoading } = useAuth();
  
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<StandardFormValues>({
    resolver: zodResolver(standardSchema),
    defaultValues: {
      'recepcion-fijo': initialStandards?.['recepcion-fijo'] || 25,
      'recepcion-variable': initialStandards?.['recepcion-variable'] || 25,
      'despacho-fijo': initialStandards?.['despacho-fijo'] || 25,
      'despacho-variable': initialStandards?.['despacho-variable'] || 25,
    },
  });

  const onSubmit = async (data: StandardFormValues) => {
    setIsSubmitting(true);
    try {
      for (const [key, value] of Object.entries(data)) {
        await updatePerformanceStandard(key as keyof PerformanceStandardMap, value);
      }
      toast({ title: 'Éxito', description: 'Los estándares de rendimiento han sido actualizados.' });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Ocurrió un error inesperado.";
      toast({ variant: 'destructive', title: 'Error', description: msg });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading) {
      return (
           <div className="flex min-h-screen w-full items-center justify-center">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
           </div>
      )
  }

  if (!permissions.canManageArticles) { // Reuse permission for now
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
        <header className="mb-6 md:mb-8">
          <div className="relative flex items-center justify-center text-center">
            <Button variant="ghost" size="icon" className="absolute left-0 top-1/2 -translate-y-1/2" onClick={() => router.push('/')}>
              <ArrowLeft className="h-6 w-6" />
            </Button>
            <div>
              <div className="flex items-center justify-center gap-2">
                <TrendingUp className="h-7 w-7 md:h-8 md:w-8 text-primary" />
                <h1 className="text-xl md:text-2xl font-bold text-primary">Gestión de Estándares de Rendimiento</h1>
              </div>
              <p className="text-xs md:text-sm text-gray-500">Defina los minutos estándar por tonelada para cada tipo de operación de cuadrilla.</p>
            </div>
          </div>
        </header>

        <Card>
            <CardHeader>
                <CardTitle>Estándares de Operación</CardTitle>
                <CardDescription>Estos valores se usarán para calcular el indicador de rendimiento en el reporte de desempeño de cuadrilla.</CardDescription>
            </CardHeader>
            <CardContent>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-lg">Recepción</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                     <FormField
                                        control={form.control}
                                        name="recepcion-fijo"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Recepción Peso Fijo (min/ton)</FormLabel>
                                                <FormControl><Input type="number" {...field} /></FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="recepcion-variable"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Recepción Peso Variable (min/ton)</FormLabel>
                                                <FormControl><Input type="number" {...field} /></FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-lg">Despacho</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                     <FormField
                                        control={form.control}
                                        name="despacho-fijo"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Despacho Peso Fijo (min/ton)</FormLabel>
                                                <FormControl><Input type="number" {...field} /></FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="despacho-variable"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Despacho Peso Variable (min/ton)</FormLabel>
                                                <FormControl><Input type="number" {...field} /></FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </CardContent>
                            </Card>
                        </div>

                         <div className="flex justify-end">
                             <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                Guardar Estándares
                            </Button>
                         </div>
                    </form>
                </Form>
            </CardContent>
        </Card>

      </div>
    </div>
  );
}
