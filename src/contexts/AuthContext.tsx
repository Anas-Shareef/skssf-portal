import { createContext, useContext, useEffect, useState } from 'react';
import { clearFrontendCache, syncFromBackend, setBackendSessionActive } from '../lib/localDb';
import { api } from '../lib/api';
import { supabase } from '../lib/supabaseClient';

export type Profile = {
  id: string;
  db_id?: string;
  role: 'super' | 'admin' | 'coordinator' | 'member';
  memberNo?: string;
  name: string;
  email: string;
  phone?: string;
  unit?: string;
  occupation?: string;
  avatar?: string;
  branch?: string;
  admin_title?: string;        // 'President' | 'Secretary' for admin users
  assigned_zone?: string;
  member_unique_code?: string;
  is_panel_coordinator?: boolean; // true when this coordinator is assigned to panel
  perms?: Record<string, boolean>;
};

type AuthContextType = {
  profile: Profile | null;
  loading: boolean;
  authError: string | null;
  signIn: (email: string, pass: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  refreshProfile: () => void;
  hasPermission: (permission: string) => boolean;
};

const AuthContext = createContext<AuthContextType>({
  profile: null,
  loading: true,
  authError: null,
  signIn: async () => false,
  signOut: async () => {},
  refreshProfile: () => {},
  hasPermission: () => false,
});

const MISSING_PROFILE_MESSAGE =
  'Your account is authenticated but has no portal profile. Please contact an administrator.';

/** PostgREST codes returned when the bearer token is missing, invalid or expired. */
const SESSION_INVALID_CODES = new Set(['PGRST301', 'PGRST302', 'PGRST303', 'PGRST304']);

class SessionInvalidError extends Error {}

const mapProfile = (profile: any, email: string): Profile => ({
  ...profile,
  email: email || profile.email || '',
  address: profile.addr,
  role: (profile.role || 'member').toLowerCase() as Profile['role'],
  id: profile.code || profile.id,
  db_id: profile.id,
  unit: profile.branch || profile.unit,
  admin_title: profile.admin_title,
  assigned_zone: profile.assigned_zone,
  member_unique_code: profile.member_unique_code,
  is_panel_coordinator: profile.is_panel_coordinator || false,
} as Profile);

/** Loads the profile for an authenticated Supabase user. Returns null when the row is absent. */
async function fetchProfile(user: { id: string; email?: string | null }): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    if (SESSION_INVALID_CODES.has((error as { code?: string }).code || '')) {
      throw new SessionInvalidError(error.message);
    }
    throw error;
  }
  return data ? mapProfile(data, user.email || '') : null;
}

/** Drops an unusable local session so the app cannot retry with stale credentials. */
async function discardInvalidSession() {
  setBackendSessionActive(false);
  clearFrontendCache();
  // Local scope first so storage is cleared even if the revocation request fails.
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const refreshProfile = () => {
    void (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          setProfile(null);
          return;
        }
        const fresh = await fetchProfile(session.user);
        if (fresh) {
          setProfile(fresh);
          setAuthError(null);
        } else {
          setProfile(null);
          setAuthError(MISSING_PROFILE_MESSAGE);
        }
      } catch (err) {
        if (err instanceof SessionInvalidError) {
          setProfile(null);
          await discardInvalidSession();
          return;
        }
        console.warn('Failed to refresh profile:', err);
      }
    })();
  };

  useEffect(() => {
    let mounted = true;

    // Remove legacy token copies from earlier builds. The Supabase session in
    // localStorage is now the only credential the app reads.
    sessionStorage.removeItem('active_api_token');
    sessionStorage.removeItem('active_user_id');

    const applySession = async (session: { user: { id: string; email?: string | null } } | null, signOutOnMissing: boolean) => {
      if (!session?.user) {
        setBackendSessionActive(false);
        if (mounted) setProfile(null);
        return;
      }

      setBackendSessionActive(true);
      let fresh: Profile | null;
      try {
        fresh = await fetchProfile(session.user);
      } catch (err) {
        if (err instanceof SessionInvalidError) {
          if (mounted) {
            setProfile(null);
            setAuthError(null);
          }
          await discardInvalidSession();
          return;
        }
        throw err;
      }
      if (!mounted) return;

      if (fresh) {
        setProfile(fresh);
        setAuthError(null);
        return;
      }

      // Authenticated but legitimately missing a profile row: never create one
      // silently and never fall back to unauthenticated data.
      setProfile(null);
      setAuthError(MISSING_PROFILE_MESSAGE);
      if (signOutOnMissing) {
        setBackendSessionActive(false);
        await supabase.auth.signOut().catch(() => {});
      }
    };

    const restoreSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        await applySession(session, true);
      } catch (err) {
        console.warn('Supabase getSession error:', err);
        setBackendSessionActive(false);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void restoreSession();

    // Subscribe to auth state changes (token refresh, sign-out, other tabs).
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return;

      if (event === 'SIGNED_OUT') {
        setBackendSessionActive(false);
        clearFrontendCache();
        if (mounted) {
          setProfile(null);
          setAuthError(null);
        }
        sessionStorage.removeItem('active_api_token');
        sessionStorage.removeItem('active_user_id');
        return;
      }

      if (event === 'TOKEN_REFRESHED') {
        // Supabase already persisted the rotated token. No profile refetch needed.
        setBackendSessionActive(!!session);
        return;
      }

      if (!session?.user) return;
      setBackendSessionActive(true);

      // Defer Supabase reads out of the callback to avoid auth deadlocks.
      window.setTimeout(() => {
        if (!mounted) return;
        void applySession(session, false)
          .then(() => {
            if (mounted) void syncFromBackend();
          })
          .catch((err) => console.warn('Auth state profile sync failed:', err));
      }, 0);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const handleDataUpdate = () => refreshProfile();
    window.addEventListener('appDataUpdated', handleDataUpdate);
    return () => window.removeEventListener('appDataUpdated', handleDataUpdate);
  }, []);

  const signIn = async (email: string, pass: string) => {
    try {
      const res = await api.post<any>('/auth/login', { email, password: pass });
      if (res?.user) {
        setBackendSessionActive(true);
        setAuthError(null);
        clearFrontendCache();
        setProfile(mapProfile(res.user, res.user.email || email));
        void syncFromBackend();
        return true;
      }
    } catch (err: any) {
      if (typeof err?.message === 'string' && err.message.includes('no portal profile')) {
        setAuthError(err.message);
      } else {
        setAuthError(null);
      }
    }
    return false;
  };

  const signOut = async () => {
    setBackendSessionActive(false);
    setAuthError(null);
    setProfile(null);
    sessionStorage.removeItem('active_api_token');
    sessionStorage.removeItem('active_user_id');
    clearFrontendCache();
    try {
      await supabase.auth.signOut();
    } catch {
      // Even if server revocation fails, never keep a reusable local session.
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    }
  };

  const hasPermission = (permission: string): boolean => {
    if (!profile) return false;
    if (profile.role === 'super') return true;
    return !!profile.perms?.[permission];
  };

  return (
    <AuthContext.Provider value={{ profile, loading, authError, signIn, signOut, refreshProfile, hasPermission }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
