import { Suspense } from 'react';
import { SmylLiquidationAssistantComponent } from './assistant-component';

export default function SmylLiquidationAssistantPage() {

    return (
        <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Cargando...</div>}>
            <SmylLiquidationAssistantComponent />
        </Suspense>
    );
}