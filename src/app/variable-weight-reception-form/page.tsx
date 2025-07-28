

import { Suspense } from 'react';
import VariableWeightReceptionFormComponent from './form-component';
import { getPedidoTypesForForm } from '../gestion-tipos-pedido/actions';
import { notFound } from 'next/navigation';
import type { PedidoType } from '@/app/gestion-tipos-pedido/actions';

export default async function VariableWeightReceptionFormPage({
  searchParams,
}: {
  searchParams: { operation: string };
}) {
  const operation = searchParams.operation;
  if (operation !== 'recepcion') {
    notFound();
  }

  const pedidoTypes: PedidoType[] = await getPedidoTypesForForm('variable-weight-reception');
  
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <VariableWeightReceptionFormComponent pedidoTypes={pedidoTypes} />
    </Suspense>
  );
}

