
import { Suspense } from 'react';
import VariableWeightReceptionFormComponent from './form-component';

export default function VariableWeightReceptionFormPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <VariableWeightReceptionFormComponent />
    </Suspense>
  );
}
