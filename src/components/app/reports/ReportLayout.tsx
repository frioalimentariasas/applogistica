
import Image from 'next/image';
import { Snowflake } from 'lucide-react';

interface ReportLayoutProps {
  title: string;
  children: React.ReactNode;
}

export function ReportLayout({ title, children }: ReportLayoutProps) {
    const parts = title.split(' - ');
    const mainTitle = parts[0] || 'Reporte';
    const subTitle = parts[1] || '';

    return (
        <div className="font-sans text-gray-800 relative bg-white">
            <header className="text-center mb-4 border-b-2 border-gray-400 pb-2">
                <div className="flex justify-center items-center h-16">
                    <Image
                        src="/images/company-logo.png"
                        alt="Logotipo de Frio Alimentaria"
                        width={200}
                        height={57}
                        priority
                        style={{ objectFit: 'contain' }}
                    />
                </div>
                <h1 className="text-xl font-bold text-blue-700 mt-2">{mainTitle}</h1>
                {subTitle && <h2 className="text-lg font-semibold text-blue-600">{subTitle}</h2>}
                <p className="text-xs text-gray-500 mt-1">FRIO ALIMENTARIA SAS NIT 900736914-0</p>
            </header>
            
            <div className="absolute inset-0 flex items-center justify-center -z-10">
                <Snowflake className="text-blue-100/20" size={400} strokeWidth={0.5} />
            </div>

            <main>
                {children}
            </main>
        </div>
    );
}
