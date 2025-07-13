
import { Suspense } from 'react';
import ClientManagementComponent from './client-management-component';

export default async function GestionClientesPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Cargando...</div>}>
      <ClientManagementComponent />
    </Suspense>
  );
}
