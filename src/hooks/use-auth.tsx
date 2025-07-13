
"use client";

import React, { type ReactNode, useEffect, useState, useContext, useCallback } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { getUserPermissions } from '@/app/session-management/actions';

export interface AppPermissions {
  canGenerateForms: boolean;
  canConsultForms: boolean;
  canViewPerformanceReport: boolean;
  canManageArticles: boolean;
  canManageClients: boolean;
  canViewBillingReports: boolean;
  canManageSessions: boolean;
}

export const defaultPermissions: AppPermissions = {
  canGenerateForms: false,
  canConsultForms: false,
  canViewPerformanceReport: false,
  canManageArticles: false,
  canManageClients: false,
  canViewBillingReports: false,
  canManageSessions: false,
};


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
    if (!auth) {
      setUser(null);
      setDisplayName(null);
      setPermissions(defaultPermissions);
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user && user.email) {
        setDisplayName(userDisplayNameMap[user.email] || user.email);
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
