-- Enable realtime for webhook_job_updates table so the chat UI can receive instant updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.webhook_job_updates;