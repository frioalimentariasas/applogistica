
import Image from 'next/image';
import { format } from 'date-fns';

const ReportSection = ({ title, children, className }: { title: string, children: React.ReactNode, className?: string }) => (
    <div className="mb-3" style={{ breakInside: 'avoid-page' }}>
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

interface VariableWeightReceptionReportProps {
    formData: any;
    userDisplayName: string;
    attachments: string[];
}

export function VariableWeightReceptionReport({ formData, userDisplayName, attachments }: VariableWeightReceptionReportProps) {
    const totalPeso = formData.summary?.reduce((acc: any, p: any) => acc + (p.totalPeso || 0), 0) || 0;
    const totalCantidad = formData.summary?.reduce((acc: any, p: any) => acc + (p.totalCantidad || 0), 0) || 0;
    const operationTerm = 'Descargue';

    return (
        <>
            <ReportSection title="Datos de la Recepción">
                <div className="grid grid-cols-3 gap-x-4 gap-y-1">
                    <ReportField label="Pedido SISLOG" value={formData.pedidoSislog} />
                    <ReportField label="Cliente" value={formData.cliente} />
                    <ReportField label="Fecha" value={formData.fecha ? format(new Date(formData.fecha), "dd/MM/yyyy") : 'N/A'} />
                    <ReportField label="Conductor" value={formData.conductor} />
                    <ReportField label="Cédula" value={formData.cedulaConductor} />
                    <ReportField label="Placa" value={formData.placa} />
                    <ReportField label="Precinto" value={formData.precinto} />
                    <ReportField label="Set Point (°C)" value={formData.setPoint} />
                    <ReportField label={`Hora Inicio ${operationTerm}`} value={formData.horaInicio} />
                    <ReportField label={`Hora Fin ${operationTerm}`} value={formData.horaFin} />
                </div>
            </ReportSection>

            <ReportSection title="Detalle de la Recepción">
                <table className="w-full text-xs border-collapse">
                    <thead>
                        <tr className="border-b border-gray-400">
                            <th className="text-left p-1 font-bold">Paleta</th>
                            <th className="text-left p-1 font-bold">Descripción</th>
                            <th className="text-left p-1 font-bold">Lote</th>
                            <th className="text-right p-1 font-bold">Cant.</th>
                            <th className="text-right p-1 font-bold">Peso Bruto</th>
                            <th className="text-right p-1 font-bold">Tara Estiba</th>
                            <th className="text-right p-1 font-bold">Tara Caja</th>
                            <th className="text-right p-1 font-bold">Total Tara</th>
                            <th className="text-right p-1 font-bold">Peso Neto</th>
                        </tr>
                    </thead>
                    <tbody>
                        {formData.items.map((p: any, i: number) => (
                            <tr key={i} className="border-b border-gray-300">
                                <td className="p-1">{p.paleta}</td>
                                <td className="p-1">{p.descripcion}</td>
                                <td className="p-1">{p.lote}</td>
                                <td className="text-right p-1">{p.cantidadPorPaleta}</td>
                                <td className="text-right p-1">{p.pesoBruto?.toFixed(2)}</td>
                                <td className="text-right p-1">{p.taraEstiba?.toFixed(2)}</td>
                                <td className="text-right p-1">{p.taraCaja?.toFixed(2)}</td>
                                <td className="text-right p-1">{p.totalTaraCaja?.toFixed(2)}</td>
                                <td className="text-right p-1">{p.pesoNeto?.toFixed(2)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </ReportSection>

             {formData.summary && formData.summary.length > 0 && (
                <ReportSection title="Resumen de Productos">
                    <table className="w-full text-xs border-collapse">
                        <thead>
                            <tr className="border-b border-gray-400">
                                <th className="text-left p-1 font-bold">Descripción</th>
                                <th className="text-right p-1 font-bold">Temp(°C)</th>
                                <th className="text-right p-1 font-bold">Total Cantidad</th>
                                <th className="text-right p-1 font-bold">Total Peso (kg)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {formData.summary.map((p: any, i: number) => (
                                <tr key={i} className="border-b border-gray-300">
                                    <td className="p-1">{p.descripcion}</td>
                                    <td className="text-right p-1">{p.temperatura}</td>
                                    <td className="text-right p-1">{p.totalCantidad}</td>
                                    <td className="text-right p-1">{p.totalPeso?.toFixed(2)}</td>
                                </tr>
                            ))}
                            <tr className="font-bold bg-gray-100">
                                <td className="p-1 text-right" colSpan={2}>TOTALES:</td>
                                <td className="text-right p-1">{totalCantidad}</td>
                                <td className="text-right p-1">{totalPeso.toFixed(2)}</td>
                            </tr>
                        </tbody>
                    </table>
                </ReportSection>
            )}

            {formData.observaciones && (
                <ReportSection title="Observaciones">
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
                            <div key={index} className="text-center" style={{ breakInside: 'avoid' }}>
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
