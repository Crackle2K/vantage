/**
 * @fileoverview Authentication context provider and hook. Manages the
 * current user session, sign-in (email + Google OAuth), sign-up,
 * and sign-out. The backend uses httpOnly cookies for session
 * persistence; this context exposes the user object and auth actions.
 */

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from '../api';
import type { User } from '../types';

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
  signOut: () => void;
  setUser: (user: User | null) => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signIn: async () => ({ error: null }),
  signUp: async () => ({ error: null }),
  signInWithGoogle: async () => ({ error: null }),
  signOut: () => {},
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
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    try {
      const userData = await api.getMe();
      setUser(userData);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const signIn = async (email: string, password: string) => {
    try {
      await api.login(email, password);
      await fetchUser();
      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Login failed' };
    }
  };

  const signUp = async (
    name: string,
    email: string,
    password: string,
    role: string,
    recaptchaToken: string,
    recaptchaAction: string
  ) => {
    try {
      await api.register(name, email, password, role, recaptchaToken, recaptchaAction);
      await fetchUser();
      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Registration failed' };
    }
  };

  const signInWithGoogle = async (credential: string) => {
    try {
      await api.googleAuth(credential);
      await fetchUser();
      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Google sign-in failed' };
    }
  };

  const signOut = async () => {
    // Call backend logout endpoint to clear httpOnly cookie
    try {
      await api.logout();
    } catch {}
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signIn,
        signUp,
        signInWithGoogle,
        signOut,
        setUser,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
