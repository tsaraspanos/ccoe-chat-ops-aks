/**
 * AKS Version - API Layer
 * 
 * This version is configured for internal AKS deployment.
 * n8n webhook URL is read from environment or uses internal K8s DNS.
 */

import { ChatRequest, ChatResponse } from '@/types/chat';

// In AKS, this comes from ConfigMap environment variable
// Falls back to internal Kubernetes DNS if not set
const N8N_WEBHOOK_URL = import.meta.env.VITE_N8N_WEBHOOK_URL || 
  'http://n8n-service.n8n.svc.cluster.local:5678/webhook/chat-ui-trigger';

console.log('API Config:', { N8N_WEBHOOK_URL });

/**
 * n8n response structure.
 * - If n8n is still gathering info it may NOT include runID/pipelineID (just answer/message).
 * - Once n8n triggers a workflow it returns runID, pipelineID, status: "in_progress".
 */
interface N8nResponse {
  runID?: string | number;
  runId?: string | number;
  jobId?: string | number;
  pipelineID?: string | number;
  pipelineId?: string | number;
  status?: string;
  answer?: string;
  message?: string;
  [key: string]: unknown;
}

/**
 * Extract answer from n8n response - handles various common field names
 */
function extractAnswer(data: N8nResponse): string | undefined {
  // Common field names for text responses
  const answerKeys = ['answer', 'message', 'text', 'output', 'response', 'content', 'result'];
  
  for (const key of answerKeys) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  
  // Check if data itself is a string (some workflows return plain text)
  if (typeof data === 'string') {
    return data;
  }
  
  // Check for nested data.data.answer pattern
  if (data.data && typeof data.data === 'object') {
    for (const key of answerKeys) {
      const value = (data.data as Record<string, unknown>)[key];
      if (typeof value === 'string' && value.trim()) {
        return value;
      }
    }
  }
  
  return undefined;
}

/**
 * Send chat message to n8n.
 * 
 * Flow:
 * 1. UI sends message to n8n webhook.
 * 2. n8n may respond with conversational replies (no runID) – return immediately.
 * 3. When n8n triggers workflow it responds with runID + status "in_progress".
 *    UI then subscribes to SSE stream for real-time updates.
 */
export async function sendChatMessage(request: ChatRequest): Promise<ChatResponse> {
  const formData = new FormData();
  formData.append('sessionId', request.sessionId);

  if (request.message) {
    formData.append('message', request.message);
  }

  if (request.files) {
    request.files.forEach((file) => {
      formData.append('files[]', file);
    });
  }

  if (request.voice) {
    formData.append('voice', request.voice, 'voice-recording.webm');
  }

  try {
    console.log('Sending message to n8n...');

    // Timeout to prevent UI being stuck forever
    const controller = new AbortController();
    const timeoutMs = 30000; // 30 seconds for internal network
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

    let triggerResponse: Response;
    try {
      triggerResponse = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });
    } finally {
      window.clearTimeout(timeoutId);
    }

    if (!triggerResponse.ok) {
      throw new Error(`Chat request failed: ${triggerResponse.statusText}`);
    }

    const n8nData: N8nResponse = await triggerResponse.json();
    console.log('n8n response:', n8nData);

    // n8n may return either a direct conversational answer OR a jobId/runID for async processing
    const runId = n8nData.runID ?? n8nData.runId ?? n8nData.jobId;
    const pipelineId = n8nData.pipelineID ?? n8nData.pipelineId;
    const normalizedTriggerStatus = String(n8nData.status ?? '').toLowerCase().trim();

    const directAnswer = extractAnswer(n8nData);
    
    // Only consider it a valid workflow run if status indicates in progress
    const runIdStr = runId !== undefined && runId !== null ? String(runId).trim() : '';
    const normalizedStatus = normalizedTriggerStatus.replace(/[\s_-]/g, '');
    const isValidWorkflowRun = runIdStr.length > 1 && normalizedStatus === 'inprogress';

    const errorStatuses = new Set(['error', 'failed', 'failure']);

    // If n8n explicitly reports an error, surface it
    if (errorStatuses.has(normalizedTriggerStatus)) {
      throw new Error(directAnswer || 'Workflow execution failed');
    }

    // If we have a valid workflow run, return with meta for SSE subscription
    if (isValidWorkflowRun) {
      console.log('Valid workflow started:', {
        runId: runIdStr,
        pipelineId,
        status: n8nData.status,
        hasDirectAnswer: Boolean(directAnswer),
      });

      return {
        answer: directAnswer || 'Working on it…',
        meta: {
          runID: runIdStr,
          jobId: runIdStr,
          pipelineID: pipelineId ? String(pipelineId) : undefined,
        },
      };
    }

    // Direct answer from n8n (no runId to track)
    if (directAnswer) {
      console.log('Direct answer from n8n:', directAnswer);
      return {
        answer: directAnswer,
        meta: {
          pipelineID: pipelineId ? String(pipelineId) : undefined,
        },
      };
    }

    // Fallback: show stringified response
    console.warn('Unexpected n8n response shape:', n8nData);
    return {
      answer: JSON.stringify(n8nData, null, 2),
      meta: { raw: n8nData as Record<string, unknown> },
    };
  } catch (error) {
    console.error('Error sending message to n8n:', error);
    throw error;
  }
}

export async function checkHealth(): Promise<{ status: string }> {
  try {
    const response = await fetch('/health');
    if (response.ok) {
      return await response.json();
    }
    return { status: 'unhealthy' };
  } catch {
    return { status: 'error' };
  }
}
