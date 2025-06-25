import { Suspense } from 'react';
import VariableWeightFormComponent from './form-component';

export default function VariableWeightFormPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <VariableWeightFormComponent />
    </Suspense>
  );
}
