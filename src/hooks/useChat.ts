import { useState, useCallback, useEffect, useRef } from 'react';
import { ChatMessage, ChatState, ChatRequest } from '@/types/chat';
import { sendChatMessage, pollForRunResult, waitForNextCompletionAfter } from '@/lib/api';
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

export function useChat() {
  const isMountedRef = useRef(true);
  const seenRunIdsRef = useRef<Set<string>>(new Set());

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
      const sentAt = Date.now();

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
      };

      setState(prev => ({
        ...prev,
        messages: [...prev.messages, assistantMessage],
        isLoading: false,
      }));

      const runID = response.meta?.runID;

      // If we got a runID, poll for its completion in the background and update the assistant message in-place.
      if (runID) {
        seenRunIdsRef.current.add(runID);

        void pollForRunResult(runID)
          .then((finalResponse) => {
            if (!isMountedRef.current) return;

            setState((prev) => ({
              ...prev,
              messages: prev.messages.map((m) =>
                m.id === assistantMessageId
                  ? { ...m, content: finalResponse.answer, timestamp: new Date() }
                  : m
              ),
            }));
          })
          .catch((err) => {
            console.warn('Run completion polling failed:', err);
          });

        return;
      }

      // If the trigger response didn't include a runID, n8n may still post the final answer later.
      // In that case, watch for the next completed job in the backend and append it.
      void waitForNextCompletionAfter(sentAt, Array.from(seenRunIdsRef.current))
        .then((finalResponse) => {
          if (!isMountedRef.current || !finalResponse) return;

          const finalRunId = finalResponse.meta?.runID;
          if (finalRunId) seenRunIdsRef.current.add(finalRunId);

          setState((prev) => ({
            ...prev,
            messages: [
              ...prev.messages,
              {
                id: uuidv4(),
                role: 'assistant',
                content: finalResponse.answer,
                timestamp: new Date(),
              },
            ],
          }));
        })
        .catch((err) => {
          console.warn('Background completion watcher failed:', err);
        });
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'An error occurred',
      }));
    }
  }, [state.sessionId]);

  const clearChat = useCallback(() => {
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
