import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AuthenticatedUser } from '../shared';

import { ApiError, getStoredToken, storeToken } from '../api/client';
import { authApi } from '../api/endpoints';

interface AuthContextValue {
  user: AuthenticatedUser | null;
  /** True until the stored token has been checked, so routes do not flash the login page. */
  isInitialising: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [isInitialising, setIsInitialising] = useState(true);
  const queryClient = useQueryClient();

  /**
   * A stored token is only a claim. It is verified against /auth/me before the app treats
   * anyone as signed in — the token may have expired, or the account may have been removed,
   * and either way the right outcome is the login screen rather than a dashboard that 401s
   * on every request.
   */
  useEffect(() => {
    let cancelled = false;

    async function restoreSession(): Promise<void> {
      if (!getStoredToken()) {
        setIsInitialising(false);
        return;
      }

      try {
        const current = await authApi.me();
        if (!cancelled) setUser(current);
      } catch {
        storeToken(null);
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setIsInitialising(false);
      }
    }

    void restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const response = await authApi.signIn({ email, password });
    storeToken(response.accessToken);
    setUser(response.user);
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const response = await authApi.signUp({ email, password });
    storeToken(response.accessToken);
    setUser(response.user);
  }, []);

  const signOut = useCallback(() => {
    storeToken(null);
    setUser(null);
    // Without this, the next person to sign in on this browser would briefly see the previous
    // user's cached orders before the refetch lands.
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo(
    () => ({ user, isInitialising, signIn, signUp, signOut }),
    [user, isInitialising, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside an AuthProvider.');
  }

  return context;
}

/** True when a failure means the session is gone rather than the request being wrong. */
export function isAuthError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}
