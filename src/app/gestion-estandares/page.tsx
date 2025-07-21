
import { Suspense } from 'react';
import StandardManagementComponent from './standard-management-component';
import { getPerformanceStandards } from './actions';
import { getClients } from '@/app/actions/clients';

export default async function GestionEstandaresPage() {
    const [initialStandards, clients] = await Promise.all([
        getPerformanceStandards(),
        getClients()
    ]);
    
    return (
        <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Cargando...</div>}>
            <StandardManagementComponent initialStandards={initialStandards} clients={clients} />
        </Suspense>
    );
}
