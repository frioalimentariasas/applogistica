"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { 
  LogOut, 
  ScrollText, 
  BookCopy, 
  ShieldCheck, 
  Settings, 
  Timer, 
  ArrowRight, 
  PackagePlus, 
  Truck, 
  Scale, 
  Layers,
  DollarSign, 
  TrendingUp, 
  FileSpreadsheet, 
  ListPlus, 
  Edit, 
  HardHat, 
  FileCog, 
  Wrench, 
  Calculator, 
  TruckIcon, 
  CalendarIcon, 
  FileSignature,
  CheckCircle2,
  Home as HomeIcon,
  Loader2,
  ListTodo,
  Box,
  ClipboardList,
  Package,
  Users2,
  FileText
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { useToast } from "@/hooks/use-toast";
import { FirebaseChecker } from '@/components/app/firebase-checker';
import { useAuth, type AppPermissions } from '@/hooks/use-auth';
import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from '@/lib/utils';

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
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  
  const router = useRouter();
  const { toast } = useToast();
  const { user, loading, displayName, permissions } = useAuth();
  const appVersion = "APP.Versión.002";

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

  const handleOpenConfirmation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!operationType || !productType) {
        toast({
            title: "Selección incompleta",
            description: "Por favor, seleccione un tipo de operación y un tipo de producto.",
            variant: "destructive"
        });
        return;
    }
    setIsConfirmOpen(true);
  };

  const handleFinalSubmit = () => {
    setIsConfirmOpen(false);
    
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
  };

  const menuItems: { label: string; href: string; icon: React.FC<any>; permission: keyof AppPermissions, group: string }[] = [
    { label: 'Consultar Formatos Guardados', href: '/consultar-formatos', icon: ScrollText, permission: 'canConsultForms', group: 'Operaciones Logísticas' },
    { label: 'Formatos Pendientes de Legalizar Peso Bruto (kg)', href: '/formatos-pendientes-legalizar', icon: ScrollText, permission: 'canViewPendingLegalization', group: 'Operaciones Logísticas' },
    { label: 'Informe Productividad Operarios Frio Alimentaria', href: '/performance-report', icon: Timer, permission: 'canViewPerformanceReport', group: 'Operaciones Logísticas' },
    { label: 'Trazabilidad de Paletas', href: '/pallet-movement-report', icon: TruckIcon, permission: 'canViewPalletTraceability', group: 'Operaciones Logísticas'},
    { label: 'Trazabilidad de Contenedor', href: '/container-traceability', icon: TruckIcon, permission: 'canViewContainerTraceability', group: 'Operaciones Logísticas'},
    
    { label: 'Gestión de Conceptos', href: '/gestion-conceptos-liquidacion-clientes', icon: DollarSign, permission: 'canManageClientLiquidationConcepts', group: 'Gestión y Liquidación Clientes' },
    { label: 'Registro de Op. Manuales Clientes', href: '/operaciones-manuales-clientes', icon: Edit, permission: 'canManageClientManualOperations', group: 'Gestión y Liquidación Clientes' },
    { label: 'Calendario de Facturación', href: '/calendario-facturacion', icon: CalendarIcon, permission: 'canViewBillingCalendar', group: 'Gestión y Liquidación Clientes' },
    { label: 'Informes de Control y Liquidación Clientes', href: '/billing-reports', icon: BookCopy, permission: 'canViewBillingReports', group: 'Gestión y Liquidación Clientes' },
    { label: 'Control de Versiones Liquidación', href: '/control-versiones-liquidacion', icon: FileCog, permission: 'canManageLiquidationVersions', group: 'Gestión y Liquidación Clientes' },
    { label: 'Asistente de Verificación Liquidación Por Lote SMYL', href: '/smyl-liquidation-assistant', icon: Package, permission: 'canViewSmylAssistant', group: 'Gestión y Liquidación Clientes' },
    { label: 'Asistente Liquidación Operaciones sin Contenedor/Lote', href: '/inventory-liquidation-assistant', icon: Calculator, permission: 'canViewInventoryAssistant', group: 'Gestión y Liquidación Clientes' },

    { label: 'Gestión de Conceptos', href: '/gestion-conceptos-liquidacion-cuadrilla', icon: DollarSign, permission: 'canManageLiquidationConcepts', group: 'Gestión y Liquidación Cuadrilla' },
    { label: 'Registro de operaciones Manuales Cuadrilla', href: '/operaciones-manuales-cuadrilla', icon: Edit, permission: 'canManageManualOperations', group: 'Gestión y Liquidación Cuadrilla' },
    { label: 'Informe de Productividad y Liquidación', href: '/crew-performance-report', icon: TrendingUp, permission: 'canViewCrewPerformanceReport', group: 'Gestión y Liquidación Cuadrilla' },
    { label: 'Gestión de Estándares', href: '/gestion-estandares-cuadrilla', icon: Settings, permission: 'canManageStandards', group: 'Gestión y Liquidación Cuadrilla' },
    { label: 'Reportes Especiales', href: '/reportes-especiales', icon: FileSpreadsheet, permission: 'canViewSpecialReports', group: 'Gestión y Liquidación Cuadrilla' },

    { label: 'Gestión de Novedades', href: '/gestion-novedades', icon: ListPlus, permission: 'canManageNovelties', group: 'Gestión de Maestros' },
    { label: 'Gestión de Tipos de Pedido', href: '/gestion-tipos-pedido', icon: ListTodo, permission: 'canManageOrderTypes', group: 'Gestión de Maestros' },
    { label: 'Gestión de Artículos', href: '/gestion-articulos', icon: Box, permission: 'canManageArticles', group: 'Gestión de Maestros' },
    { label: 'Gestión de Clientes', href: '/gestion-clientes', icon: Users2, permission: 'canManageClients', group: 'Gestión de Maestros' },
    { label: 'Gestión de Observaciones', href: '/gestion-observaciones', icon: ClipboardList, permission: 'canManageObservations', group: 'Gestión de Maestros' },
    { label: 'Gestión de Días Festivos', href: '/gestion-festivos', icon: CalendarIcon, permission: 'canManageHolidays', group: 'Gestión de Maestros' },
    { label: 'Gestión de Proveedores de Cuadrilla', href: '/gestion-proveedores-cuadrilla', icon: HardHat, permission: 'canManageCrewProviders', group: 'Gestión de Maestros' },

    { label: 'Gestión de Usuarios', href: '/session-management', icon: ShieldCheck, permission: 'canManageSessions', group: 'Parámetros y Seguridad' },
  ];

  const menuGroups: {
      [key: string]: { icon: React.FC<any>; items: typeof menuItems; }
  } = {
    'Operaciones Logísticas': { icon: FileCog, items: [] },
    'Gestión y Liquidación Clientes': { icon: FileSignature, items: [] },
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
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
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
                <div className="mt-4">
                    <h2 className="text-2xl font-extrabold tracking-tight text-center bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                        Control de Operaciones Logísticas
                    </h2>
                </div>
            </div>
        )}
        
        <div className="space-y-8">
            {permissions.canGenerateForms && (
                <div>
                    <Card className={cn(
                        "transition-all duration-300 border-2",
                        operationType === 'recepcion' ? "border-emerald-500 bg-emerald-50/30" : 
                        operationType === 'despacho' ? "border-sky-500 bg-sky-50/30" : "border-transparent"
                    )}>
                        <CardHeader>
                            <CardTitle className="text-center">Generar Nuevo Formato</CardTitle>
                            <CardDescription className="text-center">Seleccione cuidadosamente el tipo de operación para evitar errores.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleOpenConfirmation} className="space-y-8">
                                <div className="space-y-4">
                                    <Label className="text-base font-bold flex items-center gap-2">
                                        1. ¿Qué operación va a realizar?
                                    </Label>
                                    <RadioGroup value={operationType} onValueChange={setOperationType} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <Label htmlFor="recepcion" className={cn(
                                            "flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 p-6 transition-all hover:bg-emerald-50",
                                            operationType === 'recepcion' ? "border-emerald-600 bg-emerald-50 ring-2 ring-emerald-600 ring-offset-2" : "border-gray-200 bg-white"
                                        )}>
                                            <RadioGroupItem value="recepcion" id="recepcion" className="sr-only" />
                                            <PackagePlus className={cn("h-10 w-10", operationType === 'recepcion' ? "text-emerald-600" : "text-gray-400")} />
                                            <div className="text-center">
                                                <span className={cn("block text-lg font-bold", operationType === 'recepcion' ? "text-emerald-700" : "text-gray-700")}>ENTRADA (Recepción)</span>
                                                <span className="text-xs text-gray-500 mt-1 block">Ingreso de mercancía a bodega</span>
                                            </div>
                                        </Label>
                                        <Label htmlFor="despacho" className={cn(
                                            "flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 p-6 transition-all hover:bg-sky-50",
                                            operationType === 'despacho' ? "border-sky-600 bg-sky-50 ring-2 ring-sky-600 ring-offset-2" : "border-gray-200 bg-white"
                                        )}>
                                            <RadioGroupItem value="despacho" id="despacho" className="sr-only" />
                                            <Truck className={cn("h-10 w-10", operationType === 'despacho' ? "text-sky-600" : "text-gray-400")} />
                                            <div className="text-center">
                                                <span className={cn("block text-lg font-bold", operationType === 'despacho' ? "text-sky-700" : "text-gray-700")}>SALIDA (Despacho)</span>
                                                <span className="text-xs text-gray-500 mt-1 block">Salida de productos hacia cliente</span>
                                            </div>
                                        </Label>
                                    </RadioGroup>
                                </div>
                                
                                {operationType && (
                                    <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
                                        <Label className="text-base font-bold flex items-center gap-2">
                                            2. ¿Cómo es el peso de la mercancía?
                                        </Label>
                                        <RadioGroup value={productType} onValueChange={setProductType} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <Label htmlFor="fijo" className={cn(
                                                "flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 p-6 transition-all",
                                                productType === 'fijo' ? (operationType === 'recepcion' ? "border-emerald-600 bg-emerald-50 ring-2 ring-emerald-600" : "border-sky-600 bg-sky-50 ring-2 ring-sky-600") : "border-gray-200 bg-white hover:bg-gray-50"
                                            )}>
                                                <RadioGroupItem value="fijo" id="fijo" className="sr-only" />
                                                <Layers className={cn("h-10 w-10", productType === 'fijo' ? (operationType === 'recepcion' ? "text-emerald-600" : "text-sky-600") : "text-gray-400")} />
                                                <div className="text-center">
                                                    <span className={cn("block text-lg font-bold", productType === 'fijo' ? "text-gray-900" : "text-gray-700")}>PESO FIJO</span>
                                                    <span className="text-xs text-gray-500 mt-1 block">Cajas con pesos estándar (ej. 10kg)</span>
                                                </div>
                                            </Label>
                                            <Label htmlFor="variable" className={cn(
                                                "flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 p-6 transition-all",
                                                productType === 'variable' ? (operationType === 'recepcion' ? "border-emerald-600 bg-emerald-50 ring-2 ring-emerald-600" : "border-sky-600 bg-sky-50 ring-2 ring-sky-600") : "border-gray-200 bg-white hover:bg-gray-50"
                                            )}>
                                                <RadioGroupItem value="variable" id="variable" className="sr-only" />
                                                <Scale className={cn("h-10 w-10", productType === 'variable' ? (operationType === 'recepcion' ? "text-emerald-600" : "text-sky-600") : "text-gray-400")} />
                                                <div className="text-center">
                                                    <span className={cn("block text-lg font-bold", productType === 'variable' ? "text-gray-900" : "text-gray-700")}>PESO VARIABLE</span>
                                                    <span className="text-xs text-gray-500 mt-1 block">Pesamos cada paleta individualmente</span>
                                                </div>
                                            </Label>
                                        </RadioGroup>
                                    </div>
                                )}

                                <Button 
                                    type="submit" 
                                    size="lg" 
                                    className={cn(
                                        "w-full h-14 text-lg font-bold transition-all shadow-md",
                                        operationType === 'recepcion' ? "bg-emerald-600 hover:bg-emerald-700" : 
                                        operationType === 'despacho' ? "bg-sky-600 hover:bg-sky-700" : "bg-primary"
                                    )} 
                                    disabled={!operationType || !productType}
                                >
                                    <FileText className="mr-2 h-6 w-6" />
                                    Generar Formato Seleccionado
                                </Button>
                            </form>
                        </CardContent>
                    </Card>
                </div>
            )}

            {availableMenuGroups.length > 0 && (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200">
                    <Card className="w-full">
                        <CardHeader className="text-center">
                            <CardTitle className="text-xl font-bold text-gray-800">Menú de Consultas y Herramientas</CardTitle>
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
            <p className="text-sm text-primary font-mono font-bold">{appVersion}</p>
            <p className="text-xs text-primary font-mono mt-1 font-bold">FRIO ALIMENTARIA SAS NIT: 900736914-0</p>
        </footer>

        {/* Confirmation Dialog */}
        <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
            <AlertDialogContent className="sm:max-w-md border-t-8 border-t-primary">
                <AlertDialogHeader>
                    <AlertDialogTitle className="text-center text-xl flex flex-col items-center gap-2">
                        <CheckCircle2 className="h-12 w-12 text-primary animate-in zoom-in duration-300" />
                        ¿Confirmar Selección de Formato?
                    </AlertDialogTitle>
                    <AlertDialogDescription asChild>
                        <div className="text-center text-base pt-4 space-y-4 text-muted-foreground">
                            <div className="bg-muted p-4 rounded-lg border">
                                <p className="text-gray-600 text-sm font-normal">Vas a abrir un formato de:</p>
                                <div className="flex flex-col gap-1 mt-2">
                                    <span className={cn(
                                        "text-lg font-extrabold uppercase",
                                        operationType === 'recepcion' ? "text-emerald-600" : "text-sky-600"
                                    )}>
                                        {operationType === 'recepcion' ? "ENTRADA (Recepción)" : "SALIDA (Despacho)"}
                                    </span>
                                    <span className="text-gray-900 font-bold text-base">
                                        PESO {productType === 'fijo' ? "FIJO" : "VARIABLE"}
                                    </span>
                                </div>
                            </div>
                            <p className="font-semibold text-gray-800">
                                ¿Es este el formato correcto para la operación que vas a iniciar?
                            </p>
                        </div>
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="sm:justify-center gap-2 mt-4">
                    <AlertDialogCancel className="w-full sm:w-auto">
                        No, Cambiar
                    </AlertDialogCancel>
                    <AlertDialogAction 
                        onClick={handleFinalSubmit}
                        className={cn(
                            "w-full sm:w-auto font-bold",
                            operationType === 'recepcion' ? "bg-emerald-600 hover:bg-emerald-700" : "bg-sky-600 hover:bg-sky-700"
                        )}
                    >
                        Sí, Abrir Formato
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
