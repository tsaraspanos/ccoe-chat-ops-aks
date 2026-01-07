import fetch from 'node-fetch';
import FormData from 'form-data';
import { ChatPayload, ChatResponse, AttachmentInfo } from '../types';

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;

if (!N8N_WEBHOOK_URL) {
  console.warn('⚠️  N8N_WEBHOOK_URL environment variable is not set');
}

/**
 * Send a chat message to the n8n webhook.
 * Supports both JSON (text-only) and multipart/form-data (with files).
 */
export async function sendMessageToN8n(
  payload: ChatPayload,
  files?: Express.Multer.File[],
  voice?: Express.Multer.File
): Promise<ChatResponse> {
  if (!N8N_WEBHOOK_URL) {
    throw new Error('N8N_WEBHOOK_URL is not configured');
  }

  const hasFiles = (files && files.length > 0) || voice;

  if (hasFiles) {
    // Multipart form data request
    const formData = new FormData();
    formData.append('sessionId', payload.sessionId);
    
    if (payload.message) {
      formData.append('message', payload.message);
    }

    if (files) {
      for (const file of files) {
        formData.append('files[]', file.buffer, {
          filename: file.originalname,
          contentType: file.mimetype,
        });
      }
    }

    if (voice) {
      formData.append('voice', voice.buffer, {
        filename: voice.originalname || 'voice-recording.webm',
        contentType: voice.mimetype,
      });
    }

    const response = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      body: formData,
      headers: formData.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`n8n webhook returned ${response.status}: ${response.statusText}`);
    }

    return await response.json() as ChatResponse;
  } else {
    // JSON request (text-only)
    const response = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId: payload.sessionId,
        message: payload.message,
        attachments: [],
        voice: null,
      }),
    });

    if (!response.ok) {
      throw new Error(`n8n webhook returned ${response.status}: ${response.statusText}`);
    }

    return await response.json() as ChatResponse;
  }
}
