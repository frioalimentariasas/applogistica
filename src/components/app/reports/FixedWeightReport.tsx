import Image from 'next/image';
import { format } from 'date-fns';

const ReportSection = ({ title, children }: { title: string, children: React.ReactNode }) => (
    <div style={{ breakInside: 'avoid', pageBreakInside: 'avoid', marginBottom: '12px' }}>
        <div style={{ border: '1px solid #aaa', borderRadius: '8px', overflow: 'hidden' }}>
            <h2 style={{ backgroundColor: '#e2e8f0', padding: '4px 12px', fontSize: '12px', fontWeight: 'bold', color: '#1a202c', borderBottom: '1px solid #aaa', margin: 0 }}>
                {title}
            </h2>
            <div style={{ padding: '12px' }}>
                {children}
            </div>
        </div>
    </div>
);

const ReportField = ({ label, value }: { label: string, value: any }) => (
    <div style={{ fontSize: '11px', lineHeight: '1.4' }}>
      <span style={{ fontWeight: 'bold' }}>{label}: </span>
      <span>{value || 'N/A'}</span>
    </div>
);

interface FixedWeightReportProps {
    formData: any;
    userDisplayName: string;
    attachments: string[];
    formType: string;
}

export function FixedWeightReport({ formData, userDisplayName, attachments, formType }: FixedWeightReportProps) {
    const totalCajas = formData.productos.reduce((acc: any, p: any) => acc + (Number(p.cajas) || 0), 0);
    const totalPaletas = formData.productos.reduce((acc: any, p: any) => acc + (Number(p.paletas) || 0), 0);
    const isReception = formType.includes('recepcion');
    const operationTerm = isReception ? 'Descargue' : 'Cargue';

    return (
        <>
            <ReportSection title="Información General">
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                        <tr>
                            <td style={{ width: '33%', padding: '2px' }}><ReportField label="Pedido SISLOG" value={formData.pedidoSislog} /></td>
                            <td style={{ width: '33%', padding: '2px' }}><ReportField label="Nombre Cliente" value={formData.nombreCliente} /></td>
                            <td style={{ width: '33%', padding: '2px' }}><ReportField label="Factura/Remisión" value={formData.facturaRemision} /></td>
                        </tr>
                        <tr>
                            <td style={{ padding: '2px' }}><ReportField label="Fecha" value={formData.fecha ? format(new Date(formData.fecha), "dd/MM/yyyy") : 'N/A'} /></td>
                            <td style={{ padding: '2px' }}><ReportField label={`Hora Inicio ${operationTerm}`} value={formData.horaInicio} /></td>
                            <td style={{ padding: '2px' }}><ReportField label={`Hora Fin ${operationTerm}`} value={formData.horaFin} /></td>
                        </tr>
                        <tr>
                            <td style={{ padding: '2px' }}><ReportField label="Precinto/Sello" value={formData.precinto} /></td>
                            <td style={{ padding: '2px' }}><ReportField label="Documento de Transporte" value={formData.documentoTransporte} /></td>
                            <td style={{ padding: '2px' }}></td>
                        </tr>
                    </tbody>
                </table>
            </ReportSection>

            <ReportSection title="Características del Producto">
                <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid #aaa' }}>
                            <th style={{ textAlign: 'left', padding: '4px', fontWeight: 'bold' }}>Código</th>
                            <th style={{ textAlign: 'left', padding: '4px', fontWeight: 'bold' }}>Descripción</th>
                            <th style={{ textAlign: 'right', padding: '4px', fontWeight: 'bold' }}>No. Cajas</th>
                            <th style={{ textAlign: 'right', padding: '4px', fontWeight: 'bold' }}>Total Pal/Cant</th>
                            <th style={{ textAlign: 'right', padding: '4px', fontWeight: 'bold' }}>Temp(°C)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {formData.productos.map((p: any, i: number) => (
                            <tr key={i} style={{ borderBottom: '1px solid #ddd' }}>
                                <td style={{ padding: '4px' }}>{p.codigo}</td>
                                <td style={{ padding: '4px' }}>{p.descripcion}</td>
                                <td style={{ textAlign: 'right', padding: '4px' }}>{p.cajas}</td>
                                <td style={{ textAlign: 'right', padding: '4px' }}>{p.paletas?.toFixed(2)}</td>
                                <td style={{ textAlign: 'right', padding: '4px' }}>{p.temperatura}</td>
                            </tr>
                        ))}
                         <tr style={{ fontWeight: 'bold', backgroundColor: '#f1f5f9' }}>
                            <td style={{ padding: '4px', textAlign: 'right' }} colSpan={2}>TOTALES:</td>
                            <td style={{ textAlign: 'right', padding: '4px' }}>{totalCajas}</td>
                            <td style={{ textAlign: 'right', padding: '4px' }}>{totalPaletas.toFixed(2)}</td>
                            <td style={{ padding: '4px' }}></td>
                        </tr>
                    </tbody>
                </table>
            </ReportSection>

            <ReportSection title="Información del Vehículo">
                 <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                        <tr>
                           <td style={{ width: '33%', padding: '2px' }}><ReportField label="Nombre Conductor" value={formData.nombreConductor} /></td>
                           <td style={{ width: '33%', padding: '2px' }}><ReportField label="Cédula" value={formData.cedulaConductor} /></td>
                           <td style={{ width: '33%', padding: '2px' }}><ReportField label="Placa" value={formData.placa} /></td>
                        </tr>
                        <tr>
                            <td style={{ padding: '2px' }}><ReportField label="Muelle" value={formData.muelle} /></td>
                            <td style={{ padding: '2px' }}><ReportField label="Contenedor" value={formData.contenedor} /></td>
                            <td style={{ padding: '2px' }}><ReportField label="Set Point (°C)" value={formData.setPoint} /></td>
                        </tr>
                         <tr>
                            <td style={{ padding: '2px' }}><ReportField label="Cond. Higiene" value={formData.condicionesHigiene} /></td>
                            <td style={{ padding: '2px' }}><ReportField label="Termoregistrador" value={formData.termoregistrador} /></td>
                            <td style={{ padding: '2px' }}><ReportField label="Cliente Requiere Termoregistro" value={formData.clienteRequiereTermoregistro} /></td>
                        </tr>
                    </tbody>
                </table>
            </ReportSection>

            {formData.observaciones && (
                <ReportSection title="Observaciones Generales del Pedido">
                    <p style={{ fontSize: '11px' }}>{formData.observaciones}</p>
                </ReportSection>
            )}

            <ReportSection title="Coordinador y Operario Responsables de la Operación">
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                     <tbody>
                        <tr>
                            <td style={{ width: '50%', padding: '2px' }}><ReportField label="Coordinador Responsable" value={formData.coordinador} /></td>
                            <td style={{ width: '50%', padding: '2px' }}><ReportField label="Operario Logístico Responsable" value={userDisplayName} /></td>
                        </tr>
                    </tbody>
                </table>
            </ReportSection>
            
            {attachments.length > 0 && (
                <ReportSection title="Anexos: Registros Fotográficos">
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', paddingTop: '8px' }}>
                        {attachments.map((img, index) => (
                            <div key={index} style={{ textAlign: 'center', breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                                <div style={{ border: '1px solid #ccc', borderRadius: '4px', overflow: 'hidden', height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                     <img src={img} alt={`Anexo ${index + 1}`} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                                </div>
                                <p style={{ fontSize: '10px', marginTop: '4px' }}>Registro Fotográfico {index + 1}</p>
                            </div>
                        ))}
                    </div>
                </ReportSection>
            )}
        </>
    );
}
