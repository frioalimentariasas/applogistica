
import { Suspense } from 'react';
import AssistantComponentWrapper from './assistant-component-wrapper';

export default function InventoryLiquidationAssistantPage() {
    return (
        <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Cargando...</div>}>
            <AssistantComponentWrapper />
        </Suspense>
    );
}
