import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { useToast } from "@/hooks/use-toast";
import { useOneDrive } from "@/hooks/useOneDrive";
import { CloudOff, Cloud, FolderPlus, Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { OneDriveToolbar } from "@/components/onedrive/OneDriveToolbar";
import { OneDriveFileGrid } from "@/components/onedrive/OneDriveFileGrid";
import { OneDrivePreviewPanel } from "@/components/onedrive/OneDrivePreviewPanel";
import { OneDriveEmptyState } from "@/components/onedrive/OneDriveEmptyState";
import { OneDriveConnectScreen } from "@/components/onedrive/OneDriveConnectScreen";
import { OneDriveItem, BreadcrumbItem } from "@/components/onedrive/types";

const BREADCRUMBS_STORAGE_KEY = "onedrive_breadcrumbs";

export default function OneDrive() {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const { 
    isConnected, 
    isLoading: isConnecting, 
    user: oneDriveUser, 
    canManage,
    connect, 
    disconnect,
    listFiles,
    downloadFile,
    uploadFile,
    createFolder,
    deleteItem,
  } = useOneDrive();

  // Initialize state from URL params and sessionStorage
  const initialFolderId = searchParams.get("folder");
  const [files, setFiles] = useState<OneDriveItem[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(initialFolderId);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>(() => {
    // Try to restore breadcrumbs from sessionStorage
    const saved = sessionStorage.getItem(BREADCRUMBS_STORAGE_KEY);
    if (saved && initialFolderId) {
      try {
        const parsed = JSON.parse(saved) as BreadcrumbItem[];
        // Verify the saved breadcrumbs match the current folder
        if (parsed.length > 0 && parsed[parsed.length - 1].id === initialFolderId) {
          return parsed;
        }
      } catch (e) {
        // Ignore parse errors
      }
    }
    return [{ id: null, name: "My files" }];
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode] = useState<"grid" | "list">("list");
  const [selectedFile, setSelectedFile] = useState<OneDriveItem | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    setIsCreatingFolder(true);
    try {
      await createFolder(newFolderName.trim(), currentFolderId || undefined);
      setShowNewFolderDialog(false);
      setNewFolderName("");
      loadFiles(currentFolderId);
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const handleUploadFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    setIsUploading(true);
    try {
      for (const file of Array.from(fileList)) {
        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve, reject) => {
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1]); // strip data:...;base64,
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        await uploadFile(file.name, base64, currentFolderId || undefined);
      }
      loadFiles(currentFolderId);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };
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

  // Update URL and sessionStorage when folder changes
  const updateFolderState = useCallback((folderId: string | null, newBreadcrumbs: BreadcrumbItem[]) => {
    // Update URL params
    if (folderId) {
      setSearchParams({ folder: folderId });
    } else {
      setSearchParams({});
    }
    // Persist breadcrumbs to sessionStorage
    sessionStorage.setItem(BREADCRUMBS_STORAGE_KEY, JSON.stringify(newBreadcrumbs));
  }, [setSearchParams]);

  const handleFolderClick = (folder: OneDriveItem) => {
    const newBreadcrumbs = [...breadcrumbs, { id: folder.id, name: folder.name }];
    setCurrentFolderId(folder.id);
    setBreadcrumbs(newBreadcrumbs);
    setSelectedFile(null);
    updateFolderState(folder.id, newBreadcrumbs);
  };

  const handleBreadcrumbClick = (index: number) => {
    const item = breadcrumbs[index];
    const newBreadcrumbs = breadcrumbs.slice(0, index + 1);
    setCurrentFolderId(item.id);
    setBreadcrumbs(newBreadcrumbs);
    setSelectedFile(null);
    updateFolderState(item.id, newBreadcrumbs);
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

  const handleDelete = async (item: OneDriveItem) => {
    const confirmed = window.confirm(`Are you sure you want to delete "${item.name}"?${item.folder ? ' This will delete all contents inside.' : ''}`);
    if (!confirmed) return;

    const success = await deleteItem(item.id);
    if (success) {
      if (selectedFile?.id === item.id) setSelectedFile(null);
      loadFiles(currentFolderId);
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
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowNewFolderDialog(true)}>
              <FolderPlus className="mr-1.5 h-4 w-4" />
              New Folder
            </Button>
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
              {isUploading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}
              Upload
            </Button>
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleUploadFiles} />
            {canManage && (
              <Button variant="ghost" size="sm" onClick={disconnect} className="text-muted-foreground">
                <CloudOff className="mr-2 h-4 w-4" />
                Disconnect
              </Button>
            )}
          </div>
        </div>

        {/* Toolbar */}
        <OneDriveToolbar
          breadcrumbs={breadcrumbs}
          searchQuery={searchQuery}
          viewMode={viewMode}
          isLoadingFiles={isLoadingFiles}
          onBreadcrumbClick={handleBreadcrumbClick}
          onSearchChange={setSearchQuery}
          onViewModeChange={() => {}}
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
                onDelete={handleDelete}
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

      {/* New Folder Dialog */}
      <Dialog open={showNewFolderDialog} onOpenChange={setShowNewFolderDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Folder</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Folder name"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewFolderDialog(false)}>Cancel</Button>
            <Button onClick={handleCreateFolder} disabled={!newFolderName.trim() || isCreatingFolder}>
              {isCreatingFolder ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
