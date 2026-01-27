import { X, Download, ExternalLink, File, Folder, FileImage, FileText, FileSpreadsheet, Calendar, HardDrive, Eye } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { OneDriveItem } from "./types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState } from "react";

interface OneDrivePreviewPanelProps {
  item: OneDriveItem;
  previewUrl: string | null;
  isLoadingPreview: boolean;
  onClose: () => void;
  onDownload: (item: OneDriveItem) => void;
}

const formatFileSize = (bytes?: number) => {
  if (!bytes) return "Unknown";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

const getFileIcon = (item: OneDriveItem) => {
  if (item.folder) {
    return <Folder className="h-12 w-12 text-[#dcb67a]" fill="#dcb67a" />;
  }
  
  const mimeType = item.file?.mimeType || "";
  const name = item.name.toLowerCase();
  
  if (mimeType.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|svg)$/.test(name)) {
    return <FileImage className="h-12 w-12 text-[#69afe5]" />;
  }
  if (mimeType.includes("spreadsheet") || /\.(xlsx?|csv)$/.test(name)) {
    return <FileSpreadsheet className="h-12 w-12 text-[#21a366]" />;
  }
  if (mimeType.includes("document") || mimeType.includes("word") || /\.(docx?|txt|rtf)$/.test(name)) {
    return <FileText className="h-12 w-12 text-[#2b579a]" />;
  }
  if (mimeType.includes("pdf") || name.endsWith(".pdf")) {
    return <FileText className="h-12 w-12 text-[#d13438]" />;
  }
  
  return <File className="h-12 w-12 text-muted-foreground" />;
};

const isPreviewableImage = (item: OneDriveItem) => {
  const mimeType = item.file?.mimeType || "";
  const name = item.name.toLowerCase();
  return mimeType.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|svg)$/.test(name);
};

const isOfficeFile = (item: OneDriveItem) => {
  const name = item.name.toLowerCase();
  return /\.(xlsx?|docx?|pptx?|csv)$/.test(name);
};

const getOfficePreviewUrl = (webUrl: string) => {
  // OneDrive webUrl already points to Office Online viewer
  return webUrl;
};

export function OneDrivePreviewPanel({
  item,
  previewUrl,
  isLoadingPreview,
  onClose,
  onDownload,
}: OneDrivePreviewPanelProps) {
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const canPreviewInOffice = isOfficeFile(item) && item.webUrl;

  const handlePreviewClick = () => {
    if (item.webUrl) {
      // Open in new window for Office Online preview
      window.open(item.webUrl, '_blank', 'width=1200,height=800,menubar=no,toolbar=no');
    }
  };

  return (
    <div className="w-80 border-l bg-background flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <h3 className="font-semibold truncate flex-1" title={item.name}>
          {item.name}
        </h3>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Preview Area */}
      <div className="flex-1 overflow-auto">
        <div className="p-4">
          {/* Thumbnail/Icon */}
          <div className="aspect-video bg-muted rounded-lg flex items-center justify-center mb-4 overflow-hidden">
            {isLoadingPreview ? (
              <div className="animate-pulse bg-muted-foreground/20 w-full h-full" />
            ) : previewUrl && isPreviewableImage(item) ? (
              <img 
                src={previewUrl} 
                alt={item.name}
                className="max-w-full max-h-full object-contain"
              />
            ) : (
              getFileIcon(item)
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2 mb-4">
            {/* Preview button for Office files */}
            {canPreviewInOffice && (
              <Button 
                variant="default" 
                className="w-full bg-[#0078d4] hover:bg-[#106ebe]"
                onClick={handlePreviewClick}
              >
                <Eye className="h-4 w-4 mr-2" />
                Preview in Office Online
              </Button>
            )}
            
            <div className="flex gap-2">
              {!item.folder && (
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => onDownload(item)}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
              )}
              {item.webUrl && (
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={() => window.open(item.webUrl, '_blank')}
                  title="Open in OneDrive"
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          <Separator className="my-4" />

          {/* File Details */}
          <div className="space-y-4">
            <h4 className="font-medium text-sm">Details</h4>
            
            {item.folder ? (
              <div className="flex items-center gap-3 text-sm">
                <Folder className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-muted-foreground">Contains</p>
                  <p>{item.folder.childCount} items</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 text-sm">
                <HardDrive className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-muted-foreground">Size</p>
                  <p>{formatFileSize(item.size)}</p>
                </div>
              </div>
            )}

            {item.lastModifiedDateTime && (
              <div className="flex items-center gap-3 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-muted-foreground">Modified</p>
                  <p>{format(new Date(item.lastModifiedDateTime), "MMM d, yyyy 'at' h:mm a")}</p>
                </div>
              </div>
            )}

            {item.file?.mimeType && (
              <div className="flex items-center gap-3 text-sm">
                <File className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-muted-foreground">Type</p>
                  <p className="break-all">{item.file.mimeType}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
