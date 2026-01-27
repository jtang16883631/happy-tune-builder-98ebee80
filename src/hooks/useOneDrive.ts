import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface OneDriveTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface OneDriveFile {
  id: string;
  name: string;
  size: number;
  lastModifiedDateTime: string;
  webUrl: string;
  folder?: { childCount: number };
  file?: { mimeType: string };
}

interface OneDriveUser {
  displayName: string;
  mail: string;
  userPrincipalName: string;
}

const STORAGE_KEY = 'onedrive_tokens';
const REDIRECT_URI = window.location.origin + '/';

export function useOneDrive() {
  const [tokens, setTokens] = useState<OneDriveTokens | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [user, setUser] = useState<OneDriveUser | null>(null);
  const { toast } = useToast();

  // Load tokens from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as OneDriveTokens;
        if (parsed.expiresAt > Date.now()) {
          setTokens(parsed);
          setIsConnected(true);
        } else if (parsed.refreshToken) {
          // Token expired, try to refresh
          refreshAccessToken(parsed.refreshToken);
        }
      } catch (e) {
        console.error('Failed to parse stored OneDrive tokens:', e);
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  // Check for OAuth callback code in URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    
    if (code && !tokens) {
      handleOAuthCallback(code);
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
    }
  }, []);

  // Fetch user info when connected
  useEffect(() => {
    if (tokens?.accessToken && !user) {
      getUser();
    }
  }, [tokens]);

  const saveTokens = useCallback((newTokens: OneDriveTokens) => {
    setTokens(newTokens);
    setIsConnected(true);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newTokens));
  }, []);

  const refreshAccessToken = useCallback(async (refreshToken: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('onedrive-auth', {
        body: { action: 'refresh-token', refreshToken },
      });

      if (error) throw error;

      const newTokens: OneDriveTokens = {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiresAt: Date.now() + (data.expiresIn * 1000),
      };
      
      saveTokens(newTokens);
      return newTokens;
    } catch (error) {
      console.error('Failed to refresh token:', error);
      disconnect();
      return null;
    }
  }, []);

  const getValidToken = useCallback(async (): Promise<string | null> => {
    if (!tokens) return null;

    // Check if token needs refresh (5 min buffer)
    if (tokens.expiresAt < Date.now() + 300000) {
      const refreshed = await refreshAccessToken(tokens.refreshToken);
      return refreshed?.accessToken || null;
    }

    return tokens.accessToken;
  }, [tokens, refreshAccessToken]);

  const connect = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('onedrive-auth', {
        body: { action: 'get-auth-url', redirectUri: REDIRECT_URI },
      });

      if (error) throw error;

      // Redirect to Microsoft login
      window.location.href = data.authUrl;
    } catch (error: any) {
      console.error('Failed to initiate OneDrive connection:', error);
      toast({
        title: 'Connection Failed',
        description: error.message || 'Failed to connect to OneDrive',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const handleOAuthCallback = useCallback(async (code: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('onedrive-auth', {
        body: { action: 'exchange-code', code, redirectUri: REDIRECT_URI },
      });

      if (error) throw error;

      const newTokens: OneDriveTokens = {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiresAt: Date.now() + (data.expiresIn * 1000),
      };
      
      saveTokens(newTokens);
      
      toast({
        title: 'Connected!',
        description: 'Successfully connected to OneDrive',
      });
    } catch (error: any) {
      console.error('Failed to complete OneDrive connection:', error);
      toast({
        title: 'Connection Failed',
        description: error.message || 'Failed to complete OneDrive connection',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast, saveTokens]);

  const disconnect = useCallback(() => {
    setTokens(null);
    setIsConnected(false);
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
    toast({
      title: 'Disconnected',
      description: 'OneDrive has been disconnected',
    });
  }, [toast]);

  const getUser = useCallback(async () => {
    const accessToken = await getValidToken();
    if (!accessToken) return null;

    try {
      const { data, error } = await supabase.functions.invoke('onedrive-api', {
        body: { action: 'get-user', accessToken },
      });

      if (error) throw error;
      setUser(data);
      return data as OneDriveUser;
    } catch (error: any) {
      console.error('Failed to get user:', error);
      return null;
    }
  }, [getValidToken]);

  const listFiles = useCallback(async (folderId?: string): Promise<OneDriveFile[]> => {
    const accessToken = await getValidToken();
    if (!accessToken) return [];

    try {
      const { data, error } = await supabase.functions.invoke('onedrive-api', {
        body: { action: 'list-files', accessToken, folderId },
      });

      if (error) throw error;
      return data.value as OneDriveFile[];
    } catch (error: any) {
      console.error('Failed to list files:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to list files',
        variant: 'destructive',
      });
      return [];
    }
  }, [getValidToken, toast]);

  const downloadFile = useCallback(async (fileId: string): Promise<string | null> => {
    const accessToken = await getValidToken();
    if (!accessToken) return null;

    try {
      const { data, error } = await supabase.functions.invoke('onedrive-api', {
        body: { action: 'download-file', accessToken, path: fileId },
      });

      if (error) throw error;
      return data.downloadUrl || data.content;
    } catch (error: any) {
      console.error('Failed to download file:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to download file',
        variant: 'destructive',
      });
      return null;
    }
  }, [getValidToken, toast]);

  const uploadFile = useCallback(async (
    fileName: string, 
    fileContent: string, 
    folderId?: string
  ): Promise<OneDriveFile | null> => {
    const accessToken = await getValidToken();
    if (!accessToken) return null;

    try {
      const { data, error } = await supabase.functions.invoke('onedrive-api', {
        body: { action: 'upload-file', accessToken, fileName, fileContent, folderId },
      });

      if (error) throw error;
      
      toast({
        title: 'Uploaded!',
        description: `${fileName} uploaded successfully`,
      });
      
      return data as OneDriveFile;
    } catch (error: any) {
      console.error('Failed to upload file:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to upload file',
        variant: 'destructive',
      });
      return null;
    }
  }, [getValidToken, toast]);

  const createFolder = useCallback(async (
    folderName: string, 
    parentFolderId?: string
  ): Promise<OneDriveFile | null> => {
    const accessToken = await getValidToken();
    if (!accessToken) return null;

    try {
      const { data, error } = await supabase.functions.invoke('onedrive-api', {
        body: { action: 'create-folder', accessToken, fileName: folderName, folderId: parentFolderId },
      });

      if (error) throw error;
      
      toast({
        title: 'Created!',
        description: `Folder "${folderName}" created`,
      });
      
      return data as OneDriveFile;
    } catch (error: any) {
      console.error('Failed to create folder:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to create folder',
        variant: 'destructive',
      });
      return null;
    }
  }, [getValidToken, toast]);

  const deleteItem = useCallback(async (itemId: string): Promise<boolean> => {
    const accessToken = await getValidToken();
    if (!accessToken) return false;

    try {
      const { error } = await supabase.functions.invoke('onedrive-api', {
        body: { action: 'delete-item', accessToken, path: itemId },
      });

      if (error) throw error;
      
      toast({
        title: 'Deleted',
        description: 'Item deleted successfully',
      });
      
      return true;
    } catch (error: any) {
      console.error('Failed to delete item:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete item',
        variant: 'destructive',
      });
      return false;
    }
  }, [getValidToken, toast]);

  const searchFiles = useCallback(async (query: string): Promise<OneDriveFile[]> => {
    const accessToken = await getValidToken();
    if (!accessToken) return [];

    try {
      const { data, error } = await supabase.functions.invoke('onedrive-api', {
        body: { action: 'search', accessToken, path: query },
      });

      if (error) throw error;
      return data.value as OneDriveFile[];
    } catch (error: any) {
      console.error('Failed to search files:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to search files',
        variant: 'destructive',
      });
      return [];
    }
  }, [getValidToken, toast]);

  return {
    isConnected,
    isLoading,
    user,
    connect,
    disconnect,
    listFiles,
    downloadFile,
    uploadFile,
    createFolder,
    deleteItem,
    searchFiles,
  };
}
