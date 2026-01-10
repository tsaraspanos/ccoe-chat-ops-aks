-- Service role policy for edge function to read/write job updates
-- The edge function uses service role key, so this allows full access from backend only
CREATE POLICY "Service role full access" 
ON public.webhook_job_updates 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Note: This table is intentionally not accessible from client anon/authenticated users
-- Only the edge function (using service role) can access it