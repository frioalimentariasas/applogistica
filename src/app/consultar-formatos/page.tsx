
import { Suspense } from 'react';
import ConsultarFormatosComponent from './consultar-form';

export default function ConsultarFormatosPage() {
  return (
    <Suspense fallback={<div>Cargando...</div>}>
      <ConsultarFormatosComponent />
    </Suspense>
  );
}
