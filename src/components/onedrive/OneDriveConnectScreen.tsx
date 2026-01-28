import { Cloud, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

interface OneDriveConnectScreenProps {
  isConnecting: boolean;
  canManage: boolean;
  onConnect: () => void;
}

export function OneDriveConnectScreen({ isConnecting, canManage, onConnect }: OneDriveConnectScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#0078d4] to-[#005a9e] flex items-center justify-center mb-6">
        <Cloud className="h-12 w-12 text-white" />
      </div>
      <h1 className="text-3xl font-bold mb-2">Company OneDrive</h1>
      <p className="text-muted-foreground mb-8 max-w-md">
        {canManage 
          ? "Connect your company's Microsoft OneDrive account. All employees will be able to browse, preview, and download files."
          : "Company OneDrive is not connected yet. Please contact an administrator to set it up."
        }
      </p>
      {canManage ? (
        <Button 
          onClick={onConnect} 
          disabled={isConnecting} 
          size="lg"
          className="bg-[#0078d4] hover:bg-[#005a9e] text-white"
        >
          {isConnecting ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Connecting...
            </>
          ) : (
            <>
              <Cloud className="mr-2 h-5 w-5" />
              Sign in with Microsoft
            </>
          )}
        </Button>
      ) : (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Lock className="h-5 w-5" />
          <span>Administrator permission required to connect OneDrive</span>
        </div>
      )}
    </div>
  );
}
