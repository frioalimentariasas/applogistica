
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
    const clientFieldName = formData.nombreCliente !== undefined ? 'nombreCliente' : 'cliente';
    const isDespachoPorDestino = formData.despachoPorDestino === true;
    
    let productListName;
    if (formData.productos) productListName = 'productos';
    else if (isDespachoPorDestino) productListName = 'destinos';
    else productListName = 'items';

    const formProducts = formData[productListName];
    const flatProductList = (isDespachoPorDestino 
        ? formProducts?.flatMap((d: any) => d.items || []) 
        : formProducts) || [];

    // If there are no products in the form, just change the client and update the articles list
    if (flatProductList.length === 0 || flatProductList.every((p: any) => !p.descripcion)) {
        form.setValue(clientFieldName, newClient);
        setNewClientToSet(null);
        try {
            const newClientArticulos = await getArticulosByClients([newClient]);
            setArticulos(newClientArticulos); 
        } catch (e) {
            setArticulos([]);
        } finally {
             setIsVerifying(false);
        }
        return; 
    }
    
    // If there are products, perform validation
    try {
      const newClientArticulos = await getArticulosByClients([newClient]);
      
      let allProductsExistInNewClient = true;
      if (flatProductList.length > 0) {
        for (const formProduct of flatProductList) {
          if (!formProduct.codigo || !formProduct.descripcion) continue;

          const productExists = newClientArticulos.some(newArticulo => 
            newArticulo.codigoProducto.trim() === formProduct.codigo.trim() &&
            newArticulo.denominacionArticulo.trim() === formProduct.descripcion.trim()
          );

          if (!productExists) {
            allProductsExistInNewClient = false;
            break; 
          }
        }
      }

      if (allProductsExistInNewClient) {
        form.setValue(clientFieldName, newClient);
        setArticulos(newClientArticulos); // This is the crucial update
        setNewClientToSet(null);
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
      const clientFieldName = formData.nombreCliente !== undefined ? 'nombreCliente' : 'cliente';
      const isDespachoPorDestino = formData.despachoPorDestino === true;
      const productListName = formData.productos ? 'productos' : (isDespachoPorDestino ? 'destinos' : 'items');

      form.setValue(clientFieldName, newClientToSet);
      form.setValue(productListName, []); // Clear the product list
      
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
