import { X, File, Image, FileText, FileArchive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FileAttachmentsProps {
  files: File[];
  onRemove: (index: number) => void;
}

function getFileIcon(type: string) {
  if (type.startsWith('image/')) return Image;
  if (type.includes('pdf')) return FileText;
  if (type.includes('zip') || type.includes('archive')) return FileArchive;
  return File;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileAttachments({ files, onRemove }: FileAttachmentsProps) {
  if (files.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 px-4 py-2 border-b border-border">
      {files.map((file, index) => {
        const Icon = getFileIcon(file.type);
        return (
          <div
            key={`${file.name}-${index}`}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg',
              'bg-secondary/50 border border-border',
              'animate-slide-in'
            )}
          >
            <Icon className="w-4 h-4 text-muted-foreground" />
            <div className="flex flex-col">
              <span className="text-xs font-medium text-foreground truncate max-w-[100px]">
                {file.name}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {formatFileSize(file.size)}
              </span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-5 w-5 hover:bg-destructive/20"
              onClick={() => onRemove(index)}
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
