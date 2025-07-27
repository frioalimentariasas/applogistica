import { Suspense } from 'react';
import { getPedidoTypes } from './actions';
import { PedidoTypeManagementComponent } from './management-component';

export default async function GestionTiposPedidoPage() {
    const initialTypes = await getPedidoTypes();

    return (
        <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Cargando...</div>}>
            <PedidoTypeManagementComponent initialTypes={initialTypes} />
        </Suspense>
    );
}
