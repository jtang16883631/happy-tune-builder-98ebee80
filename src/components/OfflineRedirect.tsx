import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

// Routes that are fully available offline (no auth required when offline)
const OFFLINE_ROUTES = ['/scan', '/fda', '/compile', '/auth'];

export function OfflineRedirect() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isOnline, isChecking } = useOnlineStatusFull();

  useEffect(() => {
    // Don't redirect while we're still doing the initial connectivity check
    if (isChecking) return;
    // Only redirect when offline
    if (isOnline) return;

    const hasCachedSession = !!localStorage.getItem('cached_user_id');
    let hasOfflineTemplates = false;
    try {
      const manifestRaw = localStorage.getItem('offline_manifest');
      if (manifestRaw) {
        const manifest = JSON.parse(manifestRaw);
        hasOfflineTemplates = Boolean(manifest?.offlineReady && manifest?.templateCount > 0);
      }
    } catch {
      // Ignore parse errors and fall back to session-only behavior
    }

    const hasOfflineAccess = hasCachedSession || hasOfflineTemplates;

    // Cold-start offline should never get stuck on /auth if local data exists.
    if (location.pathname === '/auth' && hasOfflineAccess) {
      navigate('/scan', { replace: true });
      return;
    }

    if (OFFLINE_ROUTES.includes(location.pathname)) return;

    if (hasOfflineAccess) {
      navigate('/scan', { replace: true });
    } else {
      navigate('/auth', { replace: true });
    }
  }, [isOnline, isChecking, navigate, location.pathname]);

  return null;
}

// -----------------------------------------------------------------------
// Internal full hook – returns { isOnline, isChecking }
// -----------------------------------------------------------------------
function useOnlineStatusFull(): { isOnline: boolean; isChecking: boolean } {
  // Force offline mode — user toggled this to avoid unstable WiFi interruptions
  const forceOffline = localStorage.getItem('force_offline_mode') === 'true';
  // If navigator.onLine is false at mount time, skip async checking entirely.
  const navigatorOffline = !navigator.onLine || forceOffline;
  const [isOnline, setIsOnline] = useState<boolean>(false);
  const [isChecking, setIsChecking] = useState<boolean>(!navigatorOffline);
  const lastCheckAtRef = useRef<number>(0);
  const failureCountRef = useRef<number>(0);
  const hasCompletedFirstCheck = useRef<boolean>(false);

  const checkBackendReachable = useCallback(async (): Promise<boolean> => {
    // Quick shortcut: if force offline or browser claims offline, trust it immediately.
    if (localStorage.getItem('force_offline_mode') === 'true') return false;
    if (!navigator.onLine) return false;

    const baseUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!baseUrl || !anonKey) return navigator.onLine;

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 2500);
    try {
      const res = await fetch(`${baseUrl}/auth/v1/health`, {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
        headers: { 'apikey': anonKey },
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      window.clearTimeout(timeout);
    }
  }, []);

  const refresh = useCallback(async (force = false) => {
    // Throttle checks to avoid spamming (except forced checks)
    const now = Date.now();
    if (!force && now - lastCheckAtRef.current < 1500) return;
    lastCheckAtRef.current = now;

    // Quick shortcut: if force offline or browser claims offline, treat as offline immediately.
    if (localStorage.getItem('force_offline_mode') === 'true' || !navigator.onLine) {
      failureCountRef.current = 3;
      setIsOnline(false);
      if (!hasCompletedFirstCheck.current) {
        hasCompletedFirstCheck.current = true;
        setIsChecking(false);
      }
      return;
    }

    const ok = await checkBackendReachable();
    if (ok) {
      failureCountRef.current = 0;
      setIsOnline(true);
    } else {
      failureCountRef.current += 1;
      // Require 3 consecutive failures before going offline,
      // EXCEPT on the first check — if the very first ping fails, go offline immediately.
      if (!hasCompletedFirstCheck.current || failureCountRef.current >= 3) {
        setIsOnline(false);
      }
    }

    if (!hasCompletedFirstCheck.current) {
      hasCompletedFirstCheck.current = true;
      setIsChecking(false);
    }
  }, [checkBackendReachable]);

  useEffect(() => {
    const handleOnline = () => { void refresh(true); };
    const handleOffline = () => {
      failureCountRef.current = 3;
      lastCheckAtRef.current = 0;
      setIsOnline(false);
      if (!hasCompletedFirstCheck.current) {
        hasCompletedFirstCheck.current = true;
        setIsChecking(false);
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check — force it so throttle doesn't block
    void refresh(true);

    const interval = window.setInterval(() => { void refresh(); }, 15000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') { void refresh(true); }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [refresh]);

  return { isOnline, isChecking };
}

// -----------------------------------------------------------------------
// Public hook – returns just the boolean for backward compatibility
// -----------------------------------------------------------------------
export function useOnlineStatus(): boolean {
  const { isOnline } = useOnlineStatusFull();
  return isOnline;
}

// -----------------------------------------------------------------------
// Force offline helpers
// -----------------------------------------------------------------------
export function setForceOfflineMode(enabled: boolean) {
  if (enabled) {
    localStorage.setItem('force_offline_mode', 'true');
  } else {
    localStorage.removeItem('force_offline_mode');
  }
  // Trigger online/offline re-evaluation
  window.dispatchEvent(new Event(enabled ? 'offline' : 'online'));
}

export function isForceOfflineMode(): boolean {
  return localStorage.getItem('force_offline_mode') === 'true';
}
