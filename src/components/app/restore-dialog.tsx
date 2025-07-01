"use client"

import * as React from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button, buttonVariants } from "@/components/ui/button"

interface RestoreDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRestore: () => void;
  onDiscard: () => void;
}

export function RestoreDialog({ open, onOpenChange, onRestore, onDiscard }: RestoreDialogProps) {
  const [isConfirmingDiscard, setIsConfirmingDiscard] = React.useState(false);

  // When closing the dialog, always reset the confirmation state
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setIsConfirmingDiscard(false);
    }
    onOpenChange(isOpen);
  };

  const handleFinalDiscard = () => {
    onDiscard();
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        {!isConfirmingDiscard ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Restaurar Formato Incompleto</AlertDialogTitle>
              <AlertDialogDescription>
                Hemos encontrado datos de un formato que estaba siendo diligenciado. 
                ¿Desea restaurar estos datos o descartar el borrador y empezar de nuevo?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <Button variant="outline" onClick={() => setIsConfirmingDiscard(true)}>Descartar y Empezar de Nuevo</Button>
              <AlertDialogAction onClick={onRestore}>Restaurar Datos</AlertDialogAction>
            </AlertDialogFooter>
          </>
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Está absolutamente seguro?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acción es permanente y eliminará el borrador del formato. Perderá todos los datos que no hayan sido guardados.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <Button variant="outline" onClick={() => setIsConfirmingDiscard(false)}>Cancelar</Button>
              <AlertDialogAction onClick={handleFinalDiscard} className={buttonVariants({ variant: "destructive" })}>
                Sí, Descartar
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
