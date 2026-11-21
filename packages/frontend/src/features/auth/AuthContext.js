"use client";
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [memberships, setMemberships] = useState([]);
  const [activeTenant, setActiveTenant] = useState(null);
  const [activeRole, setActiveRole] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshSession = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch('/api/auth/me');
    if (res.ok && res.data?.user) {
      setUser(res.data.user);
      setMemberships(res.data.memberships || []);
      setActiveTenant(res.data.activeTenant || null);
      setActiveRole(res.data.activeRole || null);
    } else {
      setUser(null);
      setMemberships([]);
      setActiveTenant(null);
      setActiveRole(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  const switchTenant = useCallback(
    async (tenantId) => {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('ah_active_tenant_id', tenantId);
      }
      await refreshSession();
    },
    [refreshSession]
  );

  const logout = useCallback(async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('ah_active_tenant_id');
    }
    setUser(null);
    setMemberships([]);
    setActiveTenant(null);
    setActiveRole(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        memberships,
        activeTenant,
        activeRole,
        loading,
        refreshSession,
        switchTenant,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
