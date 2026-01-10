-- Drop the existing check constraint
ALTER TABLE public.webhook_job_updates DROP CONSTRAINT IF EXISTS webhook_job_updates_status_check;

-- Add a more permissive check constraint that accepts common status values (case-insensitive)
ALTER TABLE public.webhook_job_updates ADD CONSTRAINT webhook_job_updates_status_check 
CHECK (lower(status) IN ('pending', 'in_progress', 'in-progress', 'running', 'completed', 'complete', 'done', 'success', 'error', 'failed', 'failure', 'cancelled', 'canceled'));