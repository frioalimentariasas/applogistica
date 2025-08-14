
"use client";

import { useState } from 'react';
import { UseFormReturn } from 'react-hook-form';
import { getArticulosByClients, type ArticuloInfo } from '@/app/actions/articulos';
import { useToast } from './use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Loader2 } from 'lucide-react';

interface UseClientChangeHandlerProps<T> {
  form: UseFormReturn<any>;
  setArticulos: (articulos: ArticuloInfo[]) => void;
}

export function useClientChangeHandler<T>({ form, setArticulos }: UseClientChangeHandlerProps<T>) {
  const { toast } = useToast();
  const [isVerifying, setIsVerifying] = useState(false);
  const [isConfirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [newClientToSet, setNewClientToSet] = useState<string | null>(null);

  const handleClientChange = async (newClient: string) => {
    setIsVerifying(true);
    
    const formData = form.getValues();
    
    // Determine the correct field names for products and client
    const productListName = formData.productos ? 'productos' : 
                          (formData.destinos ? 'destinos' : 'items');
    const clientFieldName = formData.nombreCliente !== undefined ? 'nombreCliente' : 'cliente';

    const isDespachoPorDestino = productListName === 'destinos';
    const formProducts = formData[productListName];

    if (!formProducts || formProducts.length === 0 || formProducts.every((p:any) => !p.descripcion && (!p.items || p.items.length === 0))) {
        form.setValue(clientFieldName, newClient);
        setNewClientToSet(null);
        setArticulos([]);
        setIsVerifying(false);
        return;
    }
    
    const flatProductList = isDespachoPorDestino 
        ? formProducts.flatMap((d: any) => d.items || []) 
        : formProducts;

    try {
      const newClientArticulos = await getArticulosByClients([newClient]);
      
      const allProductsExist = flatProductList.every((formProduct: any) => 
        newClientArticulos.some(newArticulo => 
          newArticulo.codigoProducto === formProduct.codigo &&
          newArticulo.denominacionArticulo === formProduct.descripcion
        )
      );

      if (allProductsExist) {
        form.setValue(clientFieldName, newClient);
        setArticulos(newClientArticulos); // Update the available articles list
      } else {
        setNewClientToSet(newClient);
        setConfirmDialogOpen(true);
      }

    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo verificar la lista de productos del nuevo cliente.' });
    } finally {
      setIsVerifying(false);
    }
  };

  const onConfirmChange = async () => {
    if (newClientToSet) {
      const formData = form.getValues();
      const productListName = formData.productos ? 'productos' : 
                            (formData.destinos ? 'destinos' : 'items');
      const clientFieldName = formData.nombreCliente !== undefined ? 'nombreCliente' : 'cliente';

      form.setValue(clientFieldName, newClientToSet);
      form.setValue(productListName, []); // Clear products
      
      setIsVerifying(true);
      try {
        const newClientArticulos = await getArticulosByClients([newClientToSet]);
        setArticulos(newClientArticulos);
      } catch (e) {
        setArticulos([]);
      } finally {
        setIsVerifying(false);
      }
      
      setConfirmDialogOpen(false);
      setNewClientToSet(null);
    }
  };

  const onCancelChange = () => {
    setConfirmDialogOpen(false);
    setNewClientToSet(null);
  };

  const ClientChangeDialog = (
    <AlertDialog open={isConfirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>¿Confirmar cambio de cliente?</AlertDialogTitle>
                <AlertDialogDescription>
                    El nuevo cliente seleccionado no tiene todos los productos de este formato. Si continúa, <strong>la lista de productos actual se borrará</strong>. ¿Desea continuar?
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel onClick={onCancelChange}>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={onConfirmChange} className="bg-destructive hover:bg-destructive/90">
                    Sí, Continuar
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
  );

  const VerifyingClientSpinner = isVerifying ? (
    <div className="absolute inset-0 bg-white/70 flex items-center justify-center z-10">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="ml-2">Verificando...</span>
    </div>
  ) : null;

  return {
    handleClientChange,
    ClientChangeDialog,
    VerifyingClientSpinner,
    isVerifying,
  };
}
