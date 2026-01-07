import { Mic, Square, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface VoiceRecorderProps {
  isRecording: boolean;
  recordingDuration: number;
  hasRecording: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onClearRecording: () => void;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function VoiceRecorder({
  isRecording,
  recordingDuration,
  hasRecording,
  onStartRecording,
  onStopRecording,
  onClearRecording,
}: VoiceRecorderProps) {
  if (hasRecording && !isRecording) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary">
        <Mic className="w-4 h-4 text-primary" />
        <span className="text-xs text-secondary-foreground">Voice recorded</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-5 w-5 hover:bg-destructive/20"
          onClick={onClearRecording}
        >
          <X className="w-3 h-3" />
        </Button>
      </div>
    );
  }

  if (isRecording) {
    return (
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-destructive/10">
          <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
          <span className="text-xs font-medium text-destructive">
            Recording {formatDuration(recordingDuration)}
          </span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 bg-destructive hover:bg-destructive/90 text-destructive-foreground"
          onClick={onStopRecording}
        >
          <Square className="w-3 h-3 fill-current" />
        </Button>
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn(
        'h-9 w-9 rounded-xl transition-colors',
        'hover:bg-secondary hover:text-foreground',
        'text-muted-foreground'
      )}
      onClick={onStartRecording}
      title="Record voice message"
    >
      <Mic className="w-5 h-5" />
    </Button>
  );
}
