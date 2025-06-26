
interface ReportLayoutProps {
  title: string;
  children: React.ReactNode;
  logoBase64: string | null;
}

export function ReportLayout({ title, children, logoBase64 }: ReportLayoutProps) {
    return (
        <div style={{ fontFamily: 'Arial, sans-serif', color: '#333', backgroundColor: '#fff', padding: '0' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                <tbody>
                    <tr>
                        <td style={{ height: '80px', textAlign: 'center', verticalAlign: 'middle' }}>
                            {logoBase64 ? (
                                <img
                                    src={logoBase64}
                                    alt="Logotipo de Frio Alimentaria"
                                    style={{ maxHeight: '60px', width: 'auto' }}
                                />
                            ) : (
                                <div style={{ height: '60px', width: 'auto' }}></div> // Placeholder to keep layout stable
                            )}
                        </td>
                    </tr>
                    <tr>
                        <td style={{ textAlign: 'center', borderBottom: '2px solid #ccc', paddingBottom: '8px', marginBottom: '16px' }}>
                            <h1 style={{ fontSize: '18px', fontWeight: 'bold', color: '#005a9e', margin: '0 0 4px 0' }}>{title}</h1>
                            <p style={{ fontSize: '10px', color: '#555', margin: '0' }}>FRIO ALIMENTARIA SAS NIT 900736914-0</p>
                        </td>
                    </tr>
                </tbody>
            </table>

            <main style={{ paddingTop: '16px' }}>
                {children}
            </main>
        </div>
    );
}
