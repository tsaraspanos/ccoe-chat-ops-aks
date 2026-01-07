import { useChat } from '@/hooks/useChat';
import { ChatHeader } from './ChatHeader';
import { ChatMessages } from './ChatMessages';
import { ChatInput } from './ChatInput';
import { useToast } from '@/hooks/use-toast';
import { useEffect } from 'react';

export function ChatContainer() {
  const { messages, isLoading, error, sessionId, sendMessage, clearChat, clearError } = useChat();
  const { toast } = useToast();

  useEffect(() => {
    if (error) {
      toast({
        title: 'Error',
        description: error,
        variant: 'destructive',
      });
      clearError();
    }
  }, [error, toast, clearError]);

  return (
    <div className="flex flex-col h-screen max-w-3xl mx-auto bg-background">
      <ChatHeader sessionId={sessionId} onClearChat={clearChat} />
      <ChatMessages messages={messages} isLoading={isLoading} />
      <ChatInput onSend={sendMessage} disabled={isLoading} />
    </div>
  );
}
