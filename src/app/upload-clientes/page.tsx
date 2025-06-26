
import { Suspense } from 'react';
import UploaderForm from './uploader-form';

export default function UploadClientesPage() {
  return (
    <Suspense fallback={<div>Cargando...</div>}>
      <UploaderForm />
    </Suspense>
  );
}
