import { createContext, useContext, useEffect, useState } from 'react';
import { clearFrontendCache, syncFromBackend, localDb } from '../lib/localDb';
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
  signIn: (email: string, pass: string) => Promise<boolean>;
  signOut: () => void;
  refreshProfile: () => void;
  hasPermission: (permission: string) => boolean;
};

const AuthContext = createContext<AuthContextType>({
  profile: null,
  loading: true,
  signIn: async () => false,
  signOut: () => {},
  refreshProfile: () => {},
  hasPermission: () => false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = () => {
    const storedUserId = sessionStorage.getItem('active_user_id');
    if (storedUserId) {
      const user = localDb.getUserById(storedUserId);
      if (user) {
        setProfile(user as Profile);
        return;
      }
    }
    setProfile(null);
  };

  useEffect(() => {
    let mounted = true;
    const restoreSession = async () => {
      // First try to restore from Supabase's own persisted session (handles refresh token rotation)
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const user = session.user;
          // Sync the current access token to sessionStorage so backend API calls work
          sessionStorage.setItem('active_api_token', session.access_token);
          sessionStorage.setItem('active_user_id', user.id);

          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .maybeSingle();

          if (mounted && profile) {
            setProfile({
              ...profile,
              email: user.email || '',
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
            if (mounted) setLoading(false);
            return;
          }
        }
      } catch (sessionErr) {
        console.warn('Supabase getSession error:', sessionErr);
      }

      // Fallback: try sessionStorage token
      const token = sessionStorage.getItem('active_api_token');
      if (token) {
        try {
          const res = await api.get<any>('/auth/me');
          if (res?.user) {
            setProfile({
              ...res.user,
              role: (res.user.role || 'member').toLowerCase() as Profile['role'],
              id: res.user.code || res.user.id,
              db_id: res.user.id,
              unit: res.user.branch || res.user.unit,
              admin_title: res.user.admin_title,
              assigned_zone: res.user.assigned_zone,
              member_unique_code: res.user.member_unique_code,
              is_panel_coordinator: res.user.is_panel_coordinator || false,
            } as Profile);
          }
        } catch {
          sessionStorage.removeItem('active_api_token');
          sessionStorage.removeItem('active_user_id');
        }
      }
      if (!mounted) return;
      setLoading(false);
    };

    void restoreSession();

    // Subscribe to auth state changes (token refresh, sign-out)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) {
        sessionStorage.setItem('active_api_token', session.access_token);
        sessionStorage.setItem('active_user_id', session.user.id);
      } else if (_event === 'SIGNED_OUT') {
        sessionStorage.removeItem('active_api_token');
        sessionStorage.removeItem('active_user_id');
      }
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
      if (res?.token && res?.user) {
        sessionStorage.setItem('active_api_token', res.token);
        sessionStorage.setItem('active_user_id', res.user.code || res.user.id);
        clearFrontendCache();
        await syncFromBackend();
        setProfile({
          ...res.user,
          role: (res.user.role || 'member').toLowerCase() as Profile['role'],
          id: res.user.code || res.user.id,
          db_id: res.user.id,
          unit: res.user.branch || res.user.unit,
          admin_title: res.user.admin_title,
          assigned_zone: res.user.assigned_zone,
          member_unique_code: res.user.member_unique_code,
          is_panel_coordinator: res.user.is_panel_coordinator || false,
        } as Profile);
        return true;
      }
    } catch {
      return false;
    }
    return false;
  };

  const signOut = () => {
    const token = sessionStorage.getItem('active_api_token');
    if (token) {
      void api.post('/auth/logout').catch(() => {});
    }
    sessionStorage.removeItem('active_api_token');
    sessionStorage.removeItem('active_user_id');
    clearFrontendCache();
    setProfile(null);
  };

  const hasPermission = (permission: string): boolean => {
    if (!profile) return false;
    if (profile.role === 'super') return true;
    return !!profile.perms?.[permission];
  };

  return (
    <AuthContext.Provider value={{ profile, loading, signIn, signOut, refreshProfile, hasPermission }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
