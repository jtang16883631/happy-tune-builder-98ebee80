import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useToast } from "@/hooks/use-toast";
import { useOneDrive } from "@/hooks/useOneDrive";
import { CloudOff, Cloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OneDriveToolbar } from "@/components/onedrive/OneDriveToolbar";
import { OneDriveFileGrid } from "@/components/onedrive/OneDriveFileGrid";
import { OneDrivePreviewPanel } from "@/components/onedrive/OneDrivePreviewPanel";
import { OneDriveEmptyState } from "@/components/onedrive/OneDriveEmptyState";
import { OneDriveConnectScreen } from "@/components/onedrive/OneDriveConnectScreen";
import { OneDriveItem, BreadcrumbItem } from "@/components/onedrive/types";

export default function OneDrive() {
  const { toast } = useToast();
  const { 
    isConnected, 
    isLoading: isConnecting, 
    user: oneDriveUser, 
    canManage,
    connect, 
    disconnect,
    listFiles,
    downloadFile
  } = useOneDrive();

  const [files, setFiles] = useState<OneDriveItem[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([{ id: null, name: "My files" }]);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedFile, setSelectedFile] = useState<OneDriveItem | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const loadFiles = async (folderId: string | null = null) => {
    if (!isConnected) return;
    
    setIsLoadingFiles(true);
    try {
      const result = await listFiles(folderId || undefined);
      if (result) {
        setFiles(result as OneDriveItem[]);
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

  // Load preview when file is selected
  useEffect(() => {
    const loadPreview = async () => {
      if (!selectedFile || selectedFile.folder) {
        setPreviewUrl(null);
        return;
      }

      const mimeType = selectedFile.file?.mimeType || "";
      const name = selectedFile.name.toLowerCase();
      const isImage = mimeType.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|svg)$/.test(name);

      if (isImage) {
        setIsLoadingPreview(true);
        try {
          const url = await downloadFile(selectedFile.id);
          setPreviewUrl(url);
        } catch (error) {
          console.error("Failed to load preview:", error);
        } finally {
          setIsLoadingPreview(false);
        }
      } else {
        setPreviewUrl(null);
      }
    };

    loadPreview();
  }, [selectedFile]);

  const handleFolderClick = (folder: OneDriveItem) => {
    setCurrentFolderId(folder.id);
    setBreadcrumbs(prev => [...prev, { id: folder.id, name: folder.name }]);
    setSelectedFile(null);
  };

  const handleBreadcrumbClick = (index: number) => {
    const item = breadcrumbs[index];
    setCurrentFolderId(item.id);
    setBreadcrumbs(breadcrumbs.slice(0, index + 1));
    setSelectedFile(null);
  };

  const handleFileSelect = (file: OneDriveItem) => {
    setSelectedFile(file);
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

  const filteredFiles = files.filter(file => 
    file.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Not connected state
  if (!isConnected) {
    return (
      <AppLayout>
        <OneDriveConnectScreen isConnecting={isConnecting} canManage={canManage} onConnect={connect} />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-4rem)]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-background">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-[#0078d4] flex items-center justify-center">
              <Cloud className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">OneDrive</h1>
              {oneDriveUser && (
                <p className="text-xs text-muted-foreground">{oneDriveUser.displayName}</p>
              )}
            </div>
          </div>
          {canManage && (
            <Button variant="ghost" size="sm" onClick={disconnect} className="text-muted-foreground">
              <CloudOff className="mr-2 h-4 w-4" />
              Disconnect
            </Button>
          )}
        </div>

        {/* Toolbar */}
        <OneDriveToolbar
          breadcrumbs={breadcrumbs}
          searchQuery={searchQuery}
          viewMode={viewMode}
          isLoadingFiles={isLoadingFiles}
          onBreadcrumbClick={handleBreadcrumbClick}
          onSearchChange={setSearchQuery}
          onViewModeChange={setViewMode}
          onRefresh={() => loadFiles(currentFolderId)}
        />

        {/* Main Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* File Area */}
          <div className="flex-1 overflow-auto bg-background">
            {isLoadingFiles || filteredFiles.length === 0 ? (
              <OneDriveEmptyState 
                isLoading={isLoadingFiles} 
                hasSearchQuery={searchQuery.length > 0} 
              />
            ) : (
              <OneDriveFileGrid
                files={filteredFiles}
                viewMode={viewMode}
                selectedFile={selectedFile}
                onFolderClick={handleFolderClick}
                onFileSelect={handleFileSelect}
                onDownload={handleDownload}
              />
            )}
          </div>

          {/* Preview Panel */}
          {selectedFile && (
            <OneDrivePreviewPanel
              item={selectedFile}
              previewUrl={previewUrl}
              isLoadingPreview={isLoadingPreview}
              onClose={() => setSelectedFile(null)}
              onDownload={handleDownload}
            />
          )}
        </div>
      </div>
    </AppLayout>
  );
}
