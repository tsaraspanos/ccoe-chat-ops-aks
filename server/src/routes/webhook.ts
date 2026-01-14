import { Router, Request, Response } from 'express';

const router = Router();

// In-memory store for job updates (keyed by runID)
const jobUpdates: Map<string, { status: string; answer?: string; pipelineID?: string }> = new Map();

// SSE clients waiting for updates (keyed by runID)
const sseClients: Map<string, Response[]> = new Map();

/**
 * POST /api/webhook/update
 * n8n calls this endpoint to push workflow updates
 * 
 * Expected body:
 * {
 *   "runID": "execution-id",
 *   "pipelineID": "workflow-id",
 *   "status": "pending" | "completed" | "error",
 *   "answer": "response text"
 * }
 */
router.post('/update', (req: Request, res: Response) => {
  try {
    const { runID, pipelineID, status, answer } = req.body;

    console.log(`📥 Webhook update received at ${new Date().toISOString()}:`, JSON.stringify(req.body, null, 2));

    if (!runID) {
      console.error('❌ Missing runID in webhook payload');
      return res.status(400).json({ error: 'runID is required' });
    }

    if (!status) {
      console.error('❌ Missing status in webhook payload');
      return res.status(400).json({ error: 'status is required' });
    }

    console.log(`✅ Valid webhook: runID=${runID}, pipelineID=${pipelineID}, status=${status}, answer=${answer?.substring(0, 100)}...`);
    console.log(`📊 Current SSE clients waiting:`, Array.from(sseClients.keys()));

    // Store the update
    const update = { status, answer, pipelineID };
    jobUpdates.set(runID, update);

    // Notify any SSE clients waiting for this runID
    const clients = sseClients.get(runID) || [];
    console.log(`📡 Found ${clients.length} SSE client(s) waiting for runID=${runID}`);
    
    if (clients.length === 0) {
      console.warn(`⚠️ No SSE clients connected for runID=${runID}. Update stored for polling.`);
    }
    
    clients.forEach((client, index) => {
      try {
        console.log(`📤 Sending SSE update to client ${index + 1}/${clients.length} for runID=${runID}`);
        client.write(`data: ${JSON.stringify(update)}\n\n`);
        
        // If completed or error, close the connection
        if (status === 'completed' || status === 'error') {
          console.log(`🔚 Closing SSE connection for client ${index + 1} (status=${status})`);
          client.end();
        }
      } catch (e) {
        console.error('❌ Error sending SSE update:', e);
      }
    });

    // Clean up completed jobs after notifying
    if (status === 'completed' || status === 'error') {
      sseClients.delete(runID);
      // Keep the update for a bit in case of late poll requests
      setTimeout(() => jobUpdates.delete(runID), 60000);
    }

    return res.json({ success: true, message: `Update received for runID ${runID}` });
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/webhook/status/:runID
 * Poll endpoint for checking job status (fallback if SSE fails)
 */
router.get('/status/:runID', (req: Request, res: Response) => {
  const { runID } = req.params;
  
  const update = jobUpdates.get(runID);
  
  if (!update) {
    return res.json({ status: 'pending' });
  }
  
  return res.json(update);
});

/**
 * GET /api/webhook/stream/:runID
 * SSE endpoint - frontend connects here to receive real-time updates
 */
router.get('/stream/:runID', (req: Request, res: Response) => {
  const { runID } = req.params;

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  console.log(`📡 SSE client connected for runID=${runID}`);

  // Check if we already have an update for this job
  const existingUpdate = jobUpdates.get(runID);
  if (existingUpdate) {
    res.write(`data: ${JSON.stringify(existingUpdate)}\n\n`);
    if (existingUpdate.status === 'completed' || existingUpdate.status === 'error') {
      res.end();
      return;
    }
  }

  // Register this client
  const clients = sseClients.get(runID) || [];
  clients.push(res);
  sseClients.set(runID, clients);

  // Handle client disconnect
  req.on('close', () => {
    console.log(`📡 SSE client disconnected for runID=${runID}`);
    const remaining = (sseClients.get(runID) || []).filter(c => c !== res);
    if (remaining.length > 0) {
      sseClients.set(runID, remaining);
    } else {
      sseClients.delete(runID);
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
