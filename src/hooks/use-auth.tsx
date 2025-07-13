
"use client";

import React, { type ReactNode, useEffect, useState, useContext } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '@/lib/firebase';

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

// Define permissions for each role
const userPermissions: Record<string, AppPermissions> = {
    // Super Admin
    'sistemas@frioalimentaria.com.co': {
        canGenerateForms: true,
        canConsultForms: true,
        canViewPerformanceReport: true,
        canManageArticles: true,
        canManageClients: true,
        canViewBillingReports: true,
        canManageSessions: true,
    },
    // Coordinador Logístico
    'planta@frioalimentaria.com.co': {
        canGenerateForms: true,
        canConsultForms: true,
        canViewPerformanceReport: true,
        canManageArticles: true,
        canManageClients: true,
        canViewBillingReports: false,
        canManageSessions: false,
    },
    // Flor Simanca
    'logistica@frioalimentaria.com.co': {
        canGenerateForms: false,
        canConsultForms: true,
        canViewPerformanceReport: true,
        canManageArticles: false,
        canManageClients: false,
        canViewBillingReports: true,
        canManageSessions: false,
    },
    // Daniela Díaz
    'facturacion@frioalimentaria.com.co': {
        canGenerateForms: false,
        canConsultForms: true,
        canViewPerformanceReport: false,
        canManageArticles: false,
        canManageClients: false,
        canViewBillingReports: true,
        canManageSessions: false,
    },
    // Suri Lambraño (Procesos)
    'procesos@frioalimentaria.com.co': {
        canGenerateForms: false,
        canConsultForms: true,
        canViewPerformanceReport: false,
        canManageArticles: false,
        canManageClients: false,
        canViewBillingReports: false,
        canManageSessions: false,
    },
    // Operario
    'frioal.operario1@gmail.com': { canGenerateForms: true, canConsultForms: true, canViewPerformanceReport: false, canManageArticles: false, canManageClients: false, canViewBillingReports: false, canManageSessions: false },
    'frioal.operario2@gmail.com': { canGenerateForms: true, canConsultForms: true, canViewPerformanceReport: false, canManageArticles: false, canManageClients: false, canViewBillingReports: false, canManageSessions: false },
    'frioal.operario3@gmail.com': { canGenerateForms: true, canConsultForms: true, canViewPerformanceReport: false, canManageArticles: false, canManageClients: false, canViewBillingReports: false, canManageSessions: false },
    'frioal.operario4@gmail.com': { canGenerateForms: true, canConsultForms: true, canViewPerformanceReport: false, canManageArticles: false, canManageClients: false, canViewBillingReports: false, canManageSessions: false },
};

const defaultPermissions: AppPermissions = {
  canGenerateForms: false,
  canConsultForms: false,
  canViewPerformanceReport: false,
  canManageArticles: false,
  canManageClients: false,
  canViewBillingReports: false,
  canManageSessions: false,
};


type AppPermissions = {
  canGenerateForms: boolean;
  canConsultForms: boolean;
  canViewPerformanceReport: boolean;
  canManageArticles: boolean;
  canManageClients: boolean;
  canViewBillingReports: boolean;
  canManageSessions: boolean;
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
  const [user, setUser] = React.useState<User | null>(null);
  const [displayName, setDisplayName] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [permissions, setPermissions] = React.useState<AppPermissions>(defaultPermissions);
  
  useEffect(() => {
    if (!auth) {
      setUser(null);
      setDisplayName(null);
      setPermissions(defaultPermissions);
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      if (user && user.email) {
        setDisplayName(userDisplayNameMap[user.email] || user.email);
        setPermissions(userPermissions[user.email] || defaultPermissions);
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

export const useAuth = () => React.useContext(AuthContext);
