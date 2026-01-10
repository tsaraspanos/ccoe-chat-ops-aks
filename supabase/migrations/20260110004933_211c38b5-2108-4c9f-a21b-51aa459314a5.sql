-- Persist webhook job updates so polling works across cold starts
CREATE TABLE IF NOT EXISTS public.webhook_job_updates (
  run_id UUID PRIMARY KEY,
  session_id UUID,
  pipeline_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'error')),
  answer TEXT,
  meta JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security (no policies => not readable/writable from client anon/auth)
ALTER TABLE public.webhook_job_updates ENABLE ROW LEVEL SECURITY;

-- Updated-at trigger helper
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_webhook_job_updates_updated_at ON public.webhook_job_updates;
CREATE TRIGGER trg_webhook_job_updates_updated_at
BEFORE UPDATE ON public.webhook_job_updates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_webhook_job_updates_session_id ON public.webhook_job_updates(session_id);
CREATE INDEX IF NOT EXISTS idx_webhook_job_updates_created_at ON public.webhook_job_updates(created_at DESC);