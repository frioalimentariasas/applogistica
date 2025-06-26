
import Image from 'next/image';
import { format } from 'date-fns';

const ReportSection = ({ title, children, className }: { title: string, children: React.ReactNode, className?: string }) => (
    <div className="mb-3 break-inside-avoid">
      <div className={`rounded-lg border border-gray-400 ${className}`}>
        <h2 className="rounded-t-md bg-gray-200 px-3 py-1 text-sm font-bold text-gray-800 border-b border-gray-400">{title}</h2>
        <div className="p-3">{children}</div>
      </div>
    </div>
);
  
const ReportField = ({ label, value }: { label: string, value: any }) => (
    <div className="text-xs">
      <span className="font-bold text-gray-700">{label}:</span>
      <span className="text-gray-900 ml-2">{value || 'N/A'}</span>
    </div>
);

interface FixedWeightReportProps {
    formData: any;
    userDisplayName: string;
    attachments: string[];
}

export function FixedWeightReport({ formData, userDisplayName, attachments }: FixedWeightReportProps) {
    const totalCajas = formData.productos.reduce((acc: any, p: any) => acc + (Number(p.cajas) || 0), 0);
    const totalPaletas = formData.productos.reduce((acc: any, p: any) => acc + (Number(p.paletas) || 0), 0);
    const isReception = formData.formType?.includes('recepcion');
    const operationTerm = isReception ? 'Descargue' : 'Cargue';

    return (
        <>
            <ReportSection title="Información General">
                <div className="grid grid-cols-3 gap-x-4 gap-y-1">
                    <ReportField label="Pedido SISLOG" value={formData.pedidoSislog} />
                    <ReportField label="Nombre Cliente" value={formData.nombreCliente} />
                    <ReportField label="Factura/Remisión" value={formData.facturaRemision} />
                    <ReportField label="Fecha" value={formData.fecha ? format(new Date(formData.fecha), "dd/MM/yyyy") : 'N/A'} />
                    <ReportField label={`Hora Inicio ${operationTerm}`} value={formData.horaInicio} />
                    <ReportField label={`Hora Fin ${operationTerm}`} value={formData.horaFin} />
                    <ReportField label="Precinto/Sello" value={formData.precinto} />
                    <ReportField label="Documento de Transporte" value={formData.documentoTransporte} />
                </div>
            </ReportSection>

            <ReportSection title="Características del Producto">
                <table className="w-full text-xs border-collapse">
                    <thead>
                        <tr className="border-b border-gray-400">
                            <th className="text-left p-1 font-bold">Código</th>
                            <th className="text-left p-1 font-bold">Descripción</th>
                            <th className="text-right p-1 font-bold">No. Cajas</th>
                            <th className="text-right p-1 font-bold">Total Pal/Cant</th>
                            <th className="text-right p-1 font-bold">Temp(°C)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {formData.productos.map((p: any, i: number) => (
                            <tr key={i} className="border-b border-gray-300">
                                <td className="p-1">{p.codigo}</td>
                                <td className="p-1">{p.descripcion}</td>
                                <td className="text-right p-1">{p.cajas}</td>
                                <td className="text-right p-1">{p.paletas?.toFixed(2)}</td>
                                <td className="text-right p-1">{p.temperatura}</td>
                            </tr>
                        ))}
                         <tr className="font-bold bg-gray-100">
                            <td className="p-1 text-right" colSpan={2}>TOTALES:</td>
                            <td className="text-right p-1">{totalCajas}</td>
                            <td className="text-right p-1">{totalPaletas.toFixed(2)}</td>
                            <td className="p-1"></td>
                        </tr>
                    </tbody>
                </table>
            </ReportSection>

            <ReportSection title="Información del Vehículo">
                 <div className="grid grid-cols-3 gap-x-4 gap-y-1">
                    <ReportField label="Nombre Conductor" value={formData.nombreConductor} />
                    <ReportField label="Cédula" value={formData.cedulaConductor} />
                    <ReportField label="Placa" value={formData.placa} />
                    <ReportField label="Muelle" value={formData.muelle} />
                    <ReportField label="Contenedor" value={formData.contenedor} />
                    <ReportField label="Set Point (°C)" value={formData.setPoint} />
                    <ReportField label="Cond. Higiene" value={formData.condicionesHigiene} />
                    <ReportField label="Termoregistrador" value={formData.termoregistrador} />
                    <ReportField label="Cliente Requiere Termoregistro" value={formData.clienteRequiereTermoregistro} />
                </div>
            </ReportSection>

            {formData.observaciones && (
                <ReportSection title="Observaciones Generales del Pedido">
                    <p className="text-xs">{formData.observaciones}</p>
                </ReportSection>
            )}

            <ReportSection title="Coordinador y Operario Responsables de la Operación">
                <div className="grid grid-cols-1 gap-y-1">
                    <ReportField label="Coordinador Responsable" value={formData.coordinador} />
                    <ReportField label="Operario Logístico Responsable" value={userDisplayName} />
                </div>
            </ReportSection>
            
            {attachments.length > 0 && (
                <ReportSection title="Anexos: Registros Fotográficos">
                    <div className="grid grid-cols-2 gap-4 pt-2">
                        {attachments.map((img, index) => (
                            <div key={index} className="text-center break-inside-avoid">
                                <div className="relative w-full h-48 border border-gray-300 rounded-md overflow-hidden">
                                     <Image src={img} alt={`Anexo ${index + 1}`} layout="fill" objectFit="contain" />
                                </div>
                                <p className="text-xs mt-1">Registro Fotográfico {index + 1}</p>
                            </div>
                        ))}
                    </div>
                </ReportSection>
            )}
        </>
    );
}
