/**
 * apiFetch — central fetch wrapper with:
 *  - Automatic Authorization header injection
 *  - Proactive token refresh when token is within 24h of expiry
 *  - 401 handling: clears session and reloads to login screen
 *
 * Usage (same as fetch, but pass the currentUser object):
 *   const data = await apiFetch('/buses', { user: currentUser, setCurrentUser });
 *   const data = await apiFetch('/buses', { method: 'POST', body: JSON.stringify(payload),
 *                                           user: currentUser, setCurrentUser });
 */

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// Decode a JWT payload without verifying the signature (client-side only)
function decodeToken(token) {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

// Returns true when token expires within the next 24 hours
function tokenExpiresSoon(token) {
  const decoded = decodeToken(token);
  if (!decoded?.exp) return false;
  const msRemaining = decoded.exp * 1000 - Date.now();
  return msRemaining < 24 * 60 * 60 * 1000; // < 24 hours
}

// Returns true when the token is already expired
function tokenIsExpired(token) {
  const decoded = decodeToken(token);
  if (!decoded?.exp) return true;
  return decoded.exp * 1000 < Date.now();
}

// In-flight refresh promise — prevents multiple simultaneous refresh calls
let refreshPromise = null;

async function tryRefreshToken(currentUser, setCurrentUser) {
  if (!currentUser?.token) return null;

  if (!refreshPromise) {
    refreshPromise = fetch(`${API}/auth/refresh`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${currentUser.token}` },
    })
      .then(async (res) => {
        if (!res.ok) return null;
        const { token } = await res.json();
        return token;
      })
      .catch(() => null)
      .finally(() => { refreshPromise = null; });
  }

  const newToken = await refreshPromise;
  if (newToken && setCurrentUser) {
    const updated = { ...currentUser, token: newToken };
    setCurrentUser(updated);
    // Persist updated token so it survives page reload
    try {
      const stored = localStorage.getItem('currentUser');
      if (stored) {
        localStorage.setItem('currentUser', JSON.stringify({ ...JSON.parse(stored), token: newToken }));
      }
    } catch { /* localStorage not available */ }
    return newToken;
  }
  return null;
}

/**
 * Main fetch wrapper.
 * @param {string} path        - API path, e.g. '/buses' (without /api prefix)
 * @param {object} options     - fetch options + { user, setCurrentUser }
 */
export async function apiFetch(path, options = {}) {
  const { user, setCurrentUser, ...fetchOptions } = options;

  let token = user?.token;

  // Proactively refresh if token expires in < 24h
  if (token && tokenExpiresSoon(token) && !tokenIsExpired(token) && setCurrentUser) {
    const refreshed = await tryRefreshToken(user, setCurrentUser);
    if (refreshed) token = refreshed;
  }

  // Build headers
  const headers = {
    'Content-Type': 'application/json',
    ...fetchOptions.headers,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const response = await fetch(`${API}${path}`, { ...fetchOptions, headers });

  // Token expired mid-session — clear session and reload to login
  if (response.status === 401) {
    if (setCurrentUser) {
      setCurrentUser(null);
      try { localStorage.removeItem('currentUser'); } catch { /* ignore */ }
    }
    // Small delay so any in-flight state updates settle before reload
    setTimeout(() => { window.location.href = '/'; }, 100);
    throw new Error('Session expired. Please log in again.');
  }

  return response;
}

/**
 * Convenience: apiFetch + res.json() in one call.
 * Throws if response is not ok.
 */
export async function apiFetchJson(path, options = {}) {
  const res = await apiFetch(path, options);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || `Request failed: ${res.status}`);
  return data;
}
