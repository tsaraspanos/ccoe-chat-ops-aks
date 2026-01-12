/**
 * SSE Version - API Layer
 * 
 * Sends chat messages to n8n webhook.
 * Uses environment variable or falls back to localhost for development.
 */

import { ChatRequest, ChatResponse } from '@/types/chat';

// In production (Docker), this comes from env; in dev, use localhost
const N8N_WEBHOOK_URL = import.meta.env.VITE_N8N_WEBHOOK_URL || 
  'http://localhost:5678/webhook/chat';

console.log('API Config:', { N8N_WEBHOOK_URL });

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

function extractAnswer(data: N8nResponse): string | undefined {
  const answerKeys = ['answer', 'message', 'text', 'output', 'response', 'content', 'result'];
  
  for (const key of answerKeys) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  
  if (typeof data === 'string') {
    return data;
  }
  
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

    const controller = new AbortController();
    const timeoutMs = 30000;
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

    const runId = n8nData.runID ?? n8nData.runId ?? n8nData.jobId;
    const pipelineId = n8nData.pipelineID ?? n8nData.pipelineId;
    const normalizedTriggerStatus = String(n8nData.status ?? '').toLowerCase().trim();

    const directAnswer = extractAnswer(n8nData);
    
    const runIdStr = runId !== undefined && runId !== null ? String(runId).trim() : '';
    const normalizedStatus = normalizedTriggerStatus.replace(/[\s_-]/g, '');
    const isValidWorkflowRun = runIdStr.length > 1 && normalizedStatus === 'inprogress';

    const errorStatuses = new Set(['error', 'failed', 'failure']);

    if (errorStatuses.has(normalizedTriggerStatus)) {
      throw new Error(directAnswer || 'Workflow execution failed');
    }

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

    if (directAnswer) {
      console.log('Direct answer from n8n:', directAnswer);
      return {
        answer: directAnswer,
        meta: {
          pipelineID: pipelineId ? String(pipelineId) : undefined,
        },
      };
    }

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
