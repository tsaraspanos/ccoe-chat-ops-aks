export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  attachments?: FileAttachment[];
  voiceAttachment?: VoiceAttachment;
  meta?: {
    runID?: string;
    pipelineID?: string;
    status?: string;
  };
}

export interface FileAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  url?: string;
}

export interface VoiceAttachment {
  id: string;
  duration: number;
  blob?: Blob;
  url?: string;
}

export interface ChatRequest {
  sessionId: string;
  message?: string;
  files?: File[];
  voice?: Blob;
}

export interface ChatResponse {
  answer: string;
  meta?: {
    runID?: string;
    pipelineID?: string;
    toolCalls?: unknown[];
    raw?: Record<string, unknown>;
  };
}

export interface ChatState {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  sessionId: string;
}
