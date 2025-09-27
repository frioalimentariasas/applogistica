"use client";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";

interface IndexCreationDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  errorMessage: string;
}

export function IndexCreationDialog({ isOpen, onOpenChange, errorMessage }: IndexCreationDialogProps) {
  // Extract the URL from the error message
  const urlMatch = errorMessage.match(/(https?:\/\/[^\s]+)/);
  const firestoreIndexUrl = urlMatch ? urlMatch[0] : null;

  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-destructive" />
            Error de Base de Datos
          </AlertDialogTitle>
          <AlertDialogDescription>
            La consulta actual requiere un índice compuesto en Firestore que no existe. Para solucionar este problema, debe crear el índice manualmente.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Alert variant="destructive">
            <AlertTitle>Acción Requerida</AlertTitle>
            <AlertDescription>
            {firestoreIndexUrl ? (
                <>
                Haga clic en el siguiente enlace para ir a la consola de Firebase y crear el índice que falta. Una vez creado, puede tardar unos minutos en activarse.
                <Button 
                    asChild 
                    variant="outline" 
                    className="w-full mt-4"
                    onClick={() => onOpenChange(false)}
                >
                    <a href={firestoreIndexUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Crear Índice en Firebase
                    </a>
                </Button>
                </>
            ) : (
                'No se pudo extraer el enlace para crear el índice. Por favor, revise el error completo en la consola del servidor para obtener el enlace.'
            )}
            </AlertDescription>
        </Alert>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => onOpenChange(false)}>Cerrar</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
