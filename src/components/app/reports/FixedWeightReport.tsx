
import { format } from 'date-fns';

const formatTime12Hour = (time24: string | undefined): string => {
    if (!time24 || !time24.includes(':')) return 'N/A';
    const [hours, minutes] = time24.split(':');
    let h = parseInt(hours, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    h = h ? h : 12; // the hour '0' should be '12'
    return `${h}:${minutes} ${ampm}`;
};

const ReportSection = ({ title, children }: { title: string, children: React.ReactNode }) => (
    <div style={{ marginBottom: '12px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #aaa', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
            <thead>
                <tr>
                    <th style={{ backgroundColor: '#e2e8f0', padding: '4px 12px', fontSize: '12px', fontWeight: 'bold', color: '#1a202c', borderBottom: '1px solid #aaa', textAlign: 'left' }}>
                        {title}
                    </th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td style={{ padding: '12px' }}>
                        {children}
                    </td>
                </tr>
            </tbody>
        </table>
    </div>
);

const ReportField = ({ label, value }: { label: string, value: any }) => (
    <>
      <span style={{ fontWeight: 'bold' }}>{label}: </span>
      <span>{value || 'N/A'}</span>
    </>
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

    const fieldCellStyle: React.CSSProperties = { padding: '2px', fontSize: '11px', lineHeight: '1.4', verticalAlign: 'top' };

    return (
        <>
            <ReportSection title="Información General">
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                        <tr>
                            <td style={{...fieldCellStyle, width: '33.33%'}}><ReportField label="Pedido SISLOG" value={formData.pedidoSislog} /></td>
                            <td style={{...fieldCellStyle, width: '33.33%'}}><ReportField label="Nombre Cliente" value={formData.nombreCliente} /></td>
                            <td style={{...fieldCellStyle, width: '33.33%'}}><ReportField label="Factura/Remisión" value={formData.facturaRemision} /></td>
                        </tr>
                        <tr>
                            <td style={fieldCellStyle}><ReportField label="Fecha" value={formData.fecha ? format(new Date(formData.fecha), "dd/MM/yyyy") : 'N/A'} /></td>
                            <td style={fieldCellStyle}><ReportField label={`Hora Inicio ${operationTerm}`} value={formatTime12Hour(formData.horaInicio)} /></td>
                            <td style={fieldCellStyle}><ReportField label={`Hora Fin ${operationTerm}`} value={formatTime12Hour(formData.horaFin)} /></td>
                        </tr>
                        <tr>
                            <td style={fieldCellStyle}><ReportField label="Precinto/Sello" value={formData.precinto} /></td>
                            <td style={fieldCellStyle}><ReportField label="Doc. Transp." value={formData.documentoTransporte} /></td>
                            <td style={fieldCellStyle}></td>
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
                           <td style={{...fieldCellStyle, width: '33.33%'}}><ReportField label="Nombre Conductor" value={formData.nombreConductor} /></td>
                           <td style={{...fieldCellStyle, width: '33.33%'}}><ReportField label="Cédula" value={formData.cedulaConductor} /></td>
                           <td style={{...fieldCellStyle, width: '33.33%'}}><ReportField label="Placa" value={formData.placa} /></td>
                        </tr>
                        <tr>
                            <td style={fieldCellStyle}><ReportField label="Muelle" value={formData.muelle} /></td>
                            <td style={fieldCellStyle}><ReportField label="Contenedor" value={formData.contenedor} /></td>
                            <td style={fieldCellStyle}><ReportField label="Set Point (°C)" value={formData.setPoint} /></td>
                        </tr>
                         <tr>
                            <td style={fieldCellStyle}><ReportField label="Cond. Higiene" value={formData.condicionesHigiene} /></td>
                            <td style={fieldCellStyle}><ReportField label="Termoregistrador" value={formData.termoregistrador} /></td>
                            <td style={fieldCellStyle}><ReportField label="Cliente Requiere Termoregistro" value={formData.clienteRequiereTermoregistro} /></td>
                        </tr>
                    </tbody>
                </table>
            </ReportSection>

            {formData.observaciones && (
                <ReportSection title="Observaciones Generales del Pedido">
                    <p style={{ fontSize: '11px', margin: 0 }}>{formData.observaciones}</p>
                </ReportSection>
            )}

            <ReportSection title="Coordinador y Operario Responsables de la Operación">
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                     <tbody>
                        <tr>
                            <td style={{...fieldCellStyle, width: '50%'}}><ReportField label="Coordinador Responsable" value={formData.coordinador} /></td>
                            <td style={{...fieldCellStyle, width: '50%'}}><ReportField label="Operario Responsable" value={userDisplayName} /></td>
                        </tr>
                    </tbody>
                </table>
            </ReportSection>
            
            {attachments.length > 0 && (
                <ReportSection title="Anexos: Registros Fotográficos">
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <tbody>
                            {Array.from({ length: Math.ceil(attachments.length / 2) }).map((_, rowIndex) => (
                                <tr key={rowIndex}>
                                    {attachments.slice(rowIndex * 2, rowIndex * 2 + 2).map((img, colIndex) => (
                                        <td key={colIndex} style={{ width: '50%', padding: '8px', verticalAlign: 'top', textAlign: 'center' }}>
                                            <div style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                                                <img src={img} alt={`Anexo ${rowIndex * 2 + colIndex + 1}`} style={{ maxWidth: '100%', border: '1px solid #ccc', borderRadius: '4px', objectFit: 'contain' }} />
                                                <p style={{ fontSize: '10px', marginTop: '4px', marginBlock: 0 }}>Registro Fotográfico {rowIndex * 2 + colIndex + 1}</p>
                                            </div>
                                        </td>
                                    ))}
                                    {attachments.slice(rowIndex * 2, rowIndex * 2 + 2).length === 1 && <td style={{ width: '50%' }}></td>}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </ReportSection>
            )}
        </>
    );
}
