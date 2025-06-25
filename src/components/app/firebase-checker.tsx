"use client";

import { useEffect, useState } from 'react';
import { app } from '@/lib/firebase';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Terminal, CheckCircle2 } from 'lucide-react';

export function FirebaseChecker() {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      // A small delay to allow Firebase to initialize
      setTimeout(() => {
        const id = app.options.projectId;
        if (id) {
          setProjectId(id);
        } else {
          setError("El ID del proyecto de Firebase no se encontró. Revisa la configuración en tu archivo .env.");
        }
      }, 500);
    } catch (e: any) {
      setError(`Error al inicializar Firebase: ${e.message}. Asegúrate de que las variables de entorno estén configuradas correctamente.`);
    }
  }, []);

  if (error) {
    return (
      <Alert variant="destructive" className="mt-4">
        <Terminal className="h-4 w-4" />
        <AlertTitle>Error de Configuración de Firebase</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (projectId) {
    return (
      <Alert variant="default" className="mt-4 border-green-500 bg-green-50 text-green-800 [&>svg]:text-green-600">
         <CheckCircle2 className="h-4 w-4" />
        <AlertTitle>¡Conexión Exitosa!</AlertTitle>
        <AlertDescription>
          Tu aplicación está conectada al proyecto de Firebase: <span className="font-bold">{projectId}</span>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert className="mt-4">
      <Terminal className="h-4 w-4" />
      <AlertTitle>Verificando Conexión...</AlertTitle>
      <AlertDescription>
        Intentando conectar con Firebase.
      </AlertDescription>
    </Alert>
  );
}
