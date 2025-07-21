
"use client";

import React, { type ReactNode, useEffect, useState, useContext, useCallback } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, app } from '@/lib/firebase';
import { getUserPermissions } from '@/app/session-management/actions';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

export interface AppPermissions {
  canGenerateForms: boolean;
  canConsultForms: boolean;
  canEditForms: boolean;
  canDeleteForms: boolean;
  canViewPerformanceReport: boolean;
  canViewCrewPerformanceReport: boolean;
  canManageArticles: boolean;
  canManageClients: boolean;
  canViewBillingReports: boolean;
  canManageSessions: boolean;
  canManageStandards: boolean;
}

export const defaultPermissions: AppPermissions = {
  canGenerateForms: false,
  canConsultForms: false,
  canEditForms: false,
  canDeleteForms: false,
  canViewPerformanceReport: false,
  canViewCrewPerformanceReport: false,
  canManageArticles: false,
  canManageClients: false,
  canViewBillingReports: false,
  canManageSessions: false,
  canManageStandards: false,
};


type AuthContextType = {
  user: User | null;
  loading: boolean;
  displayName: string | null;
  permissions: AppPermissions;
};

const AuthContext = React.createContext<AuthContextType>({
  user: null,
  loading: true,
  displayName: null,
  permissions: defaultPermissions,
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [permissions, setPermissions] = useState<AppPermissions>(defaultPermissions);
  
  useEffect(() => {
    if (!auth || !app) {
      setUser(null);
      setDisplayName(null);
      setPermissions(defaultPermissions);
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user && user.email) {
        const db = getFirestore(app);
        const nameDocRef = doc(db, 'user_display_names', user.email);
        const nameDoc = await getDoc(nameDocRef);
        
        if (nameDoc.exists()) {
          setDisplayName(nameDoc.data().displayName);
        } else {
          setDisplayName(user.displayName || user.email);
        }
        
        try {
          const userPerms = await getUserPermissions(user.email);
          setPermissions(userPerms);
        } catch (error) {
          console.error("Failed to fetch user permissions:", error);
          setPermissions(defaultPermissions);
        }
      } else {
        setDisplayName(null);
        setPermissions(defaultPermissions);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);
  
  return (
    <AuthContext.Provider value={{ user, loading, displayName, permissions }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
