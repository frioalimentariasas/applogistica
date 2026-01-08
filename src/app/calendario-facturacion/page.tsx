
import { Suspense } from 'react';
import { getClients } from '@/app/actions/clients';
import CalendarComponent from './calendar-component';

export const revalidate = 0; // Force dynamic rendering

export default async function CalendarioFacturacionPage() {
    const clients = await getClients();
    return (
        <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Cargando...</div>}>
            <CalendarComponent clients={clients} />
        </Suspense>
    );
}
