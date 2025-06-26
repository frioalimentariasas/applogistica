
'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import jspdf from 'jspdf';
import html2canvas from 'html2canvas';
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

interface ReportComponentProps {
    submission: SubmissionResult;
}

export default function ReportComponent({ submission }: ReportComponentProps) {
    const router = useRouter();
    const reportRef = useRef<HTMLDivElement>(null);
    const [isDownloading, setIsDownloading] = useState(false);
    const [isLoadingImages, setIsLoadingImages] = useState(true);
    const [base64Images, setBase64Images] = useState<string[]>([]);

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
            if (formType.includes('recepcion')) return 'Reporte de Recepción - Peso Variable';
            return 'Reporte de Despacho - Peso Variable';
        }
        return 'Reporte de Formulario';
    };

    const handleDownload = async () => {
        if (!reportRef.current) return;
        setIsDownloading(true);

        try {
            const canvas = await html2canvas(reportRef.current, {
                scale: 2, // Higher scale for better quality
                useCORS: true,
                logging: false,
            });

            const imgData = canvas.toDataURL('image/png');
            const pdf = new jspdf({
                orientation: 'portrait',
                unit: 'pt',
                format: 'a4',
            });

            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            const canvasWidth = canvas.width;
            const canvasHeight = canvas.height;
            const ratio = canvasWidth / canvasHeight;
            const newImgWidth = pdfWidth;
            const newImgHeight = newImgWidth / ratio;
            
            let position = 0;
            let heightLeft = newImgHeight;
            
            pdf.addImage(imgData, 'PNG', 0, position, newImgWidth, newImgHeight);
            heightLeft -= pdfHeight;

            while (heightLeft > 0) {
                position = heightLeft - newImgHeight;
                pdf.addPage();
                pdf.addImage(imgData, 'PNG', 0, position, newImgWidth, newImgHeight);
                heightLeft -= pdfHeight;
            }

            const { formType, formData, createdAt } = submission;
            let typeName = 'Formato';
            if(formType.includes('recepcion')) typeName = 'Recepcion';
            if(formType.includes('despacho')) typeName = 'Despacho';

            let productType = 'PesoFijo';
             if(formType.includes('variable-weight')) productType = 'PesoVariable';

            const date = parseISO(createdAt);
            const formattedDate = format(date, 'yyyy-MM-dd');
            const formattedTime = format(date, 'HH-mm-ss');

            const fileName = `${typeName}_${productType}_${formData.pedidoSislog}_${formattedDate}_${formattedTime}.pdf`;
            
            pdf.save(fileName);
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
            attachments: base64Images 
        };

        switch (submission.formType) {
            case 'fixed-weight-recepcion':
            case 'fixed-weight-despacho':
                return <FixedWeightReport {...props} />;
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
                    <Button variant="outline" onClick={() => router.back()}>
                        <ArrowLeft className="mr-2" />
                        Volver
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

                <div ref={reportRef} className="bg-white p-2 sm:p-4 md:p-6 shadow-lg">
                    <ReportLayout title={getReportTitle()}>
                       {renderReportContent()}
                    </ReportLayout>
                </div>
            </div>
        </div>
    );
}
