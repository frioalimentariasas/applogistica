import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface RestoreDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRestore: () => void;
  onDiscard: () => void;
}

export function RestoreDialog({ open, onOpenChange, onRestore, onDiscard }: RestoreDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Restaurar Formato Incompleto</AlertDialogTitle>
          <AlertDialogDescription>
            Hemos encontrado datos de un formato que estaba siendo diligenciado. ¿Desea restaurar estos datos o empezar de nuevo? Descartar eliminará los datos en progreso. Los archivos adjuntos también se restaurarán.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onDiscard}>Descartar y Empezar de Nuevo</AlertDialogCancel>
          <AlertDialogAction onClick={onRestore}>Restaurar Datos</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
