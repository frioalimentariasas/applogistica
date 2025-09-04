

import { Suspense } from 'react';
import StandardManagementComponent from './StandardManagementComponent';
import { getClients } from '@/app/actions/clients';
import { getPerformanceStandards } from './actions';

export default async function GestionEstandaresCuadrillaPage() {
    const [clients, standards] = await Promise.all([
        getClients(),
        getPerformanceStandards()
    ]);

    return (
        <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Cargando...</div>}>
            <StandardManagementComponent initialClients={clients} initialStandards={standards} />
        </Suspense>
    );
}

