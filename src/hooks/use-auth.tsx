"use client";

import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
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
};

type AuthContextType = {
  user: User | null;
  loading: boolean;
  displayName: string | null;
};

const AuthContext = createContext<AuthContextType>({ user: null, loading: true, displayName: null });

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth) {
      setUser(null);
      setDisplayName(null);
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      if (user && user.email) {
        setDisplayName(userDisplayNameMap[user.email] || user.email);
      } else {
        setDisplayName(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, displayName }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
