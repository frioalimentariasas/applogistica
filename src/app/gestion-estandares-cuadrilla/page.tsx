

import { Suspense } from 'react';
import StandardManagementComponent from './StandardManagementComponent';
import { getClients } from '@/app/actions/clients';
import { getPerformanceStandards } from './actions';
import { getCrewProviders } from '../gestion-proveedores-cuadrilla/actions';

export default async function GestionEstandaresCuadrillaPage() {
    const [clients, standards, providers] = await Promise.all([
        getClients(),
        getPerformanceStandards(),
        getCrewProviders(),
    ]);

    return (
        <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Cargando...</div>}>
            <StandardManagementComponent initialClients={clients} initialStandards={standards} crewProviders={providers} />
        </Suspense>
    );
}
