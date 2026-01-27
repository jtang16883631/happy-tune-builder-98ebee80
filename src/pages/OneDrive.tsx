import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useOneDrive } from "@/hooks/useOneDrive";
import { 
  Cloud, 
  CloudOff, 
  Folder, 
  File, 
  ArrowLeft, 
  RefreshCw, 
  Search, 
  Download,
  Upload,
  Loader2,
  FolderPlus,
  Home
} from "lucide-react";
import { format } from "date-fns";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface OneDriveItem {
  id: string;
  name: string;
  folder?: { childCount: number };
  file?: { mimeType: string };
  size?: number;
  lastModifiedDateTime?: string;
  webUrl?: string;
}

interface BreadcrumbItem {
  id: string | null;
  name: string;
}

export default function OneDrive() {
  const { toast } = useToast();
  const { 
    isConnected, 
    isLoading: isConnecting, 
    user: oneDriveUser, 
    connect, 
    disconnect,
    listFiles,
    downloadFile
  } = useOneDrive();

  const [files, setFiles] = useState<OneDriveItem[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([{ id: null, name: "My Drive" }]);
  const [searchQuery, setSearchQuery] = useState("");

  const loadFiles = async (folderId: string | null = null) => {
    if (!isConnected) return;
    
    setIsLoadingFiles(true);
    try {
      const result = await listFiles(folderId || undefined);
      if (result) {
        setFiles(result);
      }
    } catch (error) {
      console.error("Failed to load files:", error);
      toast({
        title: "Error",
        description: "Failed to load files from OneDrive",
        variant: "destructive",
      });
    } finally {
      setIsLoadingFiles(false);
    }
  };

  useEffect(() => {
    if (isConnected) {
      loadFiles(currentFolderId);
    }
  }, [isConnected, currentFolderId]);

  const handleFolderClick = (folder: OneDriveItem) => {
    setCurrentFolderId(folder.id);
    setBreadcrumbs(prev => [...prev, { id: folder.id, name: folder.name }]);
  };

  const handleBreadcrumbClick = (index: number) => {
    const item = breadcrumbs[index];
    setCurrentFolderId(item.id);
    setBreadcrumbs(breadcrumbs.slice(0, index + 1));
  };

  const handleDownload = async (file: OneDriveItem) => {
    try {
      const url = await downloadFile(file.id);
      if (url) {
        window.open(url, '_blank');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to download file",
        variant: "destructive",
      });
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "-";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  const filteredFiles = files.filter(file => 
    file.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Not connected state
  if (!isConnected) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted mb-6">
            <CloudOff className="h-10 w-10 text-muted-foreground" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Connect to OneDrive</h1>
          <p className="text-muted-foreground mb-6 max-w-md">
            Connect your Microsoft OneDrive account to browse and manage your files directly from the portal.
          </p>
          <Button onClick={connect} disabled={isConnecting} size="lg">
            {isConnecting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <Cloud className="mr-2 h-4 w-4" />
                Connect OneDrive
              </>
            )}
          </Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">OneDrive Files</h1>
            <p className="text-muted-foreground">
              Browse and manage your OneDrive files
              {oneDriveUser && ` • ${oneDriveUser.displayName}`}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={disconnect}>
            <CloudOff className="mr-2 h-4 w-4" />
            Disconnect
          </Button>
        </div>

        {/* Toolbar */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              {/* Breadcrumbs */}
              <Breadcrumb className="flex-1">
                <BreadcrumbList>
                  {breadcrumbs.map((crumb, index) => (
                    <BreadcrumbItem key={crumb.id || 'root'}>
                      {index === breadcrumbs.length - 1 ? (
                        <BreadcrumbPage className="flex items-center gap-1">
                          {index === 0 && <Home className="h-3.5 w-3.5" />}
                          {crumb.name}
                        </BreadcrumbPage>
                      ) : (
                        <>
                          <BreadcrumbLink 
                            className="flex items-center gap-1 cursor-pointer hover:text-foreground"
                            onClick={() => handleBreadcrumbClick(index)}
                          >
                            {index === 0 && <Home className="h-3.5 w-3.5" />}
                            {crumb.name}
                          </BreadcrumbLink>
                          <BreadcrumbSeparator />
                        </>
                      )}
                    </BreadcrumbItem>
                  ))}
                </BreadcrumbList>
              </Breadcrumb>

              {/* Search & Actions */}
              <div className="flex gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search files..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 w-48"
                  />
                </div>
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={() => loadFiles(currentFolderId)}
                  disabled={isLoadingFiles}
                >
                  <RefreshCw className={`h-4 w-4 ${isLoadingFiles ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* File List */}
        <Card>
          <CardContent className="p-0">
            {isLoadingFiles ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredFiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Folder className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  {searchQuery ? "No files match your search" : "This folder is empty"}
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50%]">Name</TableHead>
                    <TableHead>Modified</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredFiles.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div 
                          className={`flex items-center gap-2 ${item.folder ? 'cursor-pointer hover:text-primary' : ''}`}
                          onClick={() => item.folder && handleFolderClick(item)}
                        >
                          {item.folder ? (
                            <Folder className="h-5 w-5 text-primary" />
                          ) : (
                            <File className="h-5 w-5 text-muted-foreground" />
                          )}
                          <span className="font-medium">{item.name}</span>
                          {item.folder && (
                            <span className="text-xs text-muted-foreground">
                              ({item.folder.childCount} items)
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {item.lastModifiedDateTime 
                          ? format(new Date(item.lastModifiedDateTime), "MMM d, yyyy")
                          : "-"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {item.folder ? "-" : formatFileSize(item.size)}
                      </TableCell>
                      <TableCell>
                        {item.file && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDownload(item)}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
