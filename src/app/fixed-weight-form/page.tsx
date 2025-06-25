import { Suspense } from 'react';
import FixedWeightFormComponent from './form-component';

export default function FixedWeightFormPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <FixedWeightFormComponent />
    </Suspense>
  );
}
