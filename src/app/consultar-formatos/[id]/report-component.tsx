
'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, parseISO } from 'date-fns';

import { getImageAsBase64 } from '@/app/actions/image-proxy';
import type { SubmissionResult } from '@/app/actions/consultar-formatos';
import { Button } from '@/components/ui/button';
import { Loader2, Download, ArrowLeft, Image as ImageIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

import { ReportLayout } from '@/components/app/reports/ReportLayout';
import { FixedWeightReport } from '@/components/app/reports/FixedWeightReport';
import { VariableWeightDispatchReport } from '@/components/app/reports/VariableWeightDispatchReport';
import { VariableWeightReceptionReport } from '@/components/app/reports/VariableWeightReceptionReport';


interface ReportComponentProps {
    submission: SubmissionResult;
}

interface ImageWithDimensions {
    src: string;
    width: number;
    height: number;
}

const getImageWithDimensions = (src: string): Promise<ImageWithDimensions> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            resolve({ src, width: img.width, height: img.height });
        };
        img.onerror = reject;
        img.src = src;
    });
};

const getImageAsBase64Client = async (url: string): Promise<string> => {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
        }
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = reject;
            reader.onload = () => {
                resolve(reader.result as string);
            };
            reader.readAsDataURL(blob);
        });
    } catch(e) {
        console.error("Error fetching client image", e);
        return "";
    }
};

const formatTime12Hour = (time24: string | undefined): string => {
    if (!time24 || !time24.includes(':')) return 'N/A';
    const [hours, minutes] = time24.split(':');
    let h = parseInt(hours, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    h = h ? h : 12; // the hour '0' should be '12'
    return `${h}:${minutes} ${ampm}`;
};


export default function ReportComponent({ submission }: ReportComponentProps) {
    const [isDownloading, setIsDownloading] = useState(false);
    const [areImagesLoading, setAreImagesLoading] = useState(true);
    const [base64Images, setBase64Images] = useState<ImageWithDimensions[]>([]);
    const [logoBase64, setLogoBase64] = useState<string | null>(null);
    const [logoDimensions, setLogoDimensions] = useState<{ width: number, height: number } | null>(null);

    useEffect(() => {
        const fetchAllImages = async () => {
            setAreImagesLoading(true);
            try {
                // Use the server-side proxy for Firebase Storage URLs to avoid CORS issues
                const attachmentPromises = submission.attachmentUrls.map(url => getImageAsBase64(url));
                
                // Use a client-side fetch for the same-origin logo
                const logoUrl = new URL('/images/company-logo.png', window.location.origin).href;
                const logoPromise = getImageAsBase64Client(logoUrl);

                const [logoData, ...attachmentDataURIs] = await Promise.all([logoPromise, ...attachmentPromises]);
                
                if (logoData) {
                    const dims = await getImageWithDimensions(logoData);
                    setLogoDimensions({ width: dims.width, height: dims.height });
                }
                setLogoBase64(logoData);

                const validAttachmentURIs = attachmentDataURIs.filter(img => img && !img.startsWith('data:image/gif'));
                
                const imageDimensionPromises = validAttachmentURIs.map(getImageWithDimensions);
                const imagesWithDimensions = await Promise.all(imageDimensionPromises);

                setBase64Images(imagesWithDimensions);

            } catch (error) {
                console.error("Error fetching one or more images for PDF:", error);
            } finally {
                setAreImagesLoading(false);
            }
        };

        fetchAllImages();
    }, [submission.attachmentUrls]);

    const getReportTitle = () => {
        const { formType } = submission;
        if (formType.startsWith('fixed-weight-')) return 'Reporte de ' + (formType.includes('recepcion') ? 'Recepción' : 'Despacho') + ' - Peso Fijo';
        if (formType.startsWith('variable-weight-')) {
            if (formType.includes('recepcion') || formType.includes('reception')) return 'Reporte de Recepción - Peso Variable';
            return 'Reporte de Despacho - Peso Variable';
        }
        return 'Reporte de Formulario';
    };

    const handleDownload = async () => {
        if (areImagesLoading) return;
        setIsDownloading(true);
    
        try {
            const doc = new jsPDF({
                orientation: 'portrait',
                unit: 'pt',
                format: 'a4',
            });
    
            const pageHeight = doc.internal.pageSize.getHeight();
            const pageWidth = doc.internal.pageSize.getWidth();
            const margin = 40;
            let yPos = 0;
            let attachmentsStartPage = -1; // To track where attachments start

            const formatPaletas = (num: any): string => {
                const number = Number(num);
                if (num === null || num === undefined || isNaN(number)) return '0.00';
                if (number % 1 === 0) {
                    return number.toString();
                }
                return number.toFixed(2);
            };
    
            const addHeader = (title: string) => {
                const logoWidth = 70;
                const logoHeight = 35; 
                if (logoBase64) {
                    try {
                        doc.addImage(logoBase64, 'PNG', margin, margin, logoWidth, logoHeight); 
                    } catch (e) {
                        console.error("Error adding logo to PDF:", e);
                    }
                }
                
                const titleX = margin + logoWidth + 20;
                const availableWidth = pageWidth - titleX - margin;
            
                doc.setFontSize(16);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor('#005a9e');
                doc.text(title, titleX + availableWidth / 2, margin + 20, { align: 'center', maxWidth: availableWidth });
                
                doc.setFontSize(9);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor('#3588CC');
                doc.text('FRIO ALIMENTARIA SAS NIT 900736914-0', titleX + availableWidth / 2, margin + 35, { align: 'center', maxWidth: availableWidth });
                
                yPos = margin + logoHeight + 20;
            };

            const addWatermark = () => {
                if (!logoBase64 || !logoDimensions) return;
                
                const watermarkImgWidth = pageWidth * 0.6; // Watermark covers 60% of page width
                const watermarkAspectRatio = logoDimensions.width / logoDimensions.height; // Use real aspect ratio
                const watermarkImgHeight = watermarkImgWidth / watermarkAspectRatio;
                const watermarkX = (pageWidth - watermarkImgWidth) / 2;
                const watermarkY = (pageHeight - watermarkImgHeight) / 2;

                // Set transparency
                (doc as any).setGState(new (doc as any).GState({opacity: 0.05})); 
                // Add the image
                doc.addImage(logoBase64, 'PNG', watermarkX, watermarkY, watermarkImgWidth, watermarkImgHeight, 'watermark', 'FAST');
                // Reset transparency
                (doc as any).setGState(new (doc as any).GState({opacity: 1}));
            }
    
            const addFooter = () => {
                const pageCount = (doc as any).internal.getNumberOfPages();
                for (let i = 1; i <= pageCount; i++) {
                    doc.setPage(i);
                    // Conditionally add watermark. Do not add on attachment pages.
                    if (attachmentsStartPage === -1 || i < attachmentsStartPage) {
                        addWatermark();
                    }
                    doc.setFontSize(8);
                    doc.setTextColor(150);
                    doc.text(`Página ${i} de ${pageCount}`, pageWidth - margin, pageHeight - 20, { align: 'right' });
                }
            };
    
            addHeader(getReportTitle());
    
            const { formType, formData, userDisplayName } = submission;
    
            if (formType.startsWith('fixed-weight-')) {
                const isReception = formType.includes('recepcion');
                const operationTerm = isReception ? 'Descargue' : 'Cargue';
    
                autoTable(doc, {
                    startY: yPos,
                    head: [[{ content: 'Información General', colSpan: 6, styles: { fillColor: '#e2e8f0', textColor: '#1a202c', fontStyle: 'bold', halign: 'center' } }]],
                    body: [
                        [
                            {content: 'Pedido SISLOG:', styles: {fontStyle: 'bold'}},
                            formData.pedidoSislog || 'N/A',
                            {content: 'Nombre Cliente:', styles: {fontStyle: 'bold'}},
                            formData.nombreCliente || 'N/A',
                             {content: 'Factura/Remisión:', styles: {fontStyle: 'bold'}},
                            formData.facturaRemision || 'N/A'
                        ],
                        [
                            {content: 'Fecha:', styles: {fontStyle: 'bold'}},
                            formData.fecha ? format(new Date(formData.fecha), "dd/MM/yyyy") : 'N/A',
                            {content: `Hora Inicio ${operationTerm}:`, styles: {fontStyle: 'bold'}},
                            formatTime12Hour(formData.horaInicio),
                            {content: `Hora Fin ${operationTerm}:`, styles: {fontStyle: 'bold'}},
                            formatTime12Hour(formData.horaFin)
                        ],
                        [
                            {content: 'Precinto/Sello:', styles: {fontStyle: 'bold'}},
                            formData.precinto || 'N/A',
                            {content: 'Doc. Transp.:', styles: {fontStyle: 'bold'}},
                            formData.documentoTransporte || 'N/A',
                            {content: 'Operario:', styles: {fontStyle: 'bold'}},
                            userDisplayName || 'N/A'
                        ]
                    ],
                    theme: 'grid', 
                    styles: { fontSize: 8, cellPadding: 4, valign: 'middle' },
                    columnStyles: {
                        0: { cellWidth: 'auto' }, 1: { cellWidth: '*' },
                        2: { cellWidth: 'auto' }, 3: { cellWidth: '*' },
                        4: { cellWidth: 'auto' }, 5: { cellWidth: '*' },
                    },
                });
                yPos = (doc as any).autoTable.previous.finalY + 15;
    
                const hasCantidadKg = formData.productos.some((p: any) => p.cantidadKg != null && !isNaN(Number(p.cantidadKg)) && Number(p.cantidadKg) > 0);

                const productHead = [['Código', 'Descripción', 'No. Cajas', 'Total Paletas']];
                if (hasCantidadKg) productHead[0].push('Cant. (kg)');
                productHead[0].push('Temp(°C)');

                const productBody = formData.productos.map((p: any) => {
                    const row = [ p.codigo, p.descripcion, p.cajas, formatPaletas(p.totalPaletas ?? p.paletas) ];
                    if (hasCantidadKg) {
                        row.push(p.cantidadKg ? Number(p.cantidadKg).toFixed(2) : '');
                    }
                    row.push(p.temperatura);
                    return row;
                });
                
                const totalCajas = formData.productos.reduce((acc: any, p: any) => acc + (Number(p.cajas) || 0), 0);
                const totalPaletas = formData.productos.reduce((acc: any, p: any) => acc + (Number(p.totalPaletas ?? p.paletas) || 0), 0);
                const totalCantidadKg = formData.productos.reduce((acc: any, p: any) => acc + (Number(p.cantidadKg) || 0), 0);

                const footRow = [{ content: 'TOTALES:', colSpan: 2, styles: { halign: 'right', fontStyle: 'bold' } }, totalCajas, formatPaletas(totalPaletas)];
                if (hasCantidadKg) {
                    footRow.push(totalCantidadKg.toFixed(2));
                }
                footRow.push(''); // For temperature column
    
                const productTableConfig = {
                    startY: yPos,
                    head: [
                        [{ content: 'Características del Producto', colSpan: productHead[0].length, styles: { halign: 'center' }}],
                        productHead[0]
                    ],
                    body: productBody,
                    foot: [footRow],
                    theme: 'grid',
                    footStyles: { fillColor: '#f1f5f9', fontStyle: 'bold', textColor: '#1a202c' },
                    styles: { fontSize: 8, cellPadding: 4 },
                    didParseCell: (data: any) => {
                        if (data.section === 'head') {
                            if (data.row.index === 0) { // Main title row
                                data.cell.styles.fillColor = '#e2e8f0';
                                data.cell.styles.textColor = '#1a202c';
                                data.cell.styles.fontStyle = 'bold';
                            }
                            if (data.row.index === 1) { // Column headers row
                                data.cell.styles.fillColor = '#f8fafc';
                                data.cell.styles.textColor = '#334155';
                                data.cell.styles.fontStyle = 'bold';
                            }
                        }
                    },
                };

                // Check for space before rendering the table
                const tableHeight = (doc as any).autoTable.calculateHeight(productTableConfig);
                if (yPos + tableHeight > pageHeight - margin) {
                    doc.addPage();
                    yPos = margin;
                }
                autoTable(doc, { ...productTableConfig, startY: yPos });
                yPos = (doc as any).autoTable.previous.finalY + 15;
    
                autoTable(doc, {
                    startY: yPos,
                    head: [[{ content: 'Información del Vehículo', colSpan: 6, styles: { fillColor: '#e2e8f0', textColor: '#1a202c', fontStyle: 'bold', halign: 'center' } }]],
                    body: [
                         [
                            {content: 'Nombre Conductor:', styles: {fontStyle: 'bold'}},
                            formData.nombreConductor || 'N/A',
                            {content: 'Cédula:', styles: {fontStyle: 'bold'}},
                            formData.cedulaConductor || 'N/A',
                            {content: 'Placa:', styles: {fontStyle: 'bold'}},
                            formData.placa || 'N/A'
                        ],
                        [
                            {content: 'Muelle:', styles: {fontStyle: 'bold'}},
                            formData.muelle || 'N/A',
                            {content: 'Contenedor:', styles: {fontStyle: 'bold'}},
                            formData.contenedor || 'N/A',
                            {content: 'Set Point (°C):', styles: {fontStyle: 'bold'}},
                            formData.setPoint || 'N/A'
                        ],
                        [
                            {content: 'Cond. Higiene:', styles: {fontStyle: 'bold'}},
                            formData.condicionesHigiene || 'N/A',
                            {content: 'Termoregistrador:', styles: {fontStyle: 'bold'}},
                            formData.termoregistrador || 'N/A',
                            {content: 'Cliente Requiere Termoregistro:', styles: {fontStyle: 'bold'}},
                            formData.clienteRequiereTermoregistro || 'N/A'
                        ]
                    ], 
                    theme: 'grid', 
                    styles: { fontSize: 8, cellPadding: 4, valign: 'middle' },
                    columnStyles: {
                        0: { cellWidth: 'auto' }, 1: { cellWidth: '*' },
                        2: { cellWidth: 'auto' }, 3: { cellWidth: '*' },
                        4: { cellWidth: 'auto' }, 5: { cellWidth: '*' },
                    },
                });
                yPos = (doc as any).autoTable.previous.finalY + 15;
    
                if (formData.observaciones) {
                    autoTable(doc, { startY: yPos, head: [[{ content: 'Observaciones', styles: { fillColor: '#e2e8f0', textColor: '#1a202c', fontStyle: 'bold', halign: 'center' } }]], body: [[formData.observaciones]], theme: 'grid', styles: { fontSize: 8, cellPadding: 4 } });
                    yPos = (doc as any).autoTable.previous.finalY + 15;
                }
    
                autoTable(doc, { 
                    startY: yPos, 
                    head: [[{ content: 'Responsables de la Operación', colSpan: 4, styles: { fillColor: '#e2e8f0', textColor: '#1a202c', fontStyle: 'bold', halign: 'center' } }]], 
                    body: [
                        [
                            {content: 'Coordinador:', styles: {fontStyle: 'bold'}},
                            formData.coordinador || 'N/A',
                            {content: 'Operario:', styles: {fontStyle: 'bold'}},
                            userDisplayName || 'N/A'
                        ]
                    ], 
                    theme: 'grid', 
                    styles: { fontSize: 8, cellPadding: 4, valign: 'middle' },
                    columnStyles: {
                        0: { cellWidth: 'auto' }, 1: { cellWidth: '*' },
                        2: { cellWidth: 'auto' }, 3: { cellWidth: '*' },
                    },
                });
                yPos = (doc as any).autoTable.previous.finalY + 15;
    
            } else if (formType.startsWith('variable-weight-')) {
                 const isReception = formType.includes('recepcion') || formType.includes('reception');
                 
                 const generalInfoBody = [
                    [{content: 'Pedido SISLOG:', styles: {fontStyle: 'bold'}}, formData.pedidoSislog || 'N/A'],
                    [{content: 'Cliente:', styles: {fontStyle: 'bold'}}, formData.cliente || 'N/A'],
                    [{content: 'Fecha:', styles: {fontStyle: 'bold'}}, formData.fecha ? format(new Date(formData.fecha), "dd/MM/yyyy") : 'N/A'],
                    [{content: 'Conductor:', styles: {fontStyle: 'bold'}}, formData.conductor || 'N/A'],
                    [{content: 'Cédula:', styles: {fontStyle: 'bold'}}, formData.cedulaConductor || 'N/A'],
                    [{content: 'Placa:', styles: {fontStyle: 'bold'}}, formData.placa || 'N/A'],
                    [{content: 'Precinto:', styles: {fontStyle: 'bold'}}, formData.precinto || 'N/A'],
                    [{content: 'Set Point (°C):', styles: {fontStyle: 'bold'}}, formData.setPoint || 'N/A'],
                    [{content: 'Operario:', styles: {fontStyle: 'bold'}}, userDisplayName || 'N/A'],
                    [{content: isReception ? 'H. Inicio Descargue' : 'Hora Inicio Cargue', styles: {fontStyle: 'bold'}}, formatTime12Hour(formData.horaInicio)],
                    [{content: isReception ? 'H. Fin Descargue' : 'Hora Fin Cargue', styles: {fontStyle: 'bold'}}, formatTime12Hour(formData.horaFin)],
                 ];
                 autoTable(doc, {
                    startY: yPos,
                    head: [[{ content: `Datos de ${isReception ? 'Recepción' : 'Despacho'}`, colSpan: 2, styles: { fillColor: '#e2e8f0', textColor: '#1a202c', fontStyle: 'bold', halign: 'center' } }]],
                    body: generalInfoBody,
                    theme: 'grid',
                    styles: { fontSize: 8, cellPadding: 4, valign: 'middle' },
                    columnStyles: { 0: { cellWidth: 'auto', fontStyle: 'bold' }, 1: { cellWidth: '*' } },
                });
                yPos = (doc as any).autoTable.previous.finalY + 15;
                
                let detailHead: any[][];
                let detailBody: any[][];
                let detailColSpan: number;

                if (isReception) {
                    detailHead = [['Paleta', 'Descripción', 'Lote', 'Cant.', 'Peso Bruto', 'Tara Estiba', 'Tara Caja', 'Total Tara', 'Peso Neto']];
                    detailBody = formData.items.map((p: any) => [ p.paleta, p.descripcion, p.lote, p.cantidadPorPaleta, p.pesoBruto?.toFixed(2), p.taraEstiba?.toFixed(2), p.taraCaja?.toFixed(2), p.totalTaraCaja?.toFixed(2), p.pesoNeto?.toFixed(2) ]);
                    detailColSpan = 9;
                } else { // This is dispatch
                    const showPaletaColumnInPdf = !formData.items.some((p: any) => Number(p.paleta) === 0);
                    
                    detailHead = [[]];
                    if (showPaletaColumnInPdf) detailHead[0].push('Paleta');
                    detailHead[0].push('Descripción', 'Lote', 'Presentación', 'Cant.', 'Peso Neto (kg)');

                    detailBody = formData.items.map((p: any) => {
                        const isSummaryRow = Number(p.paleta) === 0;
                        const rowData = [];
                        
                        if (showPaletaColumnInPdf) {
                            rowData.push(p.paleta);
                        }

                        rowData.push(
                            isSummaryRow ? `${p.descripcion} (${p.totalPaletas || 'N/A'} paletas)` : p.descripcion,
                            p.lote,
                            p.presentacion,
                            isSummaryRow ? p.totalCantidad : p.cantidadPorPaleta,
                            isSummaryRow ? p.totalPesoNeto?.toFixed(2) : p.pesoNeto?.toFixed(2)
                        );
                        return rowData;
                    });
                    detailColSpan = detailHead[0].length;
                }
                
                 const detailTableConfig = {
                    startY: yPos,
                    head: [
                        [{ content: `Detalle de ${isReception ? 'Recepción' : 'Despacho'}`, colSpan: detailColSpan, styles: { halign: 'center' } }],
                        ...detailHead
                    ],
                    body: detailBody,
                    theme: 'grid',
                    styles: { fontSize: 7, cellPadding: 3 },
                    didParseCell: (data: any) => {
                        if (data.section === 'head') {
                            if (data.row.index === 0) {
                                data.cell.styles.fillColor = '#e2e8f0';
                                data.cell.styles.textColor = '#1a202c';
                                data.cell.styles.fontStyle = 'bold';
                            } else {
                                data.cell.styles.fillColor = '#f8fafc';
                                data.cell.styles.textColor = '#334155';
                                data.cell.styles.fontStyle = 'bold';
                            }
                        }
                    }
                };
                if (yPos + (doc as any).autoTable.calculateHeight(detailTableConfig) > pageHeight - margin) { doc.addPage(); yPos = margin; }
                autoTable(doc, { ...detailTableConfig, startY: yPos });
                yPos = (doc as any).autoTable.previous.finalY + 15;
                
                if (formData.summary?.length > 0) {
                    const summaryHead = [['Descripción', 'Temp(°C)', 'Total Cantidad', 'Total Paletas', 'Total Peso (kg)']];
                    const summaryBody = formData.summary.map((p: any) => [
                        p.descripcion, 
                        p.temperatura, 
                        p.totalCantidad, 
                        p.totalPaletas, 
                        p.totalPeso?.toFixed(2)
                    ]);
                    const totalPeso = formData.summary.reduce((acc: any, p: any) => acc + (p.totalPeso || 0), 0);
                    const totalCantidad = formData.summary.reduce((acc: any, p: any) => acc + (p.totalCantidad || 0), 0);
                    const totalPaletas = formData.summary.reduce((acc: any, p: any) => acc + (p.totalPaletas || 0), 0);

                    const summaryTableConfig = {
                        startY: yPos,
                        head: [
                            [{ content: 'Resumen de Productos', colSpan: 5, styles: { halign: 'center' }}],
                            ...summaryHead
                        ],
                        body: summaryBody,
                        foot: [[
                            { content: 'TOTALES:', colSpan: 2, styles: { halign: 'right', fontStyle: 'bold' } }, 
                            totalCantidad,
                            totalPaletas,
                            totalPeso.toFixed(2)
                        ]],
                        theme: 'grid',
                        footStyles: { fillColor: '#f1f5f9', fontStyle: 'bold', textColor: '#1a202c' },
                        styles: { fontSize: 8, cellPadding: 4 },
                        didParseCell: (data: any) => {
                            if (data.section === 'head') {
                                if (data.row.index === 0) {
                                    data.cell.styles.fillColor = '#e2e8f0';
                                    data.cell.styles.textColor = '#1a202c';
                                    data.cell.styles.fontStyle = 'bold';
                                } else {
                                    data.cell.styles.fillColor = '#f8fafc';
                                    data.cell.styles.textColor = '#334155';
                                    data.cell.styles.fontStyle = 'bold';
                                }
                            }
                        }
                    };
                    if (yPos + (doc as any).autoTable.calculateHeight(summaryTableConfig) > pageHeight - margin) { doc.addPage(); yPos = margin; }
                    autoTable(doc, { ...summaryTableConfig, startY: yPos });
                    yPos = (doc as any).autoTable.previous.finalY + 15;
                }

                 if (formData.observaciones) {
                    autoTable(doc, { startY: yPos, head: [[{ content: 'Observaciones', styles: { fillColor: '#e2e8f0', textColor: '#1a202c', fontStyle: 'bold', halign: 'center' } }]], body: [[formData.observaciones]], theme: 'grid', styles: { fontSize: 8, cellPadding: 4 } });
                    yPos = (doc as any).autoTable.previous.finalY + 15;
                }
    
                autoTable(doc, { 
                    startY: yPos, 
                    head: [[{ content: 'Responsables de la Operación', colSpan: 4, styles: { fillColor: '#e2e8f0', textColor: '#1a202c', fontStyle: 'bold', halign: 'center' } }]],
                    body: [
                        [
                           {content: 'Coordinador:', styles: {fontStyle: 'bold'}},
                            formData.coordinador || 'N/A',
                            {content: 'Operario:', styles: {fontStyle: 'bold'}},
                            userDisplayName || 'N/A'
                        ]
                    ], 
                    theme: 'grid', 
                    styles: { fontSize: 8, cellPadding: 4, valign: 'middle' },
                    columnStyles: {
                        0: { cellWidth: 'auto' }, 1: { cellWidth: '*' },
                        2: { cellWidth: 'auto' }, 3: { cellWidth: '*' },
                    },
                });
                yPos = (doc as any).autoTable.previous.finalY + 15;
            }
    
            if (base64Images.length > 0) {
                const titleHeightEstimate = 30;
                const firstImgData = base64Images[0];
                const imgWidth = (pageWidth - margin * 3) / 2;
                const aspectRatio = firstImgData.height / firstImgData.width;
                const imgHeight = imgWidth * aspectRatio;
                const firstImageRowHeight = imgHeight + 20;

                // Check if there is enough space for the title and the first row of images
                if (yPos + titleHeightEstimate + firstImageRowHeight > pageHeight - margin) {
                    doc.addPage();
                    yPos = margin;
                }
                
                attachmentsStartPage = (doc as any).internal.getNumberOfPages();

                autoTable(doc, { startY: yPos, head: [[{ content: 'Anexos: Registros Fotográficos', styles: { fillColor: '#e2e8f0', textColor: '#1a202c', fontStyle: 'bold', halign: 'center' } }]], body: [], theme: 'grid' });
                yPos = (doc as any).autoTable.previous.finalY + 10;

                let xPos = margin;
                for (let i = 0; i < base64Images.length; i++) {
                    const imgData = base64Images[i];
                    const imgWidth = (pageWidth - margin * 3) / 2;
                    const aspectRatio = imgData.height / imgData.width;
                    const imgHeight = imgWidth * aspectRatio;

                    if (yPos + imgHeight + 20 > pageHeight - margin) {
                        doc.addPage();
                        yPos = margin;
                        xPos = margin;
                    }
                    try {
                       doc.addImage(imgData.src, 'JPEG', xPos, yPos, imgWidth, imgHeight);
                       doc.setFontSize(8);
                       doc.text(`Registro Fotográfico ${i + 1}`, xPos + imgWidth / 2, yPos + imgHeight + 10, { align: 'center' });
                    } catch(e) {
                        console.error("Error adding attachment image to PDF:", e);
                        doc.text(`Error al cargar imagen ${i+1}`, xPos, yPos);
                    }
                    
                    if ((i + 1) % 2 === 0) {
                        yPos += imgHeight + 20;
                        xPos = margin;
                    } else {
                        xPos += imgWidth + margin/2;
                    }
                }
            }
    
            addFooter();
    
            const { createdAt } = submission;
            let typeName = 'Formato';
            if (formType.includes('recepcion') || formType.includes('reception')) typeName = 'Recepcion';
            if (formType.includes('despacho')) typeName = 'Despacho';
            let productType = 'PesoFijo';
            if (formType.includes('variable-weight')) productType = 'PesoVariable';
            const date = parseISO(createdAt);
            const formattedDate = format(date, 'yyyy-MM-dd');
            const formattedTime = format(date, 'HH-mm-ss');
            const fileName = `${typeName}_${productType}_${formData.pedidoSislog || 'ID'}_${formattedDate}_${formattedTime}.pdf`;
            
            doc.save(fileName);
    
        } catch (error) {
            console.error("Error generating PDF:", error);
        } finally {
            setIsDownloading(false);
        }
    };
    

    const renderReportContent = () => {
        const props = { 
            formData: submission.formData, 
            userDisplayName: submission.userDisplayName, 
            attachments: base64Images.map(img => img.src),
        };

        switch (submission.formType) {
            case 'fixed-weight-recepcion':
                return <FixedWeightReport {...props} formType={submission.formType} />;
            case 'fixed-weight-despacho':
                 return <FixedWeightReport {...props} formType={submission.formType} />;
            case 'variable-weight-despacho':
                return <VariableWeightDispatchReport {...props} />;
            case 'variable-weight-recepcion':
                return <VariableWeightReceptionReport {...props} />;
            default:
                return <div className="p-4">Tipo de formato no reconocido.</div>;
        }
    };

    return (
        <div className="bg-gray-100 min-h-screen p-4 sm:p-8">
            <div className="max-w-4xl mx-auto">
                <header className="flex justify-between items-center mb-6">
                    <Button asChild variant="outline">
                        <Link href="/consultar-formatos">
                            <ArrowLeft className="mr-2" />
                            Volver
                        </Link>
                    </Button>
                    <h1 className="text-lg font-semibold text-gray-700">{getReportTitle()}</h1>
                    <Button onClick={handleDownload} disabled={isDownloading || areImagesLoading}>
                        {isDownloading ? (
                            <Loader2 className="mr-2 animate-spin" />
                        ) : areImagesLoading ? (
                             <Loader2 className="mr-2 animate-spin" />
                        ) : (
                            <Download className="mr-2" />
                        )}
                        {isDownloading ? 'Descargando...' : areImagesLoading ? 'Cargando...' : 'Descargar PDF'}
                    </Button>
                </header>

                {areImagesLoading && (
                    <Alert>
                        <ImageIcon className="h-4 w-4" />
                        <AlertTitle>Cargando Contenido</AlertTitle>
                        <AlertDescription>
                            Por favor espere mientras se prepara el contenido para el reporte.
                        </AlertDescription>
                    </Alert>
                )}

                <div className="bg-white shadow-lg">
                    <ReportLayout title={getReportTitle()} logoBase64={logoBase64}>
                        {renderReportContent()}
                    </ReportLayout>
                </div>
            </div>
        </div>
    );
}
