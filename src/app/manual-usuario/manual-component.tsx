
"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import images from '@/app/lib/placeholder-images.json';

import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { 
  ArrowLeft, 
  Download, 
  BookOpen, 
  LogIn, 
  Home, 
  FileText, 
  Search, 
  DollarSign, 
  Info,
  ChevronRight,
  Camera,
  HardHat,
  Settings,
  PackagePlus,
  Scale,
  ClipboardList,
  CalendarIcon,
  ShieldCheck,
  Package,
  Activity,
  Calculator,
  TruckIcon,
  Users2,
  FileSearch,
  Timer
} from 'lucide-react';

const getImageAsBase64Client = async (url: string): Promise<string> => {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("Logo fetch failed");
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = reject;
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
        });
    } catch(e) {
        console.error("Error fetching client image", e);
        return "";
    }
};

const Section = ({ id, title, children }: { id: string; title: string; children: React.ReactNode }) => (
  <section id={id} className="scroll-mt-20 space-y-6 py-8 border-b last:border-0">
    <div className="flex items-center gap-3">
      <div className="h-10 w-1 flex-shrink-0 rounded-full bg-primary" />
      <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
    </div>
    {children}
  </section>
);

const SubSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="space-y-4 mt-6">
    <h3 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
      <ChevronRight className="h-5 w-5 text-primary" />
      {title}
    </h3>
    {children}
  </div>
);

const ManualHeader = () => (
  <div className="w-full bg-white border border-gray-300 flex overflow-hidden rounded-sm mb-8 print:border-black shadow-sm">
    <div className="w-1/4 border-r border-gray-300 p-4 flex items-center justify-center print:border-black bg-gray-50/50">
      <Image
        src="/images/company-logo.png"
        alt="Logo Frio"
        width={150}
        height={43}
        priority
      />
    </div>
    <div className="w-1/2 flex items-center justify-center p-4 text-center">
      <h1 className="text-lg md:text-xl font-bold uppercase leading-tight tracking-tight text-gray-900">
        MANUAL DE USUARIO: APP DE CONTROL DE OPERACIONES LOGÍSTICAS
      </h1>
    </div>
    <div className="w-1/4 border-l border-gray-300 text-xs flex flex-col justify-center print:border-black bg-gray-50/50">
      <div className="border-b border-gray-300 p-2 print:border-black">
        <span className="font-bold">Código:</span> FA-GL-MA01
      </div>
      <div className="border-b border-gray-300 p-2 print:border-black">
        <span className="font-bold">Versión:</span> 01
      </div>
      <div className="p-2 print:border-black">
        <span className="font-bold">Fecha:</span> 25/08/2025
      </div>
    </div>
  </div>
);

const StepImage = ({ src, hint, caption }: { src: string; hint: string; caption: string }) => (
  <div className="my-8 space-y-3">
    <div className="relative aspect-video w-full overflow-hidden rounded-xl border-4 border-white shadow-xl bg-gray-100">
      <Image
        src={src}
        alt={caption}
        fill
        className="object-cover"
        data-ai-hint={hint}
      />
    </div>
    <div className="flex items-center justify-center gap-2 text-muted-foreground">
      <Camera className="h-4 w-4" />
      <p className="text-sm font-medium italic">{caption}</p>
    </div>
  </div>
);

export function ManualComponent() {
  const router = useRouter();
  const { user } = useAuth();
  const [logoBase64, setLogoBase64] = useState<string | null>(null);

  useEffect(() => {
    const fetchLogo = async () => {
      const data = await getImageAsBase64Client('/images/company-logo.png');
      setLogoBase64(data);
    };
    fetchLogo();
  }, []);

  const handleDownloadPDF = async () => {
    if (!logoBase64) return;

    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 40;

    const generateHeader = () => {
      autoTable(doc, {
        startY: 20,
        margin: { left: margin, right: margin },
        tableWidth: pageWidth - (margin * 2),
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 8, textColor: 0, lineColor: 0, lineWidth: 0.5 },
        columnStyles: {
          0: { cellWidth: 150, halign: 'center', valign: 'middle' },
          1: { halign: 'center', valign: 'middle', fontSize: 12, fontStyle: 'bold' },
          2: { cellWidth: 120, fontSize: 7 }
        },
        body: [[
          { content: '', styles: { minCellHeight: 50 } }, 
          'MANUAL DE USUARIO: APP DE CONTROL DE OPERACIONES LOGÍSTICAS',
          `Código: FA-GL-MA01\nVersión: 01\nFecha: 25/08/2025`
        ]],
        didDrawCell: (data) => {
          if (data.column.index === 0 && data.row.index === 0 && logoBase64) {
            doc.addImage(logoBase64, 'PNG', data.cell.x + 5, data.cell.y + 5, 140, 40);
          }
        }
      });
      return (doc as any).lastAutoTable.finalY + 30;
    };

    generateHeader();
    doc.setFontSize(14);
    doc.text("Este documento es un resumen del manual interactivo.", margin, 150);
    doc.setFontSize(11);
    doc.text("Para ver el manual completo con ayudas visuales y actualizaciones en tiempo real,", margin, 175);
    doc.text("por favor consulte la sección 'Manual de Usuario' dentro de la aplicación móvil o web.", margin, 190);
    
    doc.save('Manual_Usuario_Control_Operaciones.pdf');
  };

  const sections = [
    { id: 'acceso', label: 'Acceso al Sistema', icon: LogIn },
    { id: 'principal', label: 'Menú Principal', icon: Home },
    { id: 'formatos', label: 'Formatos de Operación', icon: FileText },
    { id: 'consultas', label: 'Consultas y Trazabilidad', icon: Search },
    { id: 'liquidacion', label: 'Liquidación Clientes', icon: DollarSign },
    { id: 'cuadrilla', label: 'Gestión de Cuadrilla', icon: HardHat },
    { id: 'maestros', label: 'Gestión de Maestros', icon: Settings },
    { id: 'seguridad', label: 'Seguridad y Usuarios', icon: ShieldCheck },
  ];

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <aside className="fixed left-0 top-0 hidden h-screen w-72 border-r bg-white p-6 lg:block shadow-sm">
        <div className="mb-8 flex items-center gap-2">
          <BookOpen className="h-6 w-6 text-primary" />
          <h2 className="text-xl font-bold text-primary">Contenido</h2>
        </div>
        <ScrollArea className="h-[calc(100vh-120px)]">
          <nav className="space-y-1">
            {sections.map((sec) => (
              <a
                key={sec.id}
                href={`#${sec.id}`}
                className="group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:bg-muted hover:text-primary transition-colors"
              >
                <sec.icon className="h-4 w-4 text-gray-400 group-hover:text-primary" />
                {sec.label}
              </a>
            ))}
          </nav>
        </ScrollArea>
      </aside>

      <main className="lg:pl-72">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-white/80 px-6 py-4 backdrop-blur-md">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.push('/')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-lg font-semibold text-gray-700">Documentación de Usuario</h1>
          </div>
          <Button onClick={handleDownloadPDF} variant="default" className="shadow-md">
            <Download className="mr-2 h-4 w-4" />
            Descargar PDF
          </Button>
        </header>

        <div className="mx-auto max-w-4xl p-6 lg:p-12">
          <ManualHeader />

          <Section id="introduccion" title="Introducción">
            <p className="text-lg text-gray-600 leading-relaxed">
              La App de Control de Operaciones Logísticas es una herramienta integral diseñada para digitalizar, 
              estandarizar y optimizar los procesos de recepción, despacho y liquidación de servicios de Frio Alimentaria SAS.
            </p>
            <Alert className="bg-sky-50 border-sky-200 mt-4">
              <Info className="h-4 w-4 text-sky-600" />
              <AlertTitle className="text-sky-900 font-bold">Nota importante</AlertTitle>
              <AlertDescription className="text-sky-800">
                El acceso a las funciones detalladas en este manual depende de los permisos asignados a su perfil de usuario por el administrador.
              </AlertDescription>
            </Alert>
          </Section>

          <Section id="acceso" title="1. Acceso al Sistema">
            <p className="text-gray-600">
              Para ingresar a la aplicación, debe utilizar sus credenciales corporativas (Correo y Contraseña).
            </p>
            <StepImage 
              src={images.manual.login} 
              hint="app login screen" 
              caption="Pantalla de Acceso: Ingrese su correo y contraseña institucional." 
            />
            <div className="bg-white p-6 rounded-lg border shadow-sm space-y-3">
              <p className="font-semibold text-gray-800">Pasos para el ingreso:</p>
              <ol className="list-decimal pl-5 space-y-2 text-gray-600">
                <li>Ingrese su correo electrónico registrado.</li>
                <li>Ingrese su contraseña de acceso.</li>
                <li>Haga clic en el botón <Badge variant="secondary">Ingresar</Badge>.</li>
              </ol>
            </div>
          </Section>

          <Section id="principal" title="2. Menú Principal y Selección de Formatos">
            <p className="text-gray-600">
              Desde la pantalla de inicio, el personal operativo puede iniciar el registro de cualquier movimiento logístico.
            </p>
            <StepImage 
              src={images.manual.dashboard} 
              hint="dashboard app main menu" 
              caption="Menú Principal: Opciones de generación de formatos y herramientas de gestión." 
            />
            <SubSection title="Proceso de Selección de Operación">
              <p className="text-gray-600">El sistema guía al usuario a través de dos preguntas clave para abrir el formulario correcto:</p>
              <StepImage 
                src={images.manual.selection} 
                hint="operation type selection" 
                caption="Interrogador de Operación: Selección de Entrada/Salida y Peso Fijo/Variable." 
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <Card className="bg-emerald-50/50">
                  <CardContent className="p-4 pt-6 text-center">
                    <PackagePlus className="mx-auto h-8 w-8 text-emerald-600 mb-2" />
                    <p className="font-bold text-emerald-800">Tipo de Operación</p>
                    <p className="text-sm text-emerald-700">Entrada (Recepción) o Salida (Despacho)</p>
                  </CardContent>
                </Card>
                <Card className="bg-sky-50/50">
                  <CardContent className="p-4 pt-6 text-center">
                    <Scale className="mx-auto h-8 w-8 text-sky-600 mb-2" />
                    <p className="font-bold text-sky-800">Naturaleza del Peso</p>
                    <p className="text-sm text-sky-700">Peso Fijo (Cajas estándar) o Peso Variable (Pesaje de paletas)</p>
                  </CardContent>
                </Card>
              </div>
            </SubSection>
          </Section>

          <Section id="formatos" title="3. Formatos de Operación">
            <p className="text-gray-600 leading-relaxed">
              Los formularios están diseñados para capturar toda la información crítica de la operación en tiempo real.
            </p>
            
            <SubSection title="Formato de Peso Fijo">
              <p className="text-sm text-gray-600">Ideal para productos con cajas de peso estandarizado.</p>
              <StepImage 
                src={images.manual.fixed_form} 
                hint="fixed weight operation form" 
                caption="Estructura del Formato de Peso Fijo." 
              />
            </SubSection>

            <SubSection title="Formato de Peso Variable">
              <p className="text-sm text-gray-600">Utilizado cuando se requiere el pesaje individual de cada paleta.</p>
              <StepImage 
                src={images.manual.variable_form} 
                hint="variable weight operation form" 
                caption="Estructura del Formato de Peso Variable con pesaje por paleta." 
              />
            </SubSection>

            <SubSection title="Secciones Críticas del Formulario">
              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-white font-bold text-sm">1</div>
                  <div>
                    <p className="font-bold">Información General:</p>
                    <p className="text-sm text-gray-600">Pedido SISLOG, Cliente, Fechas y Horarios de inicio/fin.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-white font-bold text-sm">2</div>
                  <div>
                    <p className="font-bold">Detalle de Productos:</p>
                    <p className="text-sm text-gray-600">Registro de códigos, cantidades, paletas y temperaturas (°C).</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-white font-bold text-sm">3</div>
                  <div>
                    <p className="font-bold">Información del Vehículo:</p>
                    <p className="text-sm text-gray-600">Datos del conductor, placa, contenedor y muelle asignado.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-white font-bold text-sm">4</div>
                  <div>
                    <p className="font-bold">Anexos Fotográficos:</p>
                    <p className="text-sm text-gray-600">Captura de fotos directamente desde la cámara para evidencia de estado de carga y precinto.</p>
                  </div>
                </div>
              </div>
            </SubSection>

            <div className="bg-amber-50 border-l-4 border-amber-400 p-4 my-6">
              <div className="flex items-center gap-2">
                <Camera className="h-5 w-5 text-amber-600" />
                <p className="font-bold text-amber-800 uppercase text-sm">Uso de la Cámara</p>
              </div>
              <div className="text-sm text-amber-700 mt-1">
                Para adjuntar fotos, use el botón <Badge variant="outline" className="border-amber-400">Tomar Foto</Badge>. 
                Asegúrese de capturar claramente el precinto, el estado de la carga y el termoregistrador si aplica.
              </div>
            </div>
          </Section>

          <Section id="consultas" title="4. Consultas y Trazabilidad">
            <p className="text-gray-600">
              El sistema permite localizar cualquier registro histórico y generar copias en formato PDF para el cliente o auditoría.
            </p>
            <SubSection title="Consultar Formatos Guardados">
              <p className="text-sm text-gray-600 mb-4">Filtre por fechas, pedido, placa o cliente para visualizar el detalle completo.</p>
              <StepImage 
                src={images.manual.search} 
                hint="search and list forms" 
                caption="Módulo de Consulta: Filtros avanzados y lista de resultados." 
              />
            </SubSection>
            <SubSection title="Trazabilidad de Paletas y Contenedores">
              <p className="text-sm text-gray-600">
                Al ingresar un código de paleta o número de contenedor, el sistema mostrará todos los movimientos registrados 
                (Recepción y Despachos) asociados a esa unidad.
              </p>
              <StepImage 
                src={images.manual.traceability} 
                hint="traceability report" 
                caption="Informe de Trazabilidad: Historial cronológico de movimientos." 
              />
            </SubSection>
          </Section>

          <Section id="liquidacion" title="5. Gestión y Liquidación Clientes">
            <p className="text-gray-600">
              Módulo para el área administrativa que automatiza el cálculo de cobros basado en las reglas de negocio.
            </p>
            <SubSection title="Informe de Liquidación de Servicios">
              <p className="text-sm text-gray-600">
                Seleccione el cliente y el periodo para generar el reporte de facturación. El sistema calculará automáticamente:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4">
                <Badge className="bg-blue-100 text-blue-800 border-blue-200 justify-center h-10 font-bold uppercase"><Warehouse className="mr-2 h-4 w-4" /> Almacenamiento</Badge>
                <Badge className="bg-green-100 text-green-800 border-green-200 justify-center h-10 font-bold uppercase"><Package className="mr-2 h-4 w-4" /> Movimientos</Badge>
                <Badge className="bg-orange-100 text-orange-800 border-orange-200 justify-center h-10 font-bold uppercase"><Sparkles className="mr-2 h-4 w-4" /> Servicios Extra</Badge>
              </div>
              <StepImage 
                src={images.manual.billing} 
                hint="billing and settlement report" 
                caption="Módulo de Liquidación: Cálculo de tarifas y generación de reporte de cobro." 
              />
            </SubSection>
          </Section>

          <Section id="cuadrilla" title="6. Gestión y Liquidación Cuadrilla">
            <p className="text-gray-600">Control de pagos y productividad del personal externo.</p>
            <SubSection title="Informe de Productividad">
              <p className="text-gray-600 text-sm">
                Mide el desempeño de los operarios comparando el tiempo real de la operación frente a los estándares de Frio Alimentaria.
              </p>
              <StepImage 
                src={images.manual.performance} 
                hint="crew productivity report" 
                caption="Informe de Productividad: Comparativa de tiempos y semáforo de desempeño." 
              />
              <div className="flex gap-4 mt-4">
                <div className="text-center p-3 border rounded bg-green-50 w-full shadow-sm">
                  <p className="text-xs font-bold text-green-700 uppercase">ÓPTIMO</p>
                  <p className="text-[10px] text-green-600">Dentro del estándar</p>
                </div>
                <div className="text-center p-3 border rounded bg-amber-50 w-full shadow-sm">
                  <p className="text-xs font-bold text-amber-700 uppercase">NORMAL</p>
                  <p className="text-[10px] text-amber-600">Cumple con tolerancia</p>
                </div>
                <div className="text-center p-3 border rounded bg-red-50 w-full shadow-sm">
                  <p className="text-xs font-bold text-red-700 uppercase">LENTO</p>
                  <p className="text-[10px] text-red-600">Requiere novedad</p>
                </div>
              </div>
            </SubSection>
          </Section>

          <Section id="maestros" title="7. Gestión de Maestros">
            <p className="text-gray-600">
              Administración de las bases de datos fundamentales que alimentan la aplicación.
            </p>
            <StepImage 
              src={images.manual.masters} 
              hint="masters management screen" 
              caption="Panel de Gestión de Maestros: Clientes, Artículos, Festivos y Observaciones." 
            />
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              <li className="p-4 border rounded-md flex items-center gap-3 bg-white shadow-sm">
                <Users2 className="h-5 w-5 text-primary" />
                <span className="text-sm font-medium">Clientes y Artículos</span>
              </li>
              <li className="p-4 border rounded-md flex items-center gap-3 bg-white shadow-sm">
                <CalendarIcon className="h-5 w-5 text-primary" />
                <span className="text-sm font-medium">Días Festivos</span>
              </li>
              <li className="p-4 border rounded-md flex items-center gap-3 bg-white shadow-sm">
                <ClipboardList className="h-5 w-5 text-primary" />
                <span className="text-sm font-medium">Observaciones Estándar</span>
              </li>
              <li className="p-4 border rounded-md flex items-center gap-3 bg-white shadow-sm">
                <HardHat className="h-5 w-5 text-primary" />
                <span className="text-sm font-medium">Proveedores de Cuadrilla</span>
              </li>
            </ul>
          </Section>

          <Section id="seguridad" title="8. Seguridad y Usuarios">
            <p className="text-gray-600">Control total sobre quién accede a cada módulo de la aplicación.</p>
            <SubSection title="Gestión de Permisos">
              <p className="text-sm text-gray-600">
                El administrador puede habilitar o deshabilitar funciones específicas para cada correo electrónico registrado.
              </p>
              <StepImage 
                src={images.manual.security} 
                hint="users and permissions screen" 
                caption="Gestión de Seguridad: Activación de permisos granulares por usuario." 
              />
            </SubSection>
          </Section>

          <footer className="mt-20 text-center text-gray-400 text-xs border-t pt-8 pb-12">
            <p className="font-semibold text-gray-500">© 2025 Frio Alimentaria SAS - Sistema de Control de Operaciones Logísticas</p>
            <p className="mt-1">Cualquier error o soporte técnico, favor comunicarse con el área de TI.</p>
          </footer>
        </div>
      </main>
    </div>
  );
}
