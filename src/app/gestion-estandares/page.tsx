
import { Suspense } from 'react';
import StandardManagementComponent from './standard-management-component';
import { getPerformanceStandards } from './actions';

export default async function GestionEstandaresPage() {
    const initialStandards = await getPerformanceStandards();
    
    return (
        <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Cargando...</div>}>
            <StandardManagementComponent initialStandards={initialStandards} />
        </Suspense>
    );
}
