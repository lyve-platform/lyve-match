CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'other',
  subject text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_tickets_subject_len CHECK (char_length(btrim(subject)) BETWEEN 3 AND 140),
  CONSTRAINT support_tickets_body_len CHECK (char_length(btrim(body)) BETWEEN 10 AND 4000),
  CONSTRAINT support_tickets_category_valid CHECK (category IN ('account','safety','billing','technical','other')),
  CONSTRAINT support_tickets_status_valid CHECK (status IN ('open','in_progress','resolved','closed'))
);

CREATE INDEX support_tickets_profile_idx ON public.support_tickets (profile_id, created_at DESC);

GRANT SELECT, INSERT ON public.support_tickets TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "support_tickets_insert_own" ON public.support_tickets
  FOR INSERT TO authenticated
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "support_tickets_select_own" ON public.support_tickets
  FOR SELECT TO authenticated
  USING (profile_id = auth.uid() OR public.has_permission(auth.uid(), 'admin.access'));

CREATE TRIGGER support_tickets_set_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();