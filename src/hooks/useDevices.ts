import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface Device {
  id: string;
  device_id: string;
  device_type: string;
  assigned_to: string | null;
  status: string;
  checkout_date: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  assigned_profile?: { id: string; full_name: string | null } | null;
}

export function useDevices() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const devicesQuery = useQuery({
    queryKey: ['devices'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('devices')
        .select('*, assigned_profile:profiles!devices_assigned_to_fkey(id, full_name)')
        .order('device_id');
      if (error) throw error;
      return data as Device[];
    },
    enabled: !!user,
  });

  const addDevice = useMutation({
    mutationFn: async (device: { device_id: string; device_type: string; notes?: string }) => {
      const { error } = await supabase.from('devices').insert({
        device_id: device.device_id,
        device_type: device.device_type,
        notes: device.notes || null,
        created_by: user?.id,
        status: 'available',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      toast.success('Device added');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const assignDevice = useMutation({
    mutationFn: async ({ deviceId, profileId }: { deviceId: string; profileId: string }) => {
      const { error } = await supabase
        .from('devices')
        .update({
          assigned_to: profileId,
          status: 'assigned',
          checkout_date: new Date().toISOString().split('T')[0],
          updated_at: new Date().toISOString(),
        })
        .eq('id', deviceId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      toast.success('Device assigned');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const returnDevice = useMutation({
    mutationFn: async (deviceId: string) => {
      const { error } = await supabase
        .from('devices')
        .update({
          assigned_to: null,
          status: 'available',
          checkout_date: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', deviceId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      toast.success('Device returned');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteDevice = useMutation({
    mutationFn: async (deviceId: string) => {
      const { error } = await supabase.from('devices').delete().eq('id', deviceId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      toast.success('Device deleted');
    },
    onError: (e: any) => toast.error(e.message),
  });

  return {
    devices: devicesQuery.data ?? [],
    isLoading: devicesQuery.isLoading,
    addDevice,
    assignDevice,
    returnDevice,
    deleteDevice,
  };
}
