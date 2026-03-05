import { Suspense } from 'react';
import { ManualComponent } from './manual-component';

export const metadata = {
  title: 'Manual de Usuario - Frio Alimentaria',
  description: 'Guía detallada de uso para la App de Control de Operaciones Logísticas.',
};

export default function ManualUsuarioPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Cargando manual...</div>}>
      <ManualComponent />
    </Suspense>
  );
}