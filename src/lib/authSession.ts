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

/**
 * Fired when the backend keeps rejecting our bearer token even after a forced
 * refresh. AuthContext listens for this and discards the unusable session so
 * the app can never keep retrying with revoked credentials.
 */
export const AUTH_SESSION_INVALID_EVENT = 'authSessionInvalid';

export function notifySessionInvalid(reason: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(AUTH_SESSION_INVALID_EVENT, { detail: { reason } }));
}

/**
 * Authenticated fetch for the `/api/*` serverless endpoints.
 *
 * The token is read from the persisted Supabase session (never from a second
 * copy) and always overrides any Authorization header supplied by the caller.
 * A 401 means the token was rejected before the handler did any work, so one
 * retry with a forced refresh is safe for every method, including POST.
 */
export async function authenticatedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const attempt = async (forceRefresh: boolean) => {
    const token = await getAccessToken({ forceRefresh });
    if (!token) throw new Error('Unauthenticated');

    const headers = new Headers(init.headers || {});
    headers.set('Authorization', `Bearer ${token}`);
    if (init.body != null && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    return fetch(input, { ...init, headers });
  };

  const first = await attempt(false);
  if (first.status !== 401) return first;

  const retried = await attempt(true);
  if (retried.status === 401) notifySessionInvalid('http_401_after_refresh');
  return retried;
}
