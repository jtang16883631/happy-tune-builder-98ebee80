import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface KitChecklist {
  laptop: boolean;
  laptop_charger: boolean;
  barcode_scanner: boolean;
  scanner_batteries: boolean;
  scanner_battery_charger: boolean;
}

export interface EquipmentKit {
  id: string;
  auditor_id: string;
  status: string;
  checkout_date: string;
  return_date: string | null;
  laptop_id: string | null;
  scanner_id: string | null;
  checklist: KitChecklist;
  return_checklist: KitChecklist | null;
  return_notes: string | null;
  checked_out_by: string | null;
  created_at: string;
  updated_at: string;
  auditor?: { id: string; full_name: string | null } | null;
}

export function useEquipmentKits() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const kitsQuery = useQuery({
    queryKey: ['equipment-kits'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('equipment_kits' as any)
        .select('*, auditor:profiles!equipment_kits_auditor_id_fkey(id, full_name)')
        .order('checkout_date', { ascending: false });
      if (error) throw error;
      return (data as any[]) as EquipmentKit[];
    },
    enabled: !!user,
  });

  const checkoutKit = useMutation({
    mutationFn: async (kit: {
      auditor_id: string;
      laptop_id: string;
      scanner_id: string;
      checklist: KitChecklist;
    }) => {
      const { error } = await supabase.from('equipment_kits' as any).insert({
        auditor_id: kit.auditor_id,
        laptop_id: kit.laptop_id,
        scanner_id: kit.scanner_id,
        checklist: kit.checklist as any,
        checked_out_by: user?.id,
        status: 'out_in_field',
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment-kits'] });
      toast.success('Kit checked out successfully');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const returnKit = useMutation({
    mutationFn: async (params: {
      kitId: string;
      return_checklist: KitChecklist;
      return_notes: string;
    }) => {
      const { error } = await supabase
        .from('equipment_kits' as any)
        .update({
          status: 'returned',
          return_date: new Date().toISOString().split('T')[0],
          return_checklist: params.return_checklist as any,
          return_notes: params.return_notes || null,
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', params.kitId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment-kits'] });
      toast.success('Kit returned successfully');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteKit = useMutation({
    mutationFn: async (kitId: string) => {
      const { error } = await supabase.from('equipment_kits' as any).delete().eq('id', kitId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment-kits'] });
      toast.success('Kit record deleted');
    },
    onError: (e: any) => toast.error(e.message),
  });

  return {
    kits: kitsQuery.data ?? [],
    isLoading: kitsQuery.isLoading,
    checkoutKit,
    returnKit,
    deleteKit,
  };
}
