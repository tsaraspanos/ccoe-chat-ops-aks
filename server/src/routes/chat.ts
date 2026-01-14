/**
 * Chat Proxy Route
 * 
 * Proxies chat requests to n8n webhook, keeping the webhook URL server-side only.
 * This prevents exposing internal URLs in the browser.
 */

import { Router, Request, Response } from 'express';
import { IncomingForm, File, Fields, Files } from 'formidable';
import FormData from 'form-data';
import fs from 'fs';
import https from 'https';
import http from 'http';
import { URL } from 'url';

const router = Router();

// Get n8n webhook URL from environment (never exposed to frontend)
const getN8nWebhookUrl = (): string => {
  return process.env.N8N_WEBHOOK_URL || '';
};

router.post('/', async (req: Request, res: Response) => {
  const webhookUrl = getN8nWebhookUrl();
  
  if (!webhookUrl) {
    console.error('N8N_WEBHOOK_URL is not configured');
    return res.status(500).json({ 
      error: 'Chat service not configured',
      message: 'The chat backend is not properly configured. Please contact your administrator.'
    });
  }

  try {
    // Parse incoming multipart form data
    const form = new IncomingForm({
      keepExtensions: true,
      maxFileSize: 10 * 1024 * 1024, // 10MB limit
    });

    const [fields, files] = await new Promise<[Fields, Files]>((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve([fields, files]);
      });
    });

    // Build form data to send to n8n
    const formData = new FormData();

    // Add text fields
    const sessionId = Array.isArray(fields.sessionId) ? fields.sessionId[0] : fields.sessionId;
    const message = Array.isArray(fields.message) ? fields.message[0] : fields.message;
    
    if (sessionId) {
      formData.append('sessionId', sessionId);
    }
    
    if (message) {
      formData.append('message', message);
    }

    // Add files
    const fileList = files['files[]'];
    if (fileList) {
      const fileArray = Array.isArray(fileList) ? fileList : [fileList];
      for (const file of fileArray) {
        formData.append('files[]', fs.createReadStream(file.filepath), {
          filename: file.originalFilename || 'file',
          contentType: file.mimetype || 'application/octet-stream',
        });
      }
    }

    // Add voice recording
    const voiceFile = files.voice;
    if (voiceFile) {
      const voice = Array.isArray(voiceFile) ? voiceFile[0] : voiceFile;
      formData.append('voice', fs.createReadStream(voice.filepath), {
        filename: voice.originalFilename || 'voice-recording.webm',
        contentType: voice.mimetype || 'audio/webm',
      });
    }

    console.log('Proxying chat request to n8n');

    // Forward to n8n
    const parsedUrl = new URL(webhookUrl);
    const isHttps = parsedUrl.protocol === 'https:';
    const httpModule = isHttps ? https : http;

    const n8nResponse = await new Promise<{ status: number; data: unknown }>((resolve, reject) => {
      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'POST',
        headers: {
          ...formData.getHeaders(),
        },
        timeout: 30000,
      };

      const request = httpModule.request(options, (response) => {
        let data = '';
        response.on('data', (chunk) => { data += chunk; });
        response.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve({ status: response.statusCode || 500, data: parsed });
          } catch {
            resolve({ status: response.statusCode || 500, data: { message: data } });
          }
        });
      });

      request.on('error', reject);
      request.on('timeout', () => {
        request.destroy();
        reject(new Error('Request timeout'));
      });

      formData.pipe(request);
    });

    // Clean up temporary files
    const allFiles = [...(fileList ? (Array.isArray(fileList) ? fileList : [fileList]) : [])];
    if (voiceFile) {
      allFiles.push(...(Array.isArray(voiceFile) ? voiceFile : [voiceFile]));
    }
    for (const file of allFiles) {
      fs.unlink(file.filepath, () => {}); // Ignore errors
    }

    return res.status(n8nResponse.status).json(n8nResponse.data);
  } catch (error) {
    console.error('Chat proxy error:', error);
    return res.status(500).json({ 
      error: 'Chat request failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
