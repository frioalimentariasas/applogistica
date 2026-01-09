

"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { FileText, LogOut, Users2, Box, ScrollText, BookCopy, ShieldCheck, Settings, Timer, ArrowRight, ArrowDownCircle, ArrowUpCircle, Boxes, ClipboardList, Users, TrendingUp, DollarSign, ListTodo, FileSpreadsheet, ListPlus, Edit, HardHat, FileCog, Briefcase, Wrench, Package, Calculator, TruckIcon, CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { useToast } from "@/hooks/use-toast";
import { FirebaseChecker } from '@/components/app/firebase-checker';
import { useAuth, type AppPermissions } from '@/hooks/use-auth';
import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"


const Logo = () => (
    <div className="flex flex-col items-center justify-center text-center">
      <Image
        src="/images/company-logo.png"
        alt="Logotipo de Frio Alimentaria"
        width={270}
        height={77}
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
  const appVersion = "APP.Versión.001";

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

  const menuItems: { label: string; href: string; icon: React.FC<any>; permission: keyof AppPermissions, group: string }[] = [
    // Operaciones Logísticas
    { label: 'Consultar Formatos Guardados', href: '/consultar-formatos', icon: ScrollText, permission: 'canConsultForms', group: 'Operaciones Logísticas' },
    { label: 'Formatos Pendientes de Legalizar Peso Bruto (kg)', href: '/formatos-pendientes-legalizar', icon: ScrollText, permission: 'canViewPendingLegalization', group: 'Operaciones Logísticas' },
    { label: 'Informe Productividad Operarios Frio Alimentaria', href: '/performance-report', icon: Timer, permission: 'canViewPerformanceReport', group: 'Operaciones Logísticas' },
    { label: 'Trazabilidad de Paletas', href: '/pallet-movement-report', icon: TruckIcon, permission: 'canViewPalletTraceability', group: 'Operaciones Logísticas'},
    { label: 'Trazabilidad de Contenedor', href: '/container-traceability', icon: TruckIcon, permission: 'canViewContainerTraceability', group: 'Operaciones Logísticas'},
    
    // Gestión y Liquidación Clientes
    { label: 'Gestión de Conceptos', href: '/gestion-conceptos-liquidacion-clientes', icon: DollarSign, permission: 'canManageClientLiquidationConcepts', group: 'Gestión y Liquidación Clientes' },
    { label: 'Registro de Op. Manuales Clientes', href: '/operaciones-manuales-clientes', icon: Edit, permission: 'canManageClientManualOperations', group: 'Gestión y Liquidación Clientes' },
    { label: 'Calendario de Facturación', href: '/calendario-facturacion', icon: CalendarIcon, permission: 'canViewBillingCalendar', group: 'Gestión y Liquidación Clientes' },
    { label: 'Informes de Facturación', href: '/billing-reports', icon: BookCopy, permission: 'canViewBillingReports', group: 'Gestión y Liquidación Clientes' },
    { label: 'Control de Versiones Liquidación', href: '/control-versiones-liquidacion', icon: FileCog, permission: 'canManageLiquidationVersions', group: 'Gestión y Liquidación Clientes' },
    { label: 'Asistente de Liquidación SMYL', href: '/smyl-liquidation-assistant', icon: Package, permission: 'canViewSmylAssistant', group: 'Gestión y Liquidación Clientes' },
    { label: 'Asistente de Liquidación de Inventario', href: '/inventory-liquidation-assistant', icon: Calculator, permission: 'canViewInventoryAssistant', group: 'Gestión y Liquidación Clientes' },

    // Gestión y Liquidación Cuadrilla
    { label: 'Gestión de Conceptos', href: '/gestion-conceptos-liquidacion-cuadrilla', icon: DollarSign, permission: 'canManageLiquidationConcepts', group: 'Gestión y Liquidación Cuadrilla' },
    { label: 'Registro de operaciones Manuales Cuadrilla', href: '/operaciones-manuales-cuadrilla', icon: Edit, permission: 'canManageManualOperations', group: 'Gestión y Liquidación Cuadrilla' },
    { label: 'Informe de Productividad y Liquidación', href: '/crew-performance-report', icon: TrendingUp, permission: 'canViewCrewPerformanceReport', group: 'Gestión y Liquidación Cuadrilla' },
    { label: 'Gestión de Estándares', href: '/gestion-estandares-cuadrilla', icon: Settings, permission: 'canManageStandards', group: 'Gestión y Liquidación Cuadrilla' },
    { label: 'Reportes Especiales', href: '/reportes-especiales', icon: FileSpreadsheet, permission: 'canViewSpecialReports', group: 'Gestión y Liquidación Cuadrilla' },

    // Gestión de Maestros
    { label: 'Gestión de Novedades', href: '/gestion-novedades', icon: ListPlus, permission: 'canManageNovelties', group: 'Gestión de Maestros' },
    { label: 'Gestión de Tipos de Pedido', href: '/gestion-tipos-pedido', icon: ListTodo, permission: 'canManageOrderTypes', group: 'Gestión de Maestros' },
    { label: 'Gestión de Artículos', href: '/gestion-articulos', icon: Box, permission: 'canManageArticles', group: 'Gestión de Maestros' },
    { label: 'Gestión de Clientes', href: '/gestion-clientes', icon: Users2, permission: 'canManageClients', group: 'Gestión de Maestros' },
    { label: 'Gestión de Observaciones', href: '/gestion-observaciones', icon: ClipboardList, permission: 'canManageObservations', group: 'Gestión de Maestros' },
    { label: 'Gestión de Días Festivos', href: '/gestion-festivos', icon: CalendarIcon, permission: 'canManageHolidays', group: 'Gestión de Maestros' },


    // Parámetros y Seguridad
    { label: 'Gestión de Usuarios', href: '/session-management', icon: ShieldCheck, permission: 'canManageSessions', group: 'Parámetros y Seguridad' },
  ];

  const menuGroups: {
      [key: string]: { icon: React.FC<any>; items: typeof menuItems; }
  } = {
    'Operaciones Logísticas': { icon: FileCog, items: [] },
    'Gestión y Liquidación Clientes': { icon: Briefcase, items: [] },
    'Gestión y Liquidación Cuadrilla': { icon: HardHat, items: [] },
    'Gestión de Maestros': { icon: Wrench, items: [] },
    'Parámetros y Seguridad': { icon: ShieldCheck, items: [] },
  };

  menuItems.forEach(item => {
    if (permissions[item.permission] && menuGroups[item.group]) {
      menuGroups[item.group].items.push(item);
    }
  });

  const availableMenuGroups = Object.entries(menuGroups).filter(([, groupData]) => 
    groupData.items.length > 0
  );


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
                        <CardHeader>
                            <CardTitle className="text-lg md:text-xl text-center text-primary">Control de Operaciones Logísticas</CardTitle>
                        </CardHeader>
            </div>
        )}
        
        <div className="space-y-8">
            {permissions.canGenerateForms && (
                <div>
                    <Card className="flex flex-col">
                        <CardContent className="flex-grow flex flex-col justify-between">
                            <form onSubmit={handleSubmit} className="space-y-6">
                                <fieldset>
                                    <legend className="text-base font-semibold text-gray-900 mb-4">Tipo de Operación</legend>
                                    <RadioGroup value={operationType} onValueChange={setOperationType} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <Label htmlFor="recepcion" className={`flex cursor-pointer items-center space-x-3 rounded-md border bg-white p-4 transition-colors ${operationType === 'recepcion' ? 'border-primary ring-2 ring-primary' : 'border-gray-200'}`}>
                                            <RadioGroupItem value="recepcion" id="recepcion" />
                                            <ArrowDownCircle className="h-5 w-5 text-primary" />
                                            <span className="font-medium">Recepción</span>
                                        </Label>
                                        <Label htmlFor="despacho" className={`flex cursor-pointer items-center space-x-3 rounded-md border bg-white p-4 transition-colors ${operationType === 'despacho' ? 'border-primary ring-2 ring-primary' : 'border-gray-200'}`}>
                                            <RadioGroupItem value="despacho" id="despacho" />
                                            <ArrowUpCircle className="h-5 w-5 text-primary" />
                                            <span className="font-medium">Despacho</span>
                                        </Label>
                                    </RadioGroup>
                                </fieldset>
                                
                                <fieldset>
                                    <legend className="text-base font-semibold text-gray-900 mb-4">Tipo de Producto</legend>
                                    <RadioGroup value={productType} onValueChange={setProductType} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <Label htmlFor="fijo" className={`flex cursor-pointer items-center space-x-3 rounded-md border bg-white p-4 transition-colors ${productType === 'fijo' ? 'border-primary ring-2 ring-primary' : 'border-gray-200'}`}>
                                            <RadioGroupItem value="fijo" id="fijo" />
                                            <Box className="h-5 w-5 text-primary" />
                                            <span className="font-medium">Peso Fijo</span>
                                        </Label>
                                        <Label htmlFor="variable" className={`flex cursor-pointer items-center space-x-3 rounded-md border bg-white p-4 transition-colors ${productType === 'variable' ? 'border-primary ring-2 ring-primary' : 'border-gray-200'}`}>
                                            <RadioGroupItem value="variable" id="variable" />
                                            <Boxes className="h-5 w-5 text-primary" />
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

            {availableMenuGroups.length > 0 && (
                <div>
                    <Card className="w-full">
                        <CardHeader>
                            <CardTitle className="text-lg md:text-xl text-center text-primary">Menú de Consultas y Herramientas</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Accordion type="multiple" className="w-full space-y-2">
                                {availableMenuGroups.map(([groupName, groupData]) => (
                                    <AccordionItem value={groupName} key={groupName} className="border-b-0">
                                        <AccordionTrigger className="bg-muted hover:bg-muted/90 rounded-md px-4 py-3 text-base">
                                          <div className="flex items-center gap-3">
                                            <groupData.icon className="h-5 w-5 text-primary"/>
                                            {groupName}
                                          </div>
                                        </AccordionTrigger>
                                        <AccordionContent className="pt-2">
                                            <div className="pl-4 pr-1 space-y-2">
                                                {groupData.items.map((item) => (
                                                    <button
                                                        key={item.href}
                                                        onClick={() => router.push(item.href)}
                                                        className="group flex w-full items-center justify-between text-left p-3 rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary/50"
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <item.icon className="h-5 w-5 text-muted-foreground group-hover:text-primary" />
                                                            <span className="font-medium text-sm text-foreground">{item.label}</span>
                                                        </div>
                                                        <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-transform duration-200" />
                                                    </button>
                                                ))}
                                            </div>
                                        </AccordionContent>
                                    </AccordionItem>
                                ))}
                            </Accordion>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>

        <div className="pt-4 max-w-xl mx-auto">
            <FirebaseChecker />
        </div>
        
        <footer className="text-center pt-6">
            <p className="text-sm text-gray-500 font-mono font-bold">{appVersion}</p>
            <p className="text-xs text-gray-500 font-mono mt-1 font-bold">FRIO ALIMENTARIA SAS NIT: 900736914-0</p>
        </footer>

      </div>
    </div>
  );
}
