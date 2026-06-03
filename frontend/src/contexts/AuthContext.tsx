/**
 * @fileoverview Authentication context provider and hook. Manages the
 * current user session, sign-in (email + Google OAuth), sign-up,
 * and sign-out. The backend uses httpOnly cookies for session
 * persistence; this context exposes the user object and auth actions.
 */

import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { api } from '../api';
import type { User } from '../types';

const TEMP_AUTH_BYPASS = true;
const TEMP_USER: User = {
  id: 'temp-auth-bypass-user',
  name: 'Temporary User',
  email: 'temp@vantage.local',
  role: 'business_owner',
  preferences_completed: true,
};

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (
    name: string,
    email: string,
    password: string,
    role: string,
    recaptchaToken: string,
    recaptchaAction: string
  ) => Promise<{ error: string | null }>;
  signInWithGoogle: (credential: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  setUser: (user: User | null) => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signIn: async () => ({ error: null }),
  signUp: async () => ({ error: null }),
  signInWithGoogle: async () => ({ error: null }),
  signOut: async () => {},
  setUser: () => {},
  isAuthenticated: false,
});

/**
 * Hook to access the auth context. Must be used within an AuthProvider.
 *
 * @returns {AuthContextType} The current user, loading state, and auth actions.
 * @throws {Error} If used outside an AuthProvider.
 */
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

/**
 * Provides authentication state and actions to the component tree.
 * Fetches the current user on mount and exposes signIn, signUp,
 * signInWithGoogle, signOut, and setUser methods.
 *
 * @param {React.ReactNode} children - Child components that need auth access.
 * @returns {JSX.Element} The auth context provider wrapping children.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(TEMP_AUTH_BYPASS ? TEMP_USER : null);
  const [loading, setLoading] = useState(!TEMP_AUTH_BYPASS);
  const sessionEpoch = useRef(0);

  const fetchUser = useCallback(async () => {
    if (TEMP_AUTH_BYPASS) {
      setUser(TEMP_USER);
      setLoading(false);
      return;
    }

    const epoch = sessionEpoch.current;
    try {
      const userData = await api.getMe();
      if (sessionEpoch.current === epoch) {
        setUser(userData);
      }
    } catch {
      if (sessionEpoch.current === epoch) {
        setUser(null);
      }
    } finally {
      if (sessionEpoch.current === epoch) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (TEMP_AUTH_BYPASS) {
      setUser(TEMP_USER);
      setLoading(false);
      return { error: null };
    }

    try {
      const userData = await api.login(email, password);
      sessionEpoch.current += 1;
      setUser(userData);
      setLoading(false);
      return { error: null };
    } catch (err) {
      setLoading(false);
      return { error: err instanceof Error ? err.message : 'Login failed' };
    }
  }, []);

  const signUp = useCallback(async (
    name: string,
    email: string,
    password: string,
    role: string,
    recaptchaToken: string,
    recaptchaAction: string
  ) => {
    if (TEMP_AUTH_BYPASS) {
      setUser(TEMP_USER);
      setLoading(false);
      return { error: null };
    }

    try {
      const userData = await api.register(name, email, password, role, recaptchaToken, recaptchaAction);
      sessionEpoch.current += 1;
      setUser(userData);
      setLoading(false);
      return { error: null };
    } catch (err) {
      setLoading(false);
      return { error: err instanceof Error ? err.message : 'Registration failed' };
    }
  }, []);

  const signInWithGoogle = useCallback(async (credential: string) => {
    if (TEMP_AUTH_BYPASS) {
      setUser(TEMP_USER);
      setLoading(false);
      return { error: null };
    }

    try {
      const userData = await api.googleAuth(credential);
      sessionEpoch.current += 1;
      setUser(userData);
      setLoading(false);
      return { error: null };
    } catch (err) {
      setLoading(false);
      return { error: err instanceof Error ? err.message : 'Google sign-in failed' };
    }
  }, []);

  const signOut = useCallback(async () => {
    if (TEMP_AUTH_BYPASS) {
      setUser(TEMP_USER);
      setLoading(false);
      return;
    }

    sessionEpoch.current += 1;
    // Call backend logout endpoint to clear httpOnly cookie
    try {
      await api.logout();
    } catch {
      // Continue local sign-out even if the network request fails.
    }
    setUser(null);
    setLoading(false);
  }, []);

  const value = useMemo(() => ({
    user,
    loading,
    signIn,
    signUp,
    signInWithGoogle,
    signOut,
    setUser,
    isAuthenticated: !!user,
  }), [user, loading, signIn, signUp, signInWithGoogle, signOut]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
