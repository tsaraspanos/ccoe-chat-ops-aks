import { useState, useCallback, useEffect, useRef } from 'react';
import { ChatMessage, ChatState, ChatRequest } from '@/types/chat';
import { sendChatMessage } from '@/lib/api';
import { useWebhookRealtime, WebhookUpdate } from './useWebhookRealtime';
import { v4 as uuidv4 } from 'uuid';

const SESSION_KEY = 'chat-session-id';

function getOrCreateSessionId(): string {
  let sessionId = localStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = uuidv4();
    localStorage.setItem(SESSION_KEY, sessionId);
  }
  return sessionId;
}

/**
 * Normalize answer from webhook update - handles string, array, or JSON-stringified array
 */
function normalizeAnswer(answer: string | null): string {
  if (!answer) return '';
  
  const trimmed = answer.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed.join('\n') : answer;
    } catch {
      return answer;
    }
  }
  return answer;
}

export function useChat() {
  const isMountedRef = useRef(true);
  
  // Track pending runIDs that are waiting for completion
  const pendingRunIdsRef = useRef<Map<string, string>>(new Map()); // runId -> assistantMessageId

  const [state, setState] = useState<ChatState>({
    messages: [],
    isLoading: false,
    error: null,
    sessionId: '',
  });

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setState(prev => ({ ...prev, sessionId: getOrCreateSessionId() }));
  }, []);

  // Handle incoming real-time webhook updates from n8n
  const handleWebhookUpdate = useCallback((update: WebhookUpdate) => {
    console.log('Processing webhook update in chat:', update);
    
    const runId = update.run_id;
    const assistantMessageId = pendingRunIdsRef.current.get(runId);
    
    const answerText = normalizeAnswer(update.answer);
    
    // Build meta object from webhook update
    const meta = {
      runID: update.run_id,
      pipelineID: update.pipeline_id || undefined,
      status: update.status,
    };
    
    if (assistantMessageId) {
      // Update existing assistant message in-place
      console.log('Updating existing message:', assistantMessageId);
      pendingRunIdsRef.current.delete(runId);
      
      setState((prev) => ({
        ...prev,
        isLoading: false,
        messages: prev.messages.map((m) =>
          m.id === assistantMessageId
            ? { ...m, content: answerText || 'Workflow completed', timestamp: new Date(), meta }
            : m
        ),
      }));
    } else {
      // New completion - append as new message
      console.log('Appending new message for runId:', runId);
      
      setState((prev) => ({
        ...prev,
        isLoading: false,
        messages: [
          ...prev.messages,
          {
            id: uuidv4(),
            role: 'assistant',
            content: answerText || 'Workflow completed',
            timestamp: new Date(),
            meta,
          },
        ],
      }));
    }
  }, []);

  // Subscribe to real-time webhook updates
  useWebhookRealtime({
    onUpdate: handleWebhookUpdate,
    sessionId: state.sessionId || undefined,
    completedOnly: true,
  });

  const sendMessage = useCallback(async (
    content: string,
    files?: File[],
    voice?: Blob
  ) => {
    if (!content.trim() && !files?.length && !voice) return;

    const userMessage: ChatMessage = {
      id: uuidv4(),
      role: 'user',
      content: content.trim(),
      timestamp: new Date(),
      attachments: files?.map(file => ({
        id: uuidv4(),
        name: file.name,
        type: file.type,
        size: file.size,
      })),
      voiceAttachment: voice ? {
        id: uuidv4(),
        duration: 0,
        blob: voice,
      } : undefined,
    };

    setState(prev => ({
      ...prev,
      messages: [...prev.messages, userMessage],
      isLoading: true,
      error: null,
    }));

    try {
      const request: ChatRequest = {
        sessionId: state.sessionId,
        message: content.trim() || undefined,
        files,
        voice,
      };

      const response = await sendChatMessage(request);

      const assistantMessageId = uuidv4();
      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: response.answer,
        timestamp: new Date(),
        meta: response.meta ? {
          runID: response.meta.runID,
          pipelineID: response.meta.pipelineID,
          status: response.meta.runID ? 'in_progress' : undefined,
        } : undefined,
      };

      // Track the runID if we got one AND the answer indicates we're still waiting
      // (e.g., "Working on it…" placeholder means n8n will post completion later)
      const runID = response.meta?.runID;
      const isWaitingForCompletion = runID && response.answer === 'Working on it…';
      
      if (isWaitingForCompletion) {
        console.log('Tracking pending runID:', runID, '-> messageId:', assistantMessageId);
        pendingRunIdsRef.current.set(runID, assistantMessageId);
      }

      setState(prev => ({
        ...prev,
        messages: [...prev.messages, assistantMessage],
        // Only keep loading if we're actually waiting for a webhook completion
        isLoading: Boolean(isWaitingForCompletion),
      }));

    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'An error occurred',
      }));
    }
  }, [state.sessionId]);

  const clearChat = useCallback(() => {
    pendingRunIdsRef.current.clear();
    setState(prev => ({
      ...prev,
      messages: [],
      error: null,
    }));
  }, []);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  return {
    messages: state.messages,
    isLoading: state.isLoading,
    error: state.error,
    sessionId: state.sessionId,
    sendMessage,
    clearChat,
    clearError,
  };
}
