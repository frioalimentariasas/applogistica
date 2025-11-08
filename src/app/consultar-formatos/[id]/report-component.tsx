
'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

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
            const reportElement = document.getElementById('report-content');
            if (reportElement) {
                await doc.html(reportElement, {
                    callback: function (doc) {
                        const { createdAt, formData, formType } = submission;
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
                    },
                    margin: [30, 0, 30, 0],
                    autoPaging: 'text',
                    width: 595, // A4 width in points
                    windowWidth: 795, // A wider virtual window to fit content
                });
            }
    
        } catch (error) {
            console.error("Error generating PDF:", error);
        } finally {
            setIsDownloading(false);
        }
    };
    
    const renderReportContent = () => {
        const { formData, userDisplayName } = submission;
        const props = { 
            formData: submission.formData,
            userDisplayName, 
            attachments: base64Images.map(img => img.src),
        };

        switch (submission.formType) {
            case 'fixed-weight-recepcion':
            case 'fixed-weight-reception':
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

                <div className="bg-white shadow-lg" id="report-content">
                    <ReportLayout title={getReportTitle()} logoBase64={logoBase64} infoBoxType={getInfoBoxType()}>
                        {renderReportContent()}
                    </ReportLayout>
                </div>
            </div>
        </div>
    );
}
