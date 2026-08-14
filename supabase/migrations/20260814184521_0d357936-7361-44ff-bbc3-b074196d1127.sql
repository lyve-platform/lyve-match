-- ============================================================
-- LYVE Phase 3 — Messaging
-- ============================================================

CREATE TYPE public.message_type AS ENUM ('text');
CREATE TYPE public.message_moderation_status AS ENUM ('unreviewed', 'cleared', 'flagged', 'removed');

-- ------------------------------------------------------------
-- conversations
-- ------------------------------------------------------------
CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL UNIQUE REFERENCES public.matches(id) ON DELETE CASCADE,
  profile_a uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  profile_b uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversations_ordered_pair CHECK (profile_a < profile_b),
  CONSTRAINT conversations_unique_pair UNIQUE (profile_a, profile_b)
);

GRANT SELECT ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE INDEX conversations_profile_a_idx ON public.conversations (profile_a, last_message_at DESC);
CREATE INDEX conversations_profile_b_idx ON public.conversations (profile_b, last_message_at DESC);

-- ------------------------------------------------------------
-- conversation_members
-- ------------------------------------------------------------
CREATE TABLE public.conversation_members (
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, profile_id)
);

GRANT SELECT ON public.conversation_members TO authenticated;
GRANT ALL ON public.conversation_members TO service_role;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;

CREATE INDEX conversation_members_profile_idx ON public.conversation_members (profile_id);

-- ------------------------------------------------------------
-- messages
-- ------------------------------------------------------------
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message_type public.message_type NOT NULL DEFAULT 'text',
  body text,
  moderation_status public.message_moderation_status NOT NULL DEFAULT 'unreviewed',
  moderation_flags text[] NOT NULL DEFAULT '{}',
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT messages_text_body CHECK (
    message_type <> 'text'
    OR deleted_at IS NOT NULL
    OR (body IS NOT NULL AND length(btrim(body)) BETWEEN 1 AND 4000)
  )
);

GRANT SELECT, INSERT, UPDATE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Keyset pagination: newest first within a conversation.
CREATE INDEX messages_conversation_created_idx
  ON public.messages (conversation_id, created_at DESC, id DESC);
CREATE INDEX messages_sender_idx ON public.messages (sender_id);

-- ------------------------------------------------------------
-- message_reads
-- ------------------------------------------------------------
CREATE TABLE public.message_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  reader_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT message_reads_unique UNIQUE (message_id, reader_id)
);

GRANT SELECT, INSERT ON public.message_reads TO authenticated;
GRANT ALL ON public.message_reads TO service_role;
ALTER TABLE public.message_reads ENABLE ROW LEVEL SECURITY;

CREATE INDEX message_reads_conversation_idx ON public.message_reads (conversation_id, reader_id);

-- ------------------------------------------------------------
-- message_reports
-- ------------------------------------------------------------
CREATE TABLE public.message_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reported_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  category public.report_category NOT NULL,
  description text,
  status public.report_status NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT message_reports_no_self CHECK (reporter_id <> reported_id),
  CONSTRAINT message_reports_unique UNIQUE (reporter_id, message_id),
  CONSTRAINT message_reports_description_length CHECK (description IS NULL OR length(description) <= 1000)
);

GRANT SELECT, INSERT ON public.message_reports TO authenticated;
GRANT ALL ON public.message_reports TO service_role;
ALTER TABLE public.message_reports ENABLE ROW LEVEL SECURITY;

CREATE INDEX message_reports_reporter_idx ON public.message_reports (reporter_id, created_at DESC);

-- ============================================================
-- Authorisation helpers (SECURITY DEFINER, pinned search_path)
-- ============================================================

-- Membership check used by every messaging policy. Definer rights avoid
-- policy recursion between conversations and conversation_members.
CREATE OR REPLACE FUNCTION public.is_conversation_member(p_conversation uuid, p_profile uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_members cm
    WHERE cm.conversation_id = p_conversation AND cm.profile_id = p_profile
  );
$$;

-- Readable = member and the pair is not blocked in either direction.
CREATE OR REPLACE FUNCTION public.can_read_conversation(p_conversation uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversations c
    WHERE c.id = p_conversation
      AND auth.uid() IN (c.profile_a, c.profile_b)
      AND NOT public.is_blocked_pair(c.profile_a, c.profile_b)
  );
$$;

-- Sendable = readable, the match is still active, and neither side is deleted.
CREATE OR REPLACE FUNCTION public.can_send_message(p_conversation uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversations c
    JOIN public.matches m ON m.id = c.match_id
    JOIN public.profiles pa ON pa.id = c.profile_a
    JOIN public.profiles pb ON pb.id = c.profile_b
    WHERE c.id = p_conversation
      AND auth.uid() IN (c.profile_a, c.profile_b)
      AND m.status = 'active'
      AND pa.deleted_at IS NULL
      AND pb.deleted_at IS NULL
      AND NOT public.is_blocked_pair(c.profile_a, c.profile_b)
  );
$$;

REVOKE ALL ON FUNCTION public.is_conversation_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_read_conversation(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_send_message(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_conversation_member(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_read_conversation(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_send_message(uuid) TO service_role;

-- ============================================================
-- RLS policies
-- ============================================================

CREATE POLICY conversations_select_member ON public.conversations
  FOR SELECT TO authenticated
  USING (
    auth.uid() IN (profile_a, profile_b)
    AND NOT public.is_blocked_pair(profile_a, profile_b)
  );

CREATE POLICY conversation_members_select_member ON public.conversation_members
  FOR SELECT TO authenticated
  USING (public.can_read_conversation(conversation_id));

CREATE POLICY messages_select_member ON public.messages
  FOR SELECT TO authenticated
  USING (public.can_read_conversation(conversation_id));

CREATE POLICY messages_insert_own ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND deleted_at IS NULL
    AND public.can_send_message(conversation_id)
  );

-- UPDATE is narrowed further by a guard trigger: soft delete only.
CREATE POLICY messages_update_own ON public.messages
  FOR UPDATE TO authenticated
  USING (sender_id = auth.uid() AND public.can_read_conversation(conversation_id))
  WITH CHECK (sender_id = auth.uid());

CREATE POLICY message_reads_select_involved ON public.message_reads
  FOR SELECT TO authenticated
  USING (
    public.can_read_conversation(conversation_id)
    AND (
      reader_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.messages m WHERE m.id = message_id AND m.sender_id = auth.uid())
    )
  );

CREATE POLICY message_reads_insert_own ON public.message_reads
  FOR INSERT TO authenticated
  WITH CHECK (
    reader_id = auth.uid()
    AND public.can_read_conversation(conversation_id)
    AND EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_id
        AND m.conversation_id = message_reads.conversation_id
        AND m.sender_id <> auth.uid()
    )
  );

CREATE POLICY message_reports_select_own ON public.message_reports
  FOR SELECT TO authenticated
  USING (reporter_id = auth.uid());

CREATE POLICY message_reports_insert_own ON public.message_reports
  FOR INSERT TO authenticated
  WITH CHECK (
    reporter_id = auth.uid()
    AND status = 'open'
    AND public.can_read_conversation(conversation_id)
    AND EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_id
        AND m.conversation_id = message_reports.conversation_id
        AND m.sender_id = message_reports.reported_id
        AND m.sender_id <> auth.uid()
    )
  );

-- ============================================================
-- Triggers
-- ============================================================

-- A conversation exists only as the consequence of a real match.
CREATE OR REPLACE FUNCTION public.create_conversation_for_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conv_id uuid;
BEGIN
  INSERT INTO public.conversations (match_id, profile_a, profile_b)
  VALUES (NEW.id, NEW.profile_a, NEW.profile_b)
  ON CONFLICT (match_id) DO NOTHING
  RETURNING id INTO conv_id;

  IF conv_id IS NULL THEN
    SELECT id INTO conv_id FROM public.conversations WHERE match_id = NEW.id;
  END IF;

  IF conv_id IS NOT NULL THEN
    INSERT INTO public.conversation_members (conversation_id, profile_id)
    VALUES (conv_id, NEW.profile_a), (conv_id, NEW.profile_b)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER matches_create_conversation
AFTER INSERT ON public.matches
FOR EACH ROW EXECUTE FUNCTION public.create_conversation_for_match();

-- Everything the client must not control is stamped server-side here.
CREATE OR REPLACE FUNCTION public.guard_message_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.sender_id := auth.uid();
    IF NOT public.can_send_message(NEW.conversation_id) THEN
      RAISE EXCEPTION 'FORBIDDEN: messaging is not available for this conversation'
        USING ERRCODE = 'check_violation';
    END IF;
    -- Timestamps and moderation state are never client supplied.
    NEW.created_at := now();
    NEW.updated_at := now();
    NEW.deleted_at := NULL;
    NEW.moderation_status := 'unreviewed';
    NEW.moderation_flags := '{}';
  END IF;

  IF NEW.message_type = 'text' THEN
    NEW.body := btrim(NEW.body);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER messages_guard_insert
BEFORE INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.guard_message_insert();

-- Members may only soft-delete their own message; nothing else may change.
CREATE OR REPLACE FUNCTION public.guard_message_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> OLD.sender_id THEN
    RETURN NEW; -- privileged/back-office path
  END IF;

  NEW.id := OLD.id;
  NEW.conversation_id := OLD.conversation_id;
  NEW.sender_id := OLD.sender_id;
  NEW.message_type := OLD.message_type;
  NEW.created_at := OLD.created_at;
  NEW.moderation_status := OLD.moderation_status;
  NEW.moderation_flags := OLD.moderation_flags;

  IF OLD.deleted_at IS NOT NULL THEN
    RETURN OLD; -- already withdrawn: immutable
  END IF;

  IF NEW.deleted_at IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: a sent message can only be withdrawn, not edited'
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.deleted_at := now();
  NEW.updated_at := now();
  NEW.body := NULL;
  RETURN NEW;
END;
$$;

CREATE TRIGGER messages_guard_update
BEFORE UPDATE ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.guard_message_update();

-- Conversation ordering for the inbox.
CREATE OR REPLACE FUNCTION public.bump_conversation_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.conversations
  SET last_message_at = NEW.created_at, updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NULL;
END;
$$;

CREATE TRIGGER messages_bump_conversation
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.bump_conversation_activity();

CREATE TRIGGER conversations_set_updated_at
BEFORE UPDATE ON public.conversations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER conversation_members_set_updated_at
BEFORE UPDATE ON public.conversation_members
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER message_reports_set_updated_at
BEFORE UPDATE ON public.message_reports
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- Read state
-- ============================================================

CREATE OR REPLACE FUNCTION public.mark_conversation_read(p_conversation uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  viewer uuid := auth.uid();
  marked integer := 0;
BEGIN
  IF viewer IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT public.can_read_conversation(p_conversation) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'insufficient_privilege';
  END IF;

  WITH inserted AS (
    INSERT INTO public.message_reads (message_id, conversation_id, reader_id)
    SELECT m.id, m.conversation_id, viewer
    FROM public.messages m
    WHERE m.conversation_id = p_conversation
      AND m.sender_id <> viewer
      AND m.deleted_at IS NULL
    ON CONFLICT (message_id, reader_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO marked FROM inserted;

  UPDATE public.conversation_members
  SET last_read_at = now()
  WHERE conversation_id = p_conversation AND profile_id = viewer;

  RETURN marked;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_conversation_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(uuid) TO authenticated, service_role;

-- ============================================================
-- Inbox
-- ============================================================

CREATE OR REPLACE FUNCTION public.my_conversations()
RETURNS TABLE(
  conversation_id uuid,
  match_id uuid,
  other_profile_id uuid,
  first_name text,
  age integer,
  photo_path text,
  can_send boolean,
  last_message_at timestamptz,
  last_message_preview text,
  last_message_sender_id uuid,
  last_message_deleted boolean,
  unread_count integer,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE viewer uuid := auth.uid();
BEGIN
  IF viewer IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.match_id,
    other.id,
    other.first_name,
    date_part('year', age(other.date_of_birth))::int,
    (SELECT ph.storage_path FROM public.profile_photos ph
      WHERE ph.profile_id = other.id
      ORDER BY ph.is_primary DESC, ph.display_order LIMIT 1),
    (m.status = 'active' AND other.deleted_at IS NULL),
    c.last_message_at,
    (SELECT CASE WHEN lm.deleted_at IS NOT NULL THEN NULL ELSE left(lm.body, 140) END
       FROM public.messages lm WHERE lm.conversation_id = c.id
       ORDER BY lm.created_at DESC, lm.id DESC LIMIT 1),
    (SELECT lm.sender_id FROM public.messages lm WHERE lm.conversation_id = c.id
       ORDER BY lm.created_at DESC, lm.id DESC LIMIT 1),
    (SELECT lm.deleted_at IS NOT NULL FROM public.messages lm WHERE lm.conversation_id = c.id
       ORDER BY lm.created_at DESC, lm.id DESC LIMIT 1),
    (SELECT count(*)::int FROM public.messages um
       WHERE um.conversation_id = c.id
         AND um.sender_id <> viewer
         AND um.deleted_at IS NULL
         AND um.created_at > coalesce(cm.last_read_at, '-infinity'::timestamptz)),
    c.created_at
  FROM public.conversations c
  JOIN public.conversation_members cm ON cm.conversation_id = c.id AND cm.profile_id = viewer
  JOIN public.matches m ON m.id = c.match_id
  JOIN public.profiles other ON other.id = CASE WHEN c.profile_a = viewer THEN c.profile_b ELSE c.profile_a END
  WHERE NOT public.is_blocked_pair(c.profile_a, c.profile_b)
    AND m.status <> 'blocked'
  ORDER BY coalesce(c.last_message_at, c.created_at) DESC
  LIMIT 100;
END;
$$;

REVOKE ALL ON FUNCTION public.my_conversations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_conversations() TO authenticated, service_role;

-- ============================================================
-- Backfill conversations for matches that already exist
-- ============================================================
INSERT INTO public.conversations (match_id, profile_a, profile_b)
SELECT m.id, m.profile_a, m.profile_b FROM public.matches m
ON CONFLICT DO NOTHING;

INSERT INTO public.conversation_members (conversation_id, profile_id)
SELECT c.id, c.profile_a FROM public.conversations c
UNION ALL
SELECT c.id, c.profile_b FROM public.conversations c
ON CONFLICT DO NOTHING;

-- ============================================================
-- Realtime (RLS still applies to every subscriber)
-- ============================================================
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.message_reads REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reads;