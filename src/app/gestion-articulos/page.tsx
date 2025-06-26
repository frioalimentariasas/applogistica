
import { Suspense } from 'react';
import ArticleManagementComponent from './article-management-component';
import { getClients } from '@/app/actions/clients';

export default async function GestionArticulosPage() {
    const clients = await getClients();
    return (
        <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Cargando...</div>}>
            <ArticleManagementComponent clients={clients} />
        </Suspense>
    );
}
