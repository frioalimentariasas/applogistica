import { Suspense } from 'react';
import FixedWeightFormComponent from './form-component';
import { getPedidoTypesForForm } from '@/app/gestion-tipos-pedido/actions';
import { notFound } from 'next/navigation';

export default async function FixedWeightFormPage({
  searchParams,
}: {
  searchParams: { operation: string };
}) {
  const operation = searchParams.operation;
  if (operation !== 'recepcion' && operation !== 'despacho') {
    notFound();
  }

  const formName = `fixed-weight-${operation}` as const;
  const pedidoTypes = await getPedidoTypesForForm(formName);

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <FixedWeightFormComponent pedidoTypes={pedidoTypes} />
    </Suspense>
  );
}
