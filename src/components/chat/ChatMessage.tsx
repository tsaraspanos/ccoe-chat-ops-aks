import { ChatMessage as ChatMessageType } from '@/types/chat';
import { User, Bot, Paperclip, Mic } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface ChatMessageProps {
  message: ChatMessageType;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';

  return (
    <div
      className={cn(
        'flex gap-3 animate-fade-in',
        isUser ? 'flex-row-reverse' : 'flex-row'
      )}
    >
      <div
        className={cn(
          'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
          isUser ? 'bg-primary' : 'bg-secondary'
        )}
      >
        {isUser ? (
          <User className="w-4 h-4 text-primary-foreground" />
        ) : (
          <Bot className="w-4 h-4 text-secondary-foreground" />
        )}
      </div>

      <div
        className={cn(
          'flex flex-col max-w-[75%] gap-1',
          isUser ? 'items-end' : 'items-start'
        )}
      >
        <div
          className={cn(
            'px-4 py-3 rounded-2xl',
            isUser
              ? 'bg-user text-user-foreground rounded-br-md'
              : 'bg-assistant text-assistant-foreground rounded-bl-md'
          )}
        >
          {message.content && (
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {message.content}
            </p>
          )}

          {message.attachments && message.attachments.length > 0 && (
            <div className={cn('flex flex-wrap gap-2', message.content && 'mt-2')}>
              {message.attachments.map((attachment) => (
                <div
                  key={attachment.id}
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs',
                    isUser ? 'bg-primary-foreground/10' : 'bg-muted'
                  )}
                >
                  <Paperclip className="w-3 h-3" />
                  <span className="truncate max-w-[120px]">{attachment.name}</span>
                </div>
              ))}
            </div>
          )}

          {message.voiceAttachment && (
            <div
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs',
                message.content && 'mt-2',
                isUser ? 'bg-primary-foreground/10' : 'bg-muted'
              )}
            >
              <Mic className="w-3 h-3" />
              <span>Voice message</span>
            </div>
          )}
        </div>

        <span className="text-[10px] text-muted-foreground px-1">
          {format(message.timestamp, 'HH:mm')}
        </span>
      </div>
    </div>
  );
}
