import { Suspense } from 'react';
import { getClients } from '@/app/actions/clients';
import BillingReportComponent from './report-component';

export default async function BillingReportsPage() {
    const clients = await getClients();
    return (
        <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Cargando...</div>}>
            <BillingReportComponent clients={clients} />
        </Suspense>
    );
}
