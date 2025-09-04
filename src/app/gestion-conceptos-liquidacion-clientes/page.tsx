
import { Suspense } from 'react';
import ConceptManagementClientComponent from './concept-management-component';
import { getClients } from '@/app/actions/clients';
import { getClientBillingConcepts } from './actions';

export default async function GestionConceptosClientesPage() {
    const [clients, concepts] = await Promise.all([
        getClients(),
        getClientBillingConcepts()
    ]);

    return (
        <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Cargando...</div>}>
            <ConceptManagementClientComponent initialClients={clients} initialConcepts={concepts} />
        </Suspense>
    );
}
