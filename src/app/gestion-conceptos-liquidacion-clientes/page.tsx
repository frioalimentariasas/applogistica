

import { Suspense } from 'react';
import ConceptManagementClientComponent from './concept-management-component';
import { getClients } from '@/app/actions/clients';
import { getClientBillingConcepts } from './actions';
import { getStandardObservations } from '@/app/gestion-observaciones/actions';

export default async function GestionConceptosClientesPage() {
    const [clients, concepts, standardObservations] = await Promise.all([
        getClients(),
        getClientBillingConcepts(),
        getStandardObservations(),
    ]);

    return (
        <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Cargando...</div>}>
            <ConceptManagementClientComponent 
                initialClients={clients} 
                initialConcepts={concepts} 
                standardObservations={standardObservations}
            />
        </Suspense>
    );
}
