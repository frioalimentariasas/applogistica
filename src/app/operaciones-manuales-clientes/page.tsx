
import { Suspense } from 'react';

export default async function OperacionesManualesClientesPage() {
    return (
        <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Cargando...</div>}>
             <div className="flex min-h-screen items-center justify-center">
              <p>Página en construcción.</p>
            </div>
        </Suspense>
    );
}
