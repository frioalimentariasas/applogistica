
'use server';

import { auth, firestore, storage } from '@/lib/firebase-admin';
import type { AppPermissions } from '@/hooks/use-auth';
import { defaultPermissions } from '@/hooks/use-auth';
import { subMonths, startOfMonth, differenceInHours } from 'date-fns';

export interface ActiveUser {
    uid: string;
    email: string | undefined;
    displayName: string | undefined;
    lastSignInTime: string;
    creationTime: string;
    lastRefreshTime: string;
    tokensValidAfterTime?: string;
    isRevoked: boolean;
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

export async function listActiveUsers(requestingAdminUid?: string): Promise<ActiveUser[]> {
    if (!auth) {
        throw new Error('La autenticación del administrador no está inicializada.');
    }

    try {
        const [userRecordsResult, displayNameMap] = await Promise.all([
            auth.listUsers(1000),
            getUserDisplayNameMap()
        ]);
        
        const now = new Date();
        const superAdminEmail = 'sistemas@frioalimentaria.com.co';

        const users = userRecordsResult.users.map((user) => {
            const lastActivityTime = new Date(Math.max(
                new Date(user.metadata.lastSignInTime || 0).getTime(),
                new Date(user.metadata.lastRefreshTime || 0).getTime()
            ));

            const hoursSinceLastActivity = differenceInHours(now, lastActivityTime);
            
            // Auto-revoke session if inactive for more than 19 hours
            if (
                hoursSinceLastActivity > 19 &&
                user.uid !== requestingAdminUid && // Don't revoke the current admin
                user.email !== superAdminEmail     // Don't revoke the super admin
            ) {
                 // Check if it's already revoked before logging/revoking again
                 const tokensValidAfterTime = user.tokensValidAfterTime ? new Date(user.tokensValidAfterTime).getTime() : 0;
                 if (tokensValidAfterTime < lastActivityTime.getTime()) {
                    console.log(`Auto-revoking session for user ${user.email} due to inactivity (${hoursSinceLastActivity} hours).`);
                    auth.revokeRefreshTokens(user.uid).catch(err => {
                        console.error(`Failed to auto-revoke session for ${user.email}:`, err);
                    });
                 }
            }
            
            const tokensValidAfter = user.tokensValidAfterTime ? new Date(user.tokensValidAfterTime) : null;
            const isEffectivelyRevoked = tokensValidAfter ? tokensValidAfter.getTime() > lastActivityTime.getTime() : false;

            return {
                uid: user.uid,
                email: user.email,
                displayName: user.email ? displayNameMap[user.email] || user.displayName || user.email : 'N/A',
                lastSignInTime: user.metadata.lastSignInTime,
                creationTime: user.metadata.creationTime,
                lastRefreshTime: user.metadata.lastRefreshTime,
                tokensValidAfterTime: user.tokensValidAfterTime,
                isRevoked: isEffectivelyRevoked,
            };
        });

        // Sort by the most recent activity
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
            canViewCrewPerformanceReport: true,
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


export async function purgeOldSubmissions(): Promise<{ success: boolean; message: string; count: number }> {
    if (!firestore || !storage) {
        return { success: false, message: 'El servidor no está configurado correctamente.', count: 0 };
    }

    try {
        const now = new Date();
        // Go back 3 months from the current date and get the start of that month.
        // e.g., if today is June 15, it goes to March 15, then gets March 1.
        const cutoffDate = startOfMonth(subMonths(now, 3));
        const cutoffDateString = cutoffDate.toISOString().split('T')[0];

        // Query for documents older than the cutoff date based on the form's date field.
        const oldSubmissionsSnapshot = await firestore.collection('submissions')
            .where('formData.fecha', '<', cutoffDateString)
            .get();

        if (oldSubmissionsSnapshot.empty) {
            return { success: true, message: 'No se encontraron formatos antiguos para purgar.', count: 0 };
        }

        const submissionsToDelete = oldSubmissionsSnapshot.docs;
        let deletedCount = 0;
        const batchSize = 400; // Firestore batch limit is 500 operations

        for (let i = 0; i < submissionsToDelete.length; i += batchSize) {
            const batch = firestore.batch();
            const chunk = submissionsToDelete.slice(i, i + batchSize);

            for (const doc of chunk) {
                const submissionData = doc.data();
                const attachmentUrls: string[] = submissionData?.attachmentUrls || [];

                // Delete attachments from Storage
                for (const url of attachmentUrls) {
                    try {
                        const decodedUrl = decodeURIComponent(url);
                        const pathStartIndex = decodedUrl.indexOf('/o/') + 3;
                        if (pathStartIndex > 2) {
                            const pathEndIndex = decodedUrl.indexOf('?');
                            const filePath = pathEndIndex === -1 ? decodedUrl.substring(pathStartIndex) : decodedUrl.substring(pathStartIndex, pathEndIndex);
                            if (filePath) {
                                // This deletion is async but we don't need to wait for it to complete
                                // before deleting the Firestore doc. It's best-effort.
                                storage.bucket().file(filePath).delete().catch(err => {
                                    if (err.code !== 404) {
                                        console.error(`Failed to delete old attachment ${filePath}:`, err.message);
                                    }
                                });
                            }
                        }
                    } catch (e) {
                        console.error(`Could not process attachment URL ${url} for deletion:`, e);
                    }
                }

                // Add Firestore document deletion to the batch
                batch.delete(doc.ref);
            }
            
            await batch.commit();
            deletedCount += chunk.length;
        }

        return { success: true, message: `Se purgaron ${deletedCount} formatos antiguos.`, count: deletedCount };

    } catch (error) {
        console.error('Error purging old submissions:', error);
        const errorMessage = error instanceof Error ? error.message : 'Ocurrió un error desconocido.';
        return { success: false, message: `Error del servidor: ${errorMessage}`, count: 0 };
    }
}
