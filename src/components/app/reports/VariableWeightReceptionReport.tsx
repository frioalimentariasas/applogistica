

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

export const processDefaultData = (formData: any) => {
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

export const processTunelCongelacionData = (formData: any) => {
    const placaGroups = (formData.placas || []).map((placa: any) => {
        const itemsByPresentation = (placa.items || []).reduce((acc: any, item: any) => {
            const presentation = item.presentacion || 'SIN PRESENTACIÓN';
            if (!acc[presentation]) {
                acc[presentation] = {
                    presentation: presentation,
                    products: [],
                };
            }
            acc[presentation].products.push(item);
            return acc;
        }, {});

        const presentationGroups = Object.values(itemsByPresentation).map((group: any) => {
             const productsWithSummary = group.products.reduce((acc: any, item: any) => {
                const desc = item.descripcion;
                if (!acc[desc]) {
                     const summaryItem = formData.summary?.find((s: any) => s.descripcion === desc && s.presentacion === group.presentation && s.placa === placa.numeroPlaca);
                     acc[desc] = {
                        descripcion: desc,
                        temperatura1: summaryItem?.temperatura1 || 'N/A',
                        temperatura2: summaryItem?.temperatura2 || 'N/A',
                        temperatura3: summaryItem?.temperatura3 || 'N/A',
                        totalPaletas: 0,
                        totalCantidad: 0,
                        totalPeso: 0,
                    };
                }
                acc[desc].totalPaletas += 1;
                acc[desc].totalCantidad += Number(item.cantidadPorPaleta) || 0;
                acc[desc].totalPeso += Number(item.pesoNeto) || 0;
                return acc;
             }, {});

             const subTotalPaletas = Object.values(productsWithSummary).reduce((sum: number, p: any) => sum + p.totalPaletas, 0);
             const subTotalCantidad = Object.values(productsWithSummary).reduce((sum: number, p: any) => sum + p.totalCantidad, 0);
             const subTotalPeso = Object.values(productsWithSummary).reduce((sum: number, p: any) => sum + p.totalPeso, 0);

            return {
                presentation: group.presentation,
                products: Object.values(productsWithSummary),
                subTotalPaletas,
                subTotalCantidad,
                subTotalPeso,
            };
        });

        const totalPaletasPlaca = presentationGroups.reduce((acc: number, group: any) => acc + group.subTotalPaletas, 0);
        const totalCantidadPlaca = presentationGroups.reduce((acc: number, group: any) => acc + group.subTotalCantidad, 0);
        const totalPesoPlaca = presentationGroups.reduce((acc: number, group: any) => acc + group.subTotalPeso, 0);

        return {
            placa: placa.numeroPlaca,
            conductor: placa.conductor,
            cedulaConductor: placa.cedulaConductor,
            presentationGroups: presentationGroups,
            totalPaletasPlaca,
            totalCantidadPlaca,
            totalPesoPlaca,
        };
    });

    const totalGeneralPaletas = placaGroups.reduce((acc, placa) => acc + placa.totalPaletasPlaca, 0);
    const totalGeneralCantidad = placaGroups.reduce((acc, placa) => acc + placa.totalCantidadPlaca, 0);
    const totalGeneralPeso = placaGroups.reduce((acc, placa) => acc + placa.totalPesoPlaca, 0);

    return { placaGroups, totalGeneralPaletas, totalGeneralCantidad, totalGeneralPeso };
};

export const processTunelACamaraData = (formData: any) => {
    const allItems = formData.items || [];
    
    const groupedByPresentation = allItems.reduce((acc: any, item: any) => {
        const presentation = item.presentacion || 'SIN PRESENTACIÓN';
        if (!acc[presentation]) {
            acc[presentation] = { products: {}, subTotalCantidad: 0, subTotalPeso: 0, subTotalPaletas: 0 };
        }
        
        const desc = item.descripcion || 'SIN DESCRIPCIÓN';
        if (!acc[presentation].products[desc]) {
            acc[presentation].products[desc] = {
                descripcion: desc,
                cantidad: 0,
                paletas: new Set(),
                pesoNeto: 0,
            };
        }
        
        const productGroup = acc[presentation].products[desc];
        productGroup.cantidad += Number(item.cantidadPorPaleta) || 0;
        productGroup.pesoNeto += Number(item.pesoNeto) || 0;
        if (item.paleta !== undefined && !isNaN(Number(item.paleta)) && Number(item.paleta) > 0) {
            productGroup.paletas.add(item.paleta);
        }

        return acc;
    }, {});

    Object.values(groupedByPresentation).forEach((group: any) => {
        group.products = Object.values(group.products).map((prod: any) => ({
            ...prod,
            totalPaletas: prod.paletas.size,
        }));
        group.subTotalCantidad = group.products.reduce((sum: number, p: any) => sum + p.cantidad, 0);
        group.subTotalPeso = group.products.reduce((sum: number, p: any) => sum + p.pesoNeto, 0);
        group.subTotalPaletas = group.products.reduce((sum: number, p: any) => sum + p.totalPaletas, 0);
    });

    const totalGeneralCantidad = Object.values(groupedByPresentation).reduce((sum: number, group: any) => sum + group.subTotalCantidad, 0);
    const totalGeneralPeso = Object.values(groupedByPresentation).reduce((sum: number, group: any) => sum + group.subTotalPeso, 0);
    const totalGeneralPaletas = Object.values(groupedByPresentation).reduce((sum: number, group: any) => sum + group.subTotalPaletas, 0);
    
    return { groupedByPresentation, totalGeneralCantidad, totalGeneralPeso, totalGeneralPaletas };
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
    const showCrewField = formData.tipoPedido !== 'INGRESO DE SALDOS' && formData.tipoPedido !== 'TUNEL A CÁMARA CONGELADOS';

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
                                <ItemsTable items={placa.items || []} tipoPedido={formData.tipoPedido} />
                           </div>
                        ))
                    ) : (
                         <ItemsTable items={formData.items || []} tipoPedido={formData.tipoPedido} />
                    )}
                </div>
            </ReportSection>

            {isTunelCongelacion ? (
                <TunelCongelacionSummary formData={formData} />
            ) : formData.tipoPedido === 'TUNEL A CÁMARA CONGELADOS' ? (
                 <TunelACamaraSummary formData={formData} />
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
    const { placaGroups, totalGeneralPaletas, totalGeneralCantidad, totalGeneralPeso } = processTunelCongelacionData(formData);
    
    if (placaGroups.length === 0) return null;

    return (
        <ReportSection title="Resumen Agrupado de Productos">
            {placaGroups.map((placaGroup, placaIndex) => (
                <div key={`placa-summary-${placaIndex}`} style={{ marginBottom: '15px' }}>
                    <h3 style={{ backgroundColor: '#ddebf7', padding: '6px 12px', fontWeight: 'bold', borderBottom: '1px solid #ddd', borderTop: '1px solid #aaa' }}>
                        Placa: {placaGroup.placa} | Conductor: {placaGroup.conductor} (C.C. {placaGroup.cedulaConductor})
                    </h3>
                    {placaGroup.presentationGroups.map((group: any, groupIndex: number) => (
                        <div key={`presentation-summary-${groupIndex}`} style={{ paddingLeft: '15px', marginTop: '5px' }}>
                             <h4 style={{ padding: '4px 0', fontWeight: 'bold' }}>Presentación: {group.presentation}</h4>
                             <table style={{ width: '100%', fontSize: '10px', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid #ccc', backgroundColor: '#fafafa' }}>
                                        <th style={{ textAlign: 'left', padding: '4px', fontWeight: 'bold' }}>Descripción</th>
                                        <th style={{ textAlign: 'right', padding: '4px', fontWeight: 'bold' }}>Temp(°C)</th>
                                        <th style={{ textAlign: 'right', padding: '4px', fontWeight: 'bold' }}>Total Paletas</th>
                                        <th style={{ textAlign: 'right', padding: '4px', fontWeight: 'bold' }}>Total Cantidad</th>
                                        <th style={{ textAlign: 'right', padding: '4px', fontWeight: 'bold' }}>Total Peso (kg)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {group.products.map((p: any, productIndex: number) => {
                                         const temps = [p.temperatura1, p.temperatura2, p.temperatura3].filter((t: any) => t != null && !isNaN(t));
                                         const tempString = temps.join(' / ');
                                         return (
                                            <tr key={productIndex} style={{ borderBottom: '1px solid #eee' }}>
                                                <td style={{ padding: '4px' }}>{p.descripcion}</td>
                                                <td style={{ textAlign: 'right', padding: '4px' }}>{tempString}</td>
                                                <td style={{ textAlign: 'right', padding: '4px' }}>{p.totalPaletas}</td>
                                                <td style={{ textAlign: 'right', padding: '4px' }}>{p.totalCantidad}</td>
                                                <td style={{ textAlign: 'right', padding: '4px' }}>{p.totalPeso.toFixed(2)}</td>
                                            </tr>
                                         )
                                    })}
                                    <tr style={{ fontWeight: 'bold', backgroundColor: '#f8f9fa' }}>
                                        <td colSpan={2} style={{ textAlign: 'right', padding: '4px' }}>Subtotal Presentación:</td>
                                        <td style={{ textAlign: 'right', padding: '4px' }}>{group.subTotalPaletas}</td>
                                        <td style={{ textAlign: 'right', padding: '4px' }}>{group.subTotalCantidad}</td>
                                        <td style={{ textAlign: 'right', padding: '4px' }}>{group.subTotalPeso.toFixed(2)}</td>
                                    </tr>
                                </tbody>
                             </table>
                        </div>
                    ))}
                    <table style={{ width: '100%', fontSize: '10px', borderCollapse: 'collapse', marginTop: '5px' }}>
                        <tbody>
                            <tr style={{ fontWeight: 'bold', backgroundColor: '#ddebf7' }}>
                                <td colSpan={2} style={{ textAlign: 'right', padding: '4px' }}>Subtotal Placa:</td>
                                <td style={{ textAlign: 'right', padding: '4px', width: '80px' }}>{placaGroup.totalPaletasPlaca}</td>
                                <td style={{ textAlign: 'right', padding: '4px', width: '80px' }}>{placaGroup.totalCantidadPlaca}</td>
                                <td style={{ textAlign: 'right', padding: '4px', width: '80px' }}>{placaGroup.totalPesoPlaca.toFixed(2)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            ))}
            <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse', marginTop: '15px' }}>
                 <tbody>
                    <tr style={{ fontWeight: 'bold', backgroundColor: '#e2e8f0', borderTop: '2px solid #aaa' }}>
                        <td colSpan={2} style={{ textAlign: 'right', padding: '6px 4px' }}>TOTAL GENERAL:</td>
                        <td style={{ textAlign: 'right', padding: '6px 4px', width: '80px' }}>{totalGeneralPaletas}</td>
                        <td style={{ textAlign: 'right', padding: '6px 4px', width: '80px' }}>{totalGeneralCantidad}</td>
                        <td style={{ textAlign: 'right', padding: '6px 4px', width: '80px' }}>{totalGeneralPeso.toFixed(2)}</td>
                    </tr>
                </tbody>
            </table>
        </ReportSection>
    );
};

export const TunelACamaraSummary = ({ formData }: { formData: any }) => {
    const { groupedByPresentation, totalGeneralCantidad, totalGeneralPeso, totalGeneralPaletas } = processTunelACamaraData(formData);
    
    return (
        <ReportSection title="Resumen Agrupado de Productos">
            {Object.entries(groupedByPresentation).map(([presentation, groupData]: [string, any]) => (
                <div key={presentation} style={{ marginBottom: '15px' }}>
                    <h3 style={{ backgroundColor: '#f1f5f9', padding: '6px 12px', fontWeight: 'bold', borderBottom: '1px solid #ddd' }}>
                        Presentación: {presentation}
                    </h3>
                    <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                        <thead>
                             <tr style={{ borderBottom: '1px solid #ddd', backgroundColor: '#fafafa' }}>
                                <th style={{ textAlign: 'left', padding: '4px', fontWeight: 'bold' }}>Descripción</th>
                                <th style={{ textAlign: 'right', padding: '4px', fontWeight: 'bold' }}>Cantidad</th>
                                <th style={{ textAlign: 'right', padding: '4px', fontWeight: 'bold' }}>Total Paletas</th>
                                <th style={{ textAlign: 'right', padding: '4px', fontWeight: 'bold' }}>Peso Neto (kg)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {groupData.products.map((item: any, index: number) => (
                                <tr key={index} style={{ borderBottom: '1px solid #eee' }}>
                                    <td style={{ padding: '4px' }}>{item.descripcion}</td>
                                    <td style={{ textAlign: 'right', padding: '4px' }}>{item.cantidad}</td>
                                    <td style={{ textAlign: 'right', padding: '4px' }}>{item.totalPaletas}</td>
                                    <td style={{ textAlign: 'right', padding: '4px' }}>{item.pesoNeto.toFixed(2)}</td>
                                </tr>
                            ))}
                            <tr style={{ fontWeight: 'bold', backgroundColor: '#f8f9fa' }}>
                                <td style={{ textAlign: 'right', padding: '4px' }}>Subtotal Presentación:</td>
                                <td style={{ textAlign: 'right', padding: '4px' }}>{groupData.subTotalCantidad}</td>
                                <td style={{ textAlign: 'right', padding: '4px' }}>{groupData.subTotalPaletas}</td>
                                <td style={{ textAlign: 'right', padding: '4px' }}>{groupData.subTotalPeso.toFixed(2)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            ))}
            <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse', marginTop: '15px' }}>
                <tbody>
                    <tr style={{ fontWeight: 'bold', backgroundColor: '#e2e8f0', borderTop: '2px solid #aaa' }}>
                        <td style={{ textAlign: 'right', padding: '6px 4px' }}>TOTAL GENERAL:</td>
                        <td style={{ textAlign: 'right', padding: '6px 4px', width: '80px' }}>{totalGeneralCantidad}</td>
                        <td style={{ textAlign: 'right', padding: '6px 4px', width: '80px' }}>{totalGeneralPaletas}</td>
                        <td style={{ textAlign: 'right', padding: '6px 4px', width: '80px' }}>{totalGeneralPeso.toFixed(2)}</td>
                    </tr>
                </tbody>
            </table>
        </ReportSection>
    );
};

const ItemsTable = ({ items, tipoPedido }: { items: any[], tipoPedido: string }) => {
    const isTunelCongelacion = tipoPedido === 'TUNEL DE CONGELACIÓN';
    const isSummaryFormat = items.some((p: any) => Number(p.paleta) === 0);

    const baseColumns = [
        { key: 'paleta', label: 'Paleta' },
        { key: 'descripcion', label: 'Descripción' },
        { key: 'lote', label: 'Lote' },
        { key: 'presentacion', label: 'Presentación' },
        { key: 'cantidadPorPaleta', label: 'Cant.', align: 'right' },
        { key: 'pesoBruto', label: 'P. Bruto', align: 'right', format: (val: any) => val?.toFixed(2) },
        { key: 'taraEstiba', label: 'T. Estiba', align: 'right', format: (val: any) => val?.toFixed(2) },
        { key: 'taraCaja', label: 'T. Caja', align: 'right', format: (val: any) => val?.toFixed(2) },
        { key: 'totalTaraCaja', label: 'Total Tara', align: 'right', format: (val: any) => val?.toFixed(2) },
        { key: 'pesoNeto', label: 'P. Neto', align: 'right', format: (val: any) => val?.toFixed(2) },
    ];
    
    const summaryColumns = [
        { key: 'descripcion', label: 'Descripción' },
        { key: 'lote', label: 'Lote' },
        { key: 'presentacion', label: 'Presentación' },
        { key: 'totalCantidad', label: 'Total Cant.', align: 'right' },
        { key: 'totalPaletas', label: 'Total Paletas', align: 'right' },
        { key: 'totalPesoNeto', label: 'Total P. Neto', align: 'right', format: (val: any) => val?.toFixed(2) },
    ];

    const tunelColumns = baseColumns.filter(c => c.key !== 'paleta');

    const columnsToRender = isSummaryFormat 
        ? summaryColumns 
        : isTunelCongelacion
        ? tunelColumns
        : baseColumns;

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

    
