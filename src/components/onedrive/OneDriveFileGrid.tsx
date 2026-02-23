import { File, Folder, FileImage, FileText, FileSpreadsheet, FileVideo, FileAudio, MoreVertical, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { OneDriveItem } from "./types";

interface OneDriveFileGridProps {
  files: OneDriveItem[];
  viewMode: "grid" | "list";
  selectedFile: OneDriveItem | null;
  onFolderClick: (folder: OneDriveItem) => void;
  onFileSelect: (file: OneDriveItem) => void;
  onDownload: (file: OneDriveItem) => void;
  onDelete?: (item: OneDriveItem) => void;
}

const getFileIcon = (item: OneDriveItem) => {
  if (item.folder) {
    return <Folder className="h-10 w-10 text-[#dcb67a]" fill="#dcb67a" />;
  }
  
  const mimeType = item.file?.mimeType || "";
  const name = item.name.toLowerCase();
  
  if (mimeType.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|svg)$/.test(name)) {
    return <FileImage className="h-10 w-10 text-[#69afe5]" />;
  }
  if (mimeType.includes("spreadsheet") || /\.(xlsx?|csv)$/.test(name)) {
    return <FileSpreadsheet className="h-10 w-10 text-[#21a366]" />;
  }
  if (mimeType.includes("document") || mimeType.includes("word") || /\.(docx?|txt|rtf)$/.test(name)) {
    return <FileText className="h-10 w-10 text-[#2b579a]" />;
  }
  if (mimeType.startsWith("video/") || /\.(mp4|mov|avi|mkv)$/.test(name)) {
    return <FileVideo className="h-10 w-10 text-[#b4009e]" />;
  }
  if (mimeType.startsWith("audio/") || /\.(mp3|wav|flac)$/.test(name)) {
    return <FileAudio className="h-10 w-10 text-[#ff8c00]" />;
  }
  if (mimeType.includes("pdf") || name.endsWith(".pdf")) {
    return <FileText className="h-10 w-10 text-[#d13438]" />;
  }
  
  return <File className="h-10 w-10 text-muted-foreground" />;
};

const formatFileSize = (bytes?: number) => {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

export function OneDriveFileGrid({
  files,
  viewMode,
  selectedFile,
  onFolderClick,
  onFileSelect,
  onDownload,
  onDelete,
}: OneDriveFileGridProps) {
  if (viewMode === "grid") {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 p-4">
        {files.map((item) => (
          <div
            key={item.id}
            className={cn(
              "group relative flex flex-col items-center p-3 rounded-lg cursor-pointer transition-all hover:bg-accent",
              selectedFile?.id === item.id && "bg-accent ring-2 ring-primary"
            )}
            onClick={() => item.folder ? onFolderClick(item) : onFileSelect(item)}
            onDoubleClick={() => item.folder ? onFolderClick(item) : onDownload(item)}
          >
            <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => e.stopPropagation()}>
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {!item.folder && (
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDownload(item); }}>
                      Download
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onFileSelect(item); }}>
                    Details
                  </DropdownMenuItem>
                  {onDelete && (
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={(e) => { e.stopPropagation(); onDelete(item); }}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            
            <div className="w-16 h-16 flex items-center justify-center mb-2">
              {getFileIcon(item)}
            </div>
            
            <span className="text-sm text-center truncate w-full" title={item.name}>
              {item.name}
            </span>
            
            {item.folder && (
              <span className="text-xs text-muted-foreground">
                {item.folder.childCount} items
              </span>
            )}
          </div>
        ))}
      </div>
    );
  }

  // List view
  return (
    <div className="divide-y">
      {files.map((item) => (
        <div
          key={item.id}
          className={cn(
            "group flex items-center gap-4 px-4 py-2 cursor-pointer transition-all hover:bg-accent",
            selectedFile?.id === item.id && "bg-accent"
          )}
          onClick={() => item.folder ? onFolderClick(item) : onFileSelect(item)}
          onDoubleClick={() => item.folder ? onFolderClick(item) : onDownload(item)}
        >
          <div className="flex-shrink-0">
            {getFileIcon(item)}
          </div>
          
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{item.name}</p>
            {item.folder && (
              <p className="text-xs text-muted-foreground">{item.folder.childCount} items</p>
            )}
          </div>
          
          <div className="hidden sm:block text-sm text-muted-foreground w-32">
            {item.lastModifiedDateTime 
              ? format(new Date(item.lastModifiedDateTime), "MMM d, yyyy")
              : ""}
          </div>
          
          <div className="hidden sm:block text-sm text-muted-foreground w-20 text-right">
            {!item.folder && formatFileSize(item.size)}
          </div>
          
          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.stopPropagation()}>
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {!item.folder && (
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDownload(item); }}>
                    Download
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onFileSelect(item); }}>
                  Details
                </DropdownMenuItem>
                {onDelete && (
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={(e) => { e.stopPropagation(); onDelete(item); }}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      ))}
    </div>
  );
}
