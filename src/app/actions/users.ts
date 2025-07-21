'use server';

import { auth, firestore } from '@/lib/firebase-admin';

export interface UserInfo {
  uid: string;
  email: string;
  displayName: string;
}

// Gets all users for dropdowns
export async function getUsersList(): Promise<UserInfo[]> {
  if (!auth || !firestore) {
    console.error('Firebase Admin not initialized.');
    return [];
  }
  try {
    const userRecords = await auth.listUsers(1000);
    const displayNameDocs = await firestore.collection('user_display_names').get();
    const displayNameMap = new Map<string, string>();
    displayNameDocs.forEach(doc => {
      displayNameMap.set(doc.id, doc.data().displayName);
    });

    const users = userRecords.users.map(user => ({
      uid: user.uid,
      email: user.email || 'No Email',
      displayName: user.email ? (displayNameMap.get(user.email) || user.displayName || user.email) : 'N/A',
    }));
    
    users.sort((a, b) => a.displayName.localeCompare(b.displayName));
    return users;

  } catch (error) {
    console.error('Error fetching user list:', error);
    return [];
  }
}
