
"use client";

import { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import LegalizarFormComponent from './legalizar-form';
import { getClients } from '@/app/actions/clients';
import { Loader2, ArrowLeft, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ClientInfo } from '@/app/actions/clients';

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

export default function FormatosPendientesPage() {
    const { user, permissions, loading: authLoading } = useAuth();
    const router = useRouter();
    const [clients, setClients] = useState<ClientInfo[]>([]);
    const [clientsLoading, setClientsLoading] = useState(true);

    useEffect(() => {
        if (!authLoading && !user) {
            router.push('/login');
        }
    }, [user, authLoading, router]);

    useEffect(() => {
        if (user && permissions.canViewPendingLegalization) {
            getClients().then(data => {
                setClients(data);
                setClientsLoading(false);
            });
        } else if (user && !permissions.canViewPendingLegalization) {
            setClientsLoading(false);
        }
    }, [user, permissions.canViewPendingLegalization]);

    if (authLoading || (user && permissions.canViewPendingLegalization && clientsLoading)) {
        return (
            <div className="flex min-h-screen w-full items-center justify-center">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
        );
    }

    if (!user || !permissions.canViewPendingLegalization) {
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
        <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Cargando...</div>}>
            <LegalizarFormComponent clients={clients} />
        </Suspense>
    );
}
