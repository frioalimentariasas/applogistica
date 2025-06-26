import Image from 'next/image';

interface ReportLayoutProps {
  title: string;
  children: React.ReactNode;
}

export function ReportLayout({ title, children }: ReportLayoutProps) {
    return (
        <div className="font-sans text-gray-800 bg-white">
            <header className="mb-4 text-center">
                {/* Container for the logo */}
                <div className="w-full pt-2 pb-2">
                    <div className="inline-block mx-auto">
                        <Image
                            src="/images/company-logo.png"
                            alt="Logotipo de Frio Alimentaria"
                            width={200}
                            height={57}
                            priority
                            style={{ objectFit: 'contain' }}
                        />
                    </div>
                </div>

                {/* Container for the title and subtitle */}
                <div className="border-b-2 border-gray-400 pb-2">
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
