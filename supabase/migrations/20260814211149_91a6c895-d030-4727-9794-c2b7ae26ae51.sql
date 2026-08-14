-- Phase 6B: store operations (rate limiting, alerting, reconciliation)

create table if not exists public.store_rate_limits (
  bucket text primary key,
  window_start timestamptz not null default now(),
  hits integer not null default 0,
  updated_at timestamptz not null default now()
);
grant all on public.store_rate_limits to service_role;
alter table public.store_rate_limits enable row level security;

create table if not exists public.store_alerts (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  severity text not null check (severity in ('info','warning','critical')),
  fingerprint text not null,
  window_start timestamptz not null,
  occurrences integer not null default 1,
  threshold integer not null default 1,
  breached boolean not null default false,
  details jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (kind, fingerprint, window_start)
);
create index if not exists store_alerts_recent_idx on public.store_alerts (last_seen_at desc);
grant select, insert, update on public.store_alerts to service_role;
alter table public.store_alerts enable row level security;

create table if not exists public.store_reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  mode text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  scanned integer not null default 0,
  corrected integer not null default 0,
  skipped_revoked integer not null default 0,
  unchanged integer not null default 0,
  failed integer not null default 0,
  notes jsonb not null default '{}'::jsonb
);
grant select, insert, update on public.store_reconciliation_runs to service_role;
alter table public.store_reconciliation_runs enable row level security;

alter table public.store_purchases
  add column if not exists last_reconciled_at timestamptz;

-- append-only guards -------------------------------------------------
create or replace function public.store_ops_no_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  raise exception 'append_only';
end $$;

drop trigger if exists store_alerts_no_delete on public.store_alerts;
create trigger store_alerts_no_delete before delete on public.store_alerts
  for each row execute function public.store_ops_no_delete();

drop trigger if exists store_reconciliation_runs_no_delete on public.store_reconciliation_runs;
create trigger store_reconciliation_runs_no_delete before delete on public.store_reconciliation_runs
  for each row execute function public.store_ops_no_delete();

-- atomic fixed-window rate limiter -----------------------------------
create or replace function public.store_rate_limit_hit(
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_hits integer;
begin
  if p_limit < 1 or p_window_seconds < 1 then
    return jsonb_build_object('allowed', false, 'hits', 0, 'limit', p_limit);
  end if;

  insert into store_rate_limits (bucket, window_start, hits, updated_at)
  values (p_bucket, v_now, 1, v_now)
  on conflict (bucket) do update set
    window_start = case
      when store_rate_limits.window_start < v_now - make_interval(secs => p_window_seconds)
      then v_now else store_rate_limits.window_start end,
    hits = case
      when store_rate_limits.window_start < v_now - make_interval(secs => p_window_seconds)
      then 1 else store_rate_limits.hits + 1 end,
    updated_at = v_now
  returning hits into v_hits;

  return jsonb_build_object('allowed', v_hits <= p_limit, 'hits', v_hits, 'limit', p_limit);
end $$;

-- grouped alert raise (dedupes inside a fixed window) -----------------
create or replace function public.store_raise_alert(
  p_kind text,
  p_severity text,
  p_fingerprint text,
  p_details jsonb default '{}'::jsonb,
  p_window_seconds integer default 300,
  p_threshold integer default 1
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / greatest(p_window_seconds, 1)) * greatest(p_window_seconds, 1));
  v_occurrences integer;
begin
  insert into store_alerts (kind, severity, fingerprint, window_start, occurrences, threshold, breached, details)
  values (p_kind, p_severity, p_fingerprint, v_window, 1, greatest(p_threshold, 1), 1 >= greatest(p_threshold, 1), coalesce(p_details, '{}'::jsonb))
  on conflict (kind, fingerprint, window_start) do update set
    occurrences = store_alerts.occurrences + 1,
    breached = (store_alerts.occurrences + 1) >= greatest(p_threshold, 1),
    severity = p_severity,
    last_seen_at = now(),
    details = coalesce(p_details, '{}'::jsonb)
  returning occurrences into v_occurrences;

  return jsonb_build_object(
    'occurrences', v_occurrences,
    'threshold', greatest(p_threshold, 1),
    'breached', v_occurrences >= greatest(p_threshold, 1)
  );
end $$;

revoke execute on function public.store_rate_limit_hit(text, integer, integer) from anon, authenticated;
revoke execute on function public.store_raise_alert(text, text, text, jsonb, integer, integer) from anon, authenticated;
revoke execute on function public.store_ops_no_delete() from anon, authenticated;