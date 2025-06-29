import { getClients } from '@/app/actions/clients';
import dynamic from 'next/dynamic';

const BillingReportComponent = dynamic(
  () => import('./report-component'),
  { 
    ssr: false,
    loading: () => <div className="flex min-h-screen items-center justify-center">Cargando...</div>
  }
);

export default async function BillingReportsPage() {
    const clients = await getClients();
    return (
        <BillingReportComponent clients={clients} />
    );
}
