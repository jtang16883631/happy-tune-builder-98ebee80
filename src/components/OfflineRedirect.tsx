import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

// Routes that are available offline (no auth required when offline)
// Master Data (FDA) and Audit Projects (Scan) - Issues tab removed from offline
const OFFLINE_ROUTES = ['/scan', '/fda', '/auth'];

export function OfflineRedirect() {
  const navigate = useNavigate();
  const location = useLocation();
  const isOnline = useOnlineStatus();

  useEffect(() => {
    // If offline and not on allowed route, redirect to /scan.
    if (!isOnline && !OFFLINE_ROUTES.includes(location.pathname)) {
      // Only redirect if we have a cached session (user was logged in before)
      const hasCachedSession = !!localStorage.getItem('cached_user_id');
      if (hasCachedSession) {
        navigate('/scan', { replace: true });
      } else {
        navigate('/auth', { replace: true });
      }
    }
  }, [isOnline, navigate, location.pathname]);

  return null;
}


// Helper hook to check online status
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const lastCheckAtRef = useRef<number>(0);
  const failureCountRef = useRef<number>(0);

  const checkBackendReachable = useCallback(async (): Promise<boolean> => {
    // In Electron, navigator.onLine can be unreliable. Use a small backend health endpoint.
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
        headers: {
          'apikey': anonKey,
        },
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      window.clearTimeout(timeout);
    }
  }, []);

  const refresh = useCallback(async () => {
    // Throttle checks to avoid spamming
    const now = Date.now();
    if (now - lastCheckAtRef.current < 1500) return;
    lastCheckAtRef.current = now;

    // Quick shortcut: if browser claims offline, treat as offline immediately.
    if (!navigator.onLine) {
      failureCountRef.current = 3; // immediately trigger offline
      setIsOnline(false);
      return;
    }

    // Electron + captive portals can cause intermittent false negatives.
    // To avoid trapping users in "offline mode" while they actually have internet,
    // only flip to offline after several consecutive backend ping failures.
    const ok = await checkBackendReachable();
    if (ok) {
      failureCountRef.current = 0;
      setIsOnline(true);
      return;
    }

    failureCountRef.current += 1;
    if (failureCountRef.current >= 3) {
      setIsOnline(false);
    }
  }, [checkBackendReachable]);

  useEffect(() => {
    const handleOnline = () => {
      // Even if the event fires, confirm reachability.
      void refresh();
    };
    const handleOffline = () => {
      // Browser says offline → trust it immediately, no ping needed.
      failureCountRef.current = 3;
      lastCheckAtRef.current = 0; // reset throttle so refresh can run
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check + periodic re-check
    void refresh();
    const interval = window.setInterval(() => {
      void refresh();
    }, 15000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void refresh();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [refresh]);

  return isOnline;
}
