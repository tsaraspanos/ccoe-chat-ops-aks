import { useRef, useEffect } from 'react';
import { ChatMessage } from '@/types/chat';
import { ChatMessageItem } from './ChatMessage';
import { TypingIndicator } from './TypingIndicator';

interface ChatMessagesProps {
  messages: ChatMessage[];
  isLoading: boolean;
}

export function ChatMessages({ messages, isLoading }: ChatMessagesProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.length === 0 && !isLoading && (
        <div className="flex items-center justify-center h-full text-muted-foreground">
          <div className="text-center">
            <p className="text-lg font-medium mb-2">Welcome to Chat UI</p>
            <p className="text-sm">Send a message to get started</p>
          </div>
        </div>
      )}
      
      {messages.map((message) => (
        <ChatMessageItem key={message.id} message={message} />
      ))}
      
      {isLoading && <TypingIndicator />}
      
      <div ref={bottomRef} />
    </div>
  );
}
