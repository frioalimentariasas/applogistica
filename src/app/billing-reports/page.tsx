
"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { getClients } from '@/app/actions/clients';
import type { ClientInfo } from '@/app/actions/clients';
import { Loader2, ArrowLeft, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import BillingReportComponent from './report-component';

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

export default function BillingReportsPage() {
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
        if (user && permissions.canViewBillingReports) {
            getClients().then((data) => {
                setClients(data);
                setClientsLoading(false);
            });
        } else if (user && !permissions.canViewBillingReports) {
            // If user is logged in but has no permissions, stop loading.
            setClientsLoading(false);
        }
    }, [user, permissions.canViewBillingReports]);

    if (authLoading || (user && permissions.canViewBillingReports && clientsLoading)) {
        return (
            <div className="flex min-h-screen w-full items-center justify-center">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
        );
    }

    if (!user || !permissions.canViewBillingReports) {
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
        <BillingReportComponent clients={clients} />
    );
}
