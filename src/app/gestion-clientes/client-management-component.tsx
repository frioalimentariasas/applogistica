
"use client";

import { useState } from 'react';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { addClient } from './actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Loader2, Users2, UserPlus } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

const clientSchema = z.object({
  razonSocial: z.string().min(3, { message: 'El nombre debe tener al menos 3 caracteres.' }),
});

type ClientFormValues = z.infer<typeof clientSchema>;

interface ClientManagementComponentProps {
  initialClients: string[];
}

export default function ClientManagementComponent({ initialClients }: ClientManagementComponentProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [clients, setClients] = useState(initialClients);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const form = useForm<ClientFormValues>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      razonSocial: '',
    },
  });

  const onSubmit: SubmitHandler<ClientFormValues> = async (data) => {
    setIsSubmitting(true);
    const result = await addClient(data.razonSocial);
    if (result.success) {
      toast({ title: 'Éxito', description: result.message });
      setClients(prev => [...prev, data.razonSocial].sort((a, b) => a.localeCompare(b)));
      form.reset();
    } else {
      toast({ variant: 'destructive', title: 'Error', description: result.message });
    }
    setIsSubmitting(false);
  };

  const filteredClients = clients.filter(client => 
    client.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8">
          <div className="relative flex items-center justify-center text-center">
            <Button variant="ghost" size="icon" className="absolute left-0 top-1/2 -translate-y-1/2" onClick={() => router.push('/')}>
              <ArrowLeft className="h-6 w-6" />
            </Button>
            <div>
              <div className="flex items-center justify-center gap-2">
                <Users2 className="h-8 w-8 text-primary" />
                <h1 className="text-2xl font-bold text-primary">Gestión de Clientes</h1>
              </div>
              <p className="text-sm text-gray-500">Agregue nuevos clientes o consulte los existentes.</p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><UserPlus />Agregar Nuevo Cliente</CardTitle>
              <CardDescription>Ingrese la razón social para crear un nuevo cliente.</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="razonSocial"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Razón Social</FormLabel>
                        <FormControl>
                          <Input placeholder="Colocar nombre Propietario SISLOG" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" disabled={isSubmitting} className="w-full">
                    {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                    Agregar Cliente
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Listado de Clientes</CardTitle>
               <CardDescription>Clientes actualmente registrados en el sistema.</CardDescription>
            </CardHeader>
            <CardContent>
               <Input 
                placeholder="Buscar cliente..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="mb-4"
              />
              <ScrollArea className="h-72">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Razón Social</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredClients.length > 0 ? (
                      filteredClients.map((client, index) => (
                        <TableRow key={index}>
                          <TableCell>{client}</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell className="text-center text-muted-foreground">
                          {clients.length === 0 ? "No hay clientes registrados." : "No se encontraron clientes."}
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
  );
}
