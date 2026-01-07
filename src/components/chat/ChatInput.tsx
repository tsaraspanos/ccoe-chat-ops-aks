import { useState, useRef, KeyboardEvent } from 'react';
import { Send, Paperclip } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { VoiceRecorder } from './VoiceRecorder';
import { FileAttachments } from './FileAttachments';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';
import { cn } from '@/lib/utils';

interface ChatInputProps {
  onSend: (message: string, files?: File[], voice?: Blob) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const {
    isRecording,
    recordingDuration,
    audioBlob,
    startRecording,
    stopRecording,
    clearRecording,
  } = useVoiceRecorder();

  const canSend = (message.trim() || files.length > 0 || audioBlob) && !disabled && !isRecording;

  const handleSend = () => {
    if (!canSend) return;
    
    onSend(message, files.length > 0 ? files : undefined, audioBlob || undefined);
    setMessage('');
    setFiles([]);
    clearRecording();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(prev => [...prev, ...Array.from(e.target.files!)]);
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="border-t border-border bg-card/50 backdrop-blur-sm">
      <FileAttachments files={files} onRemove={removeFile} />
      
      <div className="p-4">
        <div className={cn(
          'flex items-end gap-2 p-2 rounded-2xl',
          'bg-input border border-border',
          'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background',
          'transition-all duration-200'
        )}>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />
          
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              'h-9 w-9 rounded-xl flex-shrink-0 transition-colors',
              'hover:bg-secondary hover:text-foreground',
              'text-muted-foreground'
            )}
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || isRecording}
            title="Attach files"
          >
            <Paperclip className="w-5 h-5" />
          </Button>

          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            disabled={disabled || isRecording}
            className={cn(
              'flex-1 min-h-[40px] max-h-[120px] resize-none',
              'bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0',
              'text-sm placeholder:text-muted-foreground'
            )}
            rows={1}
          />

          <VoiceRecorder
            isRecording={isRecording}
            recordingDuration={recordingDuration}
            hasRecording={!!audioBlob}
            onStartRecording={startRecording}
            onStopRecording={stopRecording}
            onClearRecording={clearRecording}
          />

          <Button
            type="button"
            size="icon"
            disabled={!canSend}
            onClick={handleSend}
            className={cn(
              'h-9 w-9 rounded-xl flex-shrink-0 transition-all',
              canSend 
                ? 'bg-primary hover:bg-primary/90 text-primary-foreground' 
                : 'bg-muted text-muted-foreground'
            )}
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        
        <p className="text-[10px] text-muted-foreground text-center mt-2">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
