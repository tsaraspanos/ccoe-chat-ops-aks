import { Bot } from 'lucide-react';

export function TypingIndicator() {
  return (
    <div className="flex gap-3 animate-fade-in">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
        <Bot className="w-4 h-4 text-secondary-foreground" />
      </div>
      <div className="bg-assistant text-assistant-foreground px-4 py-3 rounded-2xl rounded-bl-md">
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-muted-foreground">Assistant is thinking</span>
          <div className="flex gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-typing" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-typing" style={{ animationDelay: '200ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-typing" style={{ animationDelay: '400ms' }} />
          </div>
        </div>
      </div>
    </div>
  );
}
