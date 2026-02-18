import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { User, Session, RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

type AppRole = 'auditor' | 'developer' | 'coordinator' | 'owner' | 'office_admin';

interface UserWithRole {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  isOwner: boolean;
  isDeveloper: boolean;
  isCoordinator: boolean;
  isAuditor: boolean;
  isPrivileged: boolean;
  isLoading: boolean;
  rolesLoaded: boolean;
}

interface AuthContextType extends UserWithRole {
  signInWithGoogle: () => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshRoles: () => Promise<void>;
  rolesLoaded: boolean;
  onlineUsers: Set<string>;
  isOnline: (userId: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [rolesLoaded, setRolesLoaded] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [presenceChannel, setPresenceChannel] = useState<RealtimeChannel | null>(null);

  const readCachedRoles = useCallback((userId: string): AppRole[] => {
    try {
      const raw = localStorage.getItem(`cached_roles:${userId}`);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(Boolean) as AppRole[];
    } catch {
      return [];
    }
  }, []);

  const writeCachedRoles = useCallback((userId: string, nextRoles: AppRole[]) => {
    try {
      localStorage.setItem(`cached_roles:${userId}`, JSON.stringify(nextRoles));
    } catch {
      // ignore
    }
  }, []);

  const fetchUserRoles = useCallback(async (userId: string): Promise<AppRole[]> => {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);

    if (error) {
      console.error('Error fetching roles:', error);
      return [];
    }

    return (data || []).map((r) => r.role as AppRole);
  }, []);

  const ensureProfileExists = useCallback(async (currentUser: User) => {
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', currentUser.id)
      .maybeSingle();

    if (!existingProfile) {
      await supabase.from('profiles').insert({
        id: currentUser.id,
        email: currentUser.email,
        full_name: currentUser.user_metadata?.full_name || currentUser.user_metadata?.name || null,
        avatar_url: currentUser.user_metadata?.avatar_url || null,
        profile_completed: false,
      });
    }
  }, []);

  // Global presence tracking
  useEffect(() => {
    if (!user) {
      // Clean up channel when user logs out
      if (presenceChannel) {
        presenceChannel.unsubscribe();
        setPresenceChannel(null);
      }
      setOnlineUsers(new Set());
      return;
    }

    const channel = supabase.channel('online-users', {
      config: {
        presence: {
          key: user.id,
        },
      },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const online = new Set<string>();
        
        Object.keys(state).forEach((key) => {
          const presences = state[key] as Array<{ user_id?: string }>;
          presences.forEach((presence) => {
            if (presence.user_id) {
              online.add(presence.user_id);
            }
          });
        });
        
        setOnlineUsers(online);
      })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        setOnlineUsers((prev) => {
          const updated = new Set(prev);
          (newPresences as Array<{ user_id?: string }>).forEach((presence) => {
            if (presence.user_id) {
              updated.add(presence.user_id);
            }
          });
          return updated;
        });
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        setOnlineUsers((prev) => {
          const updated = new Set(prev);
          (leftPresences as Array<{ user_id?: string }>).forEach((presence) => {
            if (presence.user_id) {
              updated.delete(presence.user_id);
            }
          });
          return updated;
        });
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: user.id,
            online_at: new Date().toISOString(),
          });
        }
      });

    setPresenceChannel(channel);

    return () => {
      channel.unsubscribe();
    };
  }, [user?.id]);

  useEffect(() => {
    let isMounted = true;

    const initSession = async () => {
      try {
        // If we're offline, immediately restore from localStorage cache
        // so we don't hang for 5 seconds waiting for a network call
        if (!navigator.onLine) {
          const cachedUserId = localStorage.getItem('cached_user_id');
          if (cachedUserId && isMounted) {
            const cached = readCachedRoles(cachedUserId);
            setRoles(cached);
            setRolesLoaded(true);
            setIsLoading(false);
            // Try to restore session object from Supabase local store (no network)
            try {
              const { data: { session: localSession } } = await supabase.auth.getSession();
              if (localSession?.user && isMounted) {
                setSession(localSession);
                setUser(localSession.user);
              }
            } catch {
              // ignore — we'll stay with null user but roles are set
            }
          } else if (isMounted) {
            setRolesLoaded(true);
            setIsLoading(false);
          }
          return;
        }

        // Add timeout to prevent hanging when network is slow/unavailable
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Auth timeout')), 5000)
        );
        
        const sessionPromise = supabase.auth.getSession();
        
        const { data: { session: existingSession } } = await Promise.race([
          sessionPromise,
          timeoutPromise
        ]) as Awaited<typeof sessionPromise>;

        if (!isMounted) return;

        setSession(existingSession);
        setUser(existingSession?.user ?? null);

        if (existingSession?.user) {
          // Cache user ID for offline flash drive import
          localStorage.setItem('cached_user_id', existingSession.user.id);

          await ensureProfileExists(existingSession.user);
          const userRoles = await fetchUserRoles(existingSession.user.id);
          if (isMounted) {
            setRoles(userRoles);
            setRolesLoaded(true);
            writeCachedRoles(existingSession.user.id, userRoles);
          }
        } else {
          // No session = no roles to load
          if (isMounted) setRolesLoaded(true);
        }
      } catch (err) {
        console.error('Error initializing session:', err);
        // On timeout/error, try to restore from cache so app is usable offline
        const cachedUserId = localStorage.getItem('cached_user_id');
        if (cachedUserId && isMounted) {
          const cached = readCachedRoles(cachedUserId);
          setRoles(cached);
          setRolesLoaded(true);
        } else if (isMounted) {
          setRolesLoaded(true);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        if (!isMounted) return;

        setSession(newSession);
        setUser(newSession?.user ?? null);

        if (newSession?.user) {
          // If offline, use cached roles and skip network calls.
          if (!navigator.onLine) {
            const cached = readCachedRoles(newSession.user.id);
            setRoles(cached);
            setRolesLoaded(true);
            setIsLoading(false);
            return;
          }

          setTimeout(async () => {
            if (!isMounted) return;

            try {
              await ensureProfileExists(newSession.user);
              const userRoles = await fetchUserRoles(newSession.user.id);
              if (isMounted) {
                setRoles(userRoles);
                setRolesLoaded(true);
                writeCachedRoles(newSession.user.id, userRoles);
                setIsLoading(false);
              }
            } catch (err) {
              console.error('Error in auth state change:', err);
              if (isMounted) {
                setRolesLoaded(true);
                setIsLoading(false);
              }
            }
          }, 0);
        } else {
          // If we're offline and have a cached session, do NOT clear the user.
          // The SIGNED_OUT event can fire when token refresh fails due to network loss.
          // We preserve the cached state so the user isn't kicked to /auth when offline.
          if (!navigator.onLine) {
            const cachedUserId = localStorage.getItem('cached_user_id');
            if (cachedUserId) {
              console.log('[Auth] Offline SIGNED_OUT ignored – restoring cached session');
              const cached = readCachedRoles(cachedUserId);
              setRoles(cached);
              setRolesLoaded(true);
              setIsLoading(false);
              return;
            }
          }
          setRoles([]);
          setRolesLoaded(true);
          setIsLoading(false);
        }
      }
    );

    initSession();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [fetchUserRoles, ensureProfileExists]);

  const refreshRoles = async () => {
    if (user) {
      const userRoles = await fetchUserRoles(user.id);
      setRoles(userRoles);
    }
  };

  const signInWithGoogle = async () => {
    const redirectUrl = `${window.location.origin}/`;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
      },
    });

    return { error: error as Error | null };
  };

  const signOut = async () => {
    // Clear local state first
    setUser(null);
    setSession(null);
    setRoles([]);
    
    try {
      // Try to sign out from Supabase - ignore errors if session already expired
      await supabase.auth.signOut({ scope: 'local' });
    } catch (err) {
      // Session might already be invalid, that's okay
      console.log('Sign out completed (session may have been expired)');
    }
  };

  const isOwner = roles.includes('owner');
  const isDeveloper = roles.includes('developer');
  const isCoordinator = roles.includes('coordinator');
  const isAuditor = roles.includes('auditor');
  const isPrivileged = isOwner || isDeveloper;

  const isOnline = useCallback((userId: string) => onlineUsers.has(userId), [onlineUsers]);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        roles,
        isOwner,
        isDeveloper,
        isCoordinator,
        isAuditor,
        isPrivileged,
        isLoading,
        rolesLoaded,
        signInWithGoogle,
        signOut,
        refreshRoles,
        onlineUsers,
        isOnline,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
