
"use client";

import { useState } from 'react';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { addArticle } from './actions';
import { getArticulosByClient, ArticuloInfo } from '@/app/actions/articulos';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Loader2, Box, PlusCircle, Search } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const articleSchema = z.object({
  razonSocial: z.string().min(1, { message: 'Debe seleccionar un cliente.' }),
  codigoProducto: z.string().min(1, { message: 'El código es obligatorio.' }),
  denominacionArticulo: z.string().min(3, { message: 'La descripción es obligatoria.' }),
});

type ArticleFormValues = z.infer<typeof articleSchema>;

interface ArticleManagementComponentProps {
  clients: string[];
}

export default function ArticleManagementComponent({ clients }: ArticleManagementComponentProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedClient, setSelectedClient] = useState('');
  const [articles, setArticles] = useState<ArticuloInfo[]>([]);
  const [isLoadingArticles, setIsLoadingArticles] = useState(false);

  const form = useForm<ArticleFormValues>({
    resolver: zodResolver(articleSchema),
    defaultValues: {
      razonSocial: '',
      codigoProducto: '',
      denominacionArticulo: '',
    },
  });

  const onSubmit: SubmitHandler<ArticleFormValues> = async (data) => {
    setIsSubmitting(true);
    const result = await addArticle(data);
    if (result.success) {
      toast({ title: 'Éxito', description: result.message });
      form.reset();
      // If the new article belongs to the currently viewed client, refresh the list
      if (data.razonSocial === selectedClient) {
        handleClientSelect(data.razonSocial);
      }
    } else {
      toast({ variant: 'destructive', title: 'Error', description: result.message });
    }
    setIsSubmitting(false);
  };

  const handleClientSelect = async (clientName: string) => {
    setSelectedClient(clientName);
    if (clientName) {
      setIsLoadingArticles(true);
      const fetchedArticles = await getArticulosByClient(clientName);
      setArticles(fetchedArticles);
      setIsLoadingArticles(false);
    } else {
      setArticles([]);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8">
          <div className="relative flex items-center justify-center text-center">
            <Button variant="ghost" size="icon" className="absolute left-0 top-1/2 -translate-y-1/2" onClick={() => router.push('/')}>
              <ArrowLeft className="h-6 w-6" />
            </Button>
            <div>
              <div className="flex items-center justify-center gap-2">
                <Box className="h-8 w-8 text-primary" />
                <h1 className="text-2xl font-bold text-primary">Gestión de Artículos</h1>
              </div>
              <p className="text-sm text-gray-500">Agregue nuevos artículos y asócielos a un cliente.</p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><PlusCircle /> Agregar Nuevo Artículo</CardTitle>
                <CardDescription>Complete el formulario para añadir un nuevo artículo a un cliente.</CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="razonSocial"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Cliente</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Seleccione un cliente" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {clients.map(client => (
                                <SelectItem key={client} value={client}>{client}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="codigoProducto"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Código del Producto</FormLabel>
                          <FormControl><Input placeholder="Colocar Cod. Externo de SISLOG" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="denominacionArticulo"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Descripción del Artículo</FormLabel>
                          <FormControl><Input placeholder="Colocar Nombre Completo Propietario SISLOG" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button type="submit" disabled={isSubmitting} className="w-full">
                      {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                      Agregar Artículo
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </div>
          
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Consultar Artículos por Cliente</CardTitle>
                <CardDescription>Seleccione un cliente para ver sus artículos asociados.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-4 mb-4">
                    <Select onValueChange={handleClientSelect} value={selectedClient}>
                        <SelectTrigger className="w-full">
                            <SelectValue placeholder="Seleccione un cliente para consultar..." />
                        </SelectTrigger>
                        <SelectContent>
                            {clients.map(client => (
                            <SelectItem key={client} value={client}>{client}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <ScrollArea className="h-96">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Código</TableHead>
                        <TableHead>Descripción del Artículo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoadingArticles ? (
                        <TableRow>
                          <TableCell colSpan={2} className="h-24 text-center">
                            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                            <p className="text-muted-foreground">Buscando artículos...</p>
                          </TableCell>
                        </TableRow>
                      ) : articles.length > 0 ? (
                        articles.map((article) => (
                          <TableRow key={article.codigoProducto}>
                            <TableCell className="font-mono">{article.codigoProducto}</TableCell>
                            <TableCell>{article.denominacionArticulo}</TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={2} className="h-24 text-center text-muted-foreground">
                            {selectedClient ? "Este cliente no tiene artículos registrados." : "Seleccione un cliente para ver sus artículos."}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
