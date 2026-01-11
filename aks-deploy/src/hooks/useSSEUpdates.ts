/**
 * AKS Version - useSSEUpdates Hook
 * 
 * Subscribes to Server-Sent Events (SSE) from the Express server
 * for real-time workflow updates. This replaces Supabase Realtime
 * for fully internal AKS deployments.
 */

import { useRef, useCallback, useEffect } from 'react';

export interface SSEUpdate {
  status: 'pending' | 'completed' | 'error' | string;
  answer?: string;
  meta?: Record<string, unknown>;
  error?: string;
}

interface UseSSEUpdatesOptions {
  /** Called when an update is received for a job */
  onUpdate: (jobId: string, update: SSEUpdate) => void;
}

// Get the API base URL - in AKS this will be the same origin
function getApiBaseUrl(): string {
  // In production, use the same origin (internal service)
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return '';
}

/**
 * Hook that manages SSE subscriptions to job update streams.
 * Multiple jobs can be tracked simultaneously.
 */
export function useSSEUpdates({ onUpdate }: UseSSEUpdatesOptions) {
  // Track active EventSource connections by jobId
  const connectionsRef = useRef<Map<string, EventSource>>(new Map());
  const onUpdateRef = useRef(onUpdate);

  // Keep callback ref updated
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      connectionsRef.current.forEach((eventSource, jobId) => {
        console.log(`Closing SSE connection for job ${jobId}`);
        eventSource.close();
      });
      connectionsRef.current.clear();
    };
  }, []);

  /**
   * Subscribe to SSE updates for a specific job
   */
  const subscribe = useCallback((jobId: string) => {
    // Don't create duplicate connections
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

        // Close connection if job is complete
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
      
      // EventSource will automatically try to reconnect
      // But if it's closed, we should clean up
      if (eventSource.readyState === EventSource.CLOSED) {
        connectionsRef.current.delete(jobId);
      }
    };

    connectionsRef.current.set(jobId, eventSource);
  }, []);

  /**
   * Unsubscribe from SSE updates for a specific job
   */
  const unsubscribe = useCallback((jobId: string) => {
    const eventSource = connectionsRef.current.get(jobId);
    if (eventSource) {
      console.log(`Unsubscribing from job ${jobId}`);
      eventSource.close();
      connectionsRef.current.delete(jobId);
    }
  }, []);

  /**
   * Unsubscribe from all active SSE streams
   */
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
