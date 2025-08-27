
"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { FileText, LogOut, Users2, Box, ScrollText, BookCopy, ShieldCheck, Settings, Timer, ArrowRight, ArrowDownCircle, ArrowUpCircle, Boxes, ClipboardList, Users, TrendingUp, DollarSign, ListTodo, FileSpreadsheet, ListPlus, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { useToast } from "@/hooks/use-toast";
import { FirebaseChecker } from '@/components/app/firebase-checker';
import { useAuth, type AppPermissions } from '@/hooks/use-auth';
import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import { cn } from '@/lib/utils';


const Logo = () => (
    <div className="flex flex-col items-center justify-center text-center">
      <Image
        src="/images/company-logo.png"
        alt="Logotipo de Frio Alimentaria"
        width={300}
        height={86}
        priority
      />
    </div>
  );


export default function Home() {
  const [operationType, setOperationType] = useState<string>();
  const [productType, setProductType] = useState<string>();
  const router = useRouter();
  const { toast } = useToast();
  const { user, loading, displayName, permissions } = useAuth();
  const appVersion = "V.FAL.001";

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);
  
  const handleLogout = async () => {
    if (auth) {
      await signOut(auth);
      toast({
        title: 'Sesión cerrada',
        description: 'Has cerrado sesión correctamente.',
      });
      router.push('/login');
    }
  };

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
      if (operationType === 'recepcion') {
        router.push(`/variable-weight-reception-form?operation=${operationType}`);
        return;
      }
    }
    
    toast({
      title: "En desarrollo",
      description: "Este formato aún no está disponible.",
      variant: "destructive"
    });
  };

  const menuItems: { label: string; href: string; icon: React.FC<any>; permission: keyof AppPermissions }[] = [
    { label: 'Consultar Formatos Guardados', href: '/consultar-formatos', icon: ScrollText, permission: 'canConsultForms' },
    { label: 'Informes para Facturación', href: '/billing-reports', icon: BookCopy, permission: 'canViewBillingReports' },
    { label: 'Informe Productividad Operarios Frio Alimentaria', href: '/performance-report', icon: Timer, permission: 'canViewPerformanceReport' },
    { label: 'Informe de Productividad y Liquidación Cuadrilla', href: '/crew-performance-report', icon: TrendingUp, permission: 'canViewCrewPerformanceReport' },
    { label: 'Registro de Operaciones Manuales Cuadrilla', href: '/operaciones-manuales', icon: Edit, permission: 'canManageManualOperations' },
    { label: 'Relación de Formatos por Concepto de Liquidación', href: '/reportes-especiales', icon: FileSpreadsheet, permission: 'canViewSpecialReports' },
    { label: 'Gestión de Novedades', href: '/gestion-novedades', icon: ListPlus, permission: 'canManageNovelties' },
    { label: 'Gestión de Tipos de Pedido', href: '/gestion-tipos-pedido', icon: ListTodo, permission: 'canManageOrderTypes' },
    { label: 'Gestión de Estándares de Productividad', href: '/gestion-estandares', icon: Settings, permission: 'canManageStandards' },
    { label: 'Gestión de Conceptos de Liquidación', href: '/gestion-conceptos-liquidacion', icon: DollarSign, permission: 'canManageLiquidationConcepts' },
    { label: 'Gestión de Artículos', href: '/gestion-articulos', icon: Box, permission: 'canManageArticles' },
    { label: 'Gestión de Clientes', href: '/gestion-clientes', icon: Users2, permission: 'canManageClients' },
    { label: 'Gestión de Observaciones', href: '/gestion-observaciones', icon: ClipboardList, permission: 'canManageObservations' },
    { label: 'Gestión de Usuarios', href: '/session-management', icon: ShieldCheck, permission: 'canManageSessions' },
  ];

  const availableMenuItems = menuItems.filter(item => permissions[item.permission]);


  if (loading || !user) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-white">
        <p>Cargando...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-6xl space-y-8 relative">
        <Button
          variant="outline"
          size="sm"
          onClick={handleLogout}
          className="absolute top-0 right-0"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Cerrar Sesión
        </Button>

        <Logo />
        
        {displayName && (
            <div className="text-center">
                <p className="text-lg text-gray-800">Bienvenido, <span className="font-semibold">{displayName}</span></p>
            </div>
        )}
        
        <div className="space-y-8">
            {permissions.canGenerateForms && (
                <div>
                    <Card className="flex flex-col">
                        <CardHeader>
                            <CardTitle className="text-lg md:text-xl text-center text-primary">Control de Operaciones Logísticas</CardTitle>
                        </CardHeader>
                        <CardContent className="flex-grow flex flex-col justify-between">
                            <form onSubmit={handleSubmit} className="space-y-6">
                                <fieldset>
                                    <legend className="text-base font-semibold text-gray-900 mb-4">Tipo de Operación</legend>
                                    <RadioGroup value={operationType} onValueChange={setOperationType} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <Label htmlFor="recepcion" className={`flex cursor-pointer items-center space-x-3 rounded-md border bg-white p-4 transition-colors ${operationType === 'recepcion' ? 'border-primary ring-2 ring-primary' : 'border-gray-200'}`}>
                                            <RadioGroupItem value="recepcion" id="recepcion" />
                                            <ArrowDownCircle className="h-5 w-5 text-gray-600" />
                                            <span className="font-medium">Recepción</span>
                                        </Label>
                                        <Label htmlFor="despacho" className={`flex cursor-pointer items-center space-x-3 rounded-md border bg-white p-4 transition-colors ${operationType === 'despacho' ? 'border-primary ring-2 ring-primary' : 'border-gray-200'}`}>
                                            <RadioGroupItem value="despacho" id="despacho" />
                                            <ArrowUpCircle className="h-5 w-5 text-gray-600" />
                                            <span className="font-medium">Despacho</span>
                                        </Label>
                                    </RadioGroup>
                                </fieldset>
                                
                                <fieldset>
                                    <legend className="text-base font-semibold text-gray-900 mb-4">Tipo de Producto</legend>
                                    <RadioGroup value={productType} onValueChange={setProductType} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <Label htmlFor="fijo" className={`flex cursor-pointer items-center space-x-3 rounded-md border bg-white p-4 transition-colors ${productType === 'fijo' ? 'border-primary ring-2 ring-primary' : 'border-gray-200'}`}>
                                            <RadioGroupItem value="fijo" id="fijo" />
                                            <Box className="h-5 w-5 text-gray-600" />
                                            <span className="font-medium">Peso Fijo</span>
                                        </Label>
                                        <Label htmlFor="variable" className={`flex cursor-pointer items-center space-x-3 rounded-md border bg-white p-4 transition-colors ${productType === 'variable' ? 'border-primary ring-2 ring-primary' : 'border-gray-200'}`}>
                                            <RadioGroupItem value="variable" id="variable" />
                                            <Boxes className="h-5 w-5 text-gray-600" />
                                            <span className="font-medium">Peso Variable</span>
                                        </Label>
                                    </RadioGroup>
                                </fieldset>

                                <Button type="submit" size="lg" className="w-full h-12 text-base" disabled={!operationType || !productType}>
                                    <FileText className="mr-2 h-5 w-5" />
                                    Generar Formato
                                </Button>
                            </form>
                        </CardContent>
                    </Card>
                </div>
            )}

            {availableMenuItems.length > 0 && (
                <div>
                    <Card className="w-full">
                        <CardHeader>
                            <CardTitle className="text-lg md:text-xl text-center text-primary">Consultas y Herramientas</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {availableMenuItems.map((item) => (
                                    <button
                                        key={item.href}
                                        onClick={() => router.push(item.href)}
                                        className="group text-left p-4 rounded-lg border bg-card hover:bg-primary/5 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary"
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="bg-primary/10 p-2 rounded-full">
                                                    <item.icon className="h-6 w-6 text-primary" />
                                                </div>
                                                <span className="font-semibold text-card-foreground">{item.label}</span>
                                            </div>
                                            <ArrowRight className="h-5 w-5 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-200" />
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>

        <div className="pt-4 max-w-xl mx-auto">
            <FirebaseChecker />
        </div>
        
        <footer className="text-center pt-6">
            <p className="text-sm text-gray-500 font-mono">{appVersion}</p>
        </footer>

      </div>
    </div>
  );
}
