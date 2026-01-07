export interface ChatPayload {
  sessionId: string;
  message?: string;
  attachments: AttachmentInfo[];
  voice: AttachmentInfo | null;
}

export interface AttachmentInfo {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer?: Buffer;
}

export interface ChatResponse {
  answer: string;
  meta?: {
    toolCalls?: unknown[];
    raw?: Record<string, unknown>;
  };
}
