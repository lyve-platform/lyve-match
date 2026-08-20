# LYVE — Database ERD Proposal (PostgreSQL)

Conventions: UUID v4 PKs (`gen_random_uuid()`), `created_at`/`updated_at timestamptz`,
`deleted_at` for soft deletion, FKs with explicit `on delete`, enums as Postgres types,
every public table gets explicit GRANTs plus RLS policies.

## 1. Enums

```
app_role            USER | MODERATOR | SUPPORT | ADMIN | SUPER_ADMIN
relationship_intent DATING | SERIOUS_RELATIONSHIP | MARRIAGE | NEW_CONNECTIONS | OPEN_TO_POSSIBILITIES
gender              WOMAN | MAN | NON_BINARY | OTHER | PREFER_NOT_TO_SAY
account_status      ACTIVE | RESTRICTED | SUSPENDED | BANNED | DELETED
verification_level  NONE | BASIC | VERIFIED
verification_status PENDING | APPROVED | REJECTED | EXPIRED
like_type           LIKE | SUPER_LIKE
report_category     FAKE_PROFILE | SCAM | HARASSMENT | HATE | SEXUAL_CONTENT | THREAT |
                    SPAM | UNDERAGE | IMPERSONATION | FINANCIAL_SOLICITATION | OTHER
report_status       OPEN | IN_REVIEW | ACTIONED | DISMISSED
payment_status      PENDING | SUCCEEDED | FAILED | REFUNDED | CANCELLED
subscription_status TRIALING | ACTIVE | PAST_DUE | CANCELLED | EXPIRED
boost_status        SCHEDULED | ACTIVE | COMPLETED | CANCELLED
frequency_pref      LOW | MEDIUM | HIGH | NEVER   -- smoking/drinking/etc.
```

## 2. Core entities

```text
users(id, auth_user_id, email_hash, phone_hash, dob, status, verification_level,
      locale, country_code, timezone, last_active_at, created_at, updated_at, deleted_at)
user_roles(id, user_id -> users, role app_role, unique(user_id, role))

profiles(id, user_id -> users unique, first_name, gender, bio, occupation, education,
         height_cm null, city, region, country_code, approx_lat, approx_lng,   -- coarsened
         smoking frequency_pref, drinking frequency_pref, has_children, wants_children,
         pets, personality jsonb, completion_score, created_at, updated_at, deleted_at)
profile_photos(id, profile_id, storage_path, position, is_primary, moderation_status)
profile_videos(id, profile_id, storage_path, duration_s, moderation_status)
profile_intents(id, profile_id, intent relationship_intent, unique(profile_id,intent))
profile_languages(id, profile_id, language_code)

interests(id, slug unique, label_en, label_ar, category)
user_interests(user_id, interest_id, primary key(user_id, interest_id))

preferences(id, user_id unique, min_age, max_age, max_distance_km, genders gender[],
            intents relationship_intent[], must_be_verified bool, extra jsonb)
privacy_settings(id, user_id unique, profile_visibility, photo_visibility,
                 show_online_status, read_receipts, discoverable, location_precision,
                 who_can_contact, incognito bool)
```

## 3. Interaction

```text
likes(id, from_user_id, to_user_id, type like_type, created_at, unique(from,to))
passes(id, from_user_id, to_user_id, created_at, unique(from,to))
super_likes(id, like_id, message null, source, created_at)     -- audit of paid usage
matches(id, user_a_id, user_b_id, compatibility_score, reasons jsonb,
        created_at, unmatched_by, unmatched_at, unique(least,greatest))
conversations(id, match_id unique, last_message_at, status)
conversation_members(conversation_id, user_id, muted, last_read_at, primary key(pair))
messages(id, conversation_id, sender_id, body, media_path, type,
         risk_flags jsonb, created_at, edited_at, deleted_at)
message_reports(id, message_id, reporter_id, category report_category, notes, status)
blocks(id, blocker_id, blocked_id, created_at, unique pair)
saved_profiles(id, user_id, target_user_id, unique pair)
```

## 4. Trust & safety

```text
reports(id, reporter_id, target_user_id, category, description, evidence jsonb,
        status report_status, assigned_to, resolution, created_at, resolved_at)
moderation_cases(id, subject_type, subject_id, ai_signals jsonb, risk_score,
                 requires_human bool, status, decided_by, decided_at)
account_actions(id, user_id, action, reason, expires_at, actor_admin_id, created_at)
appeals(id, account_action_id, user_id, message, status, reviewed_by, reviewed_at)
verification_requests(id, user_id, level, provider, provider_ref, status,
                      reviewed_by, created_at)   -- no document bytes in app DB
consents(id, user_id, consent_type, version, granted_at, revoked_at, ip_hash)
```

## 5. Monetization

```text
subscription_plans(id, code unique, name, features jsonb, is_active,
                   trial_days, sort_order)
plan_prices(id, plan_id, currency, interval, amount_minor, provider, provider_price_id)
subscriptions(id, user_id, plan_id, status subscription_status, provider,
              provider_subscription_id, current_period_end, cancel_at_period_end)
payments(id, user_id, provider, provider_payment_id, amount_minor, currency,
         status payment_status, purpose, metadata jsonb, refunded_amount_minor)
entitlements(id, user_id, key, value jsonb, expires_at)   -- resolved feature access
boosts(id, user_id, boost_type, start_at, end_at, payment_id, status boost_status)
```

## 6. Platform

```text
notifications(id, user_id, type, payload jsonb, read_at, created_at)
notification_preferences(id, user_id unique, channel_prefs jsonb)
devices(id, user_id, push_token, platform, last_seen_at)
matching_weights(id, key unique, weight numeric, updated_by, updated_at)  -- admin tunable
feature_flags(id, key unique, value jsonb)
admin_users(id, user_id, role app_role, two_factor_enabled, created_at)
admin_actions(id, admin_user_id, action, target_type, target_id, payload jsonb)
audit_logs(id, actor_id, actor_role, action, target_type, target_id, ip_hash,
           user_agent_hash, metadata jsonb, created_at)
```

## 7. Indexing plan

- `profiles(country_code, city)`, GiST/geo index on coarsened coords for radius queries.
- `likes(to_user_id, created_at desc)`, `likes(from_user_id, created_at desc)`.
- `messages(conversation_id, created_at desc)`; partial index on `risk_flags` non-empty.
- `matches(user_a_id)`, `matches(user_b_id)`, `conversations(last_message_at desc)`.
- `reports(status, created_at)`, `subscriptions(user_id, status)`.

## 8. Access rules (RLS sketch)

- Users read/write only their own rows (`auth.uid()`), plus read-limited discovery views.
- Discovery reads go through a security-definer function that returns only public fields
  and enforces blocks, privacy, incognito, and status.
- Admin access via `has_role(auth.uid(), 'ADMIN')` security-definer function; roles live
  only in `user_roles`, never on profiles.
- Every table: explicit GRANTs to `authenticated` / `service_role`; `anon` only where a
  policy truly allows public reads (none for user data).
