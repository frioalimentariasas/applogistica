"use client"

import { useState, useEffect } from 'react';
import { getClients, type ClientInfo } from '@/app/actions/clients';
import { getClientBillingConcepts, type ClientBillingConcept } from '@/app/gestion-conceptos-liquidacion-clientes/actions';
import { LiquidationAssistantComponent } from './assistant-component';
import { Loader2 } from 'lucide-react';

export default function AssistantComponentWrapper() {
    const [clients, setClients] = useState<ClientInfo[]>([]);
    const [billingConcepts, setBillingConcepts] = useState<ClientBillingConcept[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        async function fetchData() {
            try {
                const [clientData, billingConceptData] = await Promise.all([
                    getClients(),
                    getClientBillingConcepts(),
                ]);
                setClients(clientData);
                setBillingConcepts(billingConceptData);
            } catch (error) {
                console.error("Failed to load initial data for assistant:", error);
                // Optionally, set an error state to show a message to the user
            } finally {
                setIsLoading(false);
            }
        }
        fetchData();
    }, []);

    if (isLoading) {
        return (
            <div className="flex min-h-screen w-full items-center justify-center">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <p className="ml-4">Cargando datos...</p>
            </div>
        );
    }

    return (
        <LiquidationAssistantComponent clients={clients} billingConcepts={billingConcepts} />
    );
}
