import { Suspense } from 'react';
import UploaderForm from './uploader-form';

export default function UploadArticulosPage() {
  return (
    <Suspense fallback={<div>Cargando...</div>}>
      <UploaderForm />
    </Suspense>
  );
}
