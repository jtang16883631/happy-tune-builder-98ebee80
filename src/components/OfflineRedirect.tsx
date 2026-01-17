import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

// Routes that are available offline
const OFFLINE_ROUTES = ['/scan', '/issues', '/auth'];

export function OfflineRedirect() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => {
      setIsOnline(false);
      // When going offline, redirect to scan if not already on an offline-compatible route
      if (!OFFLINE_ROUTES.includes(location.pathname)) {
        navigate('/scan', { replace: true });
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Check on mount - if offline and not on allowed route, redirect
    if (!navigator.onLine && !OFFLINE_ROUTES.includes(location.pathname)) {
      navigate('/scan', { replace: true });
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [navigate, location.pathname]);

  return null;
}
