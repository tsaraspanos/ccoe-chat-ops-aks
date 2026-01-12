import { useChat } from '@/hooks/useChat';
import { ChatHeader } from './ChatHeader';
import { ChatMessages } from './ChatMessages';
import { ChatInput } from './ChatInput';
import { useEffect } from 'react';
import { toast } from 'sonner';

export function ChatContainer() {
  const { messages, isLoading, error, sessionId, sendMessage, clearChat, clearError } = useChat();

  useEffect(() => {
    if (error) {
      toast.error(error);
      clearError();
    }
  }, [error, clearError]);

  return (
    <div className="flex flex-col h-screen max-w-3xl mx-auto bg-background">
      <ChatHeader sessionId={sessionId} onClearChat={clearChat} />
      <ChatMessages messages={messages} isLoading={isLoading} />
      <ChatInput onSend={sendMessage} disabled={isLoading} />
    </div>
  );
}
