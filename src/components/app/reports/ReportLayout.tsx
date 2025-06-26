
interface ReportLayoutProps {
  title: string;
  children: React.ReactNode;
  logoBase64: string | null;
}

export function ReportLayout({ title, children, logoBase64 }: ReportLayoutProps) {
    return (
        // The main container for the entire report page
        <div style={{ fontFamily: 'Arial, sans-serif', color: '#333', backgroundColor: '#fff', padding: '0' }}>
            
            {/* Header Section: Wrapped in a div to enforce page break rules */}
            <div style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                        {/* Row for the Logo */}
                        <tr>
                            <td style={{ textAlign: 'center', paddingBottom: '10px' }}>
                                {logoBase64 ? (
                                    <img
                                        src={logoBase64}
                                        alt="Logotipo de Frio Alimentaria"
                                        style={{ height: '60px', width: 'auto' }}
                                    />
                                ) : (
                                    // Placeholder to maintain layout if logo is missing
                                    <div style={{ height: '60px' }}></div> 
                                )}
                            </td>
                        </tr>

                        {/* Row for the Title and Subtitle */}
                        <tr>
                            <td style={{ textAlign: 'center', borderBottom: '2px solid #ccc', paddingBottom: '8px' }}>
                                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#005a9e', margin: '0 0 4px 0' }}>{title}</div>
                                <div style={{ fontSize: '10px', color: '#555', margin: '0' }}>FRIO ALIMENTARIA SAS NIT 900736914-0</div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {/* Main Content section */}
            <main style={{ paddingTop: '16px' }}>
                {children}
            </main>
        </div>
    );
}
