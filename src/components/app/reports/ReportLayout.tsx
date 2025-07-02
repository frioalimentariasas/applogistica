
interface ReportLayoutProps {
  title: string;
  children: React.ReactNode;
  logoBase64: string | null;
  infoBoxType?: 'fixed' | 'variable';
}

export function ReportLayout({ title, children, logoBase64, infoBoxType }: ReportLayoutProps) {
    const showInfoBox = infoBoxType === 'fixed' || infoBoxType === 'variable';
    const code = infoBoxType === 'fixed' ? 'FA-GL-F01' : 'FA-GL-F02';

    return (
        // The main container for the entire report page
        <div style={{ fontFamily: 'Arial, sans-serif', color: '#333', backgroundColor: '#fff', padding: '0' }}>
            
            {/* Header Section: Wrapped in a div to enforce page break rules */}
            <div style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                        <tr>
                            <td style={{ width: '25%', verticalAlign: 'top' }}>&nbsp;</td>
                            <td style={{ width: '50%', textAlign: 'center', paddingBottom: '16px' }}>
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
                            <td style={{ width: '25%', verticalAlign: 'top', textAlign: 'right', padding: '0 16px' }}>
                                {showInfoBox && (
                                    <div style={{
                                        border: '1px solid #aaa',
                                        padding: '4px 8px',
                                        fontSize: '10px',
                                        lineHeight: '1.4',
                                        display: 'inline-block',
                                        textAlign: 'left',
                                        borderRadius: '4px'
                                    }}>
                                        <div>Código: {code}</div>
                                        <div>Versión: 01</div>
                                        <div>Fecha: 16/06/2025</div>
                                    </div>
                                )}
                            </td>
                        </tr>
                        <tr>
                            <td colSpan={3} style={{ textAlign: 'center', borderBottom: '2px solid #ccc', paddingBottom: '8px' }}>
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
