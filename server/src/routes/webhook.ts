import { Router, Request, Response } from 'express';

const router = Router();

// Special key for broadcast updates (when runID is empty)
const BROADCAST_KEY = '__broadcast__';

// In-memory store for job updates (keyed by runID)
const jobUpdates: Map<string, { status: string; answer?: string; pipelineID?: string }> = new Map();

// SSE clients waiting for updates (keyed by runID, or BROADCAST_KEY for broadcast listeners)
const sseClients: Map<string, Response[]> = new Map();

/**
 * POST /api/webhook/update
 * n8n calls this endpoint to push workflow updates
 * 
 * Expected body:
 * {
 *   "runID": "execution-id" (optional - if empty, broadcasts to all listeners),
 *   "pipelineID": "workflow-id" (optional),
 *   "status": "pending" | "completed" | "error" (optional - defaults to "completed" if answer provided),
 *   "answer": "response text"
 * }
 */
router.post('/update', (req: Request, res: Response) => {
  try {
    const { runID, pipelineID, status: rawStatus, answer } = req.body;

    console.log(`📥 Webhook update received at ${new Date().toISOString()}:`, JSON.stringify(req.body, null, 2));

    // Determine status: use provided status, or default to 'completed' if answer exists, else 'pending'
    const status = rawStatus || (answer ? 'completed' : 'pending');
    
    // If no runID, we'll broadcast to all listeners
    const isBroadcast = !runID;
    const targetKey = runID || BROADCAST_KEY;

    console.log(`✅ Valid webhook: runID=${runID || '(broadcast)'}, pipelineID=${pipelineID}, status=${status}, answer=${answer?.substring(0, 100)}...`);
    console.log(`📊 Current SSE clients waiting:`, Array.from(sseClients.keys()));
    console.log(`📡 Broadcast mode: ${isBroadcast}`);

    // Build the update object
    const update = { status, answer, pipelineID, runID: runID || null };
    
    // Store the update (for polling fallback)
    if (runID) {
      jobUpdates.set(runID, { status, answer, pipelineID });
    }

    // Get clients to notify
    let clients: Response[] = [];
    
    if (isBroadcast) {
      // Broadcast mode: notify all broadcast listeners
      clients = sseClients.get(BROADCAST_KEY) || [];
      console.log(`📡 Broadcasting to ${clients.length} broadcast listener(s)`);
    } else {
      // Specific runID: notify clients waiting for this runID
      clients = sseClients.get(runID) || [];
      console.log(`📡 Found ${clients.length} SSE client(s) waiting for runID=${runID}`);
    }
    
    if (clients.length === 0) {
      console.warn(`⚠️ No SSE clients connected for ${isBroadcast ? 'broadcast' : `runID=${runID}`}. Update stored for polling.`);
    }
    
    clients.forEach((client, index) => {
      try {
        console.log(`📤 Sending SSE update to client ${index + 1}/${clients.length}`);
        client.write(`data: ${JSON.stringify(update)}\n\n`);
        
        // For broadcast, don't close connections (they stay open for more updates)
        // For specific runID with terminal status, close the connection
        if (!isBroadcast && (status === 'completed' || status === 'error')) {
          console.log(`🔚 Closing SSE connection for client ${index + 1} (status=${status})`);
          client.end();
        }
      } catch (e) {
        console.error('❌ Error sending SSE update:', e);
      }
    });

    // Clean up completed jobs (only for specific runID updates)
    if (!isBroadcast && (status === 'completed' || status === 'error')) {
      sseClients.delete(runID);
      // Keep the update for a bit in case of late poll requests
      setTimeout(() => jobUpdates.delete(runID), 60000);
    }

    return res.json({ success: true, message: `Update received${runID ? ` for runID ${runID}` : ' (broadcast)'}` });
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
 * Use runID="broadcast" for broadcast channel (receives all updates without runID)
 */
router.get('/stream/:runID', (req: Request, res: Response) => {
  const { runID } = req.params;
  const targetKey = runID === 'broadcast' ? BROADCAST_KEY : runID;

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  console.log(`📡 SSE client connected for ${runID === 'broadcast' ? 'broadcast channel' : `runID=${runID}`}`);

  // Check if we already have an update for this job (not for broadcast)
  if (targetKey !== BROADCAST_KEY) {
    const existingUpdate = jobUpdates.get(runID);
    if (existingUpdate) {
      res.write(`data: ${JSON.stringify(existingUpdate)}\n\n`);
      if (existingUpdate.status === 'completed' || existingUpdate.status === 'error') {
        res.end();
        return;
      }
    }
  }

  // Register this client
  const clients = sseClients.get(targetKey) || [];
  clients.push(res);
  sseClients.set(targetKey, clients);

  // Handle client disconnect
  req.on('close', () => {
    console.log(`📡 SSE client disconnected for ${runID === 'broadcast' ? 'broadcast channel' : `runID=${runID}`}`);
    const remaining = (sseClients.get(targetKey) || []).filter(c => c !== res);
    if (remaining.length > 0) {
      sseClients.set(targetKey, remaining);
    } else {
      sseClients.delete(targetKey);
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
