

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

const ReportSection = ({ title, children, noPadding = false }: { title: string, children: React.ReactNode, noPadding?: boolean }) => (
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
                    <td style={{ padding: noPadding ? '0' : '12px' }}>
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

const formatTipoPedido = (tipo: string | undefined): string => {
    if (tipo === 'DESPACHO GENERICO') return 'GENERICO';
    return tipo || 'N/A';
};

interface VariableWeightDispatchReportProps {
    formData: any;
    userDisplayName: string;
    attachments: string[];
}

export function VariableWeightDispatchReport({ formData, userDisplayName, attachments }: VariableWeightDispatchReportProps) {
    const operationTerm = 'Cargue';
    const fieldCellStyle: React.CSSProperties = { padding: '2px', fontSize: '11px', lineHeight: '1.4', verticalAlign: 'top' };
    
    const allItems = formData.despachoPorDestino ? formData.destinos.flatMap((d: any) => d.items.map((i: any) => ({ ...i, destino: d.nombreDestino }))) : formData.items;
    const isSummaryFormat = allItems.some((p: any) => Number(p.paleta) === 0);

    const hasStandardObservations = (formData.observaciones || []).some(
        (obs: any) => obs.type !== 'OTRAS OBSERVACIONES'
    );
    
    const getSubtotalsForDestino = (items: any[]) => {
        return items.reduce((acc, item) => {
            if (isSummaryFormat) {
                acc.cantidad += Number(item.totalCantidad) || 0;
                acc.paletasCompletas += Number(item.paletasCompletas) || 0;
                acc.paletasPicking += Number(item.paletasPicking) || 0;
                acc.peso += Number(item.totalPesoNeto) || 0;
            } else {
                acc.cantidad += Number(item.cantidadPorPaleta) || 0;
                acc.peso += Number(item.pesoNeto) || 0;
            }
            return acc;
        }, { cantidad: 0, paletasCompletas: 0, paletasPicking: 0, peso: 0 });
    };

    const recalculatedSummary = (() => {
        const isIndividualPalletMode = allItems.every((item: any) => Number(item?.paleta) > 0);
        const shouldGroupByDestino = formData.despachoPorDestino && isIndividualPalletMode;

        const grouped = allItems.reduce((acc, item) => {
            if (!item?.descripcion?.trim()) return acc;
            const key = shouldGroupByDestino ? `${item.destino}|${item.descripcion}` : item.descripcion;

            if (!acc[key]) {
                 const summaryItem = formData.summary?.find((s: any) => (s.destino ? `${s.destino}|${s.descripcion}` : s.descripcion) === key);
                acc[key] = {
                    descripcion: item.descripcion,
                    destino: item.destino,
                    items: [],
                    temperatura: summaryItem?.temperatura,
                };
            }
            acc[key].items.push(item);
            return acc;
        }, {} as Record<string, { descripcion: string; destino?: string, items: any[], temperatura: any }>);

        return Object.values(grouped).map(group => {
            let totalPeso = 0;
            let totalCantidad = 0;
            let totalPaletas = 0;
            const uniquePallets = new Set<number>();
            if (isSummaryFormat) {
                group.items.forEach(item => {
                    totalPeso += Number(item.totalPesoNeto) || 0;
                    totalCantidad += Number(item.totalCantidad) || 0;
                    totalPaletas += (Number(item.paletasCompletas) || 0) + (Number(item.paletasPicking) || 0);
                });
            } else {
                group.items.forEach(item => {
                    totalPeso += Number(item.pesoNeto) || 0;
                    totalCantidad += Number(item.cantidadPorPaleta) || 0;
                    const paletaNum = Number(item.paleta);
                    if (!isNaN(paletaNum) && paletaNum > 0) uniquePallets.add(paletaNum);
                });
                totalPaletas = uniquePallets.size;
            }
            return { ...group, totalPeso, totalCantidad, totalPaletas };
        });
    })();
    
    const totalGeneralPeso = recalculatedSummary.reduce((acc, p) => acc + (p.totalPeso || 0), 0);
    const totalGeneralCantidad = recalculatedSummary.reduce((acc, p) => acc + (p.totalCantidad || 0), 0);
    
    const totalGeneralPaletas = (() => {
        if (isSummaryFormat) {
            return formData.despachoPorDestino
                ? formData.totalPaletasDespacho
                : recalculatedSummary.reduce((acc, p) => acc + (p.totalPaletas || 0), 0);
        }
        const uniquePallets = new Set<number>();
        let count999 = 0;
        allItems.forEach((i: any) => {
            const pNum = Number(i.paleta);
            if (!isNaN(pNum) && pNum > 0) {
                if (pNum === 999) {
                    count999++;
                } else {
                    uniquePallets.add(pNum);
                }
            }
        });
        return uniquePallets.size + count999;
    })();


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
                            <td style={fieldCellStyle}>
                                <ReportField label="Tipo Pedido" value={formatTipoPedido(formData.tipoPedido)} />
                                {formData.tipoPedido === 'MAQUILA' && (
                                    <div style={{ marginLeft: '8px', fontSize: '10px' }}>
                                         ↳ <ReportField label="Tipo Empaque" value={formData.tipoEmpaqueMaquila} />
                                    </div>
                                )}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </ReportSection>

            <ReportSection title="Detalle del Despacho" noPadding>
                 <div style={{overflowX: 'auto'}}>
                    {formData.despachoPorDestino ? (
                        formData.destinos.map((destino: any, destinoIndex: number) => {
                            const subtotals = getSubtotalsForDestino(destino.items);
                            if (!isSummaryFormat) {
                                const uniquePallets = new Set();
                                let pallets999Count = 0;
                                destino.items.forEach((item: any) => {
                                    const paletaNum = Number(item.paleta);
                                    if (!isNaN(paletaNum) && paletaNum > 0) {
                                        if (paletaNum === 999) {
                                            pallets999Count++;
                                        } else {
                                            uniquePallets.add(paletaNum);
                                        }
                                    }
                                });
                                subtotals.paletas = uniquePallets.size + pallets999Count;
                            }
                            return (
                            <div key={destinoIndex} style={{ marginBottom: '10px', breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                                <div style={{ backgroundColor: '#f1f5f9', padding: '6px 12px', fontWeight: 'bold', borderBottom: '1px solid #ddd', borderTop: destinoIndex > 0 ? '1px solid #aaa' : 'none' }}>
                                    Destino: {destino.nombreDestino}
                                </div>
                                <ItemsTable items={destino.items} isSummaryFormat={isSummaryFormat} />
                                <div style={{padding: '4px 12px', backgroundColor: '#fafafa', borderTop: '1px solid #ddd', textAlign: 'right', fontSize: '11px', fontWeight: 'bold'}}>
                                    Subtotales Destino: Cantidad: {subtotals.cantidad},
                                    {isSummaryFormat ? ` Pal. Completas: ${subtotals.paletasCompletas}, Pal. Picking: ${subtotals.paletasPicking},` : ` Paletas: ${subtotals.paletas},`}
                                    Peso: {subtotals.peso.toFixed(2)} kg
                                </div>
                            </div>
                        )})
                    ) : (
                        <ItemsTable items={formData.items} isSummaryFormat={isSummaryFormat} />
                    )}
                </div>
            </ReportSection>

            {recalculatedSummary && recalculatedSummary.length > 0 && (
                <ReportSection title="Resumen de Productos">
                    <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                        <thead>
                             <tr style={{ borderBottom: '1px solid #aaa' }}>
                                {formData.despachoPorDestino && !isSummaryFormat && <th style={{ textAlign: 'left', padding: '4px', fontWeight: 'bold' }}>Destino</th>}
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
                                    {formData.despachoPorDestino && !isSummaryFormat && <td style={{ padding: '4px' }}>{p.destino}</td>}
                                    <td style={{ padding: '4px' }}>{p.descripcion}</td>
                                    <td style={{ textAlign: 'right', padding: '4px' }}>{p.temperatura}</td>
                                    <td style={{ textAlign: 'right', padding: '4px' }}>{p.totalCantidad}</td>
                                    <td style={{ textAlign: 'right', padding: '4px' }}>{p.totalPaletas}</td>
                                    <td style={{ textAlign: 'right', padding: '4px' }}>{p.totalPeso?.toFixed(2)}</td>
                                </tr>
                            ))}
                            <tr style={{ fontWeight: 'bold', backgroundColor: '#f1f5f9' }}>
                                <td style={{ padding: '4px', textAlign: 'right' }} colSpan={formData.despachoPorDestino && !isSummaryFormat ? 2 : 1}>TOTALES:</td>
                                <td style={{ padding: '4px' }}></td>
                                <td style={{ textAlign: 'right', padding: '4px' }}>{totalGeneralCantidad}</td>
                                <td style={{ textAlign: 'right', padding: '4px' }}>{totalGeneralPaletas}</td>
                                <td style={{ textAlign: 'right', padding: '4px' }}>{totalGeneralPeso.toFixed(2)}</td>
                            </tr>
                        </tbody>
                    </table>
                </ReportSection>
            )}

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

// Helper component to render the items table
const ItemsTable = ({ items, isSummaryFormat }: { items: any[], isSummaryFormat: boolean }) => (
    <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse', tableLayout: 'auto' }}>
        <thead>
            <tr style={{ borderBottom: '1px solid #ddd', backgroundColor: '#fafafa' }}>
                {isSummaryFormat ? (
                    <>
                        <th style={{ textAlign: 'left', padding: '4px', fontWeight: 'bold' }}>Descripción</th>
                        <th style={{ textAlign: 'left', padding: '4px', fontWeight: 'bold' }}>Lote</th>
                        <th style={{ textAlign: 'left', padding: '4px', fontWeight: 'bold' }}>Presentación</th>
                        <th style={{ textAlign: 'right', padding: '4px', fontWeight: 'bold' }}>Total Cant.</th>
                        <th style={{ textAlign: 'right', padding: '4px', fontWeight: 'bold' }}>Pal. Completas</th>
                        <th style={{ textAlign: 'right', padding: '4px', fontWeight: 'bold' }}>Pal. Picking</th>
                        <th style={{ textAlign: 'right', padding: '4px', fontWeight: 'bold' }}>Total P. Neto</th>
                    </>
                ) : (
                    <>
                        <th style={{ textAlign: 'left', padding: '4px', fontWeight: 'bold' }}>Paleta</th>
                        <th style={{ textAlign: 'left', padding: '4px', fontWeight: 'bold' }}>Tipo Salida</th>
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
            {items.map((p: any, i: number) => {
                if (isSummaryFormat) {
                   return (
                        <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                            <td style={{ padding: '4px' }}>{p.descripcion}</td>
                            <td style={{ padding: '4px' }}>{p.lote}</td>
                            <td style={{ padding: '4px' }}>{p.presentacion}</td>
                            <td style={{ textAlign: 'right', padding: '4px' }}>{p.totalCantidad}</td>
                            <td style={{ textAlign: 'right', padding: '4px' }}>{p.paletasCompletas}</td>
                            <td style={{ textAlign: 'right', padding: '4px' }}>{p.paletasPicking}</td>
                            <td style={{ textAlign: 'right', padding: '4px' }}>{p.totalPesoNeto?.toFixed(2)}</td>
                        </tr>
                    );
                } else {
                     return (
                        <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                            <td style={{ padding: '4px' }}>{p.paleta}</td>
                            <td style={{ padding: '4px' }}>{p.esPicking ? 'Picking' : 'Completa'}</td>
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
);





