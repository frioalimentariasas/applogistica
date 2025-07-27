
import { Suspense } from 'react';
import FixedWeightFormComponent from './form-component';
import { getPedidoTypesForForm } from '@/app/gestion-tipos-pedido/actions';
import { notFound } from 'next/navigation';
import type { PedidoType } from '@/app/gestion-tipos-pedido/actions';

export default async function FixedWeightFormPage({
  searchParams,
}: {
  searchParams: { operation: string };
}) {
  const operation = searchParams.operation;
  if (operation !== 'recepcion' && operation !== 'despacho') {
    notFound();
  }

  // Correctly build the form name identifier to match the database value
  const formName = `fixed-weight-${operation === 'recepcion' ? 'reception' : 'despacho'}` as const;
  
  let pedidoTypes: PedidoType[] = [];
  try {
    pedidoTypes = await getPedidoTypesForForm(formName);
  } catch (error) {
    console.error(`Failed to fetch order types for ${formName}:`, error);
    // Optionally handle the error, e.g., show a message to the user
    // For now, we'll proceed with an empty list.
  }

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <FixedWeightFormComponent pedidoTypes={pedidoTypes} />
    </Suspense>
  );
}
