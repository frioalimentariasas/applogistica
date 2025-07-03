'use server';

import { auth } from '@/lib/firebase-admin';
import { UserRecord } from 'firebase-admin/auth';

export interface ActiveUser {
    uid: string;
    email: string | undefined;
    displayName: string | undefined;
    lastSignInTime: string;
    creationTime: string;
}

const userDisplayNameMap: Record<string, string> = {
    'frioal.operario1@gmail.com': 'Andres Blanco',
    'frioal.operario2@gmail.com': 'Estefany Olier',
    'frioal.operario3@gmail.com': 'Fabian Espitia',
    'frioal.operario4@gmail.com': 'Rumir Pajaro',
    'planta@frioalimentaria.com.co': 'Coordinador Logístico',
    'logistica@frioalimentaria.com.co': 'Flor Simanca',
    'facturacion@frioalimentaria.com.co': 'Daniela Díaz',
    'procesos@frioalimentaria.com.co': 'Suri Lambraño',
    'sistemas@frioalimentaria.com.co': 'Cristian Jaramillo',
};

export async function listActiveUsers(): Promise<ActiveUser[]> {
    if (!auth) {
        throw new Error('La autenticación del administrador no está inicializada.');
    }

    try {
        const userRecords: UserRecord[] = [];
        let nextPageToken;
        do {
            const listUsersResult = await auth.listUsers(1000, nextPageToken);
            userRecords.push(...listUsersResult.users);
            nextPageToken = listUsersResult.pageToken;
        } while (nextPageToken);
        
        const users = userRecords.map((user) => ({
            uid: user.uid,
            email: user.email,
            displayName: user.email ? userDisplayNameMap[user.email] || user.displayName || user.email : 'N/A',
            lastSignInTime: user.metadata.lastSignInTime,
            creationTime: user.metadata.creationTime,
        }));

        // Sort by last sign-in time, descending
        users.sort((a, b) => {
            const timeA = a.lastSignInTime ? new Date(a.lastSignInTime).getTime() : 0;
            const timeB = b.lastSignInTime ? new Date(b.lastSignInTime).getTime() : 0;
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
        
        return { success: true, message: `La sesión del usuario ${user.email} ha sido revocada.` };
    } catch (error: any) {
        console.error('Error revoking session for user:', uid, error);
        return { success: false, message: `Error al revocar la sesión: ${error.message}` };
    }
}
