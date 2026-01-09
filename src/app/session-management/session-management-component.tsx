

"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuth } from '@/hooks/use-auth';
import { defaultPermissions } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

import { 
    listActiveUsers, 
    revokeUserSession, 
    getAllUserPermissions,
    setUserPermissions,
    createUser,
    updateUserPassword,
    updateUserDisplayName,
    purgeOldSubmissions,
    type ActiveUser
} from './actions';
import type { AppPermissions } from '@/hooks/use-auth';
import { Button, buttonVariants } from '@/components/ui/button';
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
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { ArrowLeft, RefreshCw, ShieldAlert, ShieldCheck, UserX, Loader2, KeyRound, UserPlus, Pencil, KeySquare, Trash2, DatabaseZap, Wrench, Edit, FileCog, Briefcase, HardHat, TruckIcon, CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

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
            <TableCell className="text-right"><Skeleton className="h-8 w-48 rounded-md float-right" /></TableCell>
        </TableRow>
    ))
);

const permissionGroups: { 
  groupKey: keyof AppPermissions; 
  groupLabel: string;
  icon: React.ElementType; 
  permissions: { key: keyof AppPermissions; label: string }[];
}[] = [
  {
    groupKey: 'canAccessOperacionesLogísticas',
    groupLabel: 'Operaciones Logísticas',
    icon: FileCog,
    permissions: [
      { key: 'canConsultForms', label: 'Consultar Formatos Guardados' },
      { key: 'canViewPendingLegalization', label: 'Formatos Pendientes de Legalizar' },
      { key: 'canViewPerformanceReport', label: 'Informe Productividad Operarios Frio Alimentaria' },
      { key: 'canViewFormDetails', label: 'Ver Detalle del Formato (PDF)' },
      { key: 'canEditForms', label: 'Editar Formatos' },
      { key: 'canChangeFormType', label: 'Cambiar Tipo de Operación' },
      { key: 'canDeleteForms', label: 'Eliminar Formatos' },
      { key: 'canViewPalletTraceability', label: 'Trazabilidad de Paletas' },
      { key: 'canViewContainerTraceability', label: 'Trazabilidad de Contenedor' },
    ],
  },
  {
    groupKey: 'canAccessGestionClientes',
    groupLabel: 'Gestión y Liquidación Clientes',
    icon: Briefcase,
    permissions: [
      { key: 'canManageClientLiquidationConcepts', label: 'Gestión de Conceptos de Liquidación' },
      { key: 'canManageClientManualOperations', label: 'Registro de Op. Manuales' },
      { key: 'canViewBillingReports', label: 'Informes de Facturación' },
      { key: 'canViewBillingReports', label: 'Calendario de Facturación' },
      { key: 'canManageLiquidationVersions', label: 'Control de Versiones de Liquidación' },
      { key: 'canViewSmylAssistant', label: 'Asistente de Liquidación SMYL' },
      { key: 'canViewInventoryAssistant', label: 'Asistente de Liquidación de Inventario' },
    ]
  },
   {
    groupKey: 'canAccessGestionCuadrilla',
    groupLabel: 'Gestión y Liquidación Cuadrilla',
    icon: HardHat,
    permissions: [
      { key: 'canManageLiquidationConcepts', label: 'Gestión de Conceptos de Liquidación' },
      { key: 'canManageManualOperations', label: 'Registro de Op. Manuales Cuadrilla' },
      { key: 'canViewCrewPerformanceReport', label: 'Informe de Productividad y Liquidación' },
      { key: 'canManageStandards', label: 'Gestión de Estándares' },
      { key: 'canViewSpecialReports', label: 'Reportes Especiales' },
    ]
  },
  {
    groupKey: 'canAccessMaestros',
    groupLabel: 'Gestión de Maestros',
    icon: Wrench,
    permissions: [
      { key: 'canManageNovelties', label: 'Gestión de Novedades' },
      { key: 'canManageOrderTypes', label: 'Gestión de Tipos de Pedido' },
      { key: 'canManageArticles', label: 'Gestión de Artículos' },
      { key: 'canManageClients', label: 'Gestión de Clientes' },
      { key: 'canManageObservations', label: 'Gestión de Observaciones' },
      { key: 'canManageHolidays', label: 'Gestión de Días Festivos' },
    ]
  },
];


const addUserSchema = z.object({
  email: z.string().email({ message: 'Debe ser un correo válido.' }),
  password_1: z.string().min(6, { message: 'La contraseña debe tener al menos 6 caracteres.' }),
  displayName: z.string().min(3, { message: 'El nombre debe tener al menos 3 caracteres.' }),
});

const changePasswordSchema = z.object({
  password_1: z.string().min(6, 'La nueva contraseña debe tener al menos 6 caracteres.'),
  password_2: z.string(),
}).refine(data => data.password_1 === data.password_2, {
  message: 'Las contraseñas no coinciden.',
  path: ['password_2'],
});

const editNameSchema = z.object({
    displayName: z.string().min(3, { message: 'El nombre debe tener al menos 3 caracteres.' }),
});


export default function SessionManagementComponent() {
    const router = useRouter();
    const { user, permissions, loading: authLoading } = useAuth();
    const { toast } = useToast();

    const [users, setUsers] = useState<ActiveUser[]>([]);
    const [allPermissions, setAllPermissions] = useState<Record<string, AppPermissions>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [userToRevoke, setUserToRevoke] = useState<ActiveUser | null>(null);
    const [isRevoking, setIsRevoking] = useState(false);
    const [revokedUids, setRevokedUids] = useState<string[]>([]);
    
    // State for permissions dialog
    const [userToEdit, setUserToEdit] = useState<ActiveUser | null>(null);
    const [isPermissionsDialogOpen, setIsPermissionsDialogOpen] = useState(false);
    const [isSavingPermissions, setIsSavingPermissions] = useState(false);
    
    // State for user management dialogs
    const [isAddUserOpen, setIsAddUserOpen] = useState(false);
    const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
    const [isEditNameOpen, setIsEditNameOpen] = useState(false);
    
    // State for data maintenance
    const [isPurgeConfirmOpen, setIsPurgeConfirmOpen] = useState(false);
    const [isPurging, setIsPurging] = useState(false);


    // Forms
    const permissionsForm = useForm<AppPermissions>();
    const addUserForm = useForm<z.infer<typeof addUserSchema>>({ resolver: zodResolver(addUserSchema) });
    const changePasswordForm = useForm<z.infer<typeof changePasswordSchema>>({ resolver: zodResolver(changePasswordSchema) });
    const editNameForm = useForm<z.infer<typeof editNameSchema>>({ resolver: zodResolver(editNameSchema) });


    const fetchAllData = async () => {
        setIsLoading(true);
        setRevokedUids([]);
        try {
            const [activeUsers, permissionsData] = await Promise.all([
                listActiveUsers(user?.uid),
                getAllUserPermissions()
            ]);
            setUsers(activeUsers);
            setAllPermissions(permissionsData);
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Error al cargar datos',
                description: error instanceof Error ? error.message : 'Ocurrió un error inesperado.',
            });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (!authLoading && permissions.canManageSessions) {
            fetchAllData();
        }
    }, [permissions, authLoading]);

    const handleRevoke = async () => {
        if (!userToRevoke) return;
        setIsRevoking(true);
        const result = await revokeUserSession(userToRevoke.uid);
        if (result.success) {
            toast({
                title: 'Éxito',
                description: result.message,
            });
            // Immediately update the local state to reflect revocation
            setUsers(prevUsers => prevUsers.map(u => 
                u.uid === userToRevoke.uid ? { ...u, isRevoked: true } : u
            ));
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
    
    const handleOpenPermissionsDialog = (userToManage: ActiveUser) => {
        setUserToEdit(userToManage);
        const userEmail = userToManage.email || '';
        const currentPerms = allPermissions[userEmail] || defaultPermissions;
        permissionsForm.reset(currentPerms);
        setIsPermissionsDialogOpen(true);
    };

    const handleSavePermissions = async (data: AppPermissions) => {
        if (!userToEdit || !userToEdit.email) return;
        
        setIsSavingPermissions(true);
        const result = await setUserPermissions(userToEdit.email, data);
        if (result.success) {
            toast({ title: 'Éxito', description: result.message });
            setAllPermissions(prev => ({ ...prev, [userToEdit.email!]: data }));
            setIsPermissionsDialogOpen(false);
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.message });
        }
        setIsSavingPermissions(false);
    };

    const handleAddUser = async (data: z.infer<typeof addUserSchema>) => {
        const result = await createUser(data);
        if (result.success) {
            toast({ title: 'Éxito', description: result.message });
            setIsAddUserOpen(false);
            addUserForm.reset();
            await fetchAllData();
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.message });
        }
    };

    const handleChangePassword = async (data: z.infer<typeof changePasswordSchema>) => {
        if (!userToEdit) return;
        const result = await updateUserPassword(userToEdit.uid, data.password_1);
        if (result.success) {
            toast({ title: 'Éxito', description: result.message });
            setIsChangePasswordOpen(false);
            changePasswordForm.reset();
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.message });
        }
    };
    
    const handleEditName = async (data: z.infer<typeof editNameSchema>) => {
        if (!userToEdit || !userToEdit.email) return;
        const result = await updateUserDisplayName(userToEdit.email, data.displayName);
        if (result.success) {
            toast({ title: 'Éxito', description: result.message });
            setIsEditNameOpen(false);
            editNameForm.reset();
            await fetchAllData();
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.message });
        }
    };

    const handlePurge = async () => {
        setIsPurging(true);
        try {
            const result = await purgeOldSubmissions();
            if (result.success) {
                toast({
                    title: 'Purga Completada',
                    description: result.message,
                });
            } else {
                throw new Error(result.message);
            }
        } catch(error) {
            toast({
                variant: 'destructive',
                title: 'Error en la Purga',
                description: error instanceof Error ? error.message : 'Ocurrió un error inesperado.',
            });
        } finally {
            setIsPurging(false);
            setIsPurgeConfirmOpen(false);
        }
    };
    
    const handleGroupPermissionChange = (groupKey: keyof AppPermissions, childPermissions: {key: keyof AppPermissions}[], checked: boolean | 'indeterminate') => {
        if (checked === true || checked === 'indeterminate') {
            permissionsForm.setValue(groupKey, true);
            childPermissions.forEach(p => permissionsForm.setValue(p.key, true));
        } else {
            permissionsForm.setValue(groupKey, false);
            childPermissions.forEach(p => permissionsForm.setValue(p.key, false));
        }
    };
    
    if (authLoading) {
        return (
             <div className="flex min-h-screen w-full items-center justify-center">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
             </div>
        )
    }

    if (!permissions.canManageSessions) {
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
            <div className="max-w-6xl mx-auto">
                <header className="mb-6 md:mb-8">
                  <div className="relative flex items-center justify-center text-center">
                    <Button variant="ghost" size="icon" className="absolute left-0 top-1/2 -translate-y-1/2" onClick={() => router.push('/')}>
                      <ArrowLeft className="h-6 w-6" />
                    </Button>
                    <div>
                      <div className="flex items-center justify-center gap-2">
                        <ShieldCheck className="h-7 w-7 md:h-8 md:w-8 text-primary" />
                        <h1 className="text-xl md:text-2xl font-bold text-primary">Gestión de Usuarios</h1>
                      </div>
                      <p className="text-xs md:text-sm text-gray-500">Vea sesiones activas, gestione usuarios y sus permisos.</p>
                    </div>
                  </div>
                </header>
                
                <div className="space-y-8">
                    <Card>
                        <CardHeader>
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                                <div>
                                    <CardTitle>Usuarios del Sistema</CardTitle>
                                    <CardDescription>Listado de todos los usuarios, su última actividad y sus roles.</CardDescription>
                                </div>
                                <div className="flex gap-2 w-full sm:w-auto">
                                    <Button onClick={() => setIsAddUserOpen(true)} className="w-full sm:w-auto"><UserPlus className="mr-2 h-4 w-4" />Agregar Usuario</Button>
                                    <Button variant="outline" onClick={fetchAllData} disabled={isLoading} className="w-full sm:w-auto">
                                        <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                                        Refrescar
                                    </Button>
                                </div>
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
                                                const lastActivityDate = new Date(Math.max(
                                                    new Date(u.lastSignInTime || 0).getTime(),
                                                    new Date(u.lastRefreshTime || 0).getTime()
                                                ));
                                                
                                                const hasEverBeenActive = lastActivityDate.getFullYear() > 1970;

                                                const lastActivityDisplay = hasEverBeenActive
                                                    ? formatDistanceToNow(lastActivityDate, { addSuffix: true, locale: es })
                                                    : "Nunca";
                                                
                                                const isRevoked = u.isRevoked;
                                                const isActive = !isRevoked;
                                                const isSuperAdmin = u.email === 'sistemas@frioalimentaria.com.co';

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
                                                            <div className="flex flex-wrap items-center justify-end gap-1">
                                                                <Button variant="outline" size="sm" onClick={() => { setUserToEdit(u); editNameForm.setValue("displayName", u.displayName || ""); setIsEditNameOpen(true); }}><Pencil className="mr-2 h-4 w-4" />Nombre</Button>
                                                                <Button variant="outline" size="sm" onClick={() => { setUserToEdit(u); setIsChangePasswordOpen(true); }}><KeySquare className="mr-2 h-4 w-4" />Contraseña</Button>
                                                                <Button variant="outline" size="sm" onClick={() => handleOpenPermissionsDialog(u)} disabled={isSuperAdmin}><KeyRound className="mr-2 h-4 w-4" />Permisos</Button>
                                                                <Button 
                                                                    variant={isRevoked ? "secondary" : "destructive"}
                                                                    size="sm"
                                                                    onClick={() => setUserToRevoke(u)}
                                                                    disabled={u.uid === user?.uid || isRevoked || isSuperAdmin}
                                                                    title={isSuperAdmin ? 'No se puede revocar al Super Admin' : u.uid === user?.uid ? 'No puede revocar su propia sesión' : isRevoked ? 'La sesión ya está revocada.' : 'Revocar sesión'}
                                                                >
                                                                    <UserX className="mr-2 h-4 w-4" />
                                                                    {isRevoked ? "Revocada" : "Revocar"}
                                                                </Button>
                                                            </div>
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

                    <Card>
                        <CardHeader>
                            <CardTitle>Mantenimiento de Datos</CardTitle>
                            <CardDescription>
                                Ejecute acciones de mantenimiento para reparar o limpiar datos en la base de datos. Estas acciones son irreversibles.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                             <div className="flex flex-col sm:flex-row items-center justify-between rounded-lg border p-4 gap-4">
                                <div>
                                    <h4 className="font-semibold">Purgar Formatos Antiguos</h4>
                                    <p className="text-sm text-muted-foreground">
                                        Elimina permanentemente los formatos guardados con más de 3 meses de antigüedad, incluyendo sus archivos adjuntos.
                                    </p>
                                </div>
                                <Button variant="destructive" onClick={() => setIsPurgeConfirmOpen(true)} disabled={isPurging} className="w-full sm:w-auto">
                                    {isPurging ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DatabaseZap className="mr-2 h-4 w-4" />}
                                    {isPurging ? "Purgando..." : "Purgar Ahora"}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                </div>
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

            <Dialog open={isPermissionsDialogOpen} onOpenChange={setIsPermissionsDialogOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Gestionar Permisos</DialogTitle>
                        <DialogDescription>
                            Asigne o revoque accesos para <strong>{userToEdit?.displayName}</strong>.
                        </DialogDescription>
                    </DialogHeader>
                    <ScrollArea className="max-h-[60vh]">
                        <Form {...permissionsForm}>
                            <form id="permissions-form" onSubmit={permissionsForm.handleSubmit(handleSavePermissions)} className="space-y-4 py-4 pr-6">
                                <div className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                                    <div className="space-y-0.5">
                                        <Label htmlFor={'canGenerateForms'} className="text-sm font-medium">Generar Formatos (Página Principal)</Label>
                                    </div>
                                    <Controller
                                        key={'canGenerateForms'}
                                        name={'canGenerateForms'}
                                        control={permissionsForm.control}
                                        render={({ field }) => (
                                            <Checkbox
                                                id={'canGenerateForms'}
                                                checked={field.value}
                                                onCheckedChange={field.onChange}
                                            />
                                        )}
                                    />
                                </div>
                                <Accordion type="multiple" className="w-full">
                                    {permissionGroups.map(group => {
                                        const childPermissionKeys = group.permissions.map(p => p.key);
                                        const watchedChildren = permissionsForm.watch(childPermissionKeys);
                                        const allChildrenChecked = watchedChildren.every(Boolean);
                                        const someChildrenChecked = watchedChildren.some(Boolean) && !allChildrenChecked;

                                        return (
                                            <AccordionItem value={group.groupLabel} key={group.groupKey}>
                                                <div className="flex items-center rounded-md hover:bg-muted/90 data-[state=open]:bg-muted">
                                                    <div className="p-4 py-3">
                                                        <Checkbox
                                                            id={`group-${group.groupKey}`}
                                                            checked={allChildrenChecked ? true : someChildrenChecked ? 'indeterminate' : false}
                                                            onCheckedChange={(checked) => handleGroupPermissionChange(group.groupKey, group.permissions, checked)}
                                                        />
                                                    </div>
                                                    <AccordionTrigger className="font-semibold text-base py-3 pr-4 hover:no-underline">
                                                      <div className="flex items-center gap-2">
                                                        <group.icon className="h-5 w-5 mr-2" />
                                                        {group.groupLabel}
                                                      </div>
                                                    </AccordionTrigger>
                                                </div>
                                                <AccordionContent className="pl-8 space-y-3 pt-2">
                                                     {group.permissions.map(({ key, label }) => (
                                                        <div key={key} className="flex flex-row items-center justify-between">
                                                            <Label htmlFor={key} className="text-sm font-normal text-muted-foreground">{label}</Label>
                                                             <Controller
                                                                key={key}
                                                                name={key}
                                                                control={permissionsForm.control}
                                                                render={({ field }) => (
                                                                    <Checkbox
                                                                        id={key}
                                                                        checked={field.value}
                                                                        onCheckedChange={field.onChange}
                                                                    />
                                                                )}
                                                            />
                                                        </div>
                                                    ))}
                                                </AccordionContent>
                                            </AccordionItem>
                                        )
                                    })}
                                </Accordion>
                            </form>
                        </Form>
                    </ScrollArea>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setIsPermissionsDialogOpen(false)}>Cancelar</Button>
                        <Button type="submit" form="permissions-form" disabled={isSavingPermissions}>
                            {isSavingPermissions && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Guardar Permisos
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isAddUserOpen} onOpenChange={setIsAddUserOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Agregar Nuevo Usuario</DialogTitle></DialogHeader>
                    <Form {...addUserForm}>
                        <form onSubmit={addUserForm.handleSubmit(handleAddUser)} className="space-y-4">
                            <FormField name="email" control={addUserForm.control} render={({ field }) => (
                                <FormItem><FormLabel>Correo Electrónico</FormLabel><FormControl><Input placeholder="usuario@ejemplo.com" {...field} /></FormControl><FormMessage /></FormItem>
                            )}/>
                            <FormField name="password_1" control={addUserForm.control} render={({ field }) => (
                                <FormItem><FormLabel>Contraseña</FormLabel><FormControl><Input type="password" placeholder="Mínimo 6 caracteres" {...field} /></FormControl><FormMessage /></FormItem>
                            )}/>
                            <FormField name="displayName" control={addUserForm.control} render={({ field }) => (
                                <FormItem><FormLabel>Nombre para Mostrar</FormLabel><FormControl><Input placeholder="Nombre Apellido" {...field} /></FormControl><FormMessage /></FormItem>
                            )}/>
                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={() => setIsAddUserOpen(false)}>Cancelar</Button>
                                <Button type="submit" disabled={addUserForm.formState.isSubmitting}><UserPlus className="mr-2 h-4 w-4"/>Crear Usuario</Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>
            
            <Dialog open={isChangePasswordOpen} onOpenChange={setIsChangePasswordOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Cambiar Contraseña</DialogTitle><DialogDescription>Establezca una nueva contraseña para {userToEdit?.displayName}.</DialogDescription></DialogHeader>
                    <Form {...changePasswordForm}>
                        <form onSubmit={changePasswordForm.handleSubmit(handleChangePassword)} className="space-y-4">
                            <FormField name="password_1" control={changePasswordForm.control} render={({ field }) => (
                                <FormItem><FormLabel>Nueva Contraseña</FormLabel><FormControl><Input type="password" placeholder="Mínimo 6 caracteres" {...field} /></FormControl><FormMessage /></FormItem>
                            )}/>
                             <FormField name="password_2" control={changePasswordForm.control} render={({ field }) => (
                                <FormItem><FormLabel>Confirmar Contraseña</FormLabel><FormControl><Input type="password" placeholder="Repita la contraseña" {...field} /></FormControl><FormMessage /></FormItem>
                            )}/>
                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={() => setIsChangePasswordOpen(false)}>Cancelar</Button>
                                <Button type="submit" disabled={changePasswordForm.formState.isSubmitting}>Actualizar Contraseña</Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>

            <Dialog open={isEditNameOpen} onOpenChange={setIsEditNameOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Editar Nombre</DialogTitle><DialogDescription>Cambie el nombre que se muestra para {userToEdit?.email}.</DialogDescription></DialogHeader>
                    <Form {...editNameForm}>
                        <form onSubmit={editNameForm.handleSubmit(handleEditName)} className="space-y-4">
                            <FormField name="displayName" control={editNameForm.control} render={({ field }) => (
                                <FormItem><FormLabel>Nuevo Nombre</FormLabel><FormControl><Input placeholder="Nombre Apellido" {...field} /></FormControl><FormMessage /></FormItem>
                            )}/>
                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={() => setIsEditNameOpen(false)}>Cancelar</Button>
                                <Button type="submit" disabled={editNameForm.formState.isSubmitting}>Actualizar Nombre</Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>

             <AlertDialog open={isPurgeConfirmOpen} onOpenChange={setIsPurgeConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Está absolutamente seguro?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta acción es irreversible y eliminará permanentemente todos los formatos con más de 3 meses de antigüedad, incluyendo sus archivos adjuntos.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isPurging}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handlePurge} disabled={isPurging} className={buttonVariants({ variant: 'destructive' })}>
                            {isPurging ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Sí, Purgar Datos
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

        </div>
    )
}
