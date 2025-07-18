
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

interface VariableWeightDispatchReportProps {
    formData: any;
    userDisplayName: string;
    attachments: string[];
}

export function VariableWeightDispatchReport({ formData, userDisplayName, attachments }: VariableWeightDispatchReportProps) {
    const operationTerm = 'Cargue';
    const fieldCellStyle: React.CSSProperties = { padding: '2px', fontSize: '11px', lineHeight: '1.4', verticalAlign: 'top' };
    
    // A form is in "summary format" if ANY item has a paleta value of 0. Otherwise, it's detailed.
    const isSummaryFormat = formData.items.some((p: any) => Number(p.paleta) === 0);

    const recalculatedSummary = (() => {
        const groupedByDesc = (formData.items || []).reduce((acc, item) => {
            if (!item?.descripcion?.trim()) return acc;
            const desc = item.descripcion.trim();
            if (!acc[desc]) {
                const summaryItem = formData.summary?.find(s => s.descripcion === desc);
                acc[desc] = {
                    descripcion: desc,
                    items: [],
                    temperatura: summaryItem?.temperatura,
                };
            }
            acc[desc].items.push(item);
            return acc;
        }, {} as Record<string, { descripcion: string; items: any[], temperatura: any }>);

        return Object.values(groupedByDesc).map(group => {
            let totalPeso = 0;
            let totalCantidad = 0;
            let totalPaletas = 0;
            const uniquePallets = new Set<number>();

            if (isSummaryFormat) {
                group.items.forEach(item => {
                    if (Number(item.paleta) === 0) {
                        totalPeso += Number(item.totalPesoNeto) || 0;
                        totalCantidad += Number(item.totalCantidad) || 0;
                        totalPaletas += Number(item.totalPaletas) || 0;
                    }
                });
            } else {
                group.items.forEach(item => {
                    totalPeso += Number(item.pesoNeto) || 0;
                    totalCantidad += Number(item.cantidadPorPaleta) || 0;
                    const paletaNum = Number(item.paleta);
                    if (!isNaN(paletaNum) && paletaNum > 0) {
                        uniquePallets.add(paletaNum);
                    }
                });
                totalPaletas = uniquePallets.size;
            }

            return {
                descripcion: group.descripcion,
                temperatura: group.temperatura,
                totalPeso,
                totalCantidad,
                totalPaletas,
            };
        });
    })();
    
    const totalGeneralPeso = recalculatedSummary.reduce((acc, p) => acc + (p.totalPeso || 0), 0);
    const totalGeneralCantidad = recalculatedSummary.reduce((acc, p) => acc + (p.totalCantidad || 0), 0);
    const totalGeneralPaletas = recalculatedSummary.reduce((acc, p) => acc + (p.totalPaletas || 0), 0);

    return (
        <>
            <ReportSection title="Datos del Despacho">
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
                             <td style={fieldCellStyle}></td>
                        </tr>
                    </tbody>
                </table>
            </ReportSection>

            <ReportSection title="Detalle del Despacho">
                <div style={{overflowX: 'auto'}}>
                    <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse', tableLayout: 'auto' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid #aaa' }}>
                                {isSummaryFormat ? (
                                    <>
                                        <th style={{ textAlign: 'left', padding: '4px', fontWeight: 'bold' }}>Descripción</th>
                                        <th style={{ textAlign: 'left', padding: '4px', fontWeight: 'bold' }}>Lote</th>
                                        <th style={{ textAlign: 'left', padding: '4px', fontWeight: 'bold' }}>Presentación</th>
                                        <th style={{ textAlign: 'right', padding: '4px', fontWeight: 'bold' }}>Total Cant.</th>
                                        <th style={{ textAlign: 'right', padding: '4px', fontWeight: 'bold' }}>Total Paletas</th>
                                        <th style={{ textAlign: 'right', padding: '4px', fontWeight: 'bold' }}>Total P. Neto</th>
                                    </>
                                ) : (
                                    <>
                                        <th style={{ textAlign: 'left', padding: '4px', fontWeight: 'bold' }}>Paleta</th>
                                        <th style={{ textAlign: 'left', padding: '4px', fontWeight: 'bold' }}>Descripción</th>
                                        <th style={{ textAlign: 'left', padding: '4px', fontWeight: 'bold' }}>Lote</th>
                                        <th style={{ textAlign: 'left', padding: '4px', fontWeight: 'bold' }}>Presentación</th>
                                        <th style={{ textAlign: 'right', padding: '4px', fontWeight: 'bold' }}>Cant.</th>
                                        <th style={{ textAlign: 'right', padding: '4px', fontWeight: 'bold' }}>P. Bruto</th>
                                        <th style={{ textAlign: 'right', padding: '4px', fontWeight: 'bold' }}>T. Estiba</th>
                                        <th style={{ textAlign: 'right', padding: '4px', fontWeight: 'bold' }}>T. Caja</th>
                                        <th style={{ textAlign: 'right', padding: '4px', fontWeight: 'bold' }}>Total Tara</th>
                                        <th style={{ textAlign: 'right', padding: '4px', fontWeight: 'bold' }}>P. Neto</th>
                                    </>
                                )}
                            </tr>
                        </thead>
                        <tbody>
                            {formData.items.map((p: any, i: number) => {
                                if (isSummaryFormat) {
                                   return (
                                        <tr key={i} style={{ borderBottom: '1px solid #ddd' }}>
                                            <td style={{ padding: '4px' }}>{`${p.descripcion}`}</td>
                                            <td style={{ padding: '4px' }}>{p.lote}</td>
                                            <td style={{ padding: '4px' }}>{p.presentacion}</td>
                                            <td style={{ textAlign: 'right', padding: '4px' }}>{p.totalCantidad}</td>
                                            <td style={{ textAlign: 'right', padding: '4px' }}>{p.totalPaletas}</td>
                                            <td style={{ textAlign: 'right', padding: '4px' }}>{p.totalPesoNeto?.toFixed(2)}</td>
                                        </tr>
                                    );
                                } else {
                                     return (
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
                                    );
                                }
                            })}
                        </tbody>
                    </table>
                </div>
            </ReportSection>

            {recalculatedSummary && recalculatedSummary.length > 0 && (
                <ReportSection title="Resumen de Productos">
                    <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                        <thead>
                             <tr style={{ borderBottom: '1px solid #aaa' }}>
                                <th style={{ textAlign: 'left', padding: '4px', fontWeight: 'bold' }}>Descripción</th>
                                <th style={{ textAlign: 'right', padding: '4px', fontWeight: 'bold' }}>Temp(°C)</th>
                                <th style={{ textAlign: 'right', padding: '4px', fontWeight: 'bold' }}>Total Cantidad</th>
                                <th style={{ textAlign: 'right', padding: '4px', fontWeight: 'bold' }}>Total Paletas</th>
                                <th style={{ textAlign: 'right', padding: '4px', fontWeight: 'bold' }}>Total Peso (kg)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {recalculatedSummary.map((p, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid #ddd' }}>
                                    <td style={{ padding: '4px' }}>{p.descripcion}</td>
                                    <td style={{ textAlign: 'right', padding: '4px' }}>{p.temperatura}</td>
                                    <td style={{ textAlign: 'right', padding: '4px' }}>{p.totalCantidad}</td>
                                    <td style={{ textAlign: 'right', padding: '4px' }}>{p.totalPaletas}</td>
                                    <td style={{ textAlign: 'right', padding: '4px' }}>{p.totalPeso?.toFixed(2)}</td>
                                </tr>
                            ))}
                            <tr style={{ fontWeight: 'bold', backgroundColor: '#f1f5f9' }}>
                                <td style={{ padding: '4px', textAlign: 'right' }} colSpan={2}>TOTALES:</td>
                                <td style={{ textAlign: 'right', padding: '4px' }}>{totalGeneralCantidad}</td>
                                <td style={{ textAlign: 'right', padding: '4px' }}>{totalGeneralPaletas}</td>
                                <td style={{ textAlign: 'right', padding: '4px' }}>{totalGeneralPeso.toFixed(2)}</td>
                            </tr>
                        </tbody>
                    </table>
                </ReportSection>
            )}

            {formData.observaciones && (
                <ReportSection title="Observaciones">
                    <p style={{ fontSize: '11px', margin: 0 }}>{formData.observaciones}</p>
                </ReportSection>
            )}

            <ReportSection title="Responsables de la Operación">
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                     <tbody>
                        <tr>
                            <td style={{...fieldCellStyle, width: '33.33%'}}><ReportField label="Coordinador" value={formData.coordinador} /></td>
                            <td style={{...fieldCellStyle, width: '33.33%'}}><ReportField label="Operario" value={userDisplayName} /></td>
                            <td style={{...fieldCellStyle, width: '33.33%'}}><ReportField label="Aplica Cuadrilla" value={formData.aplicaCuadrilla ? formData.aplicaCuadrilla.charAt(0).toUpperCase() + formData.aplicaCuadrilla.slice(1) : 'N/A'} /></td>
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
