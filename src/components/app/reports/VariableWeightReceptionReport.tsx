
import { parseISO } from 'date-fns';

const formatTime12Hour = (time24: string | undefined): string => {
    if (!time24 || !time24.includes(':')) return 'N/A';
    const [hours, minutes] = time24.split(':');
    let h = parseInt(hours, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    h = h ? h : 12; // the hour '0' should be '12'
    return `${h}:${minutes} ${ampm}`;
};

const formatDateLocal = (isoDateString: string | undefined): string => {
    if (!isoDateString) return 'N/A';
    try {
        const date = new Date(isoDateString.split('T')[0]);
        const day = String(date.getUTCDate()).padStart(2, '0');
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const year = date.getUTCFullYear();
        return `${day}/${month}/${year}`;
    } catch (e) {
        console.error("Error formatting date:", e);
        return 'Invalid Date';
    }
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
      <span>{value !== null && value !== undefined && !Number.isNaN(value) ? value : 'N/A'}</span>
    </>
);

interface VariableWeightReceptionReportProps {
    formData: any;
    userDisplayName: string;
    attachments: string[];
}

export function VariableWeightReceptionReport({ formData, userDisplayName, attachments }: VariableWeightReceptionReportProps) {
    
    // Recalculate summary here to ensure accuracy for old and new data
    const recalculatedSummary = (() => {
        const grouped = (formData.items || []).reduce((acc, item) => {
            if (!item?.descripcion?.trim()) return acc;
            const desc = item.descripcion.trim();

            const cantidad = Number(item.cantidadPorPaleta) || 0;
            const pesoNeto = Number(item.pesoNeto) || 0;
            const paleta = Number(item.paleta);

            if (!acc[desc]) {
                const summaryItem = formData.summary?.find(s => s.descripcion === desc);
                acc[desc] = {
                    descripcion: desc,
                    totalPeso: 0,
                    totalCantidad: 0,
                    paletas: new Set<number>(),
                    temperatura1: summaryItem?.temperatura1 ?? summaryItem?.temperatura, // Fallback for old data
                    temperatura2: summaryItem?.temperatura2,
                    temperatura3: summaryItem?.temperatura3,
                };
            }

            acc[desc].totalPeso += isNaN(pesoNeto) ? 0 : pesoNeto;
            acc[desc].totalCantidad += cantidad;
            if (!isNaN(paleta) && paleta > 0) {
                acc[desc].paletas.add(paleta);
            }
            
            return acc;
        }, {} as Record<string, { descripcion: string; totalPeso: number; totalCantidad: number; paletas: Set<number>; temperatura1: any; temperatura2: any; temperatura3: any; }>);

        return Object.values(grouped).map(group => ({
            descripcion: group.descripcion,
            totalPeso: group.totalPeso,
            totalCantidad: group.totalCantidad,
            totalPaletas: group.paletas.size,
            temperatura1: group.temperatura1,
            temperatura2: group.temperatura2,
            temperatura3: group.temperatura3,
        }));
    })();

    const totalPeso = recalculatedSummary.reduce((acc, p) => acc + (p.totalPeso || 0), 0);
    const totalCantidad = recalculatedSummary.reduce((acc, p) => acc + (p.totalCantidad || 0), 0);
    const totalGeneralPaletas = recalculatedSummary.reduce((acc, p) => acc + (p.totalPaletas || 0), 0);

    const operationTerm = 'Descargue';
    const fieldCellStyle: React.CSSProperties = { padding: '2px', fontSize: '11px', lineHeight: '1.4', verticalAlign: 'top' };

    return (
        <>
            <ReportSection title="Datos de la Recepción">
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                        <tr>
                            <td style={{...fieldCellStyle, width: '33.33%'}}><ReportField label="Pedido SISLOG" value={formData.pedidoSislog} /></td>
                            <td style={{...fieldCellStyle, width: '33.33%'}}><ReportField label="Cliente" value={formData.cliente} /></td>
                            <td style={{...fieldCellStyle, width: '33.33%'}}><ReportField label="Fecha" value={formatDateLocal(formData.fecha)} /></td>
                        </tr>
                        <tr>
                            <td style={fieldCellStyle}><ReportField label="Conductor" value={formData.conductor} /></td>
                            <td style={fieldCellStyle}><ReportField label="Cédula" value={formData.cedulaConductor} /></td>
                            <td style={fieldCellStyle}><ReportField label="Placa" value={formData.placa} /></td>
                        </tr>
                         <tr>
                            <td style={fieldCellStyle}><ReportField label="Precinto" value={formData.precinto} /></td>
                            <td style={fieldCellStyle}><ReportField label="Set Point (°C)" value={formData.setPoint} /></td>
                            <td style={fieldCellStyle}><ReportField label="Contenedor" value={formData.contenedor} /></td>
                        </tr>
                         <tr>
                            <td style={fieldCellStyle}><ReportField label={`Hora Inicio ${operationTerm}`} value={formatTime12Hour(formData.horaInicio)} /></td>
                            <td style={fieldCellStyle}><ReportField label={`Hora Fin ${operationTerm}`} value={formatTime12Hour(formData.horaFin)} /></td>
                             <td style={fieldCellStyle}><ReportField label="Factura/Remisión" value={formData.facturaRemision} /></td>
                        </tr>
                         <tr>
                            <td style={fieldCellStyle} colSpan={3}>
                                <ReportField label="Tipo Pedido" value={formData.tipoPedido} />
                                {formData.tipoPedido === 'MAQUILA' && formData.tipoEmpaqueMaquila && (
                                    <span style={{ marginLeft: '16px' }}>
                                        <ReportField label="Tipo Empaque" value={formData.tipoEmpaqueMaquila} />
                                    </span>
                                )}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </ReportSection>

            <ReportSection title="Detalle de la Recepción">
                 <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid #aaa' }}>
                            <th style={{ textAlign: 'left', padding: '4px', fontWeight: 'bold' }}>Paleta</th>
                            <th style={{ textAlign: 'left', padding: '4px', fontWeight: 'bold' }}>Descripción</th>
                            <th style={{ textAlign: 'left', padding: '4px', fontWeight: 'bold' }}>Lote</th>
                            <th style={{ textAlign: 'left', padding: '4px', fontWeight: 'bold' }}>Presentación</th>
                            <th style={{ textAlign: 'right', padding: '4px', fontWeight: 'bold' }}>Cant.</th>
                            <th style={{ textAlign: 'right', padding: '4px', fontWeight: 'bold' }}>Peso Bruto</th>
                            <th style={{ textAlign: 'right', padding: '4px', fontWeight: 'bold' }}>Tara Estiba</th>
                            <th style={{ textAlign: 'right', padding: '4px', fontWeight: 'bold' }}>Tara Caja</th>
                            <th style={{ textAlign: 'right', padding: '4px', fontWeight: 'bold' }}>Total Tara</th>
                            <th style={{ textAlign: 'right', padding: '4px', fontWeight: 'bold' }}>Peso Neto</th>
                        </tr>
                    </thead>
                    <tbody>
                        {formData.items.map((p: any, i: number) => (
                            <tr key={i} style={{ borderBottom: '1px solid #ddd' }}>
                                <td style={{ padding: '4px' }}>{p.paleta}</td>
                                <td style={{ padding: '4px' }}>{p.descripcion}</td>
                                <td style={{ padding: '4px' }}>{p.lote}</td>
                                <td style={{ padding: '4px' }}>{p.presentacion}</td>
                                <td style={{ textAlign: 'right', padding: '4px' }}>{p.cantidadPorPaleta}</td>
                                <td style={{ textAlign: 'right', padding: '4px' }}>{p.pesoBruto?.toFixed(2)}</td>
                                <td style={{ textAlign: 'right', padding: '4px' }}>{p.taraEstiba?.toFixed(2)}</td>
                                <td style={{ textAlign: 'right', padding: '4px' }}>{p.taraCaja?.toFixed(2)}</td>
                                <td style={{ textAlign: 'right', padding: '4px' }}>{p.totalTaraCaja?.toFixed(2)}</td>
                                <td style={{ textAlign: 'right', padding: '4px' }}>{p.pesoNeto?.toFixed(2)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </ReportSection>

             {recalculatedSummary && recalculatedSummary.length > 0 && (
                <ReportSection title="Resumen de Productos">
                    <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid #aaa' }}>
                                <th style={{ textAlign: 'left', padding: '4px', fontWeight: 'bold' }}>Descripción</th>
                                <th style={{ textAlign: 'right', padding: '4px', fontWeight: 'bold' }}>Temperaturas(°C)</th>
                                <th style={{ textAlign: 'right', padding: '4px', fontWeight: 'bold' }}>Total Paletas</th>
                                <th style={{ textAlign: 'right', padding: '4px', fontWeight: 'bold' }}>Total Cantidad</th>
                                <th style={{ textAlign: 'right', padding: '4px', fontWeight: 'bold' }}>Total Peso (kg)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {recalculatedSummary.map((p, i) => {
                                const temps = [p.temperatura1, p.temperatura2, p.temperatura3].filter(t => t != null && !isNaN(t));
                                const tempString = temps.join(' / ');
                                return (
                                <tr key={i} style={{ borderBottom: '1px solid #ddd' }}>
                                    <td style={{ padding: '4px' }}>{p.descripcion}</td>
                                    <td style={{ textAlign: 'right', padding: '4px' }}>{tempString}</td>
                                    <td style={{ textAlign: 'right', padding: '4px' }}>{p.totalPaletas || 0}</td>
                                    <td style={{ textAlign: 'right', padding: '4px' }}>{p.totalCantidad}</td>
                                    <td style={{ textAlign: 'right', padding: '4px' }}>{p.totalPeso?.toFixed(2)}</td>
                                </tr>
                            )})}
                            <tr style={{ fontWeight: 'bold', backgroundColor: '#f1f5f9' }}>
                                <td style={{ padding: '4px', textAlign: 'right' }} colSpan={2}>TOTALES:</td>
                                <td style={{ textAlign: 'right', padding: '4px' }}>{totalGeneralPaletas}</td>
                                <td style={{ textAlign: 'right', padding: '4px' }}>{totalCantidad}</td>
                                <td style={{ textAlign: 'right', padding: '4px' }}>{totalPeso.toFixed(2)}</td>
                            </tr>
                        </tbody>
                    </table>
                </ReportSection>
            )}

            {formData.observaciones && formData.observaciones.length > 0 && (
                 <ReportSection title="Observaciones">
                    <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid #aaa' }}>
                                <th style={{ textAlign: 'left', padding: '4px', fontWeight: 'bold' }}>Tipo</th>
                                <th style={{ textAlign: 'right', padding: '4px', fontWeight: 'bold' }}>Cantidad</th>
                                <th style={{ textAlign: 'left', padding: '4px', fontWeight: 'bold' }}>Ejecutado por Grupo Rosales</th>
                            </tr>
                        </thead>
                        <tbody>
                            {formData.observaciones.map((obs: any, i: number) => {
                                const isOther = obs.type === 'OTRAS OBSERVACIONES';
                                return (
                                <tr key={i} style={{ borderBottom: '1px solid #ddd' }}>
                                    {isOther ? (
                                        <td style={{ padding: '4px', width: '100%' }} colSpan={3}>
                                            <strong>OTRAS OBSERVACIONES: </strong>{obs.customType}
                                        </td>
                                    ) : (
                                        <>
                                            <td style={{ padding: '4px', width: '60%' }}>
                                                <strong>{obs.type}</strong>
                                            </td>
                                            <td style={{ textAlign: 'right', padding: '4px' }}>
                                                {`${obs.quantity ?? ''} ${obs.quantityType || ''}`.trim()}
                                            </td>
                                            <td style={{ padding: '4px' }}>
                                                {obs.executedByGrupoRosales ? 'Sí' : 'No'}
                                            </td>
                                        </>
                                    )}
                                </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </ReportSection>
            )}

            <ReportSection title="Responsables de la Operación">
                 <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                     <tbody>
                        <tr>
                            <td style={{...fieldCellStyle, width: '33.33%'}}><ReportField label="Coordinador" value={formData.coordinador} /></td>
                            <td style={{...fieldCellStyle, width: '33.33%'}}><ReportField label="Operario" value={userDisplayName} /></td>
                            <td style={{...fieldCellStyle, width: '33.33%'}}>
                                <ReportField label="Operación Realizada por Cuadrilla" value={formData.aplicaCuadrilla ? formData.aplicaCuadrilla.charAt(0).toUpperCase() + formData.aplicaCuadrilla.slice(1) : 'N/A'} />
                                {formData.aplicaCuadrilla === 'si' && formData.tipoPedido === 'MAQUILA' && formData.numeroOperariosCuadrilla && (
                                    <div style={{ marginLeft: '8px', fontSize: '10px' }}>
                                        ↳ No. Operarios: {formData.numeroOperariosCuadrilla}
                                    </div>
                                )}
                            </td>
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
