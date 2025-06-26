
import { Suspense } from 'react';
import { getSubmissionById } from '@/app/actions/consultar-formatos';
import ReportComponent from './report-component';
import { notFound } from 'next/navigation';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default async function ReportPage({ params }: { params: { id: string } }) {
  if (!params.id) {
    notFound();
  }
  
  const submission = await getSubmissionById(params.id);

  if (!submission) {
    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
            <div className="w-full max-w-lg text-center">
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Formulario no encontrado</AlertTitle>
                    <AlertDescription>
                        No se pudo encontrar el formulario con el ID proporcionado. Puede que haya sido eliminado o el enlace sea incorrecto.
                    </AlertDescription>
                </Alert>
                <Button asChild className="mt-4">
                    <Link href="/consultar-formatos">Volver a la búsqueda</Link>
                </Button>
            </div>
        </div>
    );
  }

  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center">Cargando reporte...</div>}>
      <ReportComponent submission={submission} />
    </Suspense>
  );
}
