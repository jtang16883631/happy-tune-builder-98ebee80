import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface PresenceUser {
  id: string;
  email: string;
  fullName: string;
  avatarUrl?: string;
  onlineAt: string;
}

export function usePresence() {
  const { user } = useAuth();
  const [presentUsers, setPresentUsers] = useState<PresenceUser[]>([]);
  const [currentUserPresence, setCurrentUserPresence] = useState<PresenceUser | null>(null);

  useEffect(() => {
    if (!user) {
      setPresentUsers([]);
      setCurrentUserPresence(null);
      return;
    }

    // Always show at least the current user immediately (even if realtime is slow/blocked)
    const basePresence: PresenceUser = {
      id: user.id,
      email: user.email || '',
      fullName:
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        user.email?.split('@')[0] ||
        'User',
      avatarUrl: user.user_metadata?.avatar_url || undefined,
      onlineAt: new Date().toISOString(),
    };

    setCurrentUserPresence(basePresence);

    const channel = supabase.channel('app-presence', {
      config: { presence: { key: user.id } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const users: PresenceUser[] = [];

        Object.values(state).forEach((presences: any[]) => {
          presences.forEach((presence) => {
            users.push({
              id: presence.id,
              email: presence.email,
              fullName: presence.fullName,
              avatarUrl: presence.avatarUrl,
              onlineAt: presence.onlineAt,
            });
          });
        });

        const me = users.find((u) => u.id === user.id) || basePresence;
        const others = users.filter((u) => u.id !== user.id);

        setCurrentUserPresence(me);
        setPresentUsers(others);
      })
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') return;

        // Track presence (no profile DB call needed)
        channel.track({
          ...basePresence,
          onlineAt: new Date().toISOString(),
        });
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  return { presentUsers, currentUserPresence, totalOnline: presentUsers.length + (currentUserPresence ? 1 : 0) };
}
