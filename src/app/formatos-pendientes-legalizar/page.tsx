
'use client';

import { Suspense, useEffect, useState } from 'react';
import LegalizarFormComponent from './legalizar-form';
import { getClients } from '@/app/actions/clients';
import { Loader2 } from 'lucide-react';
import type { ClientInfo } from '@/app/actions/clients';

export default function FormatosPendientesPage() {
    const [clients, setClients] = useState<ClientInfo[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getClients().then(data => {
            setClients(data);
            setLoading(false);
        });
    }, []);

    if (loading) {
        return (
            <div className="flex min-h-screen w-full items-center justify-center">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Cargando...</div>}>
            <LegalizarFormComponent clients={clients} />
        </Suspense>
    );
}
