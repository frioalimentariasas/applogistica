
'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import jspdf from 'jspdf';
import { format, parseISO } from 'date-fns';

import type { SubmissionResult } from '@/app/actions/consultar-formatos';
import { Button } from '@/components/ui/button';
import { Loader2, Download, ArrowLeft, Image as ImageIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

import { ReportLayout } from '@/components/app/reports/ReportLayout';
import { FixedWeightReport } from '@/components/app/reports/FixedWeightReport';
import { VariableWeightDispatchReport } from '@/components/app/reports/VariableWeightDispatchReport';
import { VariableWeightReceptionReport } from '@/components/app/reports/VariableWeightReceptionReport';
import { getImageAsBase64 } from '@/app/actions/image-proxy';

// html2canvas is used by jspdf internally, so it's a good idea to have it.
import html2canvas from 'html2canvas';


interface ReportComponentProps {
    submission: SubmissionResult;
}

export default function ReportComponent({ submission }: ReportComponentProps) {
    const reportRef = useRef<HTMLDivElement>(null);
    const [isDownloading, setIsDownloading] = useState(false);
    const [isLoadingImages, setIsLoadingImages] = useState(true);
    const [base64Images, setBase64Images] = useState<string[]>([]);

    useEffect(() => {
        // This assignment must be done on the client side, after the component has mounted.
        // It ensures `window` is available.
        if (typeof window !== 'undefined') {
            (window as any).html2canvas = html2canvas;
        }
    }, []);

    useEffect(() => {
        if (!submission.attachmentUrls || submission.attachmentUrls.length === 0) {
            setIsLoadingImages(false);
            return;
        }

        const fetchImages = async () => {
            setIsLoadingImages(true);
            try {
                const promises = submission.attachmentUrls.map(url => getImageAsBase64(url));
                const images = await Promise.all(promises);
                setBase64Images(images);
            } catch (error) {
                console.error("Error fetching one or more images:", error);
            } finally {
                setIsLoadingImages(false);
            }
        };

        fetchImages();
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
        const reportElement = reportRef.current;
        if (!reportElement) return;
        setIsDownloading(true);
    
        try {
            const pdf = new jspdf({
                orientation: 'portrait',
                unit: 'pt',
                format: 'a4',
            });
    
            await pdf.html(reportElement, {
                callback: function (doc) {
                    const { formType, formData, createdAt } = submission;
                    let typeName = 'Formato';
                    if (formType.includes('recepcion') || formType.includes('reception')) typeName = 'Recepcion';
                    if (formType.includes('despacho')) typeName = 'Despacho';

                    let productType = 'PesoFijo';
                    if (formType.includes('variable-weight')) productType = 'PesoVariable';

                    const date = parseISO(createdAt);
                    const formattedDate = format(date, 'yyyy-MM-dd');
                    const formattedTime = format(date, 'HH-mm-ss');

                    const fileName = `${typeName}_${productType}_${formData.pedidoSislog}_${formattedDate}_${formattedTime}.pdf`;
                    
                    doc.save(fileName);
                },
                margin: [40, 20, 40, 20], // top, right, bottom, left
                autoPaging: 'slice',
                html2canvas: {
                    scale: 2,
                    useCORS: true,
                    logging: false,
                },
                // Force the width to match the PDF page width minus margins
                // A4 width (595pt) - left margin (20pt) - right margin (20pt) = 555pt
                width: 555,
                windowWidth: 555,
            });
    
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
                    <Button onClick={handleDownload} disabled={isDownloading || isLoadingImages}>
                        {isDownloading ? (
                            <Loader2 className="mr-2 animate-spin" />
                        ) : (
                            <Download className="mr-2" />
                        )}
                        {isDownloading ? 'Descargando...' : 'Descargar PDF'}
                    </Button>
                </header>

                {isLoadingImages && (
                    <Alert>
                        <ImageIcon className="h-4 w-4" />
                        <AlertTitle>Cargando Imágenes</AlertTitle>
                        <AlertDescription>
                            Por favor espere mientras se cargan las imágenes del anexo.
                        </AlertDescription>
                    </Alert>
                )}

                <div className="bg-white shadow-lg">
                    {/* The ref is now on the outer container for jspdf.html() */}
                    <div ref={reportRef}> 
                        <div className="p-4">
                            <ReportLayout title={getReportTitle()}>
                            {renderReportContent()}
                            </ReportLayout>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
