

import { Suspense } from 'react';
import ConceptManagementClientComponent from './concept-management-component';
import { getClients } from '@/app/actions/clients';
import { getClientBillingConcepts } from './actions';
import { getStandardObservations } from '@/app/gestion-observaciones/actions';
import { getPedidoTypes } from '@/app/gestion-tipos-pedido/actions';

export default async function GestionConceptosClientesPage() {
    const [clients, concepts, standardObservations, pedidoTypes] = await Promise.all([
        getClients(),
        getClientBillingConcepts(),
        getStandardObservations(),
        getPedidoTypes(),
    ]);

    return (
        <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Cargando...</div>}>
            <ConceptManagementClientComponent 
                initialClients={clients} 
                initialConcepts={concepts} 
                standardObservations={standardObservations}
                pedidoTypes={pedidoTypes}
            />
        </Suspense>
    );
}
