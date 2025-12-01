

"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Loader2, ArrowLeft, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getClients, type ClientInfo } from '@/app/actions/clients';
import { getClientBillingConcepts, type ClientBillingConcept } from '@/app/gestion-conceptos-liquidacion-clientes/actions';
import ManualOperationsClientComponent from './manual-operations-client-component';


const AccessDenied = () => (
    <div className="flex flex-col items-center justify-center text-center gap-4">
        <div className="rounded-full bg-destructive/10 p-4">
            <ShieldAlert className="h-12 w-12 text-destructive" />
        </div>
        <h3 className="text-xl font-semibold">Acceso Denegado</h3>
        <p className="text-muted-foreground">
            No tiene permisos para acceder a esta página.
        </p>
    </div>
);


export default function OperacionesManualesClientesPage() {
    const { user, permissions, loading: authLoading } = useAuth();
    const router = useRouter();
    const [clients, setClients] = useState<ClientInfo[]>([]);
    const [billingConcepts, setBillingConcepts] = useState<ClientBillingConcept[]>([]);
    const [dataLoading, setDataLoading] = useState(true);

    useEffect(() => {
        if (!authLoading && !user) {
            router.push('/login');
        }
    }, [user, authLoading, router]);
    
    useEffect(() => {
        if (user && permissions.canManageClientManualOperations) {
            setDataLoading(true);
            Promise.all([
                getClients(),
                getClientBillingConcepts()
            ]).then(([clientData, conceptData]) => {
                setClients(clientData);
                setBillingConcepts(conceptData);
                setDataLoading(false);
            }).catch(error => {
                console.error("Failed to load initial data for manual client operations:", error);
                setDataLoading(false);
            });
        } else if (user && !permissions.canManageClientManualOperations) {
            setDataLoading(false);
        }
    }, [user, permissions.canManageClientManualOperations]);


    if (authLoading || (user && dataLoading)) {
        return (
            <div className="flex min-h-screen w-full items-center justify-center">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
        );
    }
    
    if (!user || !permissions.canManageClientManualOperations) {
        return (
            <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8 flex items-center justify-center">
                <div className="max-w-xl mx-auto text-center">
                    <AccessDenied />
                     <Button onClick={() => router.push('/')} className="mt-6">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Volver al Inicio
                    </Button>
                </div>
            </div>
        );
    }
    
    return (
        <ManualOperationsClientComponent clients={clients} billingConcepts={billingConcepts} />
    );
}
