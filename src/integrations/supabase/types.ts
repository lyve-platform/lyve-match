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
          updated_at: string
        }
        Insert: {
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
          updated_at?: string
        }
        Update: {
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      approx_distance_km: {
        Args: { lat1: number; lat2: number; lng1: number; lng2: number }
        Returns: number
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
      is_blocked_pair: { Args: { a: string; b: string }; Returns: boolean }
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
    }
    Enums: {
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
      exercise_habit: "rarely" | "sometimes" | "often" | "prefer_not_to_say"
      gender_type:
        | "woman"
        | "man"
        | "non_binary"
        | "other"
        | "prefer_not_to_say"
      match_status: "active" | "unmatched" | "blocked"
      message_audience: "everyone" | "matches_only" | "no_one"
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
      smoking_habit: "never" | "socially" | "regularly" | "prefer_not_to_say"
      social_energy:
        | "introvert"
        | "ambivert"
        | "extrovert"
        | "prefer_not_to_say"
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
      exercise_habit: ["rarely", "sometimes", "often", "prefer_not_to_say"],
      gender_type: ["woman", "man", "non_binary", "other", "prefer_not_to_say"],
      match_status: ["active", "unmatched", "blocked"],
      message_audience: ["everyone", "matches_only", "no_one"],
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
      smoking_habit: ["never", "socially", "regularly", "prefer_not_to_say"],
      social_energy: [
        "introvert",
        "ambivert",
        "extrovert",
        "prefer_not_to_say",
      ],
    },
  },
} as const
