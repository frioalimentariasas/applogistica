
import { Suspense } from 'react';
import { getClients } from '@/app/actions/clients';
import VersionManagementComponent from './management-component';

export default async function ControlVersionesLiquidacionPage() {
    const clients = await getClients();
    return (
        <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Cargando...</div>}>
            <VersionManagementComponent clients={clients} />
        </Suspense>
    );
}
