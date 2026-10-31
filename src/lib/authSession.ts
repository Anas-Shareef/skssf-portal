import { supabase } from './supabaseClient';

// Supabase's persisted session (localStorage key `skssf_auth_session`) is the
// single source of truth for authentication. Nothing in the app should keep a
// second copy of the access token in sessionStorage.

const EXPIRY_SKEW_MS = 60_000;
let refreshPromise: Promise<string | null> | null = null;

const isUsable = (session: { access_token?: string; expires_at?: number } | null) => {
  if (!session?.access_token) return false;
  if (!session.expires_at) return true;
  return session.expires_at * 1000 > Date.now();
};

const isFresh = (session: { access_token?: string; expires_at?: number } | null) => {
  if (!isUsable(session)) return false;
  if (!session?.expires_at) return true;
  return session.expires_at * 1000 > Date.now() + EXPIRY_SKEW_MS;
};

/**
 * Returns a valid Supabase access token, refreshing the persisted session when
 * it is missing, expired, or about to expire. Returns null when there is no
 * authenticated session that can be refreshed.
 */
export async function getAccessToken(options: { forceRefresh?: boolean } = {}): Promise<string | null> {
  let session;
  try {
    const { data } = await supabase.auth.getSession();
    session = data.session;
  } catch (err) {
    console.warn('Unable to read Supabase session:', err);
    return null;
  }

  if (!session) return null;
  if (!options.forceRefresh && isFresh(session)) return session.access_token;

  if (!refreshPromise) {
    refreshPromise = supabase.auth
      .refreshSession()
      .then(({ data, error }) => {
        if (error || !data.session?.access_token) return null;
        return data.session.access_token;
      })
      .catch((err) => {
        console.warn('Supabase token refresh failed:', err);
        return null;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  const refreshed = await refreshPromise;
  if (refreshed) return refreshed;

  // A transient refresh failure must not discard a token that is still valid.
  return isUsable(session) ? session.access_token : null;
}

/** Builds fetch headers with a fresh bearer token. Throws when unauthenticated. */
export async function getAuthHeaders(
  extra: Record<string, string> = {},
  options: { forceRefresh?: boolean } = {}
): Promise<Record<string, string>> {
  const token = await getAccessToken(options);
  if (!token) throw new Error('Unauthenticated');
  return { ...extra, Authorization: `Bearer ${token}` };
}

/** Like getAuthHeaders, but omits Authorization when there is no session. */
export async function tryGetAuthHeaders(
  extra: Record<string, string> = {}
): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return token ? { ...extra, Authorization: `Bearer ${token}` } : { ...extra };
}
