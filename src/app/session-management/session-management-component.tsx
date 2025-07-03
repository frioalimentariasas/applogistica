"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

import { listActiveUsers, revokeUserSession, ActiveUser } from './actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, RefreshCw, ShieldAlert, ShieldCheck, UserX, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const AccessDenied = () => (
    <div className="flex flex-col items-center justify-center text-center gap-4">
        <div className="rounded-full bg-destructive/10 p-4">
            <ShieldAlert className="h-12 w-12 text-destructive" />
        </div>
        <h3 className="text-xl font-semibold">Acceso Denegado</h3>
        <p className="text-muted-foreground">
            No tiene permisos para acceder a esta página.
        </p>
    </div>
);

const UserSkeleton = () => (
    Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={i}>
            <TableCell><Skeleton className="h-5 w-32 rounded-md" /></TableCell>
            <TableCell><Skeleton className="h-5 w-48 rounded-md" /></TableCell>
            <TableCell><Skeleton className="h-5 w-40 rounded-md" /></TableCell>
            <TableCell><Skeleton className="h-5 w-24 rounded-md" /></TableCell>
            <TableCell className="text-right"><Skeleton className="h-8 w-24 rounded-md float-right" /></TableCell>
        </TableRow>
    ))
);


export default function SessionManagementComponent() {
    const router = useRouter();
    const { user, isAdmin, loading: authLoading } = useAuth();
    const { toast } = useToast();

    const [users, setUsers] = useState<ActiveUser[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [userToRevoke, setUserToRevoke] = useState<ActiveUser | null>(null);
    const [isRevoking, setIsRevoking] = useState(false);

    const fetchUsers = async () => {
        setIsLoading(true);
        try {
            const activeUsers = await listActiveUsers();
            setUsers(activeUsers);
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Error al cargar usuarios',
                description: error instanceof Error ? error.message : 'Ocurrió un error inesperado.',
            });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (!authLoading && isAdmin) {
            fetchUsers();
        }
    }, [isAdmin, authLoading]);

    const handleRevoke = async () => {
        if (!userToRevoke) return;
        setIsRevoking(true);
        const result = await revokeUserSession(userToRevoke.uid);
        if (result.success) {
            toast({
                title: 'Éxito',
                description: result.message,
            });
            fetchUsers(); // Refresh the list
        } else {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: result.message,
            });
        }
        setIsRevoking(false);
        setUserToRevoke(null);
    };

    if (authLoading) {
        return (
             <div className="flex min-h-screen w-full items-center justify-center">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
             </div>
        )
    }

    if (!isAdmin) {
        return (
            <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8 flex items-center justify-center">
                <div className="max-w-xl mx-auto text-center">
                    <AccessDenied />
                     <Button onClick={() => router.push('/')} className="mt-6">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Volver al Inicio
                    </Button>
                </div>
            </div>
        );
    }
    
    return (
        <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
            <div className="max-w-4xl mx-auto">
                <header className="mb-8">
                  <div className="relative flex items-center justify-center text-center">
                    <Button variant="ghost" size="icon" className="absolute left-0 top-1/2 -translate-y-1/2" onClick={() => router.push('/')}>
                      <ArrowLeft className="h-6 w-6" />
                    </Button>
                    <div>
                      <div className="flex items-center justify-center gap-2">
                        <ShieldCheck className="h-8 w-8 text-primary" />
                        <h1 className="text-2xl font-bold text-primary">Gestión de Sesiones</h1>
                      </div>
                      <p className="text-sm text-gray-500">Vea y revoque las sesiones activas de los usuarios.</p>
                    </div>
                  </div>
                </header>

                <Card>
                    <CardHeader>
                        <div className="flex justify-between items-center">
                            <div>
                                <CardTitle>Usuarios Activos</CardTitle>
                                <CardDescription>Listado de todos los usuarios y su último inicio de sesión.</CardDescription>
                            </div>
                             <Button variant="outline" onClick={fetchUsers} disabled={isLoading}>
                                <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                                Refrescar
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Nombre</TableHead>
                                        <TableHead>Email</TableHead>
                                        <TableHead>Última Actividad</TableHead>
                                        <TableHead>Estado</TableHead>
                                        <TableHead className="text-right">Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading ? (
                                        <UserSkeleton />
                                    ) : users.length > 0 ? (
                                        users.map((u) => {
                                            const signInDate = new Date(u.lastSignInTime || 0);
                                            const refreshDate = new Date(u.lastRefreshTime || 0);

                                            const lastActivityDate = signInDate > refreshDate ? signInDate : refreshDate;
                                            
                                            const hasEverBeenActive = lastActivityDate.getFullYear() > 1970;

                                            const lastActivityDisplay = hasEverBeenActive
                                                ? formatDistanceToNow(lastActivityDate, { addSuffix: true, locale: es })
                                                : "Nunca";

                                            const FIVE_MINUTES_IN_MS = 5 * 60 * 1000;
                                            const now = new Date();
                                            const timeDifference = now.getTime() - lastActivityDate.getTime();
                                            const isActive = hasEverBeenActive && timeDifference < FIVE_MINUTES_IN_MS;

                                            return (
                                                <TableRow key={u.uid} className={u.uid === user?.uid ? 'bg-blue-50' : ''}>
                                                    <TableCell className="font-medium">{u.displayName}</TableCell>
                                                    <TableCell>{u.email}</TableCell>
                                                    <TableCell>{lastActivityDisplay}</TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center gap-2">
                                                            <span className={cn('h-2.5 w-2.5 rounded-full', isActive ? 'bg-green-500' : 'bg-gray-400')} />
                                                            <span className="text-sm">{isActive ? 'Activo' : 'Inactivo'}</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <Button 
                                                            variant="destructive" 
                                                            size="sm"
                                                            onClick={() => setUserToRevoke(u)}
                                                            disabled={u.uid === user?.uid}
                                                            title={u.uid === user?.uid ? 'No puede revocar su propia sesión' : 'Revocar sesión'}
                                                        >
                                                            <UserX className="mr-2 h-4 w-4" />
                                                            Revocar
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={5} className="h-24 text-center">No se encontraron usuarios.</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </div>
            
            <AlertDialog open={!!userToRevoke} onOpenChange={() => setUserToRevoke(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Está seguro?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta acción revocará todas las sesiones activas para el usuario <strong>{userToRevoke?.displayName} ({userToRevoke?.email})</strong>.
                            El usuario deberá iniciar sesión nuevamente en todos sus dispositivos.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleRevoke} disabled={isRevoking} className="bg-destructive hover:bg-destructive/90">
                             {isRevoking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Sí, Revocar Sesión
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
