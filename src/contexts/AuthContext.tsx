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
          // The key itself is the user_id (set as presence key)
          if (key) online.add(key);
          const presences = state[key] as Array<{ user_id?: string }>;
          presences.forEach((presence) => {
            if (presence.user_id) {
              online.add(presence.user_id);
            }
          });
        });
        
        setOnlineUsers(online);
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        setOnlineUsers((prev) => {
          const updated = new Set(prev);
          // Add by key (which is user_id)
          if (key) updated.add(key);
          (newPresences as Array<{ user_id?: string }>).forEach((presence) => {
            if (presence.user_id) {
              updated.add(presence.user_id);
            }
          });
          return updated;
        });
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        setOnlineUsers((prev) => {
          const updated = new Set(prev);
          // Only remove if no presences remain for this key
          const remainingPresences = leftPresences as Array<{ user_id?: string }>;
          if (remainingPresences.length === 0 && key) {
            updated.delete(key);
          }
          remainingPresences.forEach((presence) => {
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
        // If the browser itself reports offline, restore from cache immediately
        // without waiting for any network call. This handles the cold-start case
        // where the device has never had a connection in this session.
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
              // ignore — roles are still set from cache
            }
          } else if (isMounted) {
            setRolesLoaded(true);
            setIsLoading(false);
          }
          return;
        }

        // Try to get session with a generous timeout.
        // Use a longer timeout (8s) to handle slow connections rather than
        // misidentifying them as offline during a cold start.
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Auth timeout')), 8000)
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
        // On timeout/error (e.g. no network on cold start), restore from cache.
        const cachedUserId = localStorage.getItem('cached_user_id');
        if (cachedUserId && isMounted) {
          const cached = readCachedRoles(cachedUserId);
          setRoles(cached);
          setRolesLoaded(true);
          // Also try to restore the session object from local Supabase store
          try {
            const { data: { session: localSession } } = await supabase.auth.getSession();
            if (localSession?.user && isMounted) {
              setSession(localSession);
              setUser(localSession.user);
            }
          } catch {
            // ignore
          }
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

        if (newSession?.user) {
          // Session still valid — update state normally
          setSession(newSession);
          setUser(newSession.user);

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
          // Session is null — could be a real logout OR a token refresh failure when offline.
          // CRITICAL: If offline and we have a cached user, DO NOT clear state.
          // A SIGNED_OUT event can fire when the token refresh request fails due to no network.
          // Clearing the user here would redirect to /auth even though the user is genuinely logged in.
          if (!navigator.onLine) {
            const cachedUserId = localStorage.getItem('cached_user_id');
            if (cachedUserId) {
              console.log('[Auth] Offline SIGNED_OUT ignored – preserving cached session');
              const cached = readCachedRoles(cachedUserId);
              setRoles(cached);
              setRolesLoaded(true);
              setIsLoading(false);
              // DO NOT clear user/session — keep whatever we had
              return;
            }
          }
          // Online real logout — clear everything
          setSession(null);
          setUser(null);
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
