
import { Suspense } from 'react';
import { getStandardNoveltyTypes } from './actions';
import { NoveltyManagementComponent } from './management-component';

export default async function GestionNovedadesPage() {
    const initialNovelties = await getStandardNoveltyTypes();

    return (
        <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Cargando...</div>}>
            <NoveltyManagementComponent initialNovelties={initialNovelties} />
        </Suspense>
    );
}
