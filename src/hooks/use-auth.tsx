"use client";

import React, { type ReactNode, useEffect, useState, useContext, useRef, useCallback } from 'react';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';

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
};

const AuthContext = React.createContext<AuthContextType>({ user: null, loading: true, displayName: null });

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = React.useState<User | null>(null);
  const [displayName, setDisplayName] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const router = useRouter();
  const inactivityTimer = useRef<NodeJS.Timeout | null>(null);

  const handleLogout = useCallback(async () => {
    if (auth && auth.currentUser) {
        await signOut(auth);
        router.push('/login');
    }
  }, [router]);

  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    inactivityTimer.current = setTimeout(() => {
        handleLogout();
    }, 30 * 60 * 1000); // 30 minutes
  }, [handleLogout]);
  
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
  
  useEffect(() => {
    const events: (keyof WindowEventMap)[] = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    
    if (user && !loading) {
        resetInactivityTimer();
        events.forEach(event => window.addEventListener(event, resetInactivityTimer));
        
        return () => {
            if (inactivityTimer.current) {
                clearTimeout(inactivityTimer.current);
            }
            events.forEach(event => window.removeEventListener(event, resetInactivityTimer));
        };
    } else {
        // Clear timer if user logs out or is not present
        if (inactivityTimer.current) {
            clearTimeout(inactivityTimer.current);
        }
    }
  }, [user, loading, resetInactivityTimer]);


  return (
    <AuthContext.Provider value={{ user, loading, displayName }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => React.useContext(AuthContext);
