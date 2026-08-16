CREATE TYPE public.notification_kind AS ENUM ('support_reply', 'support_status');

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind public.notification_kind NOT NULL,
  ticket_id uuid REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  title text NOT NULL,
  detail text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notifications_profile_created_idx
  ON public.notifications (profile_id, created_at DESC);

GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT TO authenticated
  USING (profile_id = auth.uid());

CREATE POLICY notifications_update_own ON public.notifications
  FOR UPDATE TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

CREATE OR REPLACE FUNCTION public.notify_support_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_subject text;
BEGIN
  IF NOT NEW.is_staff THEN
    RETURN NEW;
  END IF;

  SELECT profile_id, subject INTO v_owner, v_subject
  FROM public.support_tickets
  WHERE id = NEW.ticket_id;

  IF v_owner IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (profile_id, kind, ticket_id, title, detail)
  VALUES (v_owner, 'support_reply', NEW.ticket_id, v_subject, left(NEW.body, 160));

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_support_reply() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER support_reply_notify
AFTER INSERT ON public.support_ticket_replies
FOR EACH ROW EXECUTE FUNCTION public.notify_support_reply();

CREATE OR REPLACE FUNCTION public.notify_support_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.notifications (profile_id, kind, ticket_id, title, detail)
    VALUES (NEW.profile_id, 'support_status', NEW.id, NEW.subject, NEW.status);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_support_status() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER support_status_notify
AFTER UPDATE OF status ON public.support_tickets
FOR EACH ROW EXECUTE FUNCTION public.notify_support_status();