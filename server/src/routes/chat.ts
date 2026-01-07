import { Router, Request, Response } from 'express';
import multer from 'multer';
import { sendMessageToN8n } from '../integrations/n8nClient';
import { ChatPayload } from '../types';

const router = Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max file size
    files: 10, // Max 10 files
  },
});

// Define the multer fields
const uploadFields = upload.fields([
  { name: 'files[]', maxCount: 10 },
  { name: 'voice', maxCount: 1 },
]);

router.post('/', uploadFields, async (req: Request, res: Response) => {
  try {
    const { sessionId, message } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    // Get uploaded files
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const attachedFiles = files?.['files[]'] || [];
    const voiceFile = files?.['voice']?.[0];

    // Build payload
    const payload: ChatPayload = {
      sessionId,
      message: message || undefined,
      attachments: attachedFiles.map(f => ({
        fieldname: f.fieldname,
        originalname: f.originalname,
        encoding: f.encoding,
        mimetype: f.mimetype,
        size: f.size,
      })),
      voice: voiceFile ? {
        fieldname: voiceFile.fieldname,
        originalname: voiceFile.originalname,
        encoding: voiceFile.encoding,
        mimetype: voiceFile.mimetype,
        size: voiceFile.size,
      } : null,
    };

    // Send to n8n
    const response = await sendMessageToN8n(payload, attachedFiles, voiceFile);

    return res.json(response);
  } catch (error) {
    console.error('Chat error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    
    return res.status(500).json({
      error: errorMessage,
      answer: 'Sorry, I encountered an error processing your request. Please try again.',
    });
  }
});

export default router;
