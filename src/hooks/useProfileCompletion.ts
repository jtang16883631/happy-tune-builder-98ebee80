import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

export function useProfileCompletion() {
  const { user, isLoading: authLoading } = useAuth();
  const [needsCompletion, setNeedsCompletion] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  const checkProfileCompletion = async () => {
    if (!user) {
      setNeedsCompletion(false);
      setIsChecking(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('profile_completed')
        .eq('id', user.id)
        .single();

      if (error) {
        console.error('Error checking profile:', error);
        setNeedsCompletion(false);
      } else {
        setNeedsCompletion(!data?.profile_completed);
      }
    } catch (error) {
      console.error('Error checking profile:', error);
      setNeedsCompletion(false);
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    if (!authLoading) {
      checkProfileCompletion();
    }
  }, [user, authLoading]);

  const markCompleted = () => {
    setNeedsCompletion(false);
  };

  return {
    needsCompletion,
    isChecking: isChecking || authLoading,
    markCompleted,
    recheckProfile: checkProfileCompletion,
  };
}
