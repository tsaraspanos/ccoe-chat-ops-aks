import { Router, Request, Response } from 'express';

const router = Router();

/**
 * Returns runtime configuration for the frontend.
 * This allows environment variables to be changed without rebuilding.
 */
router.get('/', (req: Request, res: Response) => {
  res.json({
    n8nWebhookUrl: process.env.N8N_WEBHOOK_URL || '',
  });
});

export default router;
