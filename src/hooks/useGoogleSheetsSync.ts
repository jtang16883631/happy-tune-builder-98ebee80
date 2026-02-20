import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { useEffect, useCallback, useRef } from 'react';

interface SheetConfig {
  id: string;
  spreadsheet_id: string;
  spreadsheet_url: string | null;
  sync_enabled: boolean;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

interface SyncResult {
  success: boolean;
  message?: string;
  error?: string;
  spreadsheetUrl?: string;
  changes?: number;
}

export function useGoogleSheetsSync() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch sheet configuration
  const { data: sheetConfig, isLoading: isLoadingConfig } = useQuery({
    queryKey: ['live-tracker-sheet-config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('live_tracker_sheet_config')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data as SheetConfig | null;
    },
    enabled: !!user,
  });

  // Initialize sheet (create new spreadsheet)
  const initSheet = useMutation({
    mutationFn: async (): Promise<SyncResult> => {
      const { data, error } = await supabase.functions.invoke('live-tracker-sheets-sync', {
        body: { action: 'init' },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['live-tracker-sheet-config'] });
      if (data.spreadsheetUrl) {
        toast({
          title: 'Google Sheet created',
          description: 'Your Live Tracker sheet is ready. Opening in new tab...',
        });
        window.open(data.spreadsheetUrl, '_blank');
      }
    },
    onError: (error) => {
      console.error('Init sheet error:', error);
      const msg = error instanceof Error ? error.message : 'Unknown error';
      const isPermission = msg.toLowerCase().includes('permission') || msg.includes('403');
      toast({
        title: 'Failed to connect Google Sheet',
        description: isPermission
          ? 'Permission denied — make sure Google Sheets API and Google Drive API are enabled in Google Cloud Console for your service account project.'
          : msg,
        variant: 'destructive',
      });
    },
  });

  // Push to sheet (app -> sheet)
  const pushToSheet = useMutation({
    mutationFn: async (): Promise<SyncResult> => {
      const { data, error } = await supabase.functions.invoke('live-tracker-sheets-sync', {
        body: { action: 'push' },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['live-tracker-sheet-config'] });
      toast({
        title: 'Pushed to Google Sheet',
        description: data.message || 'Data synced successfully',
      });
    },
    onError: (error) => {
      console.error('Push error:', error);
      toast({
        title: 'Push failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    },
  });

  // Pull from sheet (sheet -> app)
  const pullFromSheet = useMutation({
    mutationFn: async (): Promise<SyncResult> => {
      const { data, error } = await supabase.functions.invoke('live-tracker-sheets-sync', {
        body: { action: 'pull' },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['live-tracker-sheet-config'] });
      queryClient.invalidateQueries({ queryKey: ['live-tracker-jobs'] });
      if (data.changes && data.changes > 0) {
        toast({
          title: 'Pulled from Google Sheet',
          description: `${data.changes} job(s) updated from sheet`,
        });
      }
    },
    onError: (error) => {
      console.error('Pull error:', error);
      // Don't show toast for background pulls to avoid spamming
    },
  });

  // Full sync (bidirectional)
  const syncSheet = useMutation({
    mutationFn: async (): Promise<SyncResult> => {
      const { data, error } = await supabase.functions.invoke('live-tracker-sheets-sync', {
        body: { action: 'sync' },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['live-tracker-sheet-config'] });
      queryClient.invalidateQueries({ queryKey: ['live-tracker-jobs'] });
      toast({
        title: 'Synced with Google Sheet',
        description: data.message || 'Bidirectional sync complete',
      });
    },
    onError: (error) => {
      console.error('Sync error:', error);
      toast({
        title: 'Sync failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    },
  });

  // Auto-pull from sheet every 30 seconds
  const startAutoSync = useCallback(() => {
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
    }

    if (sheetConfig?.sync_enabled) {
      syncIntervalRef.current = setInterval(() => {
        // Silent pull - no toast unless there are changes
        pullFromSheet.mutate();
      }, 30000); // 30 seconds
    }
  }, [sheetConfig?.sync_enabled, pullFromSheet]);

  // Set up auto-sync when config is loaded
  useEffect(() => {
    if (sheetConfig?.sync_enabled) {
      startAutoSync();
    }

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, [sheetConfig?.sync_enabled, startAutoSync]);

  // Also sync on window focus
  useEffect(() => {
    const handleFocus = () => {
      if (sheetConfig?.sync_enabled) {
        pullFromSheet.mutate();
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [sheetConfig?.sync_enabled, pullFromSheet]);

  return {
    sheetConfig,
    isLoadingConfig,
    isConnected: !!sheetConfig,
    initSheet,
    pushToSheet,
    pullFromSheet,
    syncSheet,
    isSyncing: pushToSheet.isPending || pullFromSheet.isPending || syncSheet.isPending,
  };
}
