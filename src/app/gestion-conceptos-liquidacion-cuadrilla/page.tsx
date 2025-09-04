

import { Suspense } from 'react';
import ConceptManagementComponent from './concept-management-component';
import { getClients } from '@/app/actions/clients';
import { getBillingConcepts } from './actions';

export default async function GestionConceptosCuadrillaPage() {
    const [clients, concepts] = await Promise.all([
        getClients(),
        getBillingConcepts()
    ]);

    return (
        <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Cargando...</div>}>
            <ConceptManagementComponent initialClients={clients} initialConcepts={concepts} />
        </Suspense>
    );
}
