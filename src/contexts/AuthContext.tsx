import { createContext, useContext, useEffect, useState } from 'react';
import { clearFrontendCache, syncFromBackend, localDb } from '../lib/localDb';
import { api } from '../lib/api';

export type Profile = {
  id: string;
  db_id?: number;
  role: 'super' | 'admin' | 'member';
  memberNo?: string;
  name: string;
  email: string;
  phone?: string;
  unit?: string;
  occupation?: string;
  avatar?: string;
  branch?: string;
};

type AuthContextType = {
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, pass: string) => Promise<boolean>;
  signOut: () => void;
  refreshProfile: () => void;
};

const AuthContext = createContext<AuthContextType>({
  profile: null,
  loading: true,
  signIn: async () => false,
  signOut: () => {},
  refreshProfile: () => {},
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
      const token = sessionStorage.getItem('active_api_token');
      if (token) {
        try {
          const res = await api.get<any>('/auth/me');
          if (res?.user) {
            setProfile({
              ...res.user,
              id: res.user.code || res.user.id,
              db_id: Number(res.user.id),
              unit: res.user.branch || res.user.unit
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
    return () => {
      mounted = false;
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
        setProfile({
          ...res.user,
          id: res.user.code || res.user.id,
          db_id: Number(res.user.id),
          unit: res.user.branch || res.user.unit
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

  return (
    <AuthContext.Provider value={{ profile, loading, signIn, signOut, refreshProfile }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
