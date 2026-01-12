import { ChatMessage } from '@/types/chat';
import { cn } from '@/lib/utils';
import { User, Bot, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

interface ChatMessageItemProps {
  message: ChatMessage;
}

export function ChatMessageItem({ message }: ChatMessageItemProps) {
  const isUser = message.role === 'user';
  const hasWorkflow = message.meta?.runID;
  
  return (
    <div className={cn(
      "flex gap-3",
      isUser && "flex-row-reverse"
    )}>
      <div className={cn(
        "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
        isUser ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
      )}>
        {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
      </div>
      
      <div className={cn(
        "flex-1 max-w-[80%]",
        isUser && "flex flex-col items-end"
      )}>
        <div className={cn(
          "rounded-2xl px-4 py-2.5",
          isUser 
            ? "bg-primary text-primary-foreground rounded-tr-md" 
            : "bg-muted text-foreground rounded-tl-md"
        )}>
          <p className="whitespace-pre-wrap break-words text-sm">
            {message.content}
          </p>
        </div>
        
        {/* Workflow status indicator */}
        {hasWorkflow && (
          <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
            {message.meta?.status === 'in_progress' && (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Processing workflow...</span>
              </>
            )}
            {message.meta?.status === 'completed' && (
              <>
                <CheckCircle className="w-3 h-3 text-green-500" />
                <span>Completed</span>
              </>
            )}
            {message.meta?.status === 'error' && (
              <>
                <AlertCircle className="w-3 h-3 text-destructive" />
                <span>Failed</span>
              </>
            )}
          </div>
        )}
        
        {/* File attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {message.attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="text-xs bg-secondary px-2 py-1 rounded"
              >
                📎 {attachment.name}
              </div>
            ))}
          </div>
        )}
        
        <span className="text-xs text-muted-foreground mt-1">
          {new Date(message.timestamp).toLocaleTimeString()}
        </span>
      </div>
    </div>
  );
}
