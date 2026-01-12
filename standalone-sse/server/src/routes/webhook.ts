import { Router, Request, Response } from 'express';

const router = Router();

// In-memory store for job updates (keyed by jobId)
const jobUpdates: Map<string, { status: string; answer?: string; meta?: Record<string, unknown>; error?: string }> = new Map();

// SSE clients waiting for updates (keyed by jobId)
const sseClients: Map<string, Response[]> = new Map();

/**
 * POST /api/webhook/update
 * n8n calls this endpoint to push workflow updates
 * 
 * Expected body:
 * {
 *   "jobId": "execution-id",
 *   "sessionId": "user-session",
 *   "status": "pending" | "completed" | "error",
 *   "answer": "response text (when completed)",
 *   "meta": { optional metadata },
 *   "error": "error message (when error)"
 * }
 */
router.post('/update', (req: Request, res: Response) => {
  try {
    const { jobId, sessionId, status, answer, meta, error } = req.body;

    if (!jobId) {
      return res.status(400).json({ error: 'jobId is required' });
    }

    if (!status) {
      return res.status(400).json({ error: 'status is required' });
    }

    console.log(`📥 Webhook update received: jobId=${jobId}, status=${status}`);

    // Store the update
    const update = { status, answer, meta, error };
    jobUpdates.set(jobId, update);

    // Notify any SSE clients waiting for this jobId
    const clients = sseClients.get(jobId) || [];
    clients.forEach(client => {
      try {
        client.write(`data: ${JSON.stringify(update)}\n\n`);
        
        // If completed or error, close the connection
        if (status === 'completed' || status === 'error') {
          client.end();
        }
      } catch (e) {
        console.error('Error sending SSE update:', e);
      }
    });

    // Clean up completed jobs after notifying
    if (status === 'completed' || status === 'error') {
      sseClients.delete(jobId);
      // Keep the update for a bit in case of late poll requests
      setTimeout(() => jobUpdates.delete(jobId), 60000);
    }

    return res.json({ success: true, message: `Update received for job ${jobId}` });
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/webhook/status/:jobId
 * Poll endpoint for checking job status (fallback if SSE fails)
 */
router.get('/status/:jobId', (req: Request, res: Response) => {
  const { jobId } = req.params;
  
  const update = jobUpdates.get(jobId);
  
  if (!update) {
    return res.json({ status: 'pending' });
  }
  
  return res.json(update);
});

/**
 * GET /api/webhook/stream/:jobId
 * SSE endpoint - frontend connects here to receive real-time updates
 */
router.get('/stream/:jobId', (req: Request, res: Response) => {
  const { jobId } = req.params;

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  console.log(`📡 SSE client connected for jobId=${jobId}`);

  // Check if we already have an update for this job
  const existingUpdate = jobUpdates.get(jobId);
  if (existingUpdate) {
    res.write(`data: ${JSON.stringify(existingUpdate)}\n\n`);
    if (existingUpdate.status === 'completed' || existingUpdate.status === 'error') {
      res.end();
      return;
    }
  }

  // Register this client
  const clients = sseClients.get(jobId) || [];
  clients.push(res);
  sseClients.set(jobId, clients);

  // Handle client disconnect
  req.on('close', () => {
    console.log(`📡 SSE client disconnected for jobId=${jobId}`);
    const remaining = (sseClients.get(jobId) || []).filter(c => c !== res);
    if (remaining.length > 0) {
      sseClients.set(jobId, remaining);
    } else {
      sseClients.delete(jobId);
    }
  });

  // Send heartbeat every 30s to keep connection alive
  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch (e) {
      clearInterval(heartbeat);
    }
  }, 30000);

  req.on('close', () => clearInterval(heartbeat));
});

export default router;
