import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

// Routes that are available offline (no auth required when offline)
const OFFLINE_ROUTES = ['/scan', '/issues', '/auth'];

export function OfflineRedirect() {
  const navigate = useNavigate();
  const location = useLocation();
  const isOnline = useOnlineStatus();

  useEffect(() => {
    // If offline and not on allowed route, redirect to /scan.
    if (!isOnline && !OFFLINE_ROUTES.includes(location.pathname)) {
      navigate('/scan', { replace: true });
    }
  }, [isOnline, navigate, location.pathname]);

  return null;
}

// Helper hook to check online status
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const lastCheckAtRef = useRef<number>(0);

  const checkBackendReachable = useCallback(async (): Promise<boolean> => {
    // In Electron, navigator.onLine can be unreliable. Use a small backend health endpoint.
    const baseUrl = import.meta.env.VITE_SUPABASE_URL;
    if (!baseUrl) return navigator.onLine;

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 2500);
    try {
      const res = await fetch(`${baseUrl}/auth/v1/health`, {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
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

    // Quick shortcut: if browser claims offline, treat as offline.
    if (!navigator.onLine) {
      setIsOnline(false);
      return;
    }

    const ok = await checkBackendReachable();
    setIsOnline(ok);
  }, [checkBackendReachable]);

  useEffect(() => {
    const handleOnline = () => {
      // Even if the event fires, confirm reachability.
      void refresh();
    };
    const handleOffline = () => setIsOnline(false);

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
