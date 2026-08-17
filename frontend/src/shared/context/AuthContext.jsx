import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/shared/utils/apiClient';
import { AuthContext } from './auth-context';

const SESSION_REPLACED_KEY = 'maderasRivero.session-replaced';

export function AuthProvider({ children }) {
  const [status, setStatus] = useState('checking');
  const [user, setUser] = useState(null);
  const [processes, setProcesses] = useState([]);

  const loadSession = useCallback(async () => {
    try {
      const response = await apiFetch('/api/auth/me');
      const json = await response.json();

      if (response.ok && json.success) {
        setUser(json.user);
        setProcesses(json.processes || []);
        setStatus('authenticated');

        return { user: json.user, processes: json.processes || [] };
      }
    } catch {
    }

    setUser(null);
    setProcesses([]);
    setStatus('guest');

    return null;
  }, []);

  const clearLocalSession = useCallback(() => {
    setUser(null);
    setProcesses([]);
    setStatus('guest');
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  useEffect(() => {
    const handleSessionReplaced = (event) => {
      if (event.key === SESSION_REPLACED_KEY && event.newValue) {
        clearLocalSession();
      }
    };

    window.addEventListener('storage', handleSessionReplaced);
    return () => window.removeEventListener('storage', handleSessionReplaced);
  }, [clearLocalSession]);

  const logout = useCallback(async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } finally {
      clearLocalSession();
    }
  }, [clearLocalSession]);

  const value = {
    status,
    user,
    processes,
    isChecking: status === 'checking',
    isAuthenticated: status === 'authenticated',
    refresh: loadSession,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
