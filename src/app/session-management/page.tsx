import { Suspense } from 'react';
import SessionManagementComponent from './session-management-component';

export default function SessionManagementPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Cargando...</div>}>
      <SessionManagementComponent />
    </Suspense>
  );
}
