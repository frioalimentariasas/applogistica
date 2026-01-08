
"use client";

import React, { type ReactNode, useEffect, useState, useContext, useCallback } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, app } from '@/lib/firebase';
import { getUserPermissions } from '@/app/session-management/actions';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

export interface AppPermissions {
  // Standalone
  canGenerateForms: boolean;

  // Group Access
  canAccessOperacionesLogísticas: boolean;
  canAccessGestionClientes: boolean;
  canAccessGestionCuadrilla: boolean;
  canAccessMaestros: boolean;
  
  // Operaciones Logísticas
  canConsultForms: boolean;
  canViewPendingLegalization: boolean;
  canViewPerformanceReport: boolean;
  canViewFormDetails: boolean;
  canEditForms: boolean;
  canChangeFormType: boolean;
  canDeleteForms: boolean;
  canViewPalletTraceability: boolean;
  canViewContainerTraceability: boolean;

  // Gestión y Liquidación Clientes
  canManageClientLiquidationConcepts: boolean;
  canManageClientManualOperations: boolean;
  canViewBillingReports: boolean;
  canManageLiquidationVersions: boolean;
  canViewSmylAssistant: boolean;
  canViewInventoryAssistant: boolean;

  // Gestión y Liquidación Cuadrilla
  canManageLiquidationConcepts: boolean;
  canManageManualOperations: boolean;
  canViewCrewPerformanceReport: boolean;
  canManageStandards: boolean;
  canViewSpecialReports: boolean;
  
  // Gestión de Maestros
  canManageNovelties: boolean;
  canManageOrderTypes: boolean;
  canManageArticles: boolean;
  canManageClients: boolean;
  canManageObservations: boolean;
  canManageHolidays: boolean; // <-- NUEVA LÍNEA

  // Parámetros y Seguridad
  canManageSessions: boolean;
}

export const defaultPermissions: AppPermissions = {
  canGenerateForms: false,

  canAccessOperacionesLogísticas: false,
  canAccessGestionClientes: false,
  canAccessGestionCuadrilla: false,
  canAccessMaestros: false,
  
  canConsultForms: false,
  canViewPendingLegalization: false,
  canViewPerformanceReport: false,
  canViewFormDetails: false,
  canEditForms: false,
  canChangeFormType: false,
  canDeleteForms: false,
  canViewPalletTraceability: false,
  canViewContainerTraceability: false,

  canManageClientLiquidationConcepts: false,
  canManageClientManualOperations: false,
  canViewBillingReports: false,
  canManageLiquidationVersions: false,
  canViewSmylAssistant: false,
  canViewInventoryAssistant: false,

  canManageLiquidationConcepts: false,
  canManageManualOperations: false,
  canViewCrewPerformanceReport: false,
  canManageStandards: false,
  canViewSpecialReports: false,
  
  canManageNovelties: false,
  canManageOrderTypes: false,
  canManageArticles: false,
  canManageClients: false,
  canManageObservations: false,
  canManageHolidays: false, // <-- NUEVA LÍNEA

  canManageSessions: false,
};


type AuthContextType = {
  user: User | null;
  loading: boolean;
  displayName: string | null;
  email: string | null;
  permissions: AppPermissions;
};

const AuthContext = React.createContext<AuthContextType>({
  user: null,
  loading: true,
  displayName: null,
  email: null,
  permissions: defaultPermissions,
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [permissions, setPermissions] = useState<AppPermissions>(defaultPermissions);
  
  useEffect(() => {
    if (!auth || !app) {
      setUser(null);
      setDisplayName(null);
      setEmail(null);
      setPermissions(defaultPermissions);
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user && user.email) {
        setEmail(user.email);
        // Super admin override
        if (user.email === 'sistemas@frioalimentaria.com.co') {
            const allPermissionsTrue: any = {};
            Object.keys(defaultPermissions).forEach(key => {
                allPermissionsTrue[key] = true;
            });
            setPermissions(allPermissionsTrue as AppPermissions);
        } else {
            try {
              const userPerms = await getUserPermissions(user.email);
              setPermissions(userPerms);
            } catch (error) {
              console.error("Failed to fetch user permissions:", error);
              setPermissions(defaultPermissions);
            }
        }
        
        const db = getFirestore(app);
        const nameDocRef = doc(db, 'user_display_names', user.email);
        const nameDoc = await getDoc(nameDocRef);
        
        if (nameDoc.exists()) {
          setDisplayName(nameDoc.data().displayName);
        } else {
          setDisplayName(user.displayName || user.email);
        }

      } else {
        setDisplayName(null);
        setEmail(null);
        setPermissions(defaultPermissions);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);
  
  return (
    <AuthContext.Provider value={{ user, loading, displayName, email, permissions }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
