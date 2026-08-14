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
          bio: string | null
          city: string | null
          country: string | null
          created_at: string
          date_of_birth: string | null
          deleted_at: string | null
          education: string | null
          first_name: string | null
          gender: Database["public"]["Enums"]["gender_type"] | null
          id: string
          occupation: string | null
          relationship_intent:
            | Database["public"]["Enums"]["relationship_intent"]
            | null
          updated_at: string
        }
        Insert: {
          bio?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          date_of_birth?: string | null
          deleted_at?: string | null
          education?: string | null
          first_name?: string | null
          gender?: Database["public"]["Enums"]["gender_type"] | null
          id: string
          occupation?: string | null
          relationship_intent?:
            | Database["public"]["Enums"]["relationship_intent"]
            | null
          updated_at?: string
        }
        Update: {
          bio?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          date_of_birth?: string | null
          deleted_at?: string | null
          education?: string | null
          first_name?: string | null
          gender?: Database["public"]["Enums"]["gender_type"] | null
          id?: string
          occupation?: string | null
          relationship_intent?:
            | Database["public"]["Enums"]["relationship_intent"]
            | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      deletion_request_status: "pending" | "cancelled" | "completed"
      gender_type:
        | "woman"
        | "man"
        | "non_binary"
        | "other"
        | "prefer_not_to_say"
      message_audience: "everyone" | "matches_only" | "no_one"
      profile_visibility: "everyone" | "matches_only" | "hidden"
      relationship_intent:
        | "dating"
        | "serious_relationship"
        | "marriage"
        | "new_connections"
        | "open_to_possibilities"
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
      deletion_request_status: ["pending", "cancelled", "completed"],
      gender_type: ["woman", "man", "non_binary", "other", "prefer_not_to_say"],
      message_audience: ["everyone", "matches_only", "no_one"],
      profile_visibility: ["everyone", "matches_only", "hidden"],
      relationship_intent: [
        "dating",
        "serious_relationship",
        "marriage",
        "new_connections",
        "open_to_possibilities",
      ],
    },
  },
} as const
