import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

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

interface CompanyTokenRecord {
  id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  display_name: string | null;
  email: string | null;
  connected_by: string | null;
}

const REDIRECT_URI = window.location.origin + '/';

export function useOneDrive() {
  const [tokens, setTokens] = useState<OneDriveTokens | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<OneDriveUser | null>(null);
  const [canManage, setCanManage] = useState(false);
  const { toast } = useToast();
  const { user: authUser } = useAuth();

  // Check if current user can manage OneDrive connection (privileged users only)
  const checkCanManage = useCallback(async () => {
    if (!authUser) {
      setCanManage(false);
      return;
    }
    
    const { data, error } = await supabase.rpc('is_privileged', { _user_id: authUser.id });
    if (!error && data) {
      setCanManage(true);
    } else {
      setCanManage(false);
    }
  }, [authUser]);

  // Load company tokens from database
  const loadCompanyTokens = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('onedrive_company_tokens')
        .select('*')
        .limit(1)
        .single();

      if (error) {
        if (error.code !== 'PGRST116') { // Not found is ok
          console.error('Failed to load company OneDrive tokens:', error);
        }
        setIsConnected(false);
        setTokens(null);
        setUser(null);
        return;
      }

      if (data) {
        const record = data as CompanyTokenRecord;
        const expiresAt = new Date(record.expires_at).getTime();
        
        // Check if token is expired
        if (expiresAt < Date.now()) {
          // Try to refresh
          const refreshed = await refreshAccessToken(record.refresh_token, record.id);
          if (!refreshed) {
            setIsConnected(false);
            return;
          }
        } else {
          setTokens({
            accessToken: record.access_token,
            refreshToken: record.refresh_token,
            expiresAt,
          });
          setIsConnected(true);
          
          if (record.display_name || record.email) {
            setUser({
              displayName: record.display_name || '',
              mail: record.email || '',
              userPrincipalName: record.email || '',
            });
          }
        }
      }
    } catch (e) {
      console.error('Error loading company tokens:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Check for OAuth callback code in URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    
    if (code && !tokens && canManage) {
      handleOAuthCallback(code);
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
    }
  }, [tokens, canManage]);

  // Load on mount and when auth changes
  useEffect(() => {
    if (authUser) {
      loadCompanyTokens();
      checkCanManage();
    } else {
      setIsConnected(false);
      setTokens(null);
      setUser(null);
      setIsLoading(false);
    }
  }, [authUser, loadCompanyTokens, checkCanManage]);

  // Fetch user info when connected but no user data
  useEffect(() => {
    if (tokens?.accessToken && !user) {
      getUser();
    }
  }, [tokens]);

  const saveTokensToDatabase = useCallback(async (
    newTokens: OneDriveTokens,
    userInfo?: OneDriveUser,
    existingId?: string
  ) => {
    const tokenData = {
      access_token: newTokens.accessToken,
      refresh_token: newTokens.refreshToken,
      expires_at: new Date(newTokens.expiresAt).toISOString(),
      display_name: userInfo?.displayName || null,
      email: userInfo?.mail || userInfo?.userPrincipalName || null,
      connected_by: authUser?.id || null,
    };

    if (existingId) {
      // Update existing record
      const { error } = await supabase
        .from('onedrive_company_tokens')
        .update(tokenData)
        .eq('id', existingId);
      
      if (error) throw error;
    } else {
      // Delete any existing and insert new
      await supabase.from('onedrive_company_tokens').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      
      const { error } = await supabase
        .from('onedrive_company_tokens')
        .insert(tokenData);
      
      if (error) throw error;
    }

    setTokens(newTokens);
    setIsConnected(true);
    if (userInfo) setUser(userInfo);
  }, [authUser]);

  const refreshAccessToken = useCallback(async (refreshToken: string, recordId?: string): Promise<OneDriveTokens | null> => {
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
      
      // Save to database
      await saveTokensToDatabase(newTokens, user || undefined, recordId);
      
      return newTokens;
    } catch (error) {
      console.error('Failed to refresh token:', error);
      return null;
    }
  }, [user, saveTokensToDatabase]);

  const getValidToken = useCallback(async (): Promise<string | null> => {
    if (!tokens) return null;

    // Check if token needs refresh (5 min buffer)
    if (tokens.expiresAt < Date.now() + 300000) {
      // Get record ID for update
      const { data } = await supabase
        .from('onedrive_company_tokens')
        .select('id')
        .limit(1)
        .single();
      
      const refreshed = await refreshAccessToken(tokens.refreshToken, data?.id);
      return refreshed?.accessToken || null;
    }

    return tokens.accessToken;
  }, [tokens, refreshAccessToken]);

  const connect = useCallback(async () => {
    if (!canManage) {
      toast({
        title: '权限不足',
        description: '只有管理员可以连接公司OneDrive',
        variant: 'destructive',
      });
      return;
    }

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
        title: '连接失败',
        description: error.message || 'Failed to connect to OneDrive',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast, canManage]);

  const handleOAuthCallback = useCallback(async (code: string) => {
    if (!canManage) return;
    
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
      
      // Get user info first
      const userInfo = await fetchUserInfo(newTokens.accessToken);
      
      // Save to database
      await saveTokensToDatabase(newTokens, userInfo);
      
      toast({
        title: '连接成功!',
        description: '公司OneDrive已连接，所有员工现在可以访问',
      });
    } catch (error: any) {
      console.error('Failed to complete OneDrive connection:', error);
      toast({
        title: '连接失败',
        description: error.message || 'Failed to complete OneDrive connection',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast, saveTokensToDatabase, canManage]);

  const fetchUserInfo = async (accessToken: string): Promise<OneDriveUser | undefined> => {
    try {
      const { data, error } = await supabase.functions.invoke('onedrive-api', {
        body: { action: 'get-user', accessToken },
      });
      if (error) throw error;
      return data as OneDriveUser;
    } catch (e) {
      console.error('Failed to fetch user info:', e);
      return undefined;
    }
  };

  const disconnect = useCallback(async () => {
    if (!canManage) {
      toast({
        title: '权限不足',
        description: '只有管理员可以断开公司OneDrive连接',
        variant: 'destructive',
      });
      return;
    }

    try {
      // Delete from database
      const { error } = await supabase
        .from('onedrive_company_tokens')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
      
      if (error) throw error;
      
      setTokens(null);
      setIsConnected(false);
      setUser(null);
      
      toast({
        title: '已断开连接',
        description: '公司OneDrive已断开连接',
      });
    } catch (error: any) {
      console.error('Failed to disconnect:', error);
      toast({
        title: '断开失败',
        description: error.message || 'Failed to disconnect OneDrive',
        variant: 'destructive',
      });
    }
  }, [toast, canManage]);

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
    canManage,
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
