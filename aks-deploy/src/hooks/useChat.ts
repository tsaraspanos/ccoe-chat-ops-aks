/**
 * AKS Version - useChat Hook
 * 
 * This version uses Express SSE for real-time updates instead of Supabase Realtime.
 * Designed for fully internal AKS deployment where all components run in-cluster.
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

/**
 * Normalize answer from SSE update - handles string, array, or JSON-stringified array
 */
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
  
  // Track pending jobIds that are waiting for completion
  const pendingJobIdsRef = useRef<Map<string, string>>(new Map()); // jobId -> assistantMessageId

  const [state, setState] = useState<ChatState>({
    messages: [],
    isLoading: false,
    error: null,
    sessionId: '',
  });

  // Track active SSE subscriptions
  const activeSubscriptionsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setState(prev => ({ ...prev, sessionId: getOrCreateSessionId() }));
  }, []);

  // Handle incoming SSE updates
  const handleSSEUpdate = useCallback((jobId: string, update: SSEUpdate) => {
    console.log('Processing SSE update in chat:', { jobId, update });
    
    const assistantMessageId = pendingJobIdsRef.current.get(jobId);
    const answerText = normalizeAnswer(update.answer);
    
    // Build meta object from update
    const meta = {
      runID: jobId,
      pipelineID: update.meta?.pipelineID as string | undefined,
      status: update.status,
    };
    
    // Remove from pending if completed
    if (update.status === 'completed' || update.status === 'error') {
      pendingJobIdsRef.current.delete(jobId);
      activeSubscriptionsRef.current.delete(jobId);
    }
    
    // Append the completion as a new message
    console.log('Appending completion message for jobId:', jobId);
    
    setState((prev) => ({
      ...prev,
      isLoading: false,
      messages: [
        ...prev.messages,
        {
          id: uuidv4(),
          role: 'assistant',
          content: update.status === 'error' 
            ? `Error: ${update.error || 'Workflow failed'}` 
            : (answerText || 'Workflow completed'),
          timestamp: new Date(),
          meta,
        },
      ],
    }));
  }, []);

  // SSE subscription hook
  const { subscribe, unsubscribe } = useSSEUpdates({
    onUpdate: handleSSEUpdate,
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
      
      // Check if n8n returned a jobId/runID - this indicates a workflow has started
      const jobId = response.meta?.runID || response.meta?.jobId;
      const pipelineID = response.meta?.pipelineID;
      const hasWorkflowMeta = Boolean(jobId);
      
      // Only include meta if n8n actually sent jobId (workflow in progress)
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

      // Track the jobId and subscribe to SSE updates
      if (hasWorkflowMeta && jobId) {
        console.log('Tracking pending jobId:', jobId, '-> messageId:', assistantMessageId);
        pendingJobIdsRef.current.set(jobId, assistantMessageId);
        activeSubscriptionsRef.current.add(jobId);
        
        // Subscribe to SSE stream for this job
        subscribe(jobId);
      }

      setState(prev => ({
        ...prev,
        messages: [...prev.messages, assistantMessage],
        // Only block input while waiting for the immediate n8n response.
        // Workflows can keep running in the background; completion comes via SSE.
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
    // Unsubscribe from all active SSE streams
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
