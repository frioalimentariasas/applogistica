import Image from 'next/image';
import { Snowflake } from 'lucide-react';

interface ReportLayoutProps {
  title: string;
  children: React.ReactNode;
}

export function ReportLayout({ title, children }: ReportLayoutProps) {
    return (
        <div className="font-sans text-gray-800 relative bg-white">
            <header className="text-center">
                <div className="w-full h-[75px] flex justify-center items-center">
                    <Image
                        src="/images/company-logo.png"
                        alt="Logotipo de Frio Alimentaria"
                        width={200}
                        height={57}
                        priority
                        style={{ objectFit: 'contain' }}
                    />
                </div>
                 <div className="border-b-2 border-gray-400 mb-4 pb-2">
                    <h1 className="text-xl font-bold text-blue-700">{title}</h1>
                    <p className="text-xs text-gray-500 mt-1">FRIO ALIMENTARIA SAS NIT 900736914-0</p>
                </div>
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
