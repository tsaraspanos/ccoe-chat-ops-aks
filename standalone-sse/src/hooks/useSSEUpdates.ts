/**
 * Standalone SSE Version - useSSEUpdates Hook
 * 
 * Subscribes to Server-Sent Events (SSE) from the Express server
 * for real-time workflow updates.
 */

import { useRef, useCallback, useEffect } from 'react';

export interface SSEUpdate {
  status: 'pending' | 'completed' | 'error' | string;
  answer?: string;
  meta?: Record<string, unknown>;
  error?: string;
}

interface UseSSEUpdatesOptions {
  onUpdate: (jobId: string, update: SSEUpdate) => void;
}

function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return '';
}

export function useSSEUpdates({ onUpdate }: UseSSEUpdatesOptions) {
  const connectionsRef = useRef<Map<string, EventSource>>(new Map());
  const onUpdateRef = useRef(onUpdate);

  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    return () => {
      connectionsRef.current.forEach((eventSource, jobId) => {
        console.log(`Closing SSE connection for job ${jobId}`);
        eventSource.close();
      });
      connectionsRef.current.clear();
    };
  }, []);

  const subscribe = useCallback((jobId: string) => {
    if (connectionsRef.current.has(jobId)) {
      console.log(`Already subscribed to job ${jobId}`);
      return;
    }

    const baseUrl = getApiBaseUrl();
    const sseUrl = `${baseUrl}/api/webhook/stream/${jobId}`;
    
    console.log(`Subscribing to SSE stream: ${sseUrl}`);

    const eventSource = new EventSource(sseUrl);

    eventSource.onopen = () => {
      console.log(`SSE connection opened for job ${jobId}`);
    };

    eventSource.onmessage = (event) => {
      try {
        const update: SSEUpdate = JSON.parse(event.data);
        console.log(`SSE update for job ${jobId}:`, update);
        
        onUpdateRef.current(jobId, update);

        if (update.status === 'completed' || update.status === 'error') {
          console.log(`Job ${jobId} completed, closing SSE connection`);
          eventSource.close();
          connectionsRef.current.delete(jobId);
        }
      } catch (e) {
        console.error('Error parsing SSE message:', e);
      }
    };

    eventSource.onerror = (error) => {
      console.error(`SSE error for job ${jobId}:`, error);
      
      if (eventSource.readyState === EventSource.CLOSED) {
        connectionsRef.current.delete(jobId);
      }
    };

    connectionsRef.current.set(jobId, eventSource);
  }, []);

  const unsubscribe = useCallback((jobId: string) => {
    const eventSource = connectionsRef.current.get(jobId);
    if (eventSource) {
      console.log(`Unsubscribing from job ${jobId}`);
      eventSource.close();
      connectionsRef.current.delete(jobId);
    }
  }, []);

  const unsubscribeAll = useCallback(() => {
    connectionsRef.current.forEach((eventSource, jobId) => {
      console.log(`Closing SSE connection for job ${jobId}`);
      eventSource.close();
    });
    connectionsRef.current.clear();
  }, []);

  return {
    subscribe,
    unsubscribe,
    unsubscribeAll,
  };
}
