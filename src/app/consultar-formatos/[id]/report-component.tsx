
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
    const [base64Images, setBase64Images] = useState<string[]>([]);
    const [logoBase64, setLogoBase64] = useState<string | null>(null);

    useEffect(() => {
        const fetchAllImages = async () => {
            setAreImagesLoading(true);
            try {
                // Use the server-side proxy for Firebase Storage URLs to avoid CORS issues
                const attachmentPromises = submission.attachmentUrls.map(url => getImageAsBase64(url));
                
                // Use a client-side fetch for the same-origin logo
                const logoUrl = new URL('/images/company-logo.png', window.location.origin).href;
                const logoPromise = getImageAsBase64Client(logoUrl);

                const [logoData, ...attachmentData] = await Promise.all([logoPromise, ...attachmentPromises]);
                
                setLogoBase64(logoData);
                setBase64Images(attachmentData.filter(img => img && !img.startsWith('data:image/gif')));

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
    
            const addHeader = (title: string) => {
                const logoWidth = 150;
                const logoHeight = 55;
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
                doc.setFont('helvetica', 'normal');
                doc.setTextColor('#555');
                doc.text('FRIO ALIMENTARIA SAS NIT 900736914-0', titleX + availableWidth / 2, margin + 35, { align: 'center', maxWidth: availableWidth });
                
                yPos = margin + logoHeight + 20;
            };
    
            const addFooter = () => {
                const pageCount = (doc as any).internal.getNumberOfPages();
                doc.setFontSize(8);
                doc.setTextColor(150);
                for (let i = 1; i <= pageCount; i++) {
                    doc.setPage(i);
                    doc.text(`Página ${i} de ${pageCount}`, pageWidth - margin, pageHeight - 20, { align: 'right' });
                }
            };
    
            const didDrawPage = (data: { pageNumber: number; doc: jsPDF; }) => {
                yPos = margin; // Reset yPos for new page
                addHeader(getReportTitle());
                // This is a bit of a hack to ensure the table starts after our manual header
                if ((doc as any).autoTable.previous) {
                   (doc as any).autoTable.previous.finalY = yPos;
                }
            };
            
            addHeader(getReportTitle()); // Add header to the first page
    
            const { formType, formData, userDisplayName } = submission;
    
            if (formType.startsWith('fixed-weight-')) {
                const isReception = formType.includes('recepcion');
                const operationTerm = isReception ? 'Descargue' : 'Cargue';
    
                autoTable(doc, {
                    startY: yPos,
                    head: [[{ content: 'Información General', colSpan: 6, styles: { fillColor: '#e2e8f0', textColor: '#1a202c', fontStyle: 'bold', halign: 'center' } }]],
                    body: [
                        ['Pedido SISLOG:', formData.pedidoSislog || 'N/A', 'Nombre Cliente:', formData.nombreCliente || 'N/A', 'Factura/Remisión:', formData.facturaRemision || 'N/A'],
                        ['Fecha:', formData.fecha ? format(new Date(formData.fecha), "dd/MM/yyyy") : 'N/A', `Hora Inicio ${operationTerm}:`, formatTime12Hour(formData.horaInicio), `Hora Fin ${operationTerm}:`, formatTime12Hour(formData.horaFin)],
                        ['Precinto/Sello:', formData.precinto || 'N/A', 'Documento de Transporte:', formData.documentoTransporte || 'N/A', 'Operario:', userDisplayName || 'N/A']
                    ],
                    theme: 'grid', styles: { fontSize: 8, cellPadding: 4 },
                    columnStyles: {
                        0: { fontStyle: 'bold' },
                        2: { fontStyle: 'bold' },
                        4: { fontStyle: 'bold' },
                    },
                });
                yPos = (doc as any).autoTable.previous.finalY + 15;
    
                const productHead = [['Código', 'Descripción', 'No. Cajas', 'Total Pal/Cant', 'Temp(°C)']];
                const productBody = formData.productos.map((p: any) => [ p.codigo, p.descripcion, p.cajas, p.paletas?.toFixed(2) || '0.00', p.temperatura ]);
                const totalCajas = formData.productos.reduce((acc: any, p: any) => acc + (Number(p.cajas) || 0), 0);
                const totalPaletas = formData.productos.reduce((acc: any, p: any) => acc + (Number(p.paletas) || 0), 0);
    
                autoTable(doc, {
                    startY: yPos,
                    head: [[{ content: 'Características del Producto', colSpan: 5, styles: { halign: 'center', fillColor: '#e2e8f0', textColor: '#1a202c', fontStyle: 'bold' } }]],
                    body: [], theme: 'grid'
                });
                autoTable(doc, {
                    startY: (doc as any).autoTable.previous.finalY,
                    head: productHead, body: productBody,
                    foot: [[{ content: 'TOTALES:', colSpan: 2, styles: { halign: 'right', fontStyle: 'bold' } }, totalCajas, totalPaletas.toFixed(2), '']],
                    theme: 'striped', headStyles: { fillColor: '#f8fafc', textColor: '#334155', fontStyle: 'bold' },
                    footStyles: { fillColor: '#f1f5f9', fontStyle: 'bold', textColor: '#1a202c' },
                    styles: { fontSize: 8, cellPadding: 4 }
                });
                yPos = (doc as any).autoTable.previous.finalY + 15;
    
                autoTable(doc, {
                    startY: yPos,
                    head: [[{ content: 'Información del Vehículo', colSpan: 6, styles: { fillColor: '#e2e8f0', textColor: '#1a202c', fontStyle: 'bold', halign: 'center' } }]],
                    body: [
                        ['Nombre Conductor:', formData.nombreConductor || 'N/A', 'Cédula:', formData.cedulaConductor || 'N/A', 'Placa:', formData.placa || 'N/A'],
                        ['Muelle:', formData.muelle || 'N/A', 'Contenedor:', formData.contenedor || 'N/A', 'Set Point (°C):', formData.setPoint || 'N/A'],
                        ['Cond. Higiene:', formData.condicionesHigiene || 'N/A', 'Termoregistrador:', formData.termoregistrador || 'N/A', 'Cliente Requiere Termoregistro:', formData.clienteRequiereTermoregistro || 'N/A']
                    ], 
                    theme: 'grid', styles: { fontSize: 8, cellPadding: 4 },
                    columnStyles: {
                        0: { fontStyle: 'bold' },
                        2: { fontStyle: 'bold' },
                        4: { fontStyle: 'bold' },
                    }
                });
                yPos = (doc as any).autoTable.previous.finalY + 15;
    
                if (formData.observaciones) {
                    autoTable(doc, { startY: yPos, head: [[{ content: 'Observaciones', styles: { fillColor: '#e2e8f0', textColor: '#1a202c', fontStyle: 'bold', halign: 'center' } }]], body: [[formData.observaciones]], theme: 'grid', styles: { fontSize: 8, cellPadding: 4 } });
                    yPos = (doc as any).autoTable.previous.finalY + 15;
                }
    
                autoTable(doc, { startY: yPos, head: [[{ content: 'Responsables', colSpan: 4, styles: { fillColor: '#e2e8f0', textColor: '#1a202c', fontStyle: 'bold', halign: 'center' } }]], body: [['Coordinador:', formData.coordinador || 'N/A', 'Operario:', userDisplayName || 'N/A']], theme: 'grid', styles: { fontSize: 8, cellPadding: 4 }, columnStyles: { 0: { fontStyle: 'bold' }, 2: { fontStyle: 'bold' } } });
                yPos = (doc as any).autoTable.previous.finalY + 15;
    
            } else if (formType.startsWith('variable-weight-')) {
                 const isReception = formType.includes('recepcion') || formType.includes('reception');
                 const operationTerm = isReception ? 'Descargue' : 'Cargue';
                 
                 autoTable(doc, { startY: yPos, head: [[{ content: `Datos de ${isReception ? 'Recepción' : 'Despacho'}`, colSpan: 6, styles: { fillColor: '#e2e8f0', textColor: '#1a202c', fontStyle: 'bold', halign: 'center' } }]],
                    body: [
                        ['Pedido SISLOG:', formData.pedidoSislog || 'N/A', 'Cliente:', formData.cliente || 'N/A', 'Fecha:', formData.fecha ? format(new Date(formData.fecha), "dd/MM/yyyy") : 'N/A'],
                        ['Conductor:', formData.conductor || 'N/A', 'Cédula:', formData.cedulaConductor || 'N/A', 'Placa:', formData.placa || 'N/A'],
                        ['Precinto:', formData.precinto || 'N/A', 'Set Point (°C):', formData.setPoint || 'N/A', 'Operario:', userDisplayName || 'N/A'],
                        [`Hora Inicio ${operationTerm}:`, formatTime12Hour(formData.horaInicio), `Hora Fin ${operationTerm}:`, formatTime12Hour(formData.horaFin), '', '']
                    ], theme: 'grid', styles: { fontSize: 8, cellPadding: 4 },
                    columnStyles: {
                        0: { fontStyle: 'bold' },
                        2: { fontStyle: 'bold' },
                        4: { fontStyle: 'bold' },
                    }
                });
                yPos = (doc as any).autoTable.previous.finalY + 15;
                
                const detailHead = isReception 
                    ? [['Paleta', 'Descripción', 'Lote', 'Cant.', 'Peso Bruto', 'Tara Estiba', 'Tara Caja', 'Total Tara', 'Peso Neto']] 
                    : [['Paleta', 'Descripción', 'Lote', 'Presentación', 'Cant.', 'Peso Neto (kg)']];

                const detailBody = isReception
                    ? formData.items.map((p: any) => [ p.paleta, p.descripcion, p.lote, p.cantidadPorPaleta, p.pesoBruto?.toFixed(2), p.taraEstiba?.toFixed(2), p.taraCaja?.toFixed(2), p.totalTaraCaja?.toFixed(2), p.pesoNeto?.toFixed(2) ])
                    : formData.items.map((p: any) => [ p.paleta, p.descripcion, p.lote, p.presentacion, p.cantidadPorPaleta, p.pesoNeto?.toFixed(2) ]);
                
                const detailColSpan = isReception ? 9 : 6;
                autoTable(doc, { startY: yPos, head: [[{ content: `Detalle de ${isReception ? 'Recepción' : 'Despacho'}`, colSpan: detailColSpan, styles: { fillColor: '#e2e8f0', textColor: '#1a202c', fontStyle: 'bold', halign: 'center' } }]], body: [], theme: 'grid' });
                autoTable(doc, { startY: (doc as any).autoTable.previous.finalY, head: detailHead, body: detailBody, theme: 'striped', headStyles: { fillColor: '#f8fafc', textColor: '#334155', fontStyle: 'bold' }, styles: { fontSize: 7, cellPadding: 3 } });
                yPos = (doc as any).autoTable.previous.finalY + 15;
                
                if (formData.summary?.length > 0) {
                    const summaryHead = [['Descripción', 'Temp(°C)', 'Total Cantidad', 'Total Peso (kg)']];
                    const summaryBody = formData.summary.map((p: any) => [p.descripcion, p.temperatura, p.totalCantidad, p.totalPeso?.toFixed(2)]);
                    const totalPeso = formData.summary.reduce((acc: any, p: any) => acc + (p.totalPeso || 0), 0);
                    const totalCantidad = formData.summary.reduce((acc: any, p: any) => acc + (p.totalCantidad || 0), 0);

                    autoTable(doc, { startY: yPos, head: [[{ content: 'Resumen de Productos', colSpan: 4, styles: { fillColor: '#e2e8f0', textColor: '#1a202c', fontStyle: 'bold', halign: 'center' } }]], body: [], theme: 'grid' });
                    autoTable(doc, { startY: (doc as any).autoTable.previous.finalY, head: summaryHead, body: summaryBody, foot: [[{ content: 'TOTALES:', colSpan: 2, styles: { halign: 'right', fontStyle: 'bold' } }, totalCantidad, totalPeso.toFixed(2)]],
                        theme: 'striped', headStyles: { fillColor: '#f8fafc', textColor: '#334155', fontStyle: 'bold' }, footStyles: { fillColor: '#f1f5f9', fontStyle: 'bold', textColor: '#1a202c' }, styles: { fontSize: 8, cellPadding: 4 } });
                    yPos = (doc as any).autoTable.previous.finalY + 15;
                }

                 if (formData.observaciones) {
                    autoTable(doc, { startY: yPos, head: [[{ content: 'Observaciones', styles: { fillColor: '#e2e8f0', textColor: '#1a202c', fontStyle: 'bold', halign: 'center' } }]], body: [[formData.observaciones]], theme: 'grid', styles: { fontSize: 8, cellPadding: 4 } });
                    yPos = (doc as any).autoTable.previous.finalY + 15;
                }
    
                autoTable(doc, { startY: yPos, head: [[{ content: 'Responsables', colSpan: 4, styles: { fillColor: '#e2e8f0', textColor: '#1a202c', fontStyle: 'bold', halign: 'center' } }]], body: [['Coordinador:', formData.coordinador || 'N/A', 'Operario:', userDisplayName || 'N/A']], theme: 'grid', styles: { fontSize: 8, cellPadding: 4 }, columnStyles: { 0: { fontStyle: 'bold' }, 2: { fontStyle: 'bold' } } });
                yPos = (doc as any).autoTable.previous.finalY + 15;
            }
    
             if (base64Images.length > 0) {
                // Check if a new page is needed before adding the attachments section
                if (yPos > pageHeight - margin - 100) { // 100 is an arbitrary value for attachment space
                    doc.addPage();
                    yPos = margin;
                }
                autoTable(doc, { startY: yPos, head: [[{ content: 'Anexos: Registros Fotográficos', styles: { fillColor: '#e2e8f0', textColor: '#1a202c', fontStyle: 'bold', halign: 'center' } }]], body: [], theme: 'grid' });
                yPos = (doc as any).autoTable.previous.finalY + 10;

                let xPos = margin;
                for (let i = 0; i < base64Images.length; i++) {
                    const imgData = base64Images[i];
                    const imgWidth = (pageWidth - margin * 3) / 2;
                    const imgHeight = 150; 

                    if (yPos + imgHeight + 20 > pageHeight - margin) {
                        doc.addPage();
                        yPos = margin;
                        xPos = margin;
                    }
                    try {
                       doc.addImage(imgData, 'JPEG', xPos, yPos, imgWidth, imgHeight);
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
            attachments: base64Images,
        };

        switch (submission.formType) {
            case 'fixed-weight-recepcion':
                return <FixedWeightReport {...props} formType={submission.formType} />;
            case 'fixed-weight-despacho':
                 return <FixedWeightReport {...props} formType={submission.formType} />;
            case 'variable-weight-despacho':
                return <VariableWeightDispatchReport {...props} />;
            case 'variable-weight-reception':
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
