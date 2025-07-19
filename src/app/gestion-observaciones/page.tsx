
import { Suspense } from 'react';
import ObservationManagementComponent from './observation-management-component';
import { getStandardObservations } from './actions';

export default async function GestionObservacionesPage() {
    // Initial data can be fetched here on the server
    const initialObservations = await getStandardObservations();

    return (
        <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Cargando...</div>}>
            <ObservationManagementComponent initialObservations={initialObservations} />
        </Suspense>
    );
}
