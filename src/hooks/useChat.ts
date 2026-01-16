/**
 * SSE Version - useChat Hook
 * 
 * Manages chat state and uses SSE for real-time workflow updates.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { ChatMessage, ChatState, ChatRequest } from '@/types/chat';
import { sendChatMessage } from '@/lib/api';
import { useSSEUpdates, SSEUpdate } from './useSSEUpdates';
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

function normalizeAnswer(answer: string | null | undefined): string {
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
  const pendingJobIdsRef = useRef<Map<string, string>>(new Map());
  const broadcastSubscribedRef = useRef(false);

  const [state, setState] = useState<ChatState>({
    messages: [],
    isLoading: false,
    error: null,
    sessionId: '',
  });

  const activeSubscriptionsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setState(prev => ({ ...prev, sessionId: getOrCreateSessionId() }));
  }, []);

  const handleSSEUpdate = useCallback((subscriptionKey: string, update: SSEUpdate) => {
    // For broadcast updates, the actual runID comes from the update payload
    const actualRunID = update.runID || subscriptionKey;
    const isBroadcast = subscriptionKey === 'broadcast';
    
    console.log('🔔 Processing SSE update in chat:', { 
      subscriptionKey, 
      actualRunID, 
      isBroadcast,
      update, 
      timestamp: new Date().toISOString() 
    });
    
    // DEDUPLICATION: If this is a broadcast update but we have a specific subscription for this runID,
    // skip it to avoid duplicate messages (we'll get it from the specific subscription)
    if (isBroadcast && actualRunID && activeSubscriptionsRef.current.has(actualRunID)) {
      console.log('🔔 Skipping broadcast update - already subscribed to specific runID:', actualRunID);
      return;
    }
    
    const answerText = normalizeAnswer(update.answer);
    console.log('🔔 Normalized answer:', answerText);
    
    // Skip if no answer content
    if (!answerText && update.status !== 'error') {
      console.log('🔔 Skipping update with no answer content');
      return;
    }
    
    const meta = {
      runID: actualRunID !== 'broadcast' ? actualRunID : undefined,
      pipelineID: update.pipelineID,
      status: update.status,
    };
    
    // Clean up tracking for specific runID updates
    if (!isBroadcast && (update.status === 'completed' || update.status === 'error')) {
      pendingJobIdsRef.current.delete(actualRunID);
      activeSubscriptionsRef.current.delete(actualRunID);
    }
    
    console.log('Appending completion message:', isBroadcast ? '(broadcast)' : `runID=${actualRunID}`);
    
    setState((prev) => ({
      ...prev,
      isLoading: false,
      messages: [
        ...prev.messages,
        {
          id: uuidv4(),
          role: 'assistant',
          content: update.status === 'error' 
            ? `Error: ${update.answer || 'Workflow failed'}` 
            : (answerText || 'Workflow completed'),
          timestamp: new Date(),
          meta,
        },
      ],
    }));
  }, []);

  const { subscribe, unsubscribe } = useSSEUpdates({
    onUpdate: handleSSEUpdate,
  });
  
  // Subscribe to broadcast channel on mount
  useEffect(() => {
    if (!broadcastSubscribedRef.current) {
      console.log('📡 Subscribing to broadcast channel for ServiceNow updates');
      subscribe('broadcast');
      broadcastSubscribedRef.current = true;
    }
    
    return () => {
      if (broadcastSubscribedRef.current) {
        console.log('📡 Unsubscribing from broadcast channel');
        unsubscribe('broadcast');
        broadcastSubscribedRef.current = false;
      }
    };
  }, [subscribe, unsubscribe]);

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
      
      const jobId = response.meta?.runID || response.meta?.jobId;
      const pipelineID = response.meta?.pipelineID;
      const hasWorkflowMeta = Boolean(jobId);
      
      const meta = hasWorkflowMeta ? {
        runID: jobId,
        pipelineID,
        status: 'in_progress',
      } : undefined;
      
      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: response.answer,
        timestamp: new Date(),
        meta,
      };

      if (hasWorkflowMeta && jobId) {
        console.log('📡 Tracking pending jobId:', jobId, '-> messageId:', assistantMessageId);
        console.log('📡 Subscribing to SSE stream for runID:', jobId);
        pendingJobIdsRef.current.set(jobId, assistantMessageId);
        activeSubscriptionsRef.current.add(jobId);
        subscribe(jobId);
      }

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
  }, [state.sessionId, subscribe]);

  const clearChat = useCallback(() => {
    activeSubscriptionsRef.current.forEach(jobId => {
      unsubscribe(jobId);
    });
    activeSubscriptionsRef.current.clear();
    pendingJobIdsRef.current.clear();
    
    setState(prev => ({
      ...prev,
      messages: [],
      error: null,
    }));
  }, [unsubscribe]);

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
