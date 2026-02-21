import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink, Cloud, CloudOff, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function OneDriveWidget() {
  const { data: connectionInfo, isLoading } = useQuery({
    queryKey: ['dashboard-onedrive-status'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('onedrive_company_tokens')
        .select('display_name, email, expires_at')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 60000,
  });

  const isConnected = !!connectionInfo;
  const isExpired = connectionInfo?.expires_at
    ? new Date(connectionInfo.expires_at).getTime() < Date.now()
    : false;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Cloud className="h-5 w-5" />
          OneDrive
        </CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <a href="/#/onedrive" target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4 mr-1" />
            Open
          </a>
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : isConnected ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant={isExpired ? 'destructive' : 'secondary'} className="text-xs">
                {isExpired ? 'Token Expired' : 'Connected'}
              </Badge>
            </div>
            {connectionInfo.display_name && (
              <p className="text-sm font-medium">{connectionInfo.display_name}</p>
            )}
            {connectionInfo.email && (
              <p className="text-xs text-muted-foreground">{connectionInfo.email}</p>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3 py-2">
            <CloudOff className="h-8 w-8 text-muted-foreground opacity-50" />
            <p className="text-sm text-muted-foreground">Not connected</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
