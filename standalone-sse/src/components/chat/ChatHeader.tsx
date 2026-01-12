import { MessageSquare, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatHeaderProps {
  sessionId: string;
  onClearChat: () => void;
}

export function ChatHeader({ sessionId, onClearChat }: ChatHeaderProps) {
  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-background">
      <div className="flex items-center gap-2">
        <MessageSquare className="w-6 h-6 text-primary" />
        <h1 className="text-lg font-semibold">Chat UI</h1>
        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
          SSE
        </span>
      </div>
      
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">
          Session: {sessionId.slice(0, 8)}...
        </span>
        <button
          onClick={onClearChat}
          className={cn(
            "p-2 rounded-lg transition-colors",
            "hover:bg-muted text-muted-foreground hover:text-foreground"
          )}
          title="Clear chat"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
