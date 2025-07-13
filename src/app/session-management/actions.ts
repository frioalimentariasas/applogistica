
'use server';

import { auth, firestore } from '@/lib/firebase-admin';
import { UserRecord } from 'firebase-admin/auth';
import type { AppPermissions } from '@/hooks/use-auth';
import { defaultPermissions } from '@/hooks/use-auth';

export interface ActiveUser {
    uid: string;
    email: string | undefined;
    displayName: string | undefined;
    lastSignInTime: string;
    creationTime: string;
    lastRefreshTime: string;
    tokensValidAfterTime?: string;
}

async function getUserDisplayNameMap(): Promise<Record<string, string>> {
    if (!firestore) return {};
    const snapshot = await firestore.collection('user_display_names').get();
    const map: Record<string, string> = {};
    snapshot.forEach(doc => {
        map[doc.id] = doc.data().displayName;
    });
    return map;
}

export async function listActiveUsers(): Promise<ActiveUser[]> {
    if (!auth) {
        throw new Error('La autenticación del administrador no está inicializada.');
    }

    try {
        const [userRecordsResult, displayNameMap] = await Promise.all([
            auth.listUsers(1000),
            getUserDisplayNameMap()
        ]);
        
        const users = userRecordsResult.users.map((user) => ({
            uid: user.uid,
            email: user.email,
            displayName: user.email ? displayNameMap[user.email] || user.displayName || user.email : 'N/A',
            lastSignInTime: user.metadata.lastSignInTime,
            creationTime: user.metadata.creationTime,
            lastRefreshTime: user.metadata.lastRefreshTime,
            tokensValidAfterTime: user.tokensValidAfterTime,
        }));

        // Sort by the most recent activity (either sign-in or token refresh)
        users.sort((a, b) => {
            const timeA = Math.max(
                new Date(a.lastSignInTime || 0).getTime(),
                new Date(a.lastRefreshTime || 0).getTime()
            );
            const timeB = Math.max(
                new Date(b.lastSignInTime || 0).getTime(),
                new Date(b.lastRefreshTime || 0).getTime()
            );
            return timeB - timeA;
        });
        
        return users;
    } catch (error) {
        console.error('Error listing users:', error);
        throw new Error('No se pudieron listar los usuarios.');
    }
}

export async function revokeUserSession(uid: string): Promise<{ success: boolean; message: string }> {
    if (!auth) {
        return { success: false, message: 'La autenticación del administrador no está inicializada.' };
    }

    try {
        await auth.revokeRefreshTokens(uid);
        const user = await auth.getUser(uid);
        
        // This helps to propagate the revocation to any live client sessions.
        // The client-side SDK will detect the change and force the user to sign out.
        await auth.updateUser(uid, { disabled: user.disabled });
        
        return { success: true, message: `La sesión del usuario ${user.email} ha sido revocada.` };
    } catch (error: any) {
        console.error('Error revoking session for user:', uid, error);
        return { success: false, message: `Error al revocar la sesión: ${error.message}` };
    }
}


export async function getUserPermissions(email: string): Promise<AppPermissions> {
    if (!firestore) {
        throw new Error('Firestore no está inicializado.');
    }

    // Special override for the super admin user
    if (email === 'sistemas@frioalimentaria.com.co') {
        return {
            canGenerateForms: true,
            canConsultForms: true,
            canViewPerformanceReport: true,
            canManageArticles: true,
            canManageClients: true,
            canViewBillingReports: true,
            canManageSessions: true,
        };
    }

    const docRef = firestore.collection('user_permissions').doc(email);
    const doc = await docRef.get();
    if (!doc.exists) {
        return defaultPermissions;
    }
    return { ...defaultPermissions, ...doc.data() } as AppPermissions;
}

export async function setUserPermissions(email: string, permissions: AppPermissions): Promise<{ success: boolean; message: string }> {
    if (!firestore) {
        return { success: false, message: 'Firestore no está inicializado.' };
    }
    try {
        const docRef = firestore.collection('user_permissions').doc(email);
        await docRef.set(permissions, { merge: true });
        return { success: true, message: `Permisos para ${email} actualizados.` };
    } catch (error: any) {
        console.error(`Error al actualizar permisos para ${email}:`, error);
        return { success: false, message: `Error al actualizar permisos: ${error.message}` };
    }
}

export async function getAllUserPermissions(): Promise<Record<string, AppPermissions>> {
     if (!firestore) {
        throw new Error('Firestore no está inicializado.');
    }
    const snapshot = await firestore.collection('user_permissions').get();
    const permissions: Record<string, AppPermissions> = {};
    snapshot.forEach(doc => {
        permissions[doc.id] = { ...defaultPermissions, ...doc.data() } as AppPermissions;
    });
    return permissions;
}

// ---- New User Management Actions ----

export async function createUser(data: { email: string; password_1: string; displayName: string }): Promise<{ success: boolean; message: string }> {
    if (!auth || !firestore) {
        return { success: false, message: 'El servidor no está configurado correctamente.' };
    }
    try {
        const { email, password_1: password, displayName } = data;
        const userRecord = await auth.createUser({
            email,
            password,
            displayName, // This sets the native Firebase Auth display name as a fallback
        });
        
        // Also save the display name to our custom collection for consistency
        await firestore.collection('user_display_names').doc(email).set({ displayName });

        return { success: true, message: `Usuario ${email} creado con éxito.` };
    } catch (error: any) {
        console.error('Error creating user:', error);
        return { success: false, message: `Error al crear el usuario: ${error.message}` };
    }
}

export async function updateUserPassword(uid: string, password_1: string): Promise<{ success: boolean; message: string }> {
    if (!auth) {
        return { success: false, message: 'El servidor no está configurado correctamente.' };
    }
    try {
        await auth.updateUser(uid, { password: password_1 });
        return { success: true, message: 'Contraseña actualizada con éxito.' };
    } catch (error: any) {
        console.error('Error updating password:', error);
        return { success: false, message: `Error al actualizar la contraseña: ${error.message}` };
    }
}

export async function updateUserDisplayName(email: string, displayName: string): Promise<{ success: boolean; message: string }> {
    if (!firestore) {
        return { success: false, message: 'El servidor no está configurado correctamente.' };
    }
    try {
        await firestore.collection('user_display_names').doc(email).set({ displayName });
        return { success: true, message: 'Nombre de usuario actualizado con éxito.' };
    } catch (error: any) {
        console.error('Error updating display name:', error);
        return { success: false, message: `Error al actualizar el nombre: ${error.message}` };
    }
}
