"use client";

import { getClients } from '@/app/actions/clients';
import type { ClientInfo } from '@/app/actions/clients';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

const BillingReportComponent = dynamic(
  () => import('./report-component'),
  { 
    ssr: false,
    loading: () => <div className="flex min-h-screen items-center justify-center">Cargando...</div>
  }
);

export default function BillingReportsPage() {
    const [clients, setClients] = useState<ClientInfo[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getClients().then((data) => {
            setClients(data);
            setLoading(false);
        });
    }, []);

    if (loading) {
        return <div className="flex min-h-screen items-center justify-center">Cargando clientes...</div>;
    }

    return (
        <BillingReportComponent clients={clients} />
    );
}
