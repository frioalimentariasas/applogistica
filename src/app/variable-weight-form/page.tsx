import { Suspense } from 'react';
import VariableWeightFormComponent from './form-component';
import { getPedidoTypesForForm } from '@/app/gestion-tipos-pedido/actions';
import { notFound } from 'next/navigation';

export default async function VariableWeightFormPage({
  searchParams,
}: {
  searchParams: { operation: string };
}) {
  const operation = searchParams.operation;
  if (operation !== 'despacho') {
    notFound();
  }

  const pedidoTypes = await getPedidoTypesForForm('variable-weight-despacho');
  
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <VariableWeightFormComponent pedidoTypes={pedidoTypes} />
    </Suspense>
  );
}
