-- Allow n8n runIDs to be arbitrary strings (not necessarily UUIDs)
-- This fixes polling + webhook upserts failing with: invalid input syntax for type uuid

ALTER TABLE public.webhook_job_updates
  ALTER COLUMN run_id TYPE text
  USING run_id::text;

-- Ensure the primary key remains valid after type change
-- (Postgres keeps the PK constraint; this is just an explicit sanity check)
-- No-op if already present.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.webhook_job_updates'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE public.webhook_job_updates ADD PRIMARY KEY (run_id);
  END IF;
END $$;
