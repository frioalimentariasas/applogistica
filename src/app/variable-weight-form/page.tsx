
import { Suspense } from 'react';
import VariableWeightFormComponent from './form-component';
import { getPedidoTypesForForm } from '@/app/gestion-tipos-pedido/actions';
import { notFound } from 'next/navigation';
import type { PedidoType } from '@/app/gestion-tipos-pedido/actions';

export default async function VariableWeightFormPage({
  searchParams,
}: {
  searchParams: Promise<{ operation: string }>;
}) {
  const { operation } = await searchParams;
  if (operation !== 'despacho') {
    notFound();
  }

  const pedidoTypes: PedidoType[] = await getPedidoTypesForForm('variable-weight-despacho');
  
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <VariableWeightFormComponent pedidoTypes={pedidoTypes} />
    </Suspense>
  );
}
