# LYVE — Least-Privilege Access & Security Monitoring

Status: implemented, continuously enforced in CI.
Last verified: 2026-08-21.

## 1. Scan status

A full security scan after the `SECURITY DEFINER` remediation returns **no new
findings**. The only remaining entry is the previously reviewed and accepted
"signed-in users can execute SECURITY DEFINER function" class, which is by
design: every one of those routines performs its own permission check
(`private.require_permission`) before touching data.

## 2. Role model

| Role | Meaning | Default database privileges |
| --- | --- | --- |
| `anon` | Not signed in | Only explicitly public reads. Zero elevated routines. |
| `authenticated` | Signed-in member | Own data plus permission-checked staff routines. |
| `service_role` | Server/back-office only | Internal writers, schedulers, reconciliation. |

Staff powers are **not** roles at the database level — they are permissions
granted to `app_role` values in `role_permissions` and checked inside each
routine. Two new permissions were added, both to `super_admin` only:

- `security.view` — read the alert log and the least-privilege report.
- `security.ack` — acknowledge an alert.

## 3. Least-privilege rules for database routines

Enforced automatically by `tests/security/function-privileges.ts`:

1. No `SECURITY DEFINER` routine may be executable by `anon`.
2. No `admin_*` routine may be executable by `anon`.
3. `billing_*` routines (store event application, entitlement revocation,
   purchase linking) are **service role only** — never callable by a signed-in
   user.
4. Internal writers such as `record_security_alert` and
   `security_privilege_audit` are **service role only**.
5. Trigger functions carry no `EXECUTE` grant to any client role.
6. Every remaining `authenticated`-executable definer routine must begin with a
   `private.require_permission(...)` or ownership check.

Current posture: 80+ routines in `public`, exactly **one** (`locale_availability`,
`SECURITY INVOKER`, public settings read) reachable without signing in, and
**zero** least-privilege violations.

Staff can review the live matrix at **Admin → Security → Least-privilege
report**, which lists each routine with its mode and per-role execute rights.

## 4. Security monitoring and alerts

### Alert store

`public.security_alerts` — `kind`, `severity` (`info` / `warning` / `critical`),
`actor_id`, `target_id`, `summary`, `metadata`, `created_at`,
`acknowledged_by`, `acknowledged_at`.

- Readable only by holders of `security.view`.
- No client role may insert, update or delete rows: entries are written solely
  by database triggers through `record_security_alert` (service role).
- Alerts never contain email, phone, message bodies, coordinates or payment
  data — identifiers and action codes only.

### What raises an alert

| Trigger | Kind | Severity |
| --- | --- | --- |
| Staff role granted | `role.granted` | critical |
| Staff role changed | `role.changed` | critical |
| Staff role revoked | `role.revoked` | warning |
| Role change / entitlement grant / permanent ban / payments setting change | `privileged.action` | critical |
| Entitlement revoke, suspension, localization change, ticket deletion | `privileged.action` | warning |
| More than 25 admin actions by one actor within 5 minutes | `admin.burst` | critical |

Burst alerts are de-duplicated to at most one per actor per 5-minute window.

### Where alerts surface

**Admin → Security** shows all alerts newest-and-most-severe first, with an
unacknowledged counter, auto-refresh every 60 seconds, and an *Acknowledge*
action for `security.ack` holders. Acknowledgement is recorded with the
acknowledging staff id and timestamp, so the trail stays complete.

## 5. Continuous checking in CI

`.github/workflows/security-suite.yml` runs on every pull request, every push
to `main`, on manual dispatch, and now **daily at 03:17 UTC** (the database can
drift without a code change). The mandatory gate is:

1. `bun run lint`
2. `bun run build`
3. `bun run test:security` — full regression suite, now including the
   least-privilege suite
4. `bun run test:privileges` — standalone least-privilege and monitoring audit
5. `bun audit --audit-level=high` — dependency vulnerability check
6. Refusal of any production store credential in CI

Any failure blocks the build. Nothing in the pipeline soft-fails.

## 6. Local commands

```bash
bun run test:privileges   # least-privilege + monitoring audit
bun run test:security     # full security regression suite
bun run test:smoke        # SSR rendering health
```
