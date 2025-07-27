

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

  let pedidoTypes: PedidoType[] = [];
  try {
    pedidoTypes = await getPedidoTypesForForm('variable-weight-reception');
  } catch (error) {
    console.error(`Failed to fetch order types for variable-weight-reception:`, error);
  }

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <VariableWeightReceptionFormComponent pedidoTypes={pedidoTypes} />
    </Suspense>
  );
}
