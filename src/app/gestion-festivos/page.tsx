
import { Suspense } from 'react';
import HolidayManagementComponent from './management-component';
import { getHolidays } from './actions';

export default async function GestionFestivosPage() {
    const initialHolidays = await getHolidays();
    return (
        <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Cargando...</div>}>
            <HolidayManagementComponent initialHolidays={initialHolidays} />
        </Suspense>
    );
}
