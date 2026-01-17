import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
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
  isPrivileged: boolean; // developer or owner
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

  const fetchUserRoles = async (userId: string) => {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);

    if (error) {
      console.error('Error fetching roles:', error);
      return [];
    }

    return (data || []).map((r) => r.role as AppRole);
  };

  // Ensure profile exists for the user (handles re-login after profile deletion)
  const ensureProfileExists = async (user: User) => {
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .single();

    if (!existingProfile) {
      // Profile doesn't exist, create one
      const { error } = await supabase.from('profiles').insert({
        id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name || user.user_metadata?.name || null,
        avatar_url: user.user_metadata?.avatar_url || null,
        profile_completed: false,
      });

      if (error) {
        console.error('Error creating profile:', error);
      }
    }
  };

  const refreshRoles = async () => {
    if (user) {
      const userRoles = await fetchUserRoles(user.id);
      setRoles(userRoles);
    }
  };

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        // Defer profile check and role fetching to avoid deadlock
        if (session?.user) {
          setTimeout(async () => {
            // Ensure profile exists (handles re-login after deletion)
            await ensureProfileExists(session.user);
            const userRoles = await fetchUserRoles(session.user.id);
            setRoles(userRoles);
            setIsLoading(false);
          }, 0);
        } else {
          setRoles([]);
          setIsLoading(false);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        // Ensure profile exists (handles re-login after deletion)
        await ensureProfileExists(session.user);
        const userRoles = await fetchUserRoles(session.user.id);
        setRoles(userRoles);
      }
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

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
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setRoles([]);
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