

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
        // Create a date object from the ISO string (which is in UTC)
        const date = new Date(isoDateString);
        
        // Manually adjust for Colombia's timezone (UTC-5)
        // This avoids issues with daylight saving time if we were to use a named timezone
        date.setUTCHours(date.getUTCHours() - 5);

        // Extract the day, month, and year from the *adjusted* date
        const day = String(date.getUTCDate()).padStart(2, '0');
        const month = String(date.getUTCMonth() + 1).padStart(2, '0'); // Month is 0-indexed
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

const formatPaletas = (num: any): string => {
    const number = Number(num);
    if (num === null || num === undefined || isNaN(number)) return '0';
    return String(Math.floor(number));
};

const formatTipoPedido = (tipo: string | undefined): string => {
    if (tipo === 'DESPACHO GENERICO') return 'GENERICO';
    return tipo || 'N/A';
};


interface FixedWeightReportProps {
    formData: any;
    userDisplayName: string;
    attachments: string[];
    formType: string;
}

export function FixedWeightReport({ formData, userDisplayName, attachments, formType }: FixedWeightReportProps) {
    const totalCajas = formData.productos.reduce((acc: any, p: any) => acc + (Number(p.cajas) || 0), 0);
    const totalPaletasCompletas = formData.productos.reduce((acc: any, p: any) => acc + (Number(p.paletasCompletas) || 0), 0);
    const totalPaletasPicking = formData.productos.reduce((acc: any, p: any) => acc + (Number(p.paletasPicking) || 0), 0);
    const totalPesoNetoKg = formData.productos.reduce((acc: any, p: any) => acc + (Number(p.pesoNetoKg) || 0), 0);

    const showPesoNetoColumn = formData.productos.some((p: any) => Number(p.pesoNetoKg) > 0);

    const isReception = formType.includes('recepcion');
    const operationTerm = isReception ? 'Descargue' : 'Cargue';

    const fieldCellStyle: React.CSSProperties = { padding: '2px', fontSize: '11px', lineHeight: '1.4', verticalAlign: 'top' };
    
    const hasStandardObservations = (formData.observaciones || []).some(
        (obs: any) => obs.type !== 'OTRAS OBSERVACIONES'
    );

    return (
        <>
            <ReportSection title="Información General">
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                        <tr>
                            <td style={{...fieldCellStyle, width: '33.33%'}}><ReportField label="Pedido SISLOG" value={formData.pedidoSislog} /></td>
                            <td style={{...fieldCellStyle, width: '33.33%'}}><ReportField label="Nombre Cliente" value={formData.nombreCliente} /></td>
                            <td style={{...fieldCellStyle, width: '33.33%'}}><ReportField label="Precinto/Sello" value={formData.precinto} /></td>
                        </tr>
                        <tr>
                            <td style={fieldCellStyle}><ReportField label="Fecha" value={formatDateLocal(formData.fecha)} /></td>
                            <td style={fieldCellStyle}><ReportField label={`Hora Inicio ${operationTerm}`} value={formatTime12Hour(formData.horaInicio)} /></td>
                            <td style={fieldCellStyle}><ReportField label={`Hora Fin ${operationTerm}`} value={formatTime12Hour(formData.horaFin)} /></td>
                        </tr>
                         <tr>
                            <td style={fieldCellStyle}><ReportField label="Doc. Transp." value={formData.documentoTransporte} /></td>
                            <td style={fieldCellStyle}><ReportField label="Factura/Remisión" value={formData.facturaRemision} /></td>
                             <td style={fieldCellStyle}>
                                <ReportField label="Tipo Pedido" value={formatTipoPedido(formData.tipoPedido)} />
                            </td>
                        </tr>
                        {formData.tipoPedido === 'MAQUILA' && (
                             <tr>
                                <td style={fieldCellStyle} colSpan={3}>
                                    <div style={{ marginLeft: '8px', fontSize: '10px' }}>
                                        ↳ <ReportField label="Tipo Empaque" value={formData.tipoEmpaqueMaquila} />
                                    </div>
                                </td>
                            </tr>
                        )}
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
                            <th style={{ textAlign: 'right', padding: '4px', fontWeight: 'bold' }}>Pal. Completas</th>
                            <th style={{ textAlign: 'right', padding: '4px', fontWeight: 'bold' }}>Pal. Picking</th>
                            {showPesoNetoColumn && <th style={{ textAlign: 'right', padding: '4px', fontWeight: 'bold' }}>Peso Neto (kg)</th>}
                            <th style={{ textAlign: 'right', padding: '4px', fontWeight: 'bold' }}>Temperaturas (°C)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {formData.productos.map((p: any, i: number) => {
                            const temps = [p.temperatura1, p.temperatura2, p.temperatura3]
                                .filter(t => t != null && !isNaN(Number(t)));
                            const tempString = temps.join(' / ');
                            return (
                                <tr key={i} style={{ borderBottom: '1px solid #ddd' }}>
                                    <td style={{ padding: '4px' }}>{p.codigo}</td>
                                    <td style={{ padding: '4px' }}>{p.descripcion}</td>
                                    <td style={{ textAlign: 'right', padding: '4px' }}>{p.cajas}</td>
                                    <td style={{ textAlign: 'right', padding: '4px' }}>{formatPaletas(p.paletasCompletas)}</td>
                                    <td style={{ textAlign: 'right', padding: '4px' }}>{formatPaletas(p.paletasPicking)}</td>
                                    {showPesoNetoColumn && <td style={{ textAlign: 'right', padding: '4px' }}>{Number(p.pesoNetoKg) > 0 ? Number(p.pesoNetoKg).toFixed(2) : ''}</td>}
                                    <td style={{ textAlign: 'right', padding: '4px' }}>{tempString}</td>
                                </tr>
                            )
                        })}
                         <tr style={{ fontWeight: 'bold', backgroundColor: '#f1f5f9' }}>
                            <td style={{ padding: '4px', textAlign: 'right' }} colSpan={2}>TOTALES:</td>
                            <td style={{ textAlign: 'right', padding: '4px' }}>{totalCajas}</td>
                            <td style={{ textAlign: 'right', padding: '4px' }}>{formatPaletas(totalPaletasCompletas)}</td>
                            <td style={{ textAlign: 'right', padding: '4px' }}>{formatPaletas(totalPaletasPicking)}</td>
                            {showPesoNetoColumn && <td style={{ textAlign: 'right', padding: '4px' }}>{totalPesoNetoKg > 0 ? totalPesoNetoKg.toFixed(2) : ''}</td>}
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
            
            {formData.observaciones && formData.observaciones.length > 0 && (
                 <ReportSection title="Observaciones">
                    <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                        {hasStandardObservations && (
                             <thead>
                                <tr style={{ borderBottom: '1px solid #aaa' }}>
                                    <th style={{ textAlign: 'left', padding: '4px', fontWeight: 'bold' }}>Tipo</th>
                                    <th style={{ textAlign: 'right', padding: '4px', fontWeight: 'bold' }}>Cantidad</th>
                                    <th style={{ textAlign: 'left', padding: '4px', fontWeight: 'bold', textTransform: 'uppercase' }}>REALIZADO POR CUADRILLA</th>
                                </tr>
                            </thead>
                        )}
                        <tbody>
                            {formData.observaciones.map((obs: any, i: number) => {
                                const isOther = obs.type === 'OTRAS OBSERVACIONES';
                                const showCrewCheckbox = obs.type === 'REESTIBADO' || obs.type === 'TRANSBORDO CANASTILLA';
                                return (
                                <tr key={i} style={{ borderBottom: '1px solid #ddd' }}>
                                    {isOther ? (
                                        <td style={{ padding: '4px', width: '100%' }} colSpan={hasStandardObservations ? 3 : 1}>
                                            <strong style={{fontWeight: 'bold'}}>OTRAS OBSERVACIONES: </strong>{obs.customType}
                                        </td>
                                    ) : (
                                        <>
                                            <td style={{ padding: '4px', width: '60%' }}>
                                                <strong style={{fontWeight: 'bold'}}>{obs.type}</strong>
                                            </td>
                                            <td style={{ textAlign: 'right', padding: '4px' }}>
                                                {`${obs.quantity ?? ''} ${obs.quantityType || ''}`.trim()}
                                            </td>
                                            <td style={{ padding: '4px' }}>
                                                {showCrewCheckbox ? (obs.executedByGrupoRosales ? 'Sí' : 'No') : ''}
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
