CREATE OR REPLACE FUNCTION public.scheduled_job_status(p_jobname text)
RETURNS TABLE (jobname text, schedule text, active boolean, command text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT j.jobname::text, j.schedule::text, j.active, j.command::text
  FROM cron.job j
  WHERE j.jobname = p_jobname;
END;
$$;

REVOKE ALL ON FUNCTION public.scheduled_job_status(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.scheduled_job_status(text) TO service_role;