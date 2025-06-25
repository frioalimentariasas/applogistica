
"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Snowflake, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { useToast } from "@/hooks/use-toast";

const Logo = () => (
    <div className="flex flex-col items-center justify-center text-center">
      <div className="flex items-center space-x-2">
        <Snowflake className="h-20 w-20 text-cyan-500" />
        <span className="text-7xl font-bold text-blue-800">frio</span>
      </div>
      <span className="text-4xl font-light text-cyan-500 tracking-widest -mt-2">alimentaria</span>
      <span className="text-xs text-gray-500 mt-1">logística en alimentos congelados</span>
    </div>
  );


export default function Home() {
  const [operationType, setOperationType] = useState<string>();
  const [productType, setProductType] = useState<string>();
  const router = useRouter();
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!operationType || !productType) {
        toast({
            title: "Selección incompleta",
            description: "Por favor, seleccione un tipo de operación y un tipo de producto.",
            variant: "destructive"
        });
        return;
    }

    if (productType === 'fijo') {
      router.push(`/fixed-weight-form?operation=${operationType}`);
      return;
    }

    if (productType === 'variable') {
      if (operationType === 'despacho') {
        router.push(`/variable-weight-form?operation=${operationType}`);
        return;
      }
    }
    
    // Fallback for any unhandled combination
    toast({
      title: "En desarrollo",
      description: "Este formato aún no está disponible.",
      variant: "destructive"
    });
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-white p-4">
      <div className="w-full max-w-xl space-y-8">
        <Logo />

        <div className="text-center">
          <h2 className="text-xl font-bold uppercase text-[#3588CC]">
            FORMATO DE RECIBOS Y DESPACHOS
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Seleccione las opciones para generar el formato correspondiente o consulte los formatos guardados.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <fieldset>
            <legend className="text-base font-semibold text-gray-900 mb-4">Tipo de Operación</legend>
            <RadioGroup value={operationType} onValueChange={setOperationType} className="grid grid-cols-2 gap-4">
                <Label htmlFor="recepcion" className={`flex cursor-pointer items-center space-x-3 rounded-md border bg-white p-4 transition-colors ${operationType === 'recepcion' ? 'border-primary ring-2 ring-primary' : 'border-gray-200'}`}>
                    <RadioGroupItem value="recepcion" id="recepcion" />
                    <span className="font-medium">Recepción</span>
                </Label>
                <Label htmlFor="despacho" className={`flex cursor-pointer items-center space-x-3 rounded-md border bg-white p-4 transition-colors ${operationType === 'despacho' ? 'border-primary ring-2 ring-primary' : 'border-gray-200'}`}>
                    <RadioGroupItem value="despacho" id="despacho" />
                    <span className="font-medium">Despacho</span>
                </Label>
            </RadioGroup>
          </fieldset>
          
          <fieldset>
            <legend className="text-base font-semibold text-gray-900 mb-4">Tipo de Producto</legend>
            <RadioGroup value={productType} onValueChange={setProductType} className="grid grid-cols-2 gap-4">
                <Label htmlFor="fijo" className={`flex cursor-pointer items-center space-x-3 rounded-md border bg-white p-4 transition-colors ${productType === 'fijo' ? 'border-primary ring-2 ring-primary' : 'border-gray-200'}`}>
                    <RadioGroupItem value="fijo" id="fijo" />
                    <span className="font-medium">Peso Fijo</span>
                </Label>
                <Label htmlFor="variable" className={`flex cursor-pointer items-center space-x-3 rounded-md border bg-white p-4 transition-colors ${productType === 'variable' ? 'border-primary ring-2 ring-primary' : 'border-gray-200'}`}>
                    <RadioGroupItem value="variable" id="variable" />
                    <span className="font-medium">Peso Variable</span>
                </Label>
            </RadioGroup>
          </fieldset>

          <Button type="submit" size="lg" className="w-full h-12 text-base" disabled={!operationType || !productType}>
            <FileText className="mr-2 h-5 w-5" />
            Generar Formato
          </Button>
        </form>
      </div>
    </div>
  );
}
