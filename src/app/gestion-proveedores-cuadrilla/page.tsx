
import { Suspense } from 'react';
import ProviderManagementComponent from './management-component';
import { getCrewProviders } from './actions';

export default async function GestionProveedoresCuadrillaPage() {
    const initialProviders = await getCrewProviders();
    return (
        <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Cargando...</div>}>
            <ProviderManagementComponent initialProviders={initialProviders} />
        </Suspense>
    );
}
