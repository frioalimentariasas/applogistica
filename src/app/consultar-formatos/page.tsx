
import { Suspense } from 'react';
import ConsultarFormatosComponent from './consultar-form';
import { getClients } from '@/app/actions/clients';

export default async function ConsultarFormatosPage() {
  const clients = await getClients();
  return (
    <Suspense fallback={<div>Cargando...</div>}>
      <ConsultarFormatosComponent clients={clients} />
    </Suspense>
  );
}
