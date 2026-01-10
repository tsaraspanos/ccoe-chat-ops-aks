import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';

export interface WebhookUpdate {
  run_id: string;
  pipeline_id: string | null;
  session_id: string | null;
  status: string;
  answer: string | null;
  error: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

interface UseWebhookRealtimeOptions {
  /** Called when a new or updated webhook job is received */
  onUpdate: (update: WebhookUpdate) => void;
  /** Optional filter by session ID */
  sessionId?: string;
  /** Only listen for completed statuses */
  completedOnly?: boolean;
}

const COMPLETED_STATUSES = new Set(['completed', 'complete', 'done', 'success']);

/**
 * Hook that subscribes to real-time webhook updates from Supabase.
 * n8n posts to the webhook-update edge function, which writes to the database,
 * and this subscription receives the update instantly.
 */
export function useWebhookRealtime({
  onUpdate,
  sessionId,
  completedOnly = true,
}: UseWebhookRealtimeOptions) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const onUpdateRef = useRef(onUpdate);

  // Keep callback ref updated
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    // Subscribe to INSERT and UPDATE events on webhook_job_updates
    const channel = supabase
      .channel('webhook-updates')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to both INSERT and UPDATE
          schema: 'public',
          table: 'webhook_job_updates',
        },
        (payload) => {
          console.log('Realtime webhook update received:', payload);
          
          const update = payload.new as WebhookUpdate;
          
          if (!update) return;

          // Filter by session if provided
          if (sessionId && update.session_id && update.session_id !== sessionId) {
            console.log('Ignoring update for different session:', update.session_id);
            return;
          }

          // Filter by completed status if requested
          const normalizedStatus = String(update.status ?? '').toLowerCase().trim();
          if (completedOnly && !COMPLETED_STATUSES.has(normalizedStatus)) {
            console.log('Ignoring non-completed status:', normalizedStatus);
            return;
          }

          onUpdateRef.current(update);
        }
      )
      .subscribe((status) => {
        console.log('Realtime subscription status:', status);
      });

    channelRef.current = channel;

    return () => {
      console.log('Cleaning up realtime subscription');
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [sessionId, completedOnly]);

  const unsubscribe = useCallback(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }, []);

  return { unsubscribe };
}
