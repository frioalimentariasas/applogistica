

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
import { optimizeImage } from '@/lib/image-optimizer';


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

const formatOptionalNumber = (num: any): string => {
    if (num === null || num === undefined || Number.isNaN(Number(num))) {
        return 'N/A';
    }
    return String(num);
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
                    const optimizedLogo = await optimizeImage(logoData);
                    const dims = await getImageWithDimensions(optimizedLogo);
                    setLogoDimensions({ width: dims.width, height: dims.height });
                    setLogoBase64(optimizedLogo);
                } else {
                    setLogoBase64(logoData);
                }

                const validAttachmentURIs = attachmentDataURIs.filter(img => img && !img.startsWith('data:image/gif'));
                
                const optimizedAttachments = await Promise.all(validAttachmentURIs.map(uri => optimizeImage(uri)));
                
                const imageDimensionPromises = optimizedAttachments.map(getImageWithDimensions);
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
            const margin = 30;
            let yPos = 0;
            let attachmentsStartPage = -1; // To track where attachments start

            const formatPaletas = (num: any): string => {
                const number = Number(num);
                if (num === null || num === undefined || isNaN(number)) return '0';
                return String(Math.floor(number));
            };

            const formatTipoPedido = (tipo: string | undefined): string => {
                if (tipo === 'DESPACHO GENERICO') return 'GENERICO';
                return tipo || 'N/A';
            };

            const { formType, formData, userDisplayName } = submission;
    
            const addHeader = (title: string) => {
                const logoPdfHeight = 35;

                // Centered Logo
                if (logoBase64 && logoDimensions) {
                    const logoAspectRatio = logoDimensions.width / logoDimensions.height;
                    const logoPdfWidth = logoPdfHeight * logoAspectRatio;
                    const logoX = (pageWidth - logoPdfWidth) / 2;
                    try {
                        doc.addImage(logoBase64, 'PNG', logoX, margin, logoPdfWidth, logoPdfHeight); 
                    } catch (e) {
                        console.error("Error adding logo to PDF:", e);
                    }
                }
                
                // Info Box
                const isFixedWeight = formType.startsWith('fixed-weight-');
                const isVariableWeight = formType.startsWith('variable-weight-');
                
                let boxHeight = 0;
                if (isFixedWeight || isVariableWeight) {
                    doc.setFontSize(8);
                    doc.setTextColor(51, 51, 51); // #333
                    
                    const code = isFixedWeight ? 'FA-GL-F01' : 'FA-GL-F02';
                    
                    const boxWidth = 110; 
                    boxHeight = 35; 
                    const boxX = pageWidth - margin - boxWidth;
                    const boxY = margin;
                    const padding = 6;
                    
                    const labelX = boxX + padding;
                    const valueX = boxX + boxWidth - padding;
                    const lineHeight = 10;
                    
                    // Draw the styled box
                    doc.setFillColor(248, 249, 250); // #f8f9fa
                    doc.setDrawColor(204, 204, 204); // #ccc
                    doc.rect(boxX, boxY, boxWidth, boxHeight, 'FD'); // Fill and Draw
                    
                    let currentY = boxY + padding + 2; // Start with top padding
                    
                    // Line 1: Código
                    doc.setFont('helvetica', 'bold');
                    doc.text('Código:', labelX, currentY, { align: 'left' });
                    doc.setFont('helvetica', 'normal');
                    doc.text(code, valueX, currentY, { align: 'right' });
                    
                    // Line 2: Versión
                    currentY += lineHeight;
                    doc.setFont('helvetica', 'bold');
                    doc.text('Versión:', labelX, currentY, { align: 'left' });
                    doc.setFont('helvetica', 'normal');
                    doc.text('01', valueX, currentY, { align: 'right' });
                    
                    // Line 3: Fecha
                    currentY += lineHeight;
                    doc.setFont('helvetica', 'bold');
                    doc.text('Fecha:', labelX, currentY, { align: 'left' });
                    doc.setFont('helvetica', 'normal');
                    doc.text('16/06/2025', valueX, currentY, { align: 'right' });
                }
                
                // Report Title and Subtitle (positioned below logo/box)
                const headerBottomY = margin + Math.max(logoPdfHeight, boxHeight);
                const titleY = headerBottomY + 30; // Increased spacing

                doc.setFontSize(16);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor('#005a9e');
                doc.text(title, pageWidth / 2, titleY, { align: 'center' });
                
                doc.setFontSize(9);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor('#3588CC');
                doc.text('FRIO ALIMENTARIA SAS NIT 900736914-0', pageWidth / 2, titleY + 15, { align: 'center' });
                
                yPos = titleY + 30;
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
            
            const addObservationsTable = () => {
                if (formData.observaciones && formData.observaciones.length > 0) {
                    const obsBody = formData.observaciones.map((obs: any) => {
                        const isOther = obs.type === 'OTRAS OBSERVACIONES';
                        if (isOther) {
                            return [{ 
                                content: `OTRAS OBSERVACIONES: ${obs.customType || ''}`,
                                colSpan: 3,
                                styles: { halign: 'left', fontStyle: 'normal' }
                            }];
                        } else {
                            const typeText = { content: obs.type, styles: { fontStyle: 'bold' } };
                            const quantityText = `${obs.quantity ?? ''} ${obs.quantityType || ''}`.trim();
                            const executedText = obs.executedByGrupoRosales ? 'Sí' : 'No';
                            return [
                                typeText,
                                { content: quantityText, styles: { halign: 'right' } },
                                { content: executedText, styles: { halign: 'center' } }
                            ];
                        }
                    });

                    autoTable(doc, {
                        startY: yPos,
                        head: [[{ content: 'Observaciones', colSpan: 3, styles: { fillColor: '#e2e8f0', textColor: '#1a202c', fontStyle: 'bold', halign: 'center' } }]],
                        body: [],
                        theme: 'grid',
                        margin: { horizontal: margin },
                        styles: { fontSize: 8, cellPadding: 4 },
                    });
                    
                    autoTable(doc, {
                        startY: (doc as any).autoTable.previous.finalY,
                        head: [['Tipo de Observación', 'Cantidad', 'Ejecutado por Grupo Rosales']],
                        body: obsBody,
                        theme: 'grid',
                        margin: { horizontal: margin },
                        styles: { fontSize: 8, cellPadding: 4, valign: 'middle' },
                        headStyles: { fillColor: '#f8fafc', textColor: '#334155' },
                        columnStyles: {
                            0: { cellWidth: '*' },
                            1: { cellWidth: 'auto', halign: 'right' },
                            2: { cellWidth: 'auto', halign: 'center' },
                        },
                    });

                    yPos = (doc as any).autoTable.previous.finalY + 15;
                }
            };
    
            addHeader(getReportTitle());
    
            if (formType.startsWith('fixed-weight-')) {
                const isReception = formType.includes('recepcion');
                const operationTerm = isReception ? 'Descargue' : 'Cargue';
                const showPesoNetoColumn = formData.productos.some((p: any) => Number(p.pesoNetoKg) > 0);
                
                const generalInfoBody: any[] = [
                        [
                            {content: 'Pedido SISLOG:', styles: {fontStyle: 'bold'}},
                            formData.pedidoSislog || 'N/A',
                            {content: 'Nombre Cliente:', styles: {fontStyle: 'bold'}},
                            formData.nombreCliente || 'N/A',
                             {content: 'Precinto/Sello:', styles: {fontStyle: 'bold'}},
                            formData.precinto || 'N/A'
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
                            {content: 'Doc. Transp.:', styles: {fontStyle: 'bold'}},
                            formData.documentoTransporte || 'N/A',
                            {content: 'Factura/Remisión:', styles: {fontStyle: 'bold'}},
                            formData.facturaRemision || 'N/A',
                            {content: !isReception ? 'Tipo Pedido:' : '', styles: {fontStyle: 'bold'}},
                            !isReception ? formatTipoPedido(formData.tipoPedido) : ''
                        ]
                ];
                
                if (isReception) {
                    generalInfoBody.push([
                         {
                            content: `Tipo Pedido: ${formData.tipoPedido || 'N/A'}${formData.tipoPedido === 'MAQUILA' ? ` (${formData.tipoEmpaqueMaquila || 'N/A'})` : ''}`,
                            styles: {fontStyle: 'bold'},
                            colSpan: 6
                        }
                    ]);
                }


                autoTable(doc, {
                    startY: yPos,
                    head: [[{ content: 'Información General', colSpan: 6, styles: { fillColor: '#e2e8f0', textColor: '#1a202c', fontStyle: 'bold', halign: 'center' } }]],
                    body: generalInfoBody,
                    theme: 'grid', 
                    styles: { fontSize: 8, cellPadding: 4, valign: 'middle' },
                    columnStyles: {
                        0: { cellWidth: 'auto' }, 1: { cellWidth: '*' },
                        2: { cellWidth: 'auto' }, 3: { cellWidth: '*' },
                        4: { cellWidth: 'auto' }, 5: { cellWidth: '*' },
                    },
                    margin: { horizontal: margin },
                });
                yPos = (doc as any).autoTable.previous.finalY + 15;
    
                const productHead = [['Código', 'Descripción', 'No. Cajas', 'Total Paletas']];
                if (showPesoNetoColumn) {
                    productHead[0].push('Peso Neto (kg)');
                }
                productHead[0].push('Temp(°C)');
                
                const productBody = formData.productos.map((p: any) => {
                    const temps = [p.temperatura1, p.temperatura2, p.temperatura3]
                        .filter(t => t != null && !isNaN(Number(t)));
                    const tempString = temps.join(' / ');

                    const row = [ p.codigo, p.descripcion, p.cajas, formatPaletas(p.totalPaletas ?? p.paletas) ];
                    if (showPesoNetoColumn) {
                        row.push(Number(p.pesoNetoKg) > 0 ? Number(p.pesoNetoKg).toFixed(2) : '');
                    }
                    row.push(tempString);
                    return row;
                });
                
                const totalCajas = formData.productos.reduce((acc: any, p: any) => acc + (Number(p.cajas) || 0), 0);
                const totalPaletas = formData.productos.reduce((acc: any, p: any) => acc + (Number(p.totalPaletas ?? p.paletas) || 0), 0);
                const totalPesoNetoKg = formData.productos.reduce((acc: any, p: any) => acc + (Number(p.pesoNetoKg) || 0), 0);

                const footRow: any[] = [{ content: 'TOTALES:', colSpan: 2, styles: { halign: 'right', fontStyle: 'bold' } }, totalCajas, formatPaletas(totalPaletas)];
                if (showPesoNetoColumn) {
                    footRow.push(totalPesoNetoKg > 0 ? totalPesoNetoKg.toFixed(2) : '');
                }
                footRow.push('');
    
                const productTableConfig: any = {
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
                    rowPageBreak: 'avoid',
                    margin: { horizontal: margin },
                };
                
                autoTable(doc, productTableConfig);
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
                            formatOptionalNumber(formData.setPoint)
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
                    margin: { horizontal: margin },
                });
                yPos = (doc as any).autoTable.previous.finalY + 15;
    
                addObservationsTable();
    
                autoTable(doc, { 
                    startY: yPos, 
                    head: [[{ content: 'Responsables de la Operación', colSpan: 6, styles: { fillColor: '#e2e8f0', textColor: '#1a202c', fontStyle: 'bold', halign: 'center' } }]], 
                    body: [
                        [
                            {content: 'Coordinador:', styles: {fontStyle: 'bold'}},
                            formData.coordinador || 'N/A',
                            {content: 'Operario:', styles: {fontStyle: 'bold'}},
                            userDisplayName || 'N/A',
                             {content: 'Operación Realizada por Cuadrilla:', styles: {fontStyle: 'bold'}},
                            `${formData.aplicaCuadrilla ? formData.aplicaCuadrilla.charAt(0).toUpperCase() + formData.aplicaCuadrilla.slice(1) : 'N/A'}${formData.aplicaCuadrilla === 'si' && isReception && formData.tipoPedido === 'MAQUILA' && formData.numeroOperariosCuadrilla ? ` (${formData.numeroOperariosCuadrilla} operarios)`: ''}`
                        ],
                    ].filter(row => row.length > 0 && row.some(cell => typeof cell === 'string' ? cell.length > 0 : (cell as any).content.length > 0)),
                    theme: 'grid', 
                    styles: { fontSize: 8, cellPadding: 4, valign: 'middle' },
                    columnStyles: {
                        0: { cellWidth: 'auto' }, 1: { cellWidth: '*' },
                        2: { cellWidth: 'auto' }, 3: { cellWidth: '*' },
                        4: { cellWidth: 'auto' }, 5: { cellWidth: '*' },
                    },
                    margin: { horizontal: margin },
                });
                yPos = (doc as any).autoTable.previous.finalY + 15;
    
            } else if (formType.startsWith('variable-weight-')) {
                 const isReception = formType.includes('recepcion') || formType.includes('reception');
                 const operationTerm = isReception ? 'Descargue' : 'Cargue';
                 const isTunelMode = formData.tipoPedido === 'TUNEL';
                 
                 const generalInfoBody: any[][] = [
                     [
                        {content: 'Pedido SISLOG:', styles: {fontStyle: 'bold'}}, formData.pedidoSislog || 'N/A',
                        {content: 'Cliente:', styles: {fontStyle: 'bold'}}, formData.cliente || 'N/A',
                        {content: 'Fecha:', styles: {fontStyle: 'bold'}}, formData.fecha ? format(new Date(formData.fecha), "dd/MM/yyyy") : 'N/A'
                     ],
                     [
                        {content: 'Conductor:', styles: {fontStyle: 'bold'}}, formData.conductor || 'N/A',
                        {content: 'Cédula:', styles: {fontStyle: 'bold'}}, formData.cedulaConductor || 'N/A',
                        {content: 'Placa:', styles: {fontStyle: 'bold'}}, formData.placa || 'N/A'
                     ],
                      [
                        {content: 'Precinto:', styles: {fontStyle: 'bold'}}, formData.precinto || 'N/A',
                        {content: 'Set Point (°C):', styles: {fontStyle: 'bold'}}, formatOptionalNumber(formData.setPoint),
                        {content: 'Contenedor:', styles: {fontStyle: 'bold'}}, formData.contenedor || 'N/A'
                      ],
                      [
                        {content: `H. Inicio ${operationTerm}:`, styles: {fontStyle: 'bold'}}, formatTime12Hour(formData.horaInicio),
                        {content: `H. Fin ${operationTerm}:`, styles: {fontStyle: 'bold'}}, formatTime12Hour(formData.horaFin),
                        {content: isReception ? 'Factura/Remisión:' : 'Tipo Pedido:', styles: {fontStyle: 'bold'}}, 
                        isReception ? formData.facturaRemision || 'N/A' : formatTipoPedido(formData.tipoPedido)
                      ],
                 ];
                 
                if (isReception) {
                    generalInfoBody.push([
                        {
                            content: `Tipo Pedido: ${formData.tipoPedido || 'N/A'}${formData.tipoPedido === 'MAQUILA' ? ` (${formData.tipoEmpaqueMaquila || 'N/A'})` : ''}`,
                            styles: {fontStyle: 'bold'},
                            colSpan: 6
                        }
                    ]);
                }


                 autoTable(doc, {
                    startY: yPos,
                    head: [[{ content: `Datos de ${isReception ? 'Recepción' : 'Despacho'}`, colSpan: 6, styles: { fillColor: '#e2e8f0', textColor: '#1a202c', fontStyle: 'bold', halign: 'center' } }]],
                    body: generalInfoBody.filter(row => row.length > 0 && row.some(cell => cell && (cell as any).content !== undefined ? (cell as any).content.length > 0 : String(cell).length > 0)),
                    theme: 'grid',
                    styles: { fontSize: 8, cellPadding: 4, valign: 'middle' },
                    columnStyles: {
                        0: { cellWidth: 'auto' }, 1: { cellWidth: '*' },
                        2: { cellWidth: 'auto' }, 3: { cellWidth: '*' },
                        4: { cellWidth: 'auto' }, 5: { cellWidth: '*' },
                    },
                    margin: { horizontal: margin },
                });
                yPos = (doc as any).autoTable.previous.finalY + 15;
                
                autoTable(doc, {
                    startY: yPos,
                    head: [[{ content: `Detalle de la ${isReception ? 'Recepción' : 'Despacho'}`, styles: { fillColor: '#e2e8f0', textColor: '#1a202c', fontStyle: 'bold', halign: 'center' } }]],
                    body: [],
                    theme: 'grid',
                    margin: { horizontal: margin },
                });
                yPos = (doc as any).autoTable.previous.finalY;

                const drawItemsTable = (items: any[], subtitle?: string) => {
                    if(subtitle) {
                         autoTable(doc, {
                            startY: yPos,
                            body: [[{ 
                                content: subtitle,
                                styles: { fontStyle: 'bold', fillColor: '#f1f5f9', textColor: '#1a202c' }
                            }]],
                            theme: 'grid',
                            margin: { horizontal: margin },
                        });
                        yPos = (doc as any).autoTable.previous.finalY;
                    }

                    const isSummaryFormat = items.some((p: any) => Number(p.paleta) === 0);
                    let detailHead: any[];
                    let detailBody: any[][];

                    if (!isSummaryFormat) {
                        detailHead = [[isTunelMode ? null : 'Paleta', 'Descripción', 'Lote', 'Presentación', 'Cant.', 'P. Bruto', 'T. Estiba', 'T. Caja', 'Total Tara', 'P. Neto'].filter(Boolean)];
                        detailBody = items.map((p: any) => [
                            isTunelMode ? null : p.paleta, 
                            p.descripcion,
                            p.lote, p.presentacion, p.cantidadPorPaleta,
                            p.pesoBruto?.toFixed(2), p.taraEstiba?.toFixed(2), p.taraCaja?.toFixed(2),
                            p.totalTaraCaja?.toFixed(2), p.pesoNeto?.toFixed(2)
                        ].filter(val => val !== null));
                    } else {
                        detailHead = [['Descripción', 'Lote', 'Presentación', 'Total Cant.', 'Total Paletas', 'Total P. Neto']];
                        detailBody = items.map((p: any) => [
                            p.descripcion, p.lote, p.presentacion, p.totalCantidad,
                            p.totalPaletas, p.totalPesoNeto?.toFixed(2)
                        ]);
                    }

                    autoTable(doc, {
                        startY: yPos,
                        head: detailHead,
                        body: detailBody,
                        theme: 'grid',
                        styles: { fontSize: 7, cellPadding: 3 },
                        headStyles: { fillColor: '#f8fafc', textColor: '#334155', fontStyle: 'bold' },
                        margin: { horizontal: margin },
                    });
                    yPos = (doc as any).autoTable.previous.finalY;

                    if (formData.despachoPorDestino) {
                        const subtotals = items.reduce((acc: {cantidad: number, paletas: number, peso: number}, item: any) => {
                            if (isSummaryFormat) {
                                acc.cantidad += Number(item.totalCantidad) || 0;
                                acc.peso += Number(item.totalPesoNeto) || 0;
                            } else {
                                acc.cantidad += Number(item.cantidadPorPaleta) || 0;
                                acc.peso += Number(item.pesoNeto) || 0;
                            }
                            return acc;
                        }, { cantidad: 0, paletas: 0, peso: 0 });
                        
                        if (!isSummaryFormat) {
                            const uniquePalletsInDest = new Set();
                            items.forEach((i: any) => {
                                const pNum = Number(i.paleta);
                                if(!isNaN(pNum) && pNum > 0) uniquePalletsInDest.add(pNum);
                            });
                            subtotals.paletas = uniquePalletsInDest.size;
                        }
                        
                        let subtotalRowContent = `Subtotal Destino: Cantidad: ${subtotals.cantidad}`;
                        if (!isSummaryFormat) {
                            subtotalRowContent += `, Paletas: ${subtotals.paletas}`;
                        }
                        subtotalRowContent += `, Peso: ${subtotals.peso.toFixed(2)} kg`;

                        autoTable(doc, {
                            startY: yPos,
                            body: [[{ 
                                content: subtotalRowContent,
                                styles: { halign: 'right', fontStyle: 'bold', fillColor: '#fafafa' }
                            }]],
                            theme: 'grid',
                            styles: { fontSize: 8, cellPadding: 3 },
                            margin: { horizontal: margin },
                        });
                        yPos = (doc as any).autoTable.previous.finalY;
                    }
                };
                
                if (formData.despachoPorDestino && formData.destinos?.length > 0) {
                    formData.destinos.forEach((destino: any) => {
                        drawItemsTable(destino.items || [], `Destino: ${destino.nombreDestino}`);
                    });
                    yPos += 15;
                } else if(isTunelMode && formData.placas?.length > 0) {
                    formData.placas.forEach((placa: any) => {
                        drawItemsTable(placa.items || [], `Placa: ${placa.numeroPlaca}`);
                    });
                    yPos += 15;
                } else {
                    drawItemsTable(formData.items || []);
                    yPos += 15;
                }
                
                const allItemsForSummary = formData.despachoPorDestino ? formData.destinos.flatMap((d: any) => d.items.map((i: any) => ({...i, destino: d.nombreDestino}))) : formData.items;
                const isSummaryFormat = allItemsForSummary.some((p: any) => Number(p.paleta) === 0);
                
                const recalculatedSummary = (() => {
                    const isIndividualPalletMode = allItemsForSummary.every((item: any) => Number(item?.paleta) > 0);
                    const shouldGroupByDestino = formData.despachoPorDestino && isIndividualPalletMode;

                    const grouped = allItemsForSummary.reduce((acc, item) => {
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
                        let totalPeso = 0, totalCantidad = 0, totalPaletas = 0;
                        const uniquePallets = new Set<number>();
                        if (isSummaryFormat) {
                            group.items.forEach(item => {
                                totalPeso += Number(item.totalPesoNeto) || 0;
                                totalCantidad += Number(item.totalCantidad) || 0;
                                totalPaletas += Number(item.totalPaletas) || 0;
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
                const totalGeneralPaletas = recalculateTotalPaletas(formData);

                if (recalculatedSummary.length > 0) {
                    const isIndividualPalletMode = allItemsForSummary.every((item: any) => Number(item?.paleta) > 0);
                    const shouldGroupByDestino = formData.despachoPorDestino && isIndividualPalletMode;

                    const summaryHead = [
                        { content: 'Resumen de Productos', colSpan: shouldGroupByDestino ? 6 : 5, styles: { halign: 'center', fillColor: '#e2e8f0' } },
                    ];
                    
                    const summarySubHead = [
                        shouldGroupByDestino ? 'Destino' : null, 
                        'Descripción', 'Temp(°C)', 'Total Cantidad', 
                        !isSummaryFormat ? 'Total Paletas' : null,
                        'Total Peso (kg)'
                    ].filter(Boolean) as string[];

                    const summaryBody = recalculatedSummary.map((p: any) => {
                        const row: any[] = [];
                        if (shouldGroupByDestino) row.push(p.destino);
                        row.push(p.descripcion);
                        row.push(p.temperatura);
                        row.push(p.totalCantidad);
                        if (!isSummaryFormat) row.push(p.totalPaletas);
                        row.push(p.totalPeso?.toFixed(2));
                        return row;
                    });
                    
                    const footRow: any[] = [
                        { content: 'TOTALES:', colSpan: shouldGroupByDestino ? 2 : 1, styles: { halign: 'right', fontStyle: 'bold' } }, 
                        '', 
                        { content: totalGeneralCantidad, styles: { halign: 'right' } }
                    ];
                     if (!isSummaryFormat) {
                        footRow.push({ content: totalGeneralPaletas, styles: { halign: 'right' } });
                    }
                    footRow.push({ content: totalGeneralPeso.toFixed(2), styles: { halign: 'right' } });

                     // Calculate table height to check for page break
                    let tempDoc = new jsPDF();
                    autoTable(tempDoc, {
                        head: [summarySubHead],
                        body: summaryBody,
                        foot: [footRow],
                        styles: { fontSize: 8, cellPadding: 4 },
                        headStyles: { fillColor: '#f8fafc', textColor: '#334155' },
                        footStyles: { fillColor: '#f1f5f9', fontStyle: 'bold', textColor: '#1a202c' },
                        margin: { horizontal: margin },
                    });
                    const tableHeight = (tempDoc as any).lastAutoTable.finalY;
                    const headerHeight = 20; // Approx height for the main title
                    const neededHeight = headerHeight + tableHeight;
                    const remainingSpace = pageHeight - yPos - margin; // margin at the bottom

                    if (neededHeight > remainingSpace) {
                        doc.addPage();
                        yPos = margin;
                    }

                    // Now draw the actual table
                    autoTable(doc, {
                        startY: yPos,
                        head: [summaryHead],
                        body: [],
                        theme: 'grid',
                        margin: { horizontal: margin },
                        styles: { fontSize: 8, cellPadding: 4 },
                    });
                    yPos = (doc as any).autoTable.previous.finalY;
    
                    autoTable(doc, {
                        startY: yPos,
                        head: [summarySubHead],
                        body: summaryBody,
                        foot: [footRow],
                        theme: 'grid',
                        footStyles: { fillColor: '#f1f5f9', fontStyle: 'bold', textColor: '#1a202c' },
                        styles: { fontSize: 8, cellPadding: 4 },
                        headStyles: { fillColor: '#f8fafc', textColor: '#334155' },
                        margin: { horizontal: margin, bottom: 40 },
                    });
                    yPos = (doc as any).autoTable.previous.finalY + 15;
                }

                addObservationsTable();
    
                autoTable(doc, { 
                    startY: yPos, 
                    head: [[{ content: 'Responsables de la Operación', colSpan: 6, styles: { fillColor: '#e2e8f0', textColor: '#1a202c', fontStyle: 'bold', halign: 'center' } }]], 
                    body: [
                        [
                           {content: 'Coordinador:', styles: {fontStyle: 'bold'}},
                            formData.coordinador || 'N/A',
                            {content: 'Operario:', styles: {fontStyle: 'bold'}},
                            userDisplayName || 'N/A',
                             {content: 'Operación Realizada por Cuadrilla:', styles: {fontStyle: 'bold'}},
                            `${formData.aplicaCuadrilla ? formData.aplicaCuadrilla.charAt(0).toUpperCase() + formData.aplicaCuadrilla.slice(1) : 'N/A'}${formData.aplicaCuadrilla === 'si' && isReception && formData.tipoPedido === 'MAQUILA' && formData.numeroOperariosCuadrilla ? ` (${formData.numeroOperariosCuadrilla} operarios)`: ''}`
                        ],
                    ].filter(row => row.length > 0 && row.some(cell => typeof cell === 'string' ? cell.length > 0 : (cell as any).content.length > 0)), 
                    theme: 'grid', 
                    styles: { fontSize: 8, cellPadding: 4, valign: 'middle' },
                    columnStyles: {
                        0: { cellWidth: 'auto' }, 1: { cellWidth: '*' },
                        2: { cellWidth: 'auto' }, 3: { cellWidth: '*' },
                        4: { cellWidth: 'auto' }, 5: { cellWidth: '*' },
                    },
                    margin: { horizontal: margin },
                });
                yPos = (doc as any).autoTable.previous.finalY + 15;
            }
    
            if (base64Images.length > 0) {
                doc.addPage();
                yPos = margin; // Reset Y position for the new page
                
                attachmentsStartPage = (doc as any).internal.getNumberOfPages();

                autoTable(doc, { startY: yPos, margin: { horizontal: margin }, head: [[{ content: 'Anexos: Registros Fotográficos', styles: { fillColor: '#e2e8f0', textColor: '#1a202c', fontStyle: 'bold', halign: 'center' } }]], body: [], theme: 'grid' });
                yPos = (doc as any).autoTable.previous.finalY + 10;

                let xPos = margin;
                for (let i = 0; i < base64Images.length; i++) {
                    const imgData = base64Images[i];
                    const imgWidth = (pageWidth - margin * 2 - (margin / 2)) / 2;
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
    
    const recalculateTotalPaletas = (formData: any): number => {
        const allItems = formData.despachoPorDestino ? formData.destinos.flatMap((d: any) => d.items) : formData.items;
        const isSummary = allItems.some((p: any) => Number(p.paleta) === 0);

        if (isSummary) {
            if (formData.despachoPorDestino) {
                return Number(formData.totalPaletasDespacho) || 0;
            }
            return allItems.reduce((sum: number, item: any) => sum + (Number(item.totalPaletas) || 0), 0);
        } else {
            const uniquePallets = new Set<number>();
            allItems.forEach((item: any) => {
                const paletaNum = Number(item.paleta);
                if (!isNaN(paletaNum) && paletaNum > 0) {
                    uniquePallets.add(paletaNum);
                }
            });
            return uniquePallets.size;
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
            case 'fixed-weight-despacho':
                 return <FixedWeightReport {...props} formType={submission.formType} />;
            case 'variable-weight-despacho':
                return <VariableWeightDispatchReport {...props} />;
            case 'variable-weight-recepcion':
            case 'variable-weight-reception':
                return <VariableWeightReceptionReport {...props} />;
            default:
                return <div className="p-4">Tipo de formato no reconocido.</div>;
        }
    };

    const getInfoBoxType = (): 'fixed' | 'variable' | undefined => {
        if (submission.formType.startsWith('fixed-weight-')) {
            return 'fixed';
        }
        if (submission.formType.startsWith('variable-weight-')) {
            return 'variable';
        }
        return undefined;
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
                    <ReportLayout title={getReportTitle()} logoBase64={logoBase64} infoBoxType={getInfoBoxType()}>
                        {renderReportContent()}
                    </ReportLayout>
                </div>
            </div>
        </div>
    );
}







