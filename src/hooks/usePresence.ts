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

  useEffect(() => {
    if (!user) return;

    const channel = supabase.channel('app-presence', {
      config: { presence: { key: user.id } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const users: PresenceUser[] = [];
        
        Object.values(state).forEach((presences: any[]) => {
          presences.forEach((presence) => {
            if (presence.id !== user.id) {
              users.push({
                id: presence.id,
                email: presence.email,
                fullName: presence.fullName,
                avatarUrl: presence.avatarUrl,
                onlineAt: presence.onlineAt,
              });
            }
          });
        });

        setPresentUsers(users);
      })
      .subscribe(async (status) => {
        if (status !== 'SUBSCRIBED') return;

        // Fetch current user's profile for display
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, avatar_url')
          .eq('id', user.id)
          .single();

        await channel.track({
          id: user.id,
          email: user.email || '',
          fullName: profile?.full_name || user.email?.split('@')[0] || 'User',
          avatarUrl: profile?.avatar_url,
          onlineAt: new Date().toISOString(),
        });
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  return { presentUsers, currentUser: user };
}
