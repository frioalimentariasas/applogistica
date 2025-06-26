
import Image from 'next/image';

interface ReportLayoutProps {
  title: string;
  children: React.ReactNode;
}

export function ReportLayout({ title, children }: ReportLayoutProps) {
    return (
        <div className="font-sans text-gray-800 bg-white">
            <header className="mb-4 flex w-full flex-col items-center text-center" style={{ breakInside: 'avoid' }}>
                <div className="h-[60px] w-[220px] relative">
                    <Image
                        src="/images/company-logo.png"
                        alt="Logotipo de Frio Alimentaria"
                        fill
                        priority
                        style={{ objectFit: 'contain' }}
                    />
                </div>
                <div className="w-full border-b-2 border-gray-400 pb-2 mt-2">
                    <h1 className="text-xl font-bold text-blue-700">{title}</h1>
                    <p className="text-xs text-gray-500 mt-1">FRIO ALIMENTARIA SAS NIT 900736914-0</p>
                </div>
            </header>

            <main>
                {children}
            </main>
        </div>
    );
}
