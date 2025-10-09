
import { Suspense } from 'react';
import { getClients } from '@/app/actions/clients';
import { getClientBillingConcepts } from '@/app/gestion-conceptos-liquidacion-clientes/actions';
import { LiquidationAssistantComponent } from './assistant-component';

export default async function InventoryLiquidationAssistantPage() {
    const clients = await getClients();
    const billingConcepts = await getClientBillingConcepts();

    return (
        <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Cargando...</div>}>
            <LiquidationAssistantComponent clients={clients} billingConcepts={billingConcepts} />
        </Suspense>
    );
}
