import { useState, useCallback, useEffect } from 'react';
import { ChatMessage, ChatState, ChatRequest } from '@/types/chat';
import { sendChatMessage } from '@/lib/api';
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
  const [state, setState] = useState<ChatState>({
    messages: [],
    isLoading: false,
    error: null,
    sessionId: '',
  });

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
      const request: ChatRequest = {
        sessionId: state.sessionId,
        message: content.trim() || undefined,
        files,
        voice,
      };

      const response = await sendChatMessage(request);

      const assistantMessage: ChatMessage = {
        id: uuidv4(),
        role: 'assistant',
        content: response.answer,
        timestamp: new Date(),
      };

      setState(prev => ({
        ...prev,
        messages: [...prev.messages, assistantMessage],
        isLoading: false,
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
