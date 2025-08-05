
"use client";

import React, { useMemo } from 'react';
import { parseISO } from 'date-fns';

// --- HELPER FUNCTIONS ---

const formatTime12Hour = (time24: string | undefined): string => {
    if (!time24 || !time24.includes(':')) return 'N/A';
    const [hours, minutes] = time24.split(':');
    let h = parseInt(hours, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    h = h ? h : 12;
    return `${h}:${minutes} ${ampm}`;
};

const formatDateLocal = (isoDateString: string | undefined): string => {
    if (!isoDateString) return 'N/A';
    try {
        const date = new Date(isoDateString.split('T')[0]);
        const day = String(date.getUTCDate()).padStart(2, '0');
        const month = String(date.getUTCMonth() + 1).padStart(2, '0'); // Month is 0-indexed
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

// --- DATA PROCESSING LOGIC ---

const processDefaultData = (formData: any) => {
    const allItems = formData.items || [];
    const isSummaryMode = allItems.some((p: any) => Number(p.paleta) === 0);
    
    const summaryData = (formData.summary || []).map((s: any) => {
        const totalPaletas = isSummaryMode
            ? allItems.filter((i: any) => i.descripcion === s.descripcion && Number(i.paleta) === 0).reduce((sum: number, i: any) => sum + (Number(i.totalPaletas) || 0), 0)
            : new Set(allItems.filter((i: any) => i.descripcion === s.descripcion).map((i: any) => i.paleta)).size;
        
        return { ...s, totalPaletas };
    });

    const totalGeneralPaletas = summaryData.reduce((acc: number, p: any) => acc + p.totalPaletas, 0);
    const totalGeneralCantidad = summaryData.reduce((acc: number, p: any) => acc + p.totalCantidad, 0);
    const totalGeneralPeso = summaryData.reduce((acc: number, p: any) => acc + p.totalPeso, 0);

    return { summaryData, totalGeneralPaletas, totalGeneralCantidad, totalGeneralPeso, isSummaryMode };
};


// --- REACT COMPONENTS ---

interface VariableWeightReceptionReportProps {
    formData: any;
    userDisplayName: string;
    attachments: string[];
}

export function VariableWeightReceptionReport({ formData, userDisplayName, attachments }: VariableWeightReceptionReportProps) {
    const isTunelCongelacion = formData.tipoPedido === 'TUNEL DE CONGELACIÓN';
    const operationTerm = 'Descargue';
    const fieldCellStyle: React.CSSProperties = { padding: '2px', fontSize: '11px', lineHeight: '1.4', verticalAlign: 'top' };
    const hasStandardObservations = (formData.observaciones || []).some((obs: any) => obs.type !== 'OTRAS OBSERVACIONES');
    const showCrewField = formData.tipoPedido !== 'TUNEL A CÁMARA CONGELADOS';

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
            
            <ReportSection title="Detalle de la Recepción" noPadding>
                <div style={{overflowX: 'auto'}}>
                    {formData.recepcionPorPlaca || isTunelCongelacion ? (
                        (formData.placas || []).map((placa: any, index: number) => (
                           <div key={`placa-${index}`} style={{marginBottom: '10px'}}>
                                <div style={{ backgroundColor: '#ddebf7', padding: '6px 12px', fontWeight: 'bold', borderBottom: '1px solid #ddd', borderTop: index > 0 ? '1px solid #aaa' : 'none' }}>
                                    Placa: {placa.numeroPlaca} | Conductor: {placa.conductor} (C.C. {placa.cedulaConductor})
                                </div>
                                <ItemsTable items={placa.items || []} isSummaryFormat={false} tipoPedido={formData.tipoPedido} />
                           </div>
                        ))
                    ) : (
                         <ItemsTable items={formData.items || []} isSummaryFormat={(formData.items || []).some((p: any) => Number(p.paleta) === 0)} tipoPedido={formData.tipoPedido} />
                    )}
                </div>
            </ReportSection>

            {isTunelCongelacion ? (
                <TunelCongelacionSummary formData={formData} />
            ) : (
                <DefaultSummary formData={formData} />
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
                                const showCrewCheckbox = obs.type === 'REESTIBADO' || obs.type === 'TRANSBORDO CANASTILLA' || obs.type === 'SALIDA PALETAS TUNEL';
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
                            {showCrewField && (
                                <td style={{...fieldCellStyle, width: '33.33%'}}>
                                    <ReportField label="Operación Realizada por Cuadrilla" value={formData.aplicaCuadrilla ? formData.aplicaCuadrilla.charAt(0).toUpperCase() + formData.aplicaCuadrilla.slice(1) : 'N/A'} />
                                    {formData.aplicaCuadrilla === 'si' && formData.tipoPedido === 'MAQUILA' && formData.numeroOperariosCuadrilla && (
                                        <div style={{ marginLeft: '8px', fontSize: '10px' }}>
                                            ↳ No. Operarios: {formData.numeroOperariosCuadrilla}
                                        </div>
                                    )}
                                </td>
                            )}
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

const DefaultSummary = ({ formData }: { formData: any }) => {
    const { summaryData, totalGeneralPaletas, totalGeneralCantidad, totalGeneralPeso } = processDefaultData(formData);

    if (summaryData.length === 0) return null;

    return (
        <ReportSection title="Resumen Agrupado de Productos">
            <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                <thead>
                    <tr style={{ borderBottom: '1px solid #aaa' }}>
                        <th style={{ textAlign: 'left', padding: '4px', fontWeight: 'bold' }}>Producto</th>
                        <th style={{ textAlign: 'right', padding: '4px', fontWeight: 'bold' }}>Temperaturas (°C)</th>
                        <th style={{ textAlign: 'right', padding: '4px', fontWeight: 'bold' }}>Total Paletas</th>
                        <th style={{ textAlign: 'right', padding: '4px', fontWeight: 'bold' }}>Total Cantidad</th>
                        <th style={{ textAlign: 'right', padding: '4px', fontWeight: 'bold' }}>Total Peso (kg)</th>
                    </tr>
                </thead>
                <tbody>
                    {summaryData.map((p: any, i: number) => {
                        const temps = [p.temperatura1, p.temperatura2, p.temperatura3].filter((t: any) => t != null && !isNaN(t));
                        const tempString = temps.join(' / ');
                        return (
                            <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                                <td style={{ padding: '4px' }}>{p.descripcion}</td>
                                <td style={{ textAlign: 'right', padding: '4px' }}>{tempString}</td>
                                <td style={{ textAlign: 'right', padding: '4px' }}>{p.totalPaletas}</td>
                                <td style={{ textAlign: 'right', padding: '4px' }}>{p.totalCantidad}</td>
                                <td style={{ textAlign: 'right', padding: '4px' }}>{p.totalPeso.toFixed(2)}</td>
                            </tr>
                        );
                    })}
                    <tr style={{ fontWeight: 'bold', backgroundColor: '#f1f5f9' }}>
                        <td colSpan={2} style={{ textAlign: 'right', padding: '6px 4px' }}>TOTAL GENERAL:</td>
                        <td style={{ textAlign: 'right', padding: '6px 4px' }}>{totalGeneralPaletas}</td>
                        <td style={{ textAlign: 'right', padding: '6px 4px' }}>{totalGeneralCantidad}</td>
                        <td style={{ textAlign: 'right', padding: '6px 4px' }}>{totalGeneralPeso.toFixed(2)}</td>
                    </tr>
                </tbody>
            </table>
        </ReportSection>
    );
}

const TunelCongelacionSummary = ({ formData }: { formData: any }) => {
    const placaGroups = formData.placas || [];

    if (placaGroups.length === 0) return null;

    let totalGeneralPaletas = 0;
    let totalGeneralCantidad = 0;
    let totalGeneralPeso = 0;

    return (
        <ReportSection title="Resumen Agrupado de Productos" noPadding>
            <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                <thead>
                    <tr style={{ borderBottom: '1px solid #aaa' }}>
                        <th style={{ textAlign: 'left', padding: '4px', fontWeight: 'bold' }}>Producto</th>
                        <th style={{ textAlign: 'right', padding: '4px', fontWeight: 'bold' }}>Temperaturas (°C)</th>
                        <th style={{ textAlign: 'right', padding: '4px', fontWeight: 'bold' }}>Total Paletas</th>
                        <th style={{ textAlign: 'right', padding: '4px', fontWeight: 'bold' }}>Total Cantidad</th>
                        <th style={{ textAlign: 'right', padding: '4px', fontWeight: 'bold' }}>Total Peso (kg)</th>
                    </tr>
                </thead>
                {placaGroups.map((placa: any, placaIndex: number) => {
                    const uniquePresentations = [...new Set((placa.items || []).map((item: any) => item.presentacion || 'SIN PRESENTACIÓN'))];

                    return (
                        <React.Fragment key={`placa-group-${placa.numeroPlaca}-${placaIndex}`}>
                            <tbody style={{breakInside: 'avoid'}}>
                                <tr style={{ backgroundColor: '#ddebf7', borderTop: '2px solid #aaa' }}>
                                    <td colSpan={5} style={{ padding: '6px 4px', fontWeight: 'bold', color: '#1f3e76' }}>
                                        Placa: {placa.numeroPlaca}
                                    </td>
                                </tr>
                            </tbody>
                            {uniquePresentations.map((presentacion: any) => {
                                const itemsInPresentation = (placa.items || []).filter((item: any) => (item.presentacion || 'SIN PRESENTACIÓN') === presentacion);
                                
                                const productsInPresentation = itemsInPresentation.reduce((acc: any, item: any) => {
                                    if (!acc[item.descripcion]) {
                                        const summaryItem = formData.summary?.find((s: any) => s.descripcion === item.descripcion && s.presentacion === presentacion && s.placa === placa.numeroPlaca);
                                        acc[item.descripcion] = {
                                            descripcion: item.descripcion,
                                            temperatura: [summaryItem?.temperatura1, summaryItem?.temperatura2, summaryItem?.temperatura3].filter(t => t != null && !isNaN(t)).join(' / '),
                                            totalPaletas: 0,
                                            totalCantidad: 0,
                                            totalPeso: 0,
                                        };
                                    }
                                    acc[item.descripcion].totalPaletas += 1;
                                    acc[item.descripcion].totalCantidad += Number(item.cantidadPorPaleta) || 0;
                                    acc[item.descripcion].totalPeso += Number(item.pesoNeto) || 0;
                                    return acc;
                                }, {});

                                const subTotalPaletas = Object.values(productsInPresentation).reduce((sum: number, p: any) => sum + p.totalPaletas, 0);
                                const subTotalCantidad = Object.values(productsInPresentation).reduce((sum: number, p: any) => sum + p.totalCantidad, 0);
                                const subTotalPeso = Object.values(productsInPresentation).reduce((sum: number, p: any) => sum + p.totalPeso, 0);
                                
                                totalGeneralPaletas += subTotalPaletas;
                                totalGeneralCantidad += subTotalCantidad;
                                totalGeneralPeso += subTotalPeso;

                                return (
                                    <tbody key={presentacion} style={{breakInside: 'avoid'}}>
                                        <tr style={{ backgroundColor: '#f9fafb' }}>
                                            <td colSpan={5} style={{ padding: '4px 8px', fontWeight: 'bold', fontStyle: 'italic' }}>
                                                Presentación: {presentacion}
                                            </td>
                                        </tr>
                                        {Object.values(productsInPresentation).map((product: any, productIndex: number) => (
                                            <tr key={productIndex} style={{ borderBottom: '1px solid #eee' }}>
                                                <td style={{ padding: '4px 4px 4px 12px' }}>{product.descripcion}</td>
                                                <td style={{ textAlign: 'right', padding: '4px' }}>{product.temperatura}</td>
                                                <td style={{ textAlign: 'right', padding: '4px' }}>{product.totalPaletas}</td>
                                                <td style={{ textAlign: 'right', padding: '4px' }}>{product.totalCantidad}</td>
                                                <td style={{ textAlign: 'right', padding: '4px' }}>{product.totalPeso.toFixed(2)}</td>
                                            </tr>
                                        ))}
                                         <tr style={{ fontWeight: 'bold', backgroundColor: '#f1f5f9' }}>
                                            <td colSpan={2} style={{ textAlign: 'right', padding: '4px' }}>Subtotal Presentación:</td>
                                            <td style={{ textAlign: 'right', padding: '4px' }}>{subTotalPaletas}</td>
                                            <td style={{ textAlign: 'right', padding: '4px' }}>{subTotalCantidad}</td>
                                            <td style={{ textAlign: 'right', padding: '4px' }}>{subTotalPeso.toFixed(2)}</td>
                                        </tr>
                                    </tbody>
                                );
                            })}
                        </React.Fragment>
                    );
                })}
                <tbody>
                    <tr style={{ fontWeight: 'bold', backgroundColor: '#dbeafe', borderTop: '2px solid #aaa' }}>
                        <td colSpan={2} style={{ textAlign: 'right', padding: '6px 4px' }}>TOTAL GENERAL:</td>
                        <td style={{ textAlign: 'right', padding: '6px 4px' }}>{totalGeneralPaletas}</td>
                        <td style={{ textAlign: 'right', padding: '6px 4px' }}>{totalGeneralCantidad}</td>
                        <td style={{ textAlign: 'right', padding: '6px 4px' }}>{totalGeneralPeso.toFixed(2)}</td>
                    </tr>
                </tbody>
            </table>
        </ReportSection>
    );
};


const ItemsTable = ({ items, isSummaryFormat, tipoPedido }: { items: any[], isSummaryFormat: boolean, tipoPedido: string }) => {
    
    // Define columns based on the type of report
    const detailColumns = [
        { key: 'paleta', label: 'Paleta' },
        { key: 'descripcion', label: 'Descripción' },
        { key: 'lote', label: 'Lote' },
        { key: 'presentacion', label: 'Presentación' },
        { key: 'cantidadPorPaleta', label: 'Cant.', align: 'right' },
        { key: 'pesoBruto', label: 'Peso Bruto', align: 'right', format: (val: any) => val?.toFixed(2) },
        { key: 'taraEstiba', label: 'Tara Estiba', align: 'right', format: (val: any) => val?.toFixed(2) },
        { key: 'taraCaja', label: 'Tara Caja', align: 'right', format: (val: any) => val?.toFixed(2) },
        { key: 'totalTaraCaja', label: 'Total Tara', align: 'right', format: (val: any) => val?.toFixed(2) },
        { key: 'pesoNeto', label: 'Peso Neto', align: 'right', format: (val: any) => val?.toFixed(2) },
    ];

    const tunelColumns = detailColumns.filter(c => c.key !== 'paleta');

    const summaryColumns = [
        { key: 'descripcion', label: 'Descripción' },
        { key: 'lote', label: 'Lote' },
        { key: 'presentacion', label: 'Presentación' },
        { key: 'totalCantidad', label: 'Total Cant.', align: 'right' },
        { key: 'totalPaletas', label: 'Total Paletas', align: 'right' },
        { key: 'totalPesoNeto', label: 'Total P. Neto', align: 'right', format: (val: any) => val?.toFixed(2) },
    ];

    const columnsToRender = isSummaryFormat 
        ? summaryColumns 
        : tipoPedido === 'TUNEL DE CONGELACIÓN' 
        ? tunelColumns 
        : detailColumns;

    return (
        <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse', tableLayout: 'auto' }}>
            <thead>
                <tr style={{ borderBottom: '1px solid #ddd', backgroundColor: '#fafafa' }}>
                    {columnsToRender.map(col => (
                        <th key={col.key} style={{ textAlign: col.align || 'left', padding: '4px', fontWeight: 'bold' }}>
                            {col.label}
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {items.map((item, index) => (
                    <tr key={index} style={{ borderBottom: '1px solid #eee' }}>
                        {columnsToRender.map(col => {
                            const value = item[col.key as keyof typeof item];
                            return (
                                <td key={col.key} style={{ padding: '4px', textAlign: col.align || 'left' }}>
                                    {col.format ? col.format(value) : value}
                                </td>
                            );
                        })}
                    </tr>
                ))}
            </tbody>
        </table>
    );
};
