
import { Suspense } from 'react';
import ClientManagementComponent from './client-management-component';
import { getClients } from '@/app/actions/clients';

export default async function GestionClientesPage() {
  const clients = await getClients();

  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Cargando...</div>}>
      <ClientManagementComponent initialClients={clients} />
    </Suspense>
  );
}
