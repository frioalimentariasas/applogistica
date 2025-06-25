
"use client";

import { useEffect, useState } from 'react';
import { app } from '@/lib/firebase';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Terminal, CheckCircle2, AlertTriangle } from 'lucide-react';

export function FirebaseChecker() {
  const [status, setStatus] = useState<"checking" | "success" | "error" | "unconfigured">("checking");
  const [projectId, setProjectId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
        if (app) {
            try {
                const id = app.options.projectId;
                if (id) {
                    setProjectId(id);
                    setStatus("success");
                } else {
                    setStatus("error");
                }
            } catch (e: any) {
                console.error("Firebase Checker Error:", e);
                setStatus("error");
            }
        } else {
            setStatus("unconfigured");
        }
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  if (status === "unconfigured") {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Firebase no está configurado</AlertTitle>
        <AlertDescription>
          Tu aplicación no está conectada a Firebase. Por favor, completa la configuración en tu archivo <strong>.env</strong> para continuar.
        </AlertDescription>
      </Alert>
    );
  }
  
  if (status === "error") {
    return (
      <Alert variant="destructive">
        <Terminal className="h-4 w-4" />
        <AlertTitle>Error de Configuración de Firebase</AlertTitle>
        <AlertDescription>
          Ocurrió un error al intentar conectar con Firebase. Revisa la consola para más detalles y asegúrate de que las variables de entorno son correctas.
        </AlertDescription>
      </Alert>
    );
  }

  if (status === "success" && projectId) {
    return (
      <Alert variant="default" className="border-green-500 bg-green-50 text-green-800 [&>svg]:text-green-600">
         <CheckCircle2 className="h-4 w-4" />
        <AlertTitle>¡Conexión Exitosa!</AlertTitle>
        <AlertDescription>
          Tu aplicación está conectada al proyecto de Firebase: <span className="font-bold">{projectId}</span>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert>
      <Terminal className="h-4 w-4" />
      <AlertTitle>Verificando Conexión...</AlertTitle>
      <AlertDescription>
        Intentando conectar con Firebase.
      </AlertDescription>
    </Alert>
  );
}
