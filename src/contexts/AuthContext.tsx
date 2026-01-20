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
        const { data: { session: existingSession } } = await supabase.auth.getSession();

        if (!isMounted) return;

        setSession(existingSession);
        setUser(existingSession?.user ?? null);

        if (existingSession?.user) {
          await ensureProfileExists(existingSession.user);
          const userRoles = await fetchUserRoles(existingSession.user.id);
          if (isMounted) {
            setRoles(userRoles);
          }
        }
      } catch (err) {
        console.error('Error initializing session:', err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        if (!isMounted) return;

        setSession(newSession);
        setUser(newSession?.user ?? null);

        if (newSession?.user) {
          setTimeout(async () => {
            if (!isMounted) return;

            try {
              await ensureProfileExists(newSession.user);
              const userRoles = await fetchUserRoles(newSession.user.id);
              if (isMounted) {
                setRoles(userRoles);
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
