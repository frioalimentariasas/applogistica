
"use client";

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { uploadArticulos } from './actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Loader2, FileUp, Box } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Cargando...
        </>
      ) : (
        <>
          <FileUp className="mr-2 h-4 w-4" />
          Cargar y Procesar Archivo
        </>
      )}
    </Button>
  );
}

export default function UploaderForm() {
    const router = useRouter();
    const { toast } = useToast();
    const [fileName, setFileName] = useState('');
    const [formError, setFormError] = useState<string | null>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setFileName(file.name);
            setFormError(null);
        } else {
            setFileName('');
        }
    };
    
    async function handleFormAction(formData: FormData) {
        const file = formData.get('file') as File;
        if (!file || file.size === 0) {
            setFormError('Por favor, seleccione un archivo para cargar.');
            return;
        }

        const result = await uploadArticulos(formData);

        if (result.success) {
            toast({
                title: "¡Éxito!",
                description: result.message,
            });
            setFileName('');
            const form = document.getElementById('upload-form') as HTMLFormElement;
            form?.reset();
        } else {
            toast({
                variant: "destructive",
                title: "Error en la Carga",
                description: result.message,
            });
        }
    }

    return (
        <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
            <div className="max-w-2xl mx-auto">
                <header className="mb-6 md:mb-8">
                    <div className="relative flex items-center justify-center text-center">
                         <Button 
                            variant="ghost" 
                            size="icon" 
                            className="absolute left-0 top-1/2 -translate-y-1/2" 
                            onClick={() => router.push('/')}
                            aria-label="Volver a la página principal"
                        >
                            <ArrowLeft className="h-6 w-6" />
                        </Button>
                        <div>
                            <div className="flex items-center justify-center gap-2">
                                <Box className="h-7 w-7 md:h-8 md:w-8 text-primary" />
                                <h1 className="text-xl md:text-2xl font-bold text-primary">Cargar Artículos desde Excel</h1>
                            </div>
                             <p className="text-xs md:text-sm text-gray-500">Cargue un archivo .xlsx o .xls con los datos de los artículos.</p>
                        </div>
                    </div>
                </header>
                
                <Alert className="mb-6 border-blue-500 bg-blue-50 text-blue-800 [&>svg]:text-blue-600">
                    <AlertTitle className="text-blue-700">¡Atención!</AlertTitle>
                    <AlertDescription>
                        El archivo Excel debe tener las columnas: <strong>Razón Social</strong>, <strong>Codigo Producto</strong>, <strong>Denominación articulo</strong> y <strong>Sesion</strong>. La carga actualizará los artículos existentes y agregará los nuevos.
                    </AlertDescription>
                </Alert>

                <Card>
                    <CardHeader>
                        <CardTitle>Seleccionar Archivo</CardTitle>
                        <CardDescription>Elija el archivo Excel que desea importar. El sistema lo procesará y cargará los datos a la colección "articulos" en su base de datos de Firestore.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form id="upload-form" action={handleFormAction} className="space-y-6">
                            <div className="space-y-2">
                                <Label htmlFor="file-upload">Archivo Excel</Label>
                                <Input 
                                    id="file-upload" 
                                    name="file" 
                                    type="file" 
                                    required 
                                    accept=".xlsx, .xls"
                                    onChange={handleFileChange}
                                    className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                                />
                                {fileName && <p className="text-sm text-muted-foreground">Archivo seleccionado: {fileName}</p>}
                                {formError && <p className="text-sm font-medium text-destructive">{formError}</p>}
                            </div>
                            <SubmitButton />
                        </form>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
