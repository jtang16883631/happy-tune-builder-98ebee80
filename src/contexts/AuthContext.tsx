import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
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
}

interface AuthContextType extends UserWithRole {
  signInWithGoogle: () => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshRoles: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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

  useEffect(() => {
    let isMounted = true;

    const initSession = async () => {
      try {
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
          // If offline, use cached roles and skip network calls.
          if (!navigator.onLine) {
            const cached = readCachedRoles(existingSession.user.id);
            if (isMounted) setRoles(cached);
            return;
          }

          await ensureProfileExists(existingSession.user);
          const userRoles = await fetchUserRoles(existingSession.user.id);
          if (isMounted) {
            setRoles(userRoles);
            writeCachedRoles(existingSession.user.id, userRoles);
          }
        }
      } catch (err) {
        console.error('Error initializing session:', err);
        // On error (including timeout), just finish loading so app is usable
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
                writeCachedRoles(newSession.user.id, userRoles);
                setIsLoading(false);
              }
            } catch (err) {
              console.error('Error in auth state change:', err);
              if (isMounted) {
                setIsLoading(false);
              }
            }
          }, 0);
        } else {
          setRoles([]);
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
        signInWithGoogle,
        signOut,
        refreshRoles,
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
