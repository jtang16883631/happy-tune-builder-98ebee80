import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Sparkles, X } from 'lucide-react';

export function UpdateBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem('update_pending') === 'true') {
      setVisible(true);
    }
  }, []);

  const applyUpdate = () => {
    sessionStorage.removeItem('update_pending');

    // Preserve auth tokens
    const authKeys: [string, string | null][] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!;
      // Preserve auth tokens, cached user data, and offline-critical keys
      if (key.startsWith('sb-') || key === 'cached_user_id' || key === 'cached_user_short_name'
          || key === 'last_scan_location' || key.startsWith('last_scan_section_')
          || key === 'offline_manifest') {
        authKeys.push([key, localStorage.getItem(key)]);
      }
    }

    // Unregister service workers
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((r) => r.forEach((sw) => sw.unregister()));
    }

    // Clear caches
    if ('caches' in window) {
      caches.keys().then((names) => names.forEach((n) => caches.delete(n)));
    }

    // Clear and restore localStorage
    const buildTs = localStorage.getItem('build_timestamp');
    localStorage.clear();
    authKeys.forEach(([k, v]) => { if (v) localStorage.setItem(k, v); });
    if (buildTs) localStorage.setItem('build_timestamp', buildTs);

    window.location.reload();
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] animate-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-3 rounded-lg bg-primary px-4 py-2.5 text-primary-foreground shadow-lg">
        <Sparkles className="h-4 w-4 shrink-0" />
        <span className="text-sm font-medium whitespace-nowrap">New update available</span>
        <Button
          size="sm"
          variant="secondary"
          className="h-7 text-xs font-semibold"
          onClick={applyUpdate}
        >
          Update Now
        </Button>
        <button
          onClick={() => { setVisible(false); sessionStorage.removeItem('update_pending'); }}
          className="ml-1 rounded p-0.5 hover:bg-primary-foreground/20 transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
