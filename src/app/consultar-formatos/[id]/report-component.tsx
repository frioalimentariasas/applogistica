

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
    
    const processTunelCongelacionData = (formData: any) => {
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
                            temperatura1: summaryItem?.temperatura1,
                            temperatura2: summaryItem?.temperatura2,
                            temperatura3: summaryItem?.temperatura3,
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
                
                const watermarkImgHeight = pageHeight * 0.4; // Watermark covers 40% of page height
                const watermarkAspectRatio = logoDimensions.width / logoDimensions.height; // Use real aspect ratio
                const watermarkImgWidth = watermarkImgHeight * watermarkAspectRatio;
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
                        let typeText = obs.customType || obs.type;
                        
                        if (!isOther && (obs.type === 'REESTIBADO' || obs.type === 'TRANSBORDO CANASTILLA' || obs.type === 'SALIDA PALETAS TUNEL') && obs.executedByGrupoRosales === true) {
                            typeText += " (Realizado por Cuadrilla)";
                        }

                        if (isOther) {
                            return [{ 
                                content: `OTRAS OBSERVACIONES: ${typeText}`,
                                colSpan: 2,
                                styles: { halign: 'left', fontStyle: 'normal' }
                            }];
                        } else {
                            const quantityText = `${obs.quantity ?? ''} ${obs.quantityType || ''}`.trim();
                            return [typeText, { content: quantityText, styles: { halign: 'right' } }];
                        }
                    });

                    autoTable(doc, {
                        startY: yPos,
                        head: [[{ content: 'Observaciones', colSpan: 2, styles: { fillColor: '#e2e8f0', textColor: '#1a202c', fontStyle: 'bold', halign: 'center' } }]],
                        body: [],
                        theme: 'grid',
                        margin: { horizontal: margin },
                        styles: { fontSize: 8, cellPadding: 4 },
                    });
                    
                    autoTable(doc, {
                        startY: (doc as any).autoTable.previous.finalY,
                        head: [['Tipo de Observación', 'Cantidad']],
                        body: obsBody,
                        theme: 'grid',
                        margin: { horizontal: margin },
                        styles: { fontSize: 8, cellPadding: 4, valign: 'middle' },
                        headStyles: { fillColor: '#f8fafc', textColor: '#334155' },
                        columnStyles: {
                            0: { cellWidth: '*' },
                            1: { cellWidth: 'auto', halign: 'right' },
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
                            {content: 'Tipo Pedido:', styles: {fontStyle: 'bold'}},
                            formatTipoPedido(formData.tipoPedido)
                        ]
                ];
                
                if (isReception && formData.tipoPedido === 'MAQUILA') {
                    generalInfoBody.push([
                         {
                            content: `Tipo Empaque: ${formData.tipoEmpaqueMaquila || 'N/A'}`,
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
                 if (isReception) {
                     if (formData.tipoPedido === 'TUNEL DE CONGELACIÓN') {
                        const { placaGroups, totalGeneralPaletas, totalGeneralCantidad, totalGeneralPeso } = processTunelCongelacionData(formData);
                        
                        autoTable(doc, {
                            startY: yPos,
                            head: [[{ content: `Datos de Recepción`, colSpan: 6, styles: { fillColor: '#e2e8f0', textColor: '#1a202c', fontStyle: 'bold', halign: 'center' } }]],
                            body: [
                                [
                                    {content: 'Pedido SISLOG:', styles: {fontStyle: 'bold'}}, formData.pedidoSislog || 'N/A',
                                    {content: 'Cliente:', styles: {fontStyle: 'bold'}}, formData.cliente || 'N/A',
                                    {content: 'Fecha:', styles: {fontStyle: 'bold'}}, formData.fecha ? format(new Date(formData.fecha), "dd/MM/yyyy") : 'N/A'
                                ],
                                [
                                    {content: `H. Inicio Descargue:`, styles: {fontStyle: 'bold'}}, formatTime12Hour(formData.horaInicio),
                                    {content: `H. Fin Descargue:`, styles: {fontStyle: 'bold'}}, formatTime12Hour(formData.horaFin),
                                    {content: 'Tipo Pedido:', styles: {fontStyle: 'bold'}}, formData.tipoPedido || 'N/A'
                                ],
                                [
                                    {content: 'Precinto:', styles: {fontStyle: 'bold'}}, formData.precinto || 'N/A',
                                    {content: 'Set Point (°C):', styles: {fontStyle: 'bold'}}, formatOptionalNumber(formData.setPoint),
                                    {content: 'Contenedor:', styles: {fontStyle: 'bold'}}, formData.contenedor || 'N/A'
                                ],
                            ],
                            theme: 'grid',
                            styles: { fontSize: 8, cellPadding: 4, valign: 'middle' },
                            columnStyles: { 0: { cellWidth: 'auto' }, 1: { cellWidth: '*' }, 2: { cellWidth: 'auto' }, 3: { cellWidth: '*' }, 4: { cellWidth: 'auto' }, 5: { cellWidth: '*' } },
                            margin: { horizontal: margin },
                        });
                        yPos = (doc as any).autoTable.previous.finalY + 15;

                        (formData.placas || []).forEach((placa: any) => {
                             autoTable(doc, {
                                startY: yPos,
                                head: [[{ content: `Placa: ${placa.numeroPlaca} | Conductor: ${placa.conductor} (C.C. ${placa.cedulaConductor})`, colSpan: 8, styles: { fillColor: '#ddebf7', fontStyle: 'bold', textColor: '#000' } }]],
                                theme: 'grid',
                                margin: { horizontal: margin },
                                styles: { fontSize: 7, cellPadding: 3 },
                             });
                             yPos = (doc as any).autoTable.previous.finalY;

                             autoTable(doc, {
                                startY: yPos,
                                head: [['Descripción', 'Lote', 'Presentación', 'Cant.', 'P. Bruto', 'T. Estiba', 'T. Caja', 'P. Neto']],
                                body: (placa.items || []).map((p: any) => [
                                    p.descripcion, p.lote, p.presentacion, p.cantidadPorPaleta,
                                    p.pesoBruto?.toFixed(2), p.taraEstiba?.toFixed(2), p.taraCaja?.toFixed(2), p.pesoNeto?.toFixed(2)
                                ]),
                                theme: 'grid',
                                styles: { fontSize: 7, cellPadding: 3 },
                                headStyles: { fillColor: false, textColor: '#333', fontStyle: 'bold' },
                                margin: { horizontal: margin },
                             });
                             yPos = (doc as any).autoTable.previous.finalY;
                        });
                        
                        yPos += 15;

                        if (placaGroups.length > 0) {
                            autoTable(doc, {
                                startY: yPos,
                                head: [[{ content: 'Resumen Agrupado de Productos', styles: {halign: 'center', fillColor: '#e2e8f0', textColor: '#1a202c', fontStyle: 'bold' } }]],
                                body: [],
                                theme: 'grid',
                                margin: { horizontal: margin },
                            });
                            yPos = (doc as any).autoTable.previous.finalY;

                            for (const placaGroup of placaGroups) {
                                autoTable(doc, {
                                    startY: yPos,
                                    body: [[{ content: `Placa: ${placaGroup.placa} | Conductor: ${placaGroup.conductor} | C.C: ${placaGroup.cedulaConductor}`, styles: { fontStyle: 'bold', fillColor: '#f1f5f9', textColor: '#000' } }]],
                                    theme: 'grid',
                                    margin: { horizontal: margin },
                                });
                                yPos = (doc as any).autoTable.previous.finalY;

                                for (const group of placaGroup.presentationGroups) {
                                    autoTable(doc, {
                                        startY: yPos,
                                        body: [[{ content: `Presentación: ${group.presentation}`, colSpan: 5, styles: { fontStyle: 'bold', fillColor: '#fafafa', textColor: '#000' } }]],
                                        theme: 'grid',
                                        margin: { horizontal: margin, left: margin + 10 },
                                    });

                                    autoTable(doc, {
                                        startY: (doc as any).autoTable.previous.finalY,
                                        head: [['Descripción', 'Temp(°C)', 'Total Paletas', 'Total Cantidad', 'Total Peso (kg)']],
                                        body: group.products.map((p: any) => [p.descripcion, [p.temperatura1, p.temperatura2, p.temperatura3].filter(t => t != null).join(' / '), p.totalPaletas, p.totalCantidad, p.totalPeso.toFixed(2)]),
                                        foot: [[
                                            { content: `Subtotal ${group.presentation}:`, colSpan: 2, styles: { halign: 'right', fontStyle: 'bold', textColor: '#000' } },
                                            group.subTotalPaletas,
                                            group.subTotalCantidad,
                                            group.subTotalPeso.toFixed(2),
                                        ]],
                                        theme: 'grid',
                                        styles: { fontSize: 7, cellPadding: 3 },
                                        headStyles: { fillColor: '#fff', textColor: '#333' },
                                        footStyles: { fillColor: '#f8f9fa', fontStyle: 'bold', textColor: '#000' },
                                        margin: { horizontal: margin, left: margin + 10 },
                                    });
                                    yPos = (doc as any).autoTable.previous.finalY;
                                }

                                // Subtotal por placa
                                autoTable(doc, {
                                    startY: yPos,
                                    body: [[
                                        { content: `Subtotal Placa ${placaGroup.placa}:`, colSpan: 2, styles: { fontStyle: 'bold', fillColor: '#ddebf7', textColor: '#000', halign: 'right' } },
                                        { content: placaGroup.totalPaletasPlaca, styles: { fontStyle: 'bold', fillColor: '#ddebf7', textColor: '#000', halign: 'right' } },
                                        { content: placaGroup.totalCantidadPlaca, styles: { fontStyle: 'bold', fillColor: '#ddebf7', textColor: '#000', halign: 'right' } },
                                        { content: placaGroup.totalPesoPlaca.toFixed(2), styles: { fontStyle: 'bold', fillColor: '#ddebf7', textColor: '#000', halign: 'right' } },
                                    ]],
                                    theme: 'grid',
                                    styles: { fontSize: 8 },
                                    headStyles: { fontStyle: 'bold', fillColor: '#ddebf7', textColor: '#000' },
                                    margin: { horizontal: margin },
                                });
                                yPos = (doc as any).autoTable.previous.finalY;
                            }
                            
                            yPos = (doc as any).autoTable.previous.finalY + 15;
                            
                            const tableHeight = 4 * 18 + 20;
                            if (yPos + tableHeight > pageHeight - margin) {
                                doc.addPage();
                                yPos = margin;
                            }
                            
                            autoTable(doc, {
                                startY: yPos,
                                head: [[{ content: 'TOTALES GENERALES', colSpan: 4, styles: { fillColor: '#1A90C8', textColor: '#FFFFFF', fontStyle: 'bold', halign: 'center' } }]],
                                body: [
                                    [{ content: 'Total General Paletas:', styles: { fontStyle: 'bold' } }, { content: totalGeneralPaletas, styles: { halign: 'right', fontStyle: 'bold', textColor: '#000' } }],
                                    [{ content: 'Total General Cantidad:', styles: { fontStyle: 'bold' } }, { content: totalGeneralCantidad, styles: { halign: 'right', fontStyle: 'bold', textColor: '#000' } }],
                                    [{ content: 'Total General Peso (kg):', styles: { fontStyle: 'bold' } }, { content: totalGeneralPeso.toFixed(2), styles: { halign: 'right', fontStyle: 'bold', textColor: '#000' } }],
                                ],
                                theme: 'grid',
                                styles: { fontSize: 8, cellPadding: 4, valign: 'middle' },
                                headStyles: { halign: 'center' },
                                didParseCell: function (data) {
                                    if (data.section === 'body') {
                                        data.cell.styles.fillColor = '#f8fafc';
                                    }
                                },
                                columnStyles: {
                                    0: { cellWidth: 150, fontStyle: 'bold' },
                                    1: { halign: 'right', cellWidth: '*' },
                                }
                            });
                            yPos = (doc as any).autoTable.previous.finalY + 15;
                        }
                    } else {
                         // --- START: Existing logic for other Variable Weight Receptions ---
                        const operationTerm = 'Descargue';
                        const isTunelModeByPlate = (formData.tipoPedido === 'TUNEL') && formData.recepcionPorPlaca;
                        
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
                               {content: 'Factura/Remisión:', styles: {fontStyle: 'bold'}}, formData.facturaRemision || 'N/A'
                             ],
                        ];
                        
                       if (formData.tipoPedido) {
                           const tipoPedidoText = `Tipo Pedido: ${formData.tipoPedido || 'N/A'}`;
                           const maquilaText = formData.tipoPedido === 'MAQUILA' ? ` (${formData.tipoEmpaqueMaquila || 'N/A'})` : '';
                           generalInfoBody.push([
                               { content: `${tipoPedidoText}${maquilaText}`, styles: { fontStyle: 'bold' }, colSpan: 6 }
                           ]);
                       }

                        autoTable(doc, {
                           startY: yPos,
                           head: [[{ content: `Datos de Recepción`, colSpan: 6, styles: { fillColor: '#e2e8f0', textColor: '#1a202c', fontStyle: 'bold', halign: 'center' } }]],
                           body: generalInfoBody,
                           theme: 'grid',
                           styles: { fontSize: 8, cellPadding: 4, valign: 'middle' },
                           columnStyles: { 0: { cellWidth: 'auto' }, 1: { cellWidth: '*' }, 2: { cellWidth: 'auto' }, 3: { cellWidth: '*' }, 4: { cellWidth: 'auto' }, 5: { cellWidth: '*' } },
                           margin: { horizontal: margin },
                       });
                       yPos = (doc as any).autoTable.previous.finalY + 15;

                        const drawItemsTable = (items: any[], subtitle?: string) => {
                             if(subtitle) {
                                  autoTable(doc, {
                                     startY: yPos,
                                     body: [[{ content: subtitle, styles: { fontStyle: 'bold', fillColor: '#f1f5f9', textColor: '#1a202c' } }]],
                                     theme: 'grid',
                                     margin: { horizontal: margin },
                                 });
                                 yPos = (doc as any).autoTable.previous.finalY;
                             }
                            const isSummaryFormat = items.some((p: any) => Number(p.paleta) === 0);
                            const head = isSummaryFormat
                                ? [['Descripción', 'Lote', 'Presentación', 'Total Cant.', 'Total Paletas', 'Total P. Neto']]
                                : [['Paleta', 'Descripción', 'Lote', 'Presentación', 'Cant.', 'P. Bruto', 'T. Estiba', 'T. Caja', 'Total Tara', 'P. Neto']];
                            const body = items.map((p: any) => isSummaryFormat
                                ? [p.descripcion, p.lote, p.presentacion, p.totalCantidad, p.totalPaletas, p.totalPesoNeto?.toFixed(2)]
                                : [p.paleta, p.descripcion, p.lote, p.presentacion, p.cantidadPorPaleta, p.pesoBruto?.toFixed(2), p.taraEstiba?.toFixed(2), p.taraCaja?.toFixed(2), p.totalTaraCaja?.toFixed(2), p.pesoNeto?.toFixed(2)]
                            );
                             autoTable(doc, { startY: yPos, head, body, theme: 'grid', styles: { fontSize: 7, cellPadding: 3 }, headStyles: { fillColor: '#f8fafc', textColor: '#334155', fontStyle: 'bold' }, margin: { horizontal: margin }, });
                             yPos = (doc as any).autoTable.previous.finalY + 15;
                        };
                        
                         if(isTunelModeByPlate) {
                            (formData.placas || []).forEach((placa: any) => {
                                const subTitle = `Placa: ${placa.numeroPlaca} | Conductor: ${placa.conductor} (C.C. ${placa.cedulaConductor})`;
                                drawItemsTable(placa.items || [], subTitle);
                            });
                        } else {
                            drawItemsTable(formData.items || []);
                        }

                        const { summaryData, totalGeneralPaletas, totalGeneralCantidad, totalGeneralPeso } = processDefaultData(formData);
                         if (summaryData.length > 0) {
                            autoTable(doc, {
                                startY: yPos,
                                head: [[{ content: 'Resumen Agrupado de Productos', styles: { halign: 'center', fillColor: '#e2e8f0', textColor: '#1a202c', fontStyle: 'bold' } }]],
                                theme: 'grid',
                                margin: { horizontal: margin },
                            });
                             autoTable(doc, {
                                 startY: (doc as any).autoTable.previous.finalY,
                                 head: [['Descripción', 'Temp(°C)', 'Total Cantidad', 'Total Paletas', 'Total Peso (kg)']],
                                 body: summaryData.map((p: any) => [ p.descripcion, [p.temperatura1, p.temperatura2, p.temperatura3].filter(t => t != null).join(' / '), p.totalCantidad, p.totalPaletas, p.totalPeso.toFixed(2) ]),
                                 foot: [[ { content: 'TOTALES:', colSpan: 2, styles: { halign: 'right', fontStyle: 'bold' } }, totalGeneralCantidad, totalGeneralPaletas, totalGeneralPeso.toFixed(2) ]],
                                 theme: 'grid',
                                 footStyles: { fillColor: '#f1f5f9', fontStyle: 'bold', textColor: '#1a202c' },
                                 styles: { fontSize: 8, cellPadding: 4 },
                                 headStyles: { fillColor: '#e2e8f0', textColor: '#1a202c', fontStyle: 'bold' },
                                 margin: { horizontal: margin, bottom: 40 },
                             });
                             yPos = (doc as any).autoTable.previous.finalY + 15;
                         }
                    }
                 } else { // Despacho Peso Variable
                    const operationTerm = 'Cargue';
                    const allItems = formData.despachoPorDestino ? formData.destinos.flatMap((d: any) => d.items.map((i: any) => ({ ...i, destino: d.nombreDestino }))) : formData.items;
                    const isSummaryFormat = allItems.some((p: any) => Number(p.paleta) === 0);

                    const recalculatedSummary = (() => {
                        const isIndividualPalletMode = allItems.every((item: any) => Number(item?.paleta) > 0);
                        const shouldGroupByDestino = formData.despachoPorDestino && isIndividualPalletMode;
                
                        const grouped = allItems.reduce((acc:any, item:any) => {
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
                
                        return Object.values(grouped).map((group:any) => {
                            let totalPeso = 0;
                            let totalCantidad = 0;
                            let totalPaletas = 0;
                            const uniquePallets = new Set<number>();
                            if (isSummaryFormat) {
                                group.items.forEach((item:any) => {
                                    totalPeso += Number(item.totalPesoNeto) || 0;
                                    totalCantidad += Number(item.totalCantidad) || 0;
                                    totalPaletas += Number(item.totalPaletas) || 0;
                                });
                            } else {
                                group.items.forEach((item:any) => {
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
                    
                    const totalGeneralPeso = recalculatedSummary.reduce((acc: number, p: any) => acc + (p.totalPeso || 0), 0);
                    const totalGeneralCantidad = recalculatedSummary.reduce((acc: number, p: any) => acc + (p.totalCantidad || 0), 0);
                    
                    const totalGeneralPaletas = (() => {
                        if (isSummaryFormat) {
                            if (formData.despachoPorDestino) {
                                return formData.totalPaletasDespacho || 0;
                            }
                            return recalculateTotalPaletas(formData);
                        }
                        const uniquePallets = new Set<number>();
                        allItems.forEach((i: any) => {
                            const pNum = Number(i.paleta);
                            if (!isNaN(pNum) && pNum > 0) uniquePallets.add(pNum);
                        });
                        return uniquePallets.size;
                    })();

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
                            {content: 'Tipo Pedido:', styles: {fontStyle: 'bold'}}, formatTipoPedido(formData.tipoPedido)
                        ],
                    ];

                    autoTable(doc, {
                        startY: yPos,
                        head: [[{ content: `Datos de Despacho`, colSpan: 6, styles: { fillColor: '#e2e8f0', textColor: '#1a202c', fontStyle: 'bold', halign: 'center' } }]],
                        body: generalInfoBody,
                        theme: 'grid',
                        styles: { fontSize: 8, cellPadding: 4, valign: 'middle' },
                        columnStyles: { 0: { cellWidth: 'auto' }, 1: { cellWidth: '*' }, 2: { cellWidth: 'auto' }, 3: { cellWidth: '*' }, 4: { cellWidth: 'auto' }, 5: { cellWidth: '*' } },
                        margin: { horizontal: margin },
                    });
                    yPos = (doc as any).autoTable.previous.finalY + 15;
                    
                    if (formData.despachoPorDestino) {
                        (formData.destinos || []).forEach((destino: any, index: number) => {
                            autoTable(doc, {
                                startY: yPos,
                                head: [[{ content: `Destino: ${destino.nombreDestino}`, colSpan: 10, styles: { fillColor: '#000', fontStyle: 'bold', textColor: '#fff' } }]],
                                theme: 'grid',
                                margin: { horizontal: margin },
                            });
                             yPos = (doc as any).autoTable.previous.finalY;

                             const head = isSummaryFormat
                                 ? [['Descripción', 'Lote', 'Presentación', 'Total Cant.', 'Total Paletas', 'Total P. Neto']]
                                 : [['Paleta', 'Descripción', 'Lote', 'Presentación', 'Cant.', 'P. Bruto', 'T. Estiba', 'T. Caja', 'Total Tara', 'P. Neto']];
                             const body = destino.items.map((p: any) => isSummaryFormat
                                 ? [p.descripcion, p.lote, p.presentacion, p.totalCantidad, p.totalPaletas, p.totalPesoNeto?.toFixed(2)]
                                 : [p.paleta, p.descripcion, p.lote, p.presentacion, p.cantidadPorPaleta, p.pesoBruto?.toFixed(2), p.taraEstiba?.toFixed(2), p.taraCaja?.toFixed(2), p.totalTaraCaja?.toFixed(2), p.pesoNeto?.toFixed(2)]
                             );
                             autoTable(doc, { startY: yPos, head, body, theme: 'grid', styles: { fontSize: 7, cellPadding: 3 }, headStyles: { fillColor: false, textColor: '#333', fontStyle: 'bold' }, margin: { horizontal: margin }, });
                             yPos = (doc as any).autoTable.previous.finalY + 15;
                        });

                    } else {
                         const head = isSummaryFormat
                             ? [['Descripción', 'Lote', 'Presentación', 'Total Cant.', 'Total Paletas', 'Total P. Neto']]
                             : [['Paleta', 'Descripción', 'Lote', 'Presentación', 'Cant.', 'P. Bruto', 'T. Estiba', 'T. Caja', 'Total Tara', 'P. Neto']];
                         const body = formData.items.map((p: any) => isSummaryFormat
                             ? [p.descripcion, p.lote, p.presentacion, p.totalCantidad, p.totalPaletas, p.totalPesoNeto?.toFixed(2)]
                             : [p.paleta, p.descripcion, p.lote, p.presentacion, p.cantidadPorPaleta, p.pesoBruto?.toFixed(2), p.taraEstiba?.toFixed(2), p.taraCaja?.toFixed(2), p.totalTaraCaja?.toFixed(2), p.pesoNeto?.toFixed(2)]
                         );
                         autoTable(doc, { startY: yPos, head, body, theme: 'grid', styles: { fontSize: 7, cellPadding: 3 }, headStyles: { fillColor: '#f8fafc', textColor: '#334155', fontStyle: 'bold' }, margin: { horizontal: margin }, });
                         yPos = (doc as any).autoTable.previous.finalY + 15;
                    }
                    if (recalculatedSummary.length > 0) {
                         autoTable(doc, {
                            startY: yPos,
                            head: [[{ content: 'Resumen Agrupado de Productos', styles: { halign: 'center', fillColor: '#e2e8f0', textColor: '#1a202c', fontStyle: 'bold' } }]],
                            theme: 'grid',
                            margin: { horizontal: margin },
                         });
                         autoTable(doc, {
                             startY: (doc as any).autoTable.previous.finalY,
                             head: [['Descripción', 'Temp(°C)', 'Total Cantidad', 'Total Paletas', 'Total Peso (kg)']],
                             body: recalculatedSummary.map((p: any) => [ p.descripcion, p.temperatura, p.totalCantidad, p.totalPaletas, p.totalPeso.toFixed(2) ]),
                             foot: [[ { content: 'TOTALES:', colSpan: 2, styles: { halign: 'right', fontStyle: 'bold' } }, totalGeneralCantidad, totalGeneralPaletas, totalGeneralPeso.toFixed(2) ]],
                             theme: 'grid',
                             footStyles: { fillColor: '#f1f5f9', fontStyle: 'bold', textColor: '#1a202c' },
                             styles: { fontSize: 8, cellPadding: 4 },
                             headStyles: { fillColor: '#e2e8f0', textColor: '#1a202c', fontStyle: 'bold' },
                             margin: { horizontal: margin, bottom: 40 },
                         });
                         yPos = (doc as any).autoTable.previous.finalY + 15;
                     }
                 }
                 addObservationsTable();
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





    
