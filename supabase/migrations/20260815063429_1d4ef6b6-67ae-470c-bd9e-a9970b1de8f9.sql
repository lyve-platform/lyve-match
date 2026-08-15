CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Stores the maintenance secret in the encrypted vault. The value is supplied
-- at runtime by the server (from secret storage) and is never written into
-- source control or into any migration.
CREATE OR REPLACE FUNCTION public.set_account_purge_secret(p_secret text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_secret IS NULL OR length(btrim(p_secret)) < 16 THEN
    RAISE EXCEPTION 'maintenance secret too short';
  END IF;

  SELECT id INTO v_id FROM vault.secrets WHERE name = 'account_purge_secret';

  IF v_id IS NULL THEN
    PERFORM vault.create_secret(btrim(p_secret), 'account_purge_secret', 'LYVE scheduled account purge maintenance secret');
  ELSE
    PERFORM vault.update_secret(v_id, btrim(p_secret), 'account_purge_secret', 'LYVE scheduled account purge maintenance secret');
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_account_purge_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_account_purge_secret(text) TO service_role;

-- Performs the scheduled call. Reads the secret from the vault at call time,
-- so no literal secret exists in scheduled SQL. Returns the pg_net request id
-- only; it never returns or logs member data.
CREATE OR REPLACE FUNCTION public.trigger_account_purge_http()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret text;
  v_url text;
  v_request_id bigint;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets WHERE name = 'account_purge_secret';

  IF v_secret IS NULL THEN
    RAISE EXCEPTION 'account purge secret is not configured';
  END IF;

  SELECT decrypted_secret INTO v_url
  FROM vault.decrypted_secrets WHERE name = 'account_purge_url';

  IF v_url IS NULL THEN
    RAISE EXCEPTION 'account purge url is not configured';
  END IF;

  SELECT net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_account_purge_http() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_account_purge_http() TO service_role;

-- Stores the endpoint URL in the vault as well, so the scheduled command
-- carries no deployment-specific configuration.
CREATE OR REPLACE FUNCTION public.set_account_purge_url(p_url text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_url IS NULL OR p_url !~ '^https://' THEN
    RAISE EXCEPTION 'purge url must be https';
  END IF;

  SELECT id INTO v_id FROM vault.secrets WHERE name = 'account_purge_url';

  IF v_id IS NULL THEN
    PERFORM vault.create_secret(btrim(p_url), 'account_purge_url', 'LYVE scheduled account purge endpoint');
  ELSE
    PERFORM vault.update_secret(v_id, btrim(p_url), 'account_purge_url', 'LYVE scheduled account purge endpoint');
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_account_purge_url(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_account_purge_url(text) TO service_role;