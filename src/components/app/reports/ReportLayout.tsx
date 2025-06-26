
import Image from 'next/image';

interface ReportLayoutProps {
  title: string;
  children: React.ReactNode;
}

export function ReportLayout({ title, children }: ReportLayoutProps) {
    return (
        <div style={{ fontFamily: 'Arial, sans-serif', color: '#333', backgroundColor: '#fff', padding: '0' }}>
            {/* Using a container with a fixed height helps PDF generators render the image correctly */}
            <div style={{ height: '80px', textAlign: 'center', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                <img
                    src="/images/company-logo.png"
                    alt="Logotipo de Frio Alimentaria"
                    style={{ maxHeight: '60px', width: 'auto', margin: '0 auto', display: 'block' }}
                />
            </div>
            
            <div style={{ textAlign: 'center', pageBreakInside: 'avoid', breakInside: 'avoid', borderBottom: '2px solid #ccc', paddingBottom: '8px', marginBottom: '16px' }}>
                <h1 style={{ fontSize: '18px', fontWeight: 'bold', color: '#005a9e', margin: '0 0 4px 0' }}>{title}</h1>
                <p style={{ fontSize: '10px', color: '#555', margin: '0' }}>FRIO ALIMENTARIA SAS NIT 900736914-0</p>
            </div>

            <main>
                {children}
            </main>
        </div>
    );
}
