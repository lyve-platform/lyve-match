export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      account_appeals: {
        Row: {
          body: string
          case_id: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          id: string
          profile_id: string
          status: Database["public"]["Enums"]["appeal_status"]
          updated_at: string
        }
        Insert: {
          body: string
          case_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          profile_id: string
          status?: Database["public"]["Enums"]["appeal_status"]
          updated_at?: string
        }
        Update: {
          body?: string
          case_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          profile_id?: string
          status?: Database["public"]["Enums"]["appeal_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_appeals_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "moderation_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_appeals_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      account_deletion_requests: {
        Row: {
          created_at: string
          id: string
          processed_at: string | null
          profile_id: string
          reason: string | null
          requested_at: string
          scheduled_purge_at: string
          status: Database["public"]["Enums"]["deletion_request_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          processed_at?: string | null
          profile_id: string
          reason?: string | null
          requested_at?: string
          scheduled_purge_at?: string
          status?: Database["public"]["Enums"]["deletion_request_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          processed_at?: string | null
          profile_id?: string
          reason?: string | null
          requested_at?: string
          scheduled_purge_at?: string
          status?: Database["public"]["Enums"]["deletion_request_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_deletion_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          case_id: string | null
          created_at: string
          id: string
          metadata: Json
          reason: string | null
          target_id: string | null
          target_type: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          case_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          reason?: string | null
          target_id?: string | null
          target_type: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          case_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          reason?: string | null
          target_id?: string | null
          target_type?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          created_at: string
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          created_at?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          created_at?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      billing_accounts: {
        Row: {
          created_at: string
          currency: string
          id: string
          locale: string | null
          profile_id: string
          provider: Database["public"]["Enums"]["billing_provider"]
          provider_customer_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          locale?: string | null
          profile_id: string
          provider?: Database["public"]["Enums"]["billing_provider"]
          provider_customer_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          locale?: string | null
          profile_id?: string
          provider?: Database["public"]["Enums"]["billing_provider"]
          provider_customer_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_accounts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_events: {
        Row: {
          created_at: string
          error: string | null
          event_created_at: string | null
          event_type: string
          id: string
          payload_summary: Json
          processed_at: string | null
          profile_id: string | null
          provider: Database["public"]["Enums"]["billing_provider"]
          provider_event_id: string
          received_at: string
          signature_verified: boolean
          status: Database["public"]["Enums"]["billing_event_status"]
          subscription_id: string | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          event_created_at?: string | null
          event_type: string
          id?: string
          payload_summary?: Json
          processed_at?: string | null
          profile_id?: string | null
          provider: Database["public"]["Enums"]["billing_provider"]
          provider_event_id: string
          received_at?: string
          signature_verified?: boolean
          status?: Database["public"]["Enums"]["billing_event_status"]
          subscription_id?: string | null
        }
        Update: {
          created_at?: string
          error?: string | null
          event_created_at?: string | null
          event_type?: string
          id?: string
          payload_summary?: Json
          processed_at?: string | null
          profile_id?: string | null
          provider?: Database["public"]["Enums"]["billing_provider"]
          provider_event_id?: string
          received_at?: string
          signature_verified?: boolean
          status?: Database["public"]["Enums"]["billing_event_status"]
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_events_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_events_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
          id: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
          id?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_members: {
        Row: {
          conversation_id: string
          created_at: string
          last_read_at: string | null
          profile_id: string
          updated_at: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          last_read_at?: string | null
          profile_id: string
          updated_at?: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          last_read_at?: string | null
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_members_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          last_message_at: string | null
          match_id: string
          profile_a: string
          profile_b: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          match_id: string
          profile_a: string
          profile_b: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          match_id?: string
          profile_a?: string
          profile_b?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: true
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_profile_a_fkey"
            columns: ["profile_a"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_profile_b_fkey"
            columns: ["profile_b"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      entitlements: {
        Row: {
          created_at: string
          expires_at: string | null
          granted_by: string | null
          id: string
          key: string
          metadata: Json
          profile_id: string
          reason: string | null
          revoke_reason: string | null
          revoked_at: string | null
          source: Database["public"]["Enums"]["entitlement_source"]
          starts_at: string
          subscription_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          granted_by?: string | null
          id?: string
          key: string
          metadata?: Json
          profile_id: string
          reason?: string | null
          revoke_reason?: string | null
          revoked_at?: string | null
          source?: Database["public"]["Enums"]["entitlement_source"]
          starts_at?: string
          subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          granted_by?: string | null
          id?: string
          key?: string
          metadata?: Json
          profile_id?: string
          reason?: string | null
          revoke_reason?: string | null
          revoked_at?: string | null
          source?: Database["public"]["Enums"]["entitlement_source"]
          starts_at?: string
          subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "entitlements_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entitlements_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      interests: {
        Row: {
          category: string | null
          created_at: string
          id: string
          is_active: boolean
          label_ar: string
          label_en: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          label_ar: string
          label_en: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          label_ar?: string
          label_en?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      likes: {
        Row: {
          created_at: string
          id: string
          likee_id: string
          liker_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          likee_id: string
          liker_id: string
        }
        Update: {
          created_at?: string
          id?: string
          likee_id?: string
          liker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "likes_likee_id_fkey"
            columns: ["likee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "likes_liker_id_fkey"
            columns: ["liker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          created_at: string
          ended_at: string | null
          ended_by: string | null
          id: string
          profile_a: string
          profile_b: string
          status: Database["public"]["Enums"]["match_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          ended_by?: string | null
          id?: string
          profile_a: string
          profile_b: string
          status?: Database["public"]["Enums"]["match_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          ended_by?: string | null
          id?: string
          profile_a?: string
          profile_b?: string
          status?: Database["public"]["Enums"]["match_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "matches_ended_by_fkey"
            columns: ["ended_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_profile_a_fkey"
            columns: ["profile_a"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_profile_b_fkey"
            columns: ["profile_b"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reads: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          message_id: string
          read_at: string
          reader_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          message_id: string
          read_at?: string
          reader_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          message_id?: string
          read_at?: string
          reader_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reads_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reads_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reads_reader_id_fkey"
            columns: ["reader_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reports: {
        Row: {
          category: Database["public"]["Enums"]["report_category"]
          conversation_id: string
          created_at: string
          description: string | null
          id: string
          message_id: string
          reported_id: string
          reporter_id: string
          status: Database["public"]["Enums"]["report_status"]
          updated_at: string
        }
        Insert: {
          category: Database["public"]["Enums"]["report_category"]
          conversation_id: string
          created_at?: string
          description?: string | null
          id?: string
          message_id: string
          reported_id: string
          reporter_id: string
          status?: Database["public"]["Enums"]["report_status"]
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["report_category"]
          conversation_id?: string
          created_at?: string
          description?: string | null
          id?: string
          message_id?: string
          reported_id?: string
          reporter_id?: string
          status?: Database["public"]["Enums"]["report_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reports_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reports_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reports_reported_id_fkey"
            columns: ["reported_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string | null
          conversation_id: string
          created_at: string
          deleted_at: string | null
          id: string
          message_type: Database["public"]["Enums"]["message_type"]
          moderation_flags: string[]
          moderation_status: Database["public"]["Enums"]["message_moderation_status"]
          sender_id: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          message_type?: Database["public"]["Enums"]["message_type"]
          moderation_flags?: string[]
          moderation_status?: Database["public"]["Enums"]["message_moderation_status"]
          sender_id: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          message_type?: Database["public"]["Enums"]["message_type"]
          moderation_flags?: string[]
          moderation_status?: Database["public"]["Enums"]["message_moderation_status"]
          sender_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_cases: {
        Row: {
          assigned_to: string | null
          case_number: number
          category: Database["public"]["Enums"]["report_category"] | null
          created_at: string
          id: string
          message_report_id: string | null
          priority: Database["public"]["Enums"]["moderation_priority"]
          report_count: number
          report_id: string | null
          resolution_note: string | null
          resolved_at: string | null
          signal_count: number
          source: Database["public"]["Enums"]["moderation_source"]
          status: Database["public"]["Enums"]["moderation_case_status"]
          subject_id: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          case_number?: never
          category?: Database["public"]["Enums"]["report_category"] | null
          created_at?: string
          id?: string
          message_report_id?: string | null
          priority?: Database["public"]["Enums"]["moderation_priority"]
          report_count?: number
          report_id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          signal_count?: number
          source: Database["public"]["Enums"]["moderation_source"]
          status?: Database["public"]["Enums"]["moderation_case_status"]
          subject_id: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          case_number?: never
          category?: Database["public"]["Enums"]["report_category"] | null
          created_at?: string
          id?: string
          message_report_id?: string | null
          priority?: Database["public"]["Enums"]["moderation_priority"]
          report_count?: number
          report_id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          signal_count?: number
          source?: Database["public"]["Enums"]["moderation_source"]
          status?: Database["public"]["Enums"]["moderation_case_status"]
          subject_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "moderation_cases_message_report_id_fkey"
            columns: ["message_report_id"]
            isOneToOne: false
            referencedRelation: "message_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_cases_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_cases_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_progress: {
        Row: {
          completed_steps: string[]
          created_at: string
          current_step: string
          is_complete: boolean
          profile_id: string
          updated_at: string
        }
        Insert: {
          completed_steps?: string[]
          created_at?: string
          current_step?: string
          is_complete?: boolean
          profile_id: string
          updated_at?: string
        }
        Update: {
          completed_steps?: string[]
          created_at?: string
          current_step?: string
          is_complete?: boolean
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_progress_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      passes: {
        Row: {
          created_at: string
          id: string
          passed_id: string
          passer_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          passed_id: string
          passer_id: string
        }
        Update: {
          created_at?: string
          id?: string
          passed_id?: string
          passer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "passes_passed_id_fkey"
            columns: ["passed_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "passes_passer_id_fkey"
            columns: ["passer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      preferences: {
        Row: {
          created_at: string
          intents: Database["public"]["Enums"]["relationship_intent"][]
          max_age: number
          max_distance_km: number
          min_age: number
          preferred_genders: Database["public"]["Enums"]["gender_type"][]
          profile_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          intents?: Database["public"]["Enums"]["relationship_intent"][]
          max_age?: number
          max_distance_km?: number
          min_age?: number
          preferred_genders?: Database["public"]["Enums"]["gender_type"][]
          profile_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          intents?: Database["public"]["Enums"]["relationship_intent"][]
          max_age?: number
          max_distance_km?: number
          min_age?: number
          preferred_genders?: Database["public"]["Enums"]["gender_type"][]
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "preferences_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      privacy_settings: {
        Row: {
          allow_messages: Database["public"]["Enums"]["message_audience"]
          created_at: string
          discoverable: boolean
          profile_id: string
          profile_visibility: Database["public"]["Enums"]["profile_visibility"]
          show_online_status: boolean
          show_read_receipts: boolean
          updated_at: string
        }
        Insert: {
          allow_messages?: Database["public"]["Enums"]["message_audience"]
          created_at?: string
          discoverable?: boolean
          profile_id: string
          profile_visibility?: Database["public"]["Enums"]["profile_visibility"]
          show_online_status?: boolean
          show_read_receipts?: boolean
          updated_at?: string
        }
        Update: {
          allow_messages?: Database["public"]["Enums"]["message_audience"]
          created_at?: string
          discoverable?: boolean
          profile_id?: string
          profile_visibility?: Database["public"]["Enums"]["profile_visibility"]
          show_online_status?: boolean
          show_read_receipts?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "privacy_settings_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_interests: {
        Row: {
          created_at: string
          interest_id: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          interest_id: string
          profile_id: string
        }
        Update: {
          created_at?: string
          interest_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_interests_interest_id_fkey"
            columns: ["interest_id"]
            isOneToOne: false
            referencedRelation: "interests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_interests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_photos: {
        Row: {
          created_at: string
          display_order: number
          id: string
          is_primary: boolean
          profile_id: string
          storage_path: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          is_primary?: boolean
          profile_id: string
          storage_path: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          is_primary?: boolean
          profile_id?: string
          storage_path?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_photos_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_status: Database["public"]["Enums"]["account_status"]
          approx_latitude: number | null
          approx_longitude: number | null
          bio: string | null
          children: Database["public"]["Enums"]["children_plan"] | null
          city: string | null
          communication_style:
            | Database["public"]["Enums"]["communication_style"]
            | null
          country: string | null
          created_at: string
          date_of_birth: string | null
          deleted_at: string | null
          drinking: Database["public"]["Enums"]["drinking_habit"] | null
          education: string | null
          exercise: Database["public"]["Enums"]["exercise_habit"] | null
          first_name: string | null
          gender: Database["public"]["Enums"]["gender_type"] | null
          id: string
          last_active_at: string
          occupation: string | null
          relationship_intent:
            | Database["public"]["Enums"]["relationship_intent"]
            | null
          smoking: Database["public"]["Enums"]["smoking_habit"] | null
          social_energy: Database["public"]["Enums"]["social_energy"] | null
          status_changed_at: string | null
          status_reason: string | null
          suspended_until: string | null
          updated_at: string
        }
        Insert: {
          account_status?: Database["public"]["Enums"]["account_status"]
          approx_latitude?: number | null
          approx_longitude?: number | null
          bio?: string | null
          children?: Database["public"]["Enums"]["children_plan"] | null
          city?: string | null
          communication_style?:
            | Database["public"]["Enums"]["communication_style"]
            | null
          country?: string | null
          created_at?: string
          date_of_birth?: string | null
          deleted_at?: string | null
          drinking?: Database["public"]["Enums"]["drinking_habit"] | null
          education?: string | null
          exercise?: Database["public"]["Enums"]["exercise_habit"] | null
          first_name?: string | null
          gender?: Database["public"]["Enums"]["gender_type"] | null
          id: string
          last_active_at?: string
          occupation?: string | null
          relationship_intent?:
            | Database["public"]["Enums"]["relationship_intent"]
            | null
          smoking?: Database["public"]["Enums"]["smoking_habit"] | null
          social_energy?: Database["public"]["Enums"]["social_energy"] | null
          status_changed_at?: string | null
          status_reason?: string | null
          suspended_until?: string | null
          updated_at?: string
        }
        Update: {
          account_status?: Database["public"]["Enums"]["account_status"]
          approx_latitude?: number | null
          approx_longitude?: number | null
          bio?: string | null
          children?: Database["public"]["Enums"]["children_plan"] | null
          city?: string | null
          communication_style?:
            | Database["public"]["Enums"]["communication_style"]
            | null
          country?: string | null
          created_at?: string
          date_of_birth?: string | null
          deleted_at?: string | null
          drinking?: Database["public"]["Enums"]["drinking_habit"] | null
          education?: string | null
          exercise?: Database["public"]["Enums"]["exercise_habit"] | null
          first_name?: string | null
          gender?: Database["public"]["Enums"]["gender_type"] | null
          id?: string
          last_active_at?: string
          occupation?: string | null
          relationship_intent?:
            | Database["public"]["Enums"]["relationship_intent"]
            | null
          smoking?: Database["public"]["Enums"]["smoking_habit"] | null
          social_energy?: Database["public"]["Enums"]["social_energy"] | null
          status_changed_at?: string | null
          status_reason?: string | null
          suspended_until?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          category: Database["public"]["Enums"]["report_category"]
          created_at: string
          description: string | null
          id: string
          reported_id: string
          reporter_id: string
          status: Database["public"]["Enums"]["report_status"]
          updated_at: string
        }
        Insert: {
          category: Database["public"]["Enums"]["report_category"]
          created_at?: string
          description?: string | null
          id?: string
          reported_id: string
          reporter_id: string
          status?: Database["public"]["Enums"]["report_status"]
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["report_category"]
          created_at?: string
          description?: string | null
          id?: string
          reported_id?: string
          reporter_id?: string
          status?: Database["public"]["Enums"]["report_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_reported_id_fkey"
            columns: ["reported_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          id: string
          permission: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          created_at?: string
          id?: string
          permission: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          created_at?: string
          id?: string
          permission?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      safety_signals: {
        Row: {
          case_id: string | null
          categories: string[]
          created_at: string
          id: string
          message_id: string | null
          risk_level: Database["public"]["Enums"]["safety_risk_level"]
          screener: string
          subject_id: string
        }
        Insert: {
          case_id?: string | null
          categories?: string[]
          created_at?: string
          id?: string
          message_id?: string | null
          risk_level?: Database["public"]["Enums"]["safety_risk_level"]
          screener: string
          subject_id: string
        }
        Update: {
          case_id?: string | null
          categories?: string[]
          created_at?: string
          id?: string
          message_id?: string | null
          risk_level?: Database["public"]["Enums"]["safety_risk_level"]
          screener?: string
          subject_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "safety_signals_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "moderation_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_signals_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_signals_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      store_alerts: {
        Row: {
          breached: boolean
          details: Json
          fingerprint: string
          first_seen_at: string
          id: string
          kind: string
          last_seen_at: string
          occurrences: number
          severity: string
          threshold: number
          window_start: string
        }
        Insert: {
          breached?: boolean
          details?: Json
          fingerprint: string
          first_seen_at?: string
          id?: string
          kind: string
          last_seen_at?: string
          occurrences?: number
          severity: string
          threshold?: number
          window_start: string
        }
        Update: {
          breached?: boolean
          details?: Json
          fingerprint?: string
          first_seen_at?: string
          id?: string
          kind?: string
          last_seen_at?: string
          occurrences?: number
          severity?: string
          threshold?: number
          window_start?: string
        }
        Relationships: []
      }
      store_purchase_audit: {
        Row: {
          attempted_profile_id: string | null
          created_at: string
          event_id: string | null
          event_type: string | null
          id: string
          metadata: Json
          outcome: string
          owner_profile_id: string | null
          provider: Database["public"]["Enums"]["billing_provider"]
          purchase_ref_hash: string
        }
        Insert: {
          attempted_profile_id?: string | null
          created_at?: string
          event_id?: string | null
          event_type?: string | null
          id?: string
          metadata?: Json
          outcome: string
          owner_profile_id?: string | null
          provider: Database["public"]["Enums"]["billing_provider"]
          purchase_ref_hash: string
        }
        Update: {
          attempted_profile_id?: string | null
          created_at?: string
          event_id?: string | null
          event_type?: string | null
          id?: string
          metadata?: Json
          outcome?: string
          owner_profile_id?: string | null
          provider?: Database["public"]["Enums"]["billing_provider"]
          purchase_ref_hash?: string
        }
        Relationships: []
      }
      store_purchases: {
        Row: {
          created_at: string
          environment: string
          id: string
          last_reconciled_at: string | null
          latest_event_at: string | null
          latest_event_id: string | null
          linked_at: string
          plan_code: string
          product_id: string
          profile_id: string
          provider: Database["public"]["Enums"]["billing_provider"]
          purchase_ref: string
          revoked_at: string | null
          status: Database["public"]["Enums"]["subscription_status"]
          subscription_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          environment?: string
          id?: string
          last_reconciled_at?: string | null
          latest_event_at?: string | null
          latest_event_id?: string | null
          linked_at?: string
          plan_code: string
          product_id: string
          profile_id: string
          provider: Database["public"]["Enums"]["billing_provider"]
          purchase_ref: string
          revoked_at?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          environment?: string
          id?: string
          last_reconciled_at?: string | null
          latest_event_at?: string | null
          latest_event_id?: string | null
          linked_at?: string
          plan_code?: string
          product_id?: string
          profile_id?: string
          provider?: Database["public"]["Enums"]["billing_provider"]
          purchase_ref?: string
          revoked_at?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_purchases_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_purchases_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      store_rate_limits: {
        Row: {
          bucket: string
          hits: number
          updated_at: string
          window_start: string
        }
        Insert: {
          bucket: string
          hits?: number
          updated_at?: string
          window_start?: string
        }
        Update: {
          bucket?: string
          hits?: number
          updated_at?: string
          window_start?: string
        }
        Relationships: []
      }
      store_reconciliation_runs: {
        Row: {
          corrected: number
          failed: number
          finished_at: string | null
          id: string
          mode: string
          notes: Json
          scanned: number
          skipped_revoked: number
          started_at: string
          unchanged: number
        }
        Insert: {
          corrected?: number
          failed?: number
          finished_at?: string | null
          id?: string
          mode: string
          notes?: Json
          scanned?: number
          skipped_revoked?: number
          started_at?: string
          unchanged?: number
        }
        Update: {
          corrected?: number
          failed?: number
          finished_at?: string | null
          id?: string
          mode?: string
          notes?: Json
          scanned?: number
          skipped_revoked?: number
          started_at?: string
          unchanged?: number
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          billing_account_id: string
          billing_interval: Database["public"]["Enums"]["billing_interval"]
          cancel_at_period_end: boolean
          canceled_at: string | null
          created_at: string
          currency: string | null
          current_period_end: string | null
          current_period_start: string | null
          ended_at: string | null
          id: string
          plan_code: string
          profile_id: string
          provider: Database["public"]["Enums"]["billing_provider"]
          provider_subscription_id: string | null
          purchase_source: Database["public"]["Enums"]["entitlement_source"]
          status: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          billing_account_id: string
          billing_interval?: Database["public"]["Enums"]["billing_interval"]
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          currency?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          ended_at?: string | null
          id?: string
          plan_code: string
          profile_id: string
          provider?: Database["public"]["Enums"]["billing_provider"]
          provider_subscription_id?: string | null
          purchase_source?: Database["public"]["Enums"]["entitlement_source"]
          status?: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          billing_account_id?: string
          billing_interval?: Database["public"]["Enums"]["billing_interval"]
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          currency?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          ended_at?: string | null
          id?: string
          plan_code?: string
          profile_id?: string
          provider?: Database["public"]["Enums"]["billing_provider"]
          provider_subscription_id?: string | null
          purchase_source?: Database["public"]["Enums"]["entitlement_source"]
          status?: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_billing_account_id_fkey"
            columns: ["billing_account_id"]
            isOneToOne: false
            referencedRelation: "billing_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          granted_by: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_billing_overview: {
        Args: { p_profile: string }
        Returns: {
          billing_interval: Database["public"]["Enums"]["billing_interval"]
          cancel_at_period_end: boolean
          canceled_at: string
          created_at: string
          currency: string
          current_period_end: string
          current_period_start: string
          entitlement_keys: string[]
          plan_code: string
          profile_id: string
          provider: Database["public"]["Enums"]["billing_provider"]
          provider_subscription_id: string
          purchase_source: Database["public"]["Enums"]["entitlement_source"]
          status: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at: string
        }[]
      }
      admin_case_reports: {
        Args: { p_case: string }
        Returns: {
          category: Database["public"]["Enums"]["report_category"]
          created_at: string
          description: string
          kind: string
          report_id: string
          reporter_id: string
          status: Database["public"]["Enums"]["report_status"]
        }[]
      }
      admin_case_signals: {
        Args: { p_case: string }
        Returns: {
          categories: string[]
          created_at: string
          risk_level: Database["public"]["Enums"]["safety_risk_level"]
          screener: string
          signal_id: string
        }[]
      }
      admin_decide_appeal: {
        Args: {
          p_appeal: string
          p_note?: string
          p_status: Database["public"]["Enums"]["appeal_status"]
        }
        Returns: boolean
      }
      admin_grant_entitlement: {
        Args: {
          p_days: number
          p_key: string
          p_reason: string
          p_target: string
        }
        Returns: string
      }
      admin_list_appeals: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: {
          account_status: Database["public"]["Enums"]["account_status"]
          body: string
          created_at: string
          decided_at: string
          decision_note: string
          first_name: string
          id: string
          profile_id: string
          status: Database["public"]["Enums"]["appeal_status"]
        }[]
      }
      admin_list_audit: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: {
          action: string
          actor_id: string
          actor_name: string
          case_id: string
          created_at: string
          id: string
          metadata: Json
          reason: string
          target_id: string
          target_type: string
        }[]
      }
      admin_list_cases: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_status?: Database["public"]["Enums"]["moderation_case_status"]
        }
        Returns: {
          case_id: string
          case_number: number
          category: Database["public"]["Enums"]["report_category"]
          created_at: string
          priority: Database["public"]["Enums"]["moderation_priority"]
          report_count: number
          signal_count: number
          source: Database["public"]["Enums"]["moderation_source"]
          status: Database["public"]["Enums"]["moderation_case_status"]
          subject_id: string
          subject_name: string
          subject_status: Database["public"]["Enums"]["account_status"]
          updated_at: string
        }[]
      }
      admin_list_entitlements: {
        Args: { p_profile: string }
        Returns: {
          created_at: string
          expires_at: string
          id: string
          key: string
          reason: string
          revoke_reason: string
          revoked_at: string
          source: Database["public"]["Enums"]["entitlement_source"]
          starts_at: string
        }[]
      }
      admin_list_staff: {
        Args: never
        Returns: {
          created_at: string
          granted_by: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }[]
      }
      admin_list_users: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_status?: Database["public"]["Enums"]["account_status"]
        }
        Returns: {
          account_status: Database["public"]["Enums"]["account_status"]
          block_count: number
          created_at: string
          deleted_at: string
          effective_status: Database["public"]["Enums"]["account_status"]
          first_name: string
          last_active_at: string
          open_case_id: string
          open_case_status: Database["public"]["Enums"]["moderation_case_status"]
          photo_count: number
          profile_complete: boolean
          profile_id: string
          report_count: number
          status_reason: string
          suspended_until: string
        }[]
      }
      admin_localization_setting: {
        Args: never
        Returns: {
          arabic_enabled: boolean
          updated_at: string
          updated_by: string
          updated_by_name: string
        }[]
      }
      admin_metrics: {
        Args: never
        Returns: {
          active_30d: number
          active_users: number
          banned_accounts: number
          block_rate: number
          blocks_total: number
          deleted_accounts: number
          high_risk_signals_7d: number
          new_users_7d: number
          open_appeals: number
          open_cases: number
          pending_reports: number
          report_rate: number
          reports_total: number
          restricted_accounts: number
          suspended_accounts: number
          total_users: number
        }[]
      }
      admin_moderate_account: {
        Args: {
          p_action: string
          p_case?: string
          p_days?: number
          p_reason?: string
          p_target: string
        }
        Returns: Database["public"]["Enums"]["account_status"]
      }
      admin_revoke_entitlement: {
        Args: { p_entitlement: string; p_reason: string }
        Returns: boolean
      }
      admin_set_arabic_enabled: {
        Args: { p_enabled: boolean }
        Returns: boolean
      }
      admin_set_role: {
        Args: {
          p_grant: boolean
          p_role: Database["public"]["Enums"]["app_role"]
          p_target: string
        }
        Returns: boolean
      }
      admin_update_case: {
        Args: {
          p_case: string
          p_note?: string
          p_priority?: Database["public"]["Enums"]["moderation_priority"]
          p_status?: Database["public"]["Enums"]["moderation_case_status"]
        }
        Returns: string
      }
      approx_distance_km: {
        Args: { lat1: number; lat2: number; lng1: number; lng2: number }
        Returns: number
      }
      billing_apply_store_event: {
        Args: {
          p_cancel_at_period_end: boolean
          p_currency: string
          p_entitlements: string[]
          p_event_at: string
          p_event_id: string
          p_interval: Database["public"]["Enums"]["billing_interval"]
          p_period_end: string
          p_period_start: string
          p_plan_code: string
          p_provider: Database["public"]["Enums"]["billing_provider"]
          p_purchase_ref: string
          p_reason?: string
          p_revoke?: boolean
          p_status: Database["public"]["Enums"]["subscription_status"]
        }
        Returns: string
      }
      billing_apply_subscription: {
        Args: {
          p_cancel_at_period_end: boolean
          p_currency: string
          p_entitlements: string[]
          p_interval: Database["public"]["Enums"]["billing_interval"]
          p_period_end: string
          p_period_start: string
          p_plan_code: string
          p_profile: string
          p_provider: Database["public"]["Enums"]["billing_provider"]
          p_provider_subscription_id: string
          p_source: Database["public"]["Enums"]["entitlement_source"]
          p_status: Database["public"]["Enums"]["subscription_status"]
        }
        Returns: string
      }
      billing_link_store_purchase: {
        Args: {
          p_environment: string
          p_plan_code: string
          p_product_id: string
          p_profile: string
          p_provider: Database["public"]["Enums"]["billing_provider"]
          p_purchase_ref: string
        }
        Returns: string
      }
      billing_revoke_subscription_entitlements: {
        Args: {
          p_provider: Database["public"]["Enums"]["billing_provider"]
          p_provider_subscription_id: string
          p_reason: string
        }
        Returns: number
      }
      category_priority: {
        Args: { _category: Database["public"]["Enums"]["report_category"] }
        Returns: Database["public"]["Enums"]["moderation_priority"]
      }
      discover_candidates: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: {
          age: number
          bio: string
          children: Database["public"]["Enums"]["children_plan"]
          city: string
          communication_style: Database["public"]["Enums"]["communication_style"]
          completeness: number
          country: string
          distance_km: number
          drinking: Database["public"]["Enums"]["drinking_habit"]
          exercise: Database["public"]["Enums"]["exercise_habit"]
          first_name: string
          interest_slugs: string[]
          last_active_at: string
          photo_paths: string[]
          profile_id: string
          relationship_intent: Database["public"]["Enums"]["relationship_intent"]
          smoking: Database["public"]["Enums"]["smoking_habit"]
          social_energy: Database["public"]["Enums"]["social_energy"]
          they_want_my_age: boolean
          they_want_my_gender: boolean
          they_want_my_intent: boolean
        }[]
      }
      has_entitlement: {
        Args: { _key: string; _user: string }
        Returns: boolean
      }
      has_permission: {
        Args: { _permission: string; _user_id: string }
        Returns: boolean
      }
      inspect_purge_http_response: {
        Args: { p_request_id: number }
        Returns: {
          purged: number
          status_code: number
        }[]
      }
      likes_received: {
        Args: never
        Returns: {
          age: number
          bio: string
          city: string
          country: string
          first_name: string
          interest_slugs: string[]
          liked_at: string
          photo_paths: string[]
          profile_id: string
          relationship_intent: Database["public"]["Enums"]["relationship_intent"]
        }[]
      }
      locale_availability: { Args: never; Returns: boolean }
      mark_conversation_read: {
        Args: { p_conversation: string }
        Returns: number
      }
      my_conversations: {
        Args: never
        Returns: {
          age: number
          can_send: boolean
          conversation_id: string
          created_at: string
          first_name: string
          last_message_at: string
          last_message_deleted: boolean
          last_message_preview: string
          last_message_sender_id: string
          match_id: string
          other_profile_id: string
          photo_path: string
          unread_count: number
        }[]
      }
      my_entitlements: {
        Args: never
        Returns: {
          expires_at: string
          key: string
          source: Database["public"]["Enums"]["entitlement_source"]
        }[]
      }
      my_matches: {
        Args: never
        Returns: {
          age: number
          bio: string
          city: string
          country: string
          first_name: string
          interest_slugs: string[]
          match_id: string
          matched_at: string
          photo_paths: string[]
          profile_id: string
          relationship_intent: Database["public"]["Enums"]["relationship_intent"]
        }[]
      }
      profile_completeness: { Args: { p_id: string }; Returns: number }
      purge_expired_accounts: {
        Args: { p_dry_run?: boolean }
        Returns: {
          purged_profile_id: string
        }[]
      }
      scheduled_job_status: {
        Args: { p_jobname: string }
        Returns: {
          active: boolean
          command: string
          jobname: string
          schedule: string
        }[]
      }
      set_account_purge_secret: {
        Args: { p_secret: string }
        Returns: undefined
      }
      set_account_purge_url: { Args: { p_url: string }; Returns: undefined }
      store_raise_alert: {
        Args: {
          p_details?: Json
          p_fingerprint: string
          p_kind: string
          p_severity: string
          p_threshold?: number
          p_window_seconds?: number
        }
        Returns: Json
      }
      store_rate_limit_hit: {
        Args: { p_bucket: string; p_limit: number; p_window_seconds: number }
        Returns: Json
      }
      trigger_account_purge_http: { Args: never; Returns: number }
      write_audit: {
        Args: {
          _action: string
          _actor: string
          _case?: string
          _metadata?: Json
          _reason?: string
          _target_id: string
          _target_type: string
        }
        Returns: string
      }
    }
    Enums: {
      account_status:
        | "active"
        | "restricted"
        | "suspended"
        | "banned"
        | "deleted"
      app_role: "super_admin" | "moderator" | "support"
      appeal_status: "pending" | "reviewing" | "granted" | "denied"
      billing_event_status:
        | "received"
        | "processed"
        | "duplicate"
        | "ignored"
        | "failed"
      billing_interval: "month" | "year"
      billing_provider:
        | "none"
        | "mock"
        | "stripe"
        | "paddle"
        | "apple"
        | "google"
        | "manual"
      children_plan:
        | "want_children"
        | "do_not_want_children"
        | "open_to_children"
        | "have_children"
        | "prefer_not_to_say"
      communication_style:
        | "thoughtful"
        | "direct"
        | "playful"
        | "reserved"
        | "prefer_not_to_say"
      deletion_request_status: "pending" | "cancelled" | "completed"
      drinking_habit: "never" | "socially" | "regularly" | "prefer_not_to_say"
      entitlement_source:
        | "web"
        | "ios"
        | "android"
        | "promotional"
        | "admin_grant"
      exercise_habit: "rarely" | "sometimes" | "often" | "prefer_not_to_say"
      gender_type:
        | "woman"
        | "man"
        | "non_binary"
        | "other"
        | "prefer_not_to_say"
      match_status: "active" | "unmatched" | "blocked"
      message_audience: "everyone" | "matches_only" | "no_one"
      message_moderation_status:
        | "unreviewed"
        | "cleared"
        | "flagged"
        | "removed"
      message_type: "text"
      moderation_case_status:
        | "open"
        | "investigating"
        | "action_required"
        | "resolved"
        | "dismissed"
      moderation_priority: "low" | "medium" | "high" | "critical"
      moderation_source:
        | "profile_report"
        | "message_report"
        | "safety_signal"
        | "manual"
      profile_visibility: "everyone" | "matches_only" | "hidden"
      relationship_intent:
        | "dating"
        | "serious_relationship"
        | "marriage"
        | "new_connections"
        | "open_to_possibilities"
      report_category:
        | "fake_profile"
        | "scam"
        | "harassment"
        | "hate"
        | "sexual_content"
        | "threat"
        | "spam"
        | "underage_concern"
        | "impersonation"
        | "financial_solicitation"
        | "other"
      report_status: "open" | "reviewing" | "actioned" | "dismissed"
      safety_risk_level: "none" | "low" | "medium" | "high"
      smoking_habit: "never" | "socially" | "regularly" | "prefer_not_to_say"
      social_energy:
        | "introvert"
        | "ambivert"
        | "extrovert"
        | "prefer_not_to_say"
      subscription_status:
        | "trialing"
        | "active"
        | "past_due"
        | "paused"
        | "canceled"
        | "expired"
        | "incomplete"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      account_status: [
        "active",
        "restricted",
        "suspended",
        "banned",
        "deleted",
      ],
      app_role: ["super_admin", "moderator", "support"],
      appeal_status: ["pending", "reviewing", "granted", "denied"],
      billing_event_status: [
        "received",
        "processed",
        "duplicate",
        "ignored",
        "failed",
      ],
      billing_interval: ["month", "year"],
      billing_provider: [
        "none",
        "mock",
        "stripe",
        "paddle",
        "apple",
        "google",
        "manual",
      ],
      children_plan: [
        "want_children",
        "do_not_want_children",
        "open_to_children",
        "have_children",
        "prefer_not_to_say",
      ],
      communication_style: [
        "thoughtful",
        "direct",
        "playful",
        "reserved",
        "prefer_not_to_say",
      ],
      deletion_request_status: ["pending", "cancelled", "completed"],
      drinking_habit: ["never", "socially", "regularly", "prefer_not_to_say"],
      entitlement_source: [
        "web",
        "ios",
        "android",
        "promotional",
        "admin_grant",
      ],
      exercise_habit: ["rarely", "sometimes", "often", "prefer_not_to_say"],
      gender_type: ["woman", "man", "non_binary", "other", "prefer_not_to_say"],
      match_status: ["active", "unmatched", "blocked"],
      message_audience: ["everyone", "matches_only", "no_one"],
      message_moderation_status: [
        "unreviewed",
        "cleared",
        "flagged",
        "removed",
      ],
      message_type: ["text"],
      moderation_case_status: [
        "open",
        "investigating",
        "action_required",
        "resolved",
        "dismissed",
      ],
      moderation_priority: ["low", "medium", "high", "critical"],
      moderation_source: [
        "profile_report",
        "message_report",
        "safety_signal",
        "manual",
      ],
      profile_visibility: ["everyone", "matches_only", "hidden"],
      relationship_intent: [
        "dating",
        "serious_relationship",
        "marriage",
        "new_connections",
        "open_to_possibilities",
      ],
      report_category: [
        "fake_profile",
        "scam",
        "harassment",
        "hate",
        "sexual_content",
        "threat",
        "spam",
        "underage_concern",
        "impersonation",
        "financial_solicitation",
        "other",
      ],
      report_status: ["open", "reviewing", "actioned", "dismissed"],
      safety_risk_level: ["none", "low", "medium", "high"],
      smoking_habit: ["never", "socially", "regularly", "prefer_not_to_say"],
      social_energy: [
        "introvert",
        "ambivert",
        "extrovert",
        "prefer_not_to_say",
      ],
      subscription_status: [
        "trialing",
        "active",
        "past_due",
        "paused",
        "canceled",
        "expired",
        "incomplete",
      ],
    },
  },
} as const
