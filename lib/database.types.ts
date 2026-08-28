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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      air_cache: {
        Row: {
          body: Json
          fetched_at: string
          key: string
        }
        Insert: {
          body: Json
          fetched_at?: string
          key: string
        }
        Update: {
          body?: Json
          fetched_at?: string
          key?: string
        }
        Relationships: []
      }
      app_compatibility_policy: {
        Row: {
          latest_version: string
          minimum_supported_version: string
          platform: string
          recommended_version: string
          store_url: string
          update_message: string
          updated_at: string
        }
        Insert: {
          latest_version: string
          minimum_supported_version: string
          platform: string
          recommended_version: string
          store_url: string
          update_message?: string
          updated_at?: string
        }
        Update: {
          latest_version?: string
          minimum_supported_version?: string
          platform?: string
          recommended_version?: string
          store_url?: string
          update_message?: string
          updated_at?: string
        }
        Relationships: []
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
        Relationships: []
      }
      course_completions: {
        Row: {
          bike_id: string | null
          bike_model: string | null
          completed_at: string
          course_id: string
          id: string
          user_id: string
        }
        Insert: {
          bike_id?: string | null
          bike_model?: string | null
          completed_at?: string
          course_id: string
          id?: string
          user_id: string
        }
        Update: {
          bike_id?: string | null
          bike_model?: string | null
          completed_at?: string
          course_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_completions_bike_id_fkey"
            columns: ["bike_id"]
            isOneToOne: false
            referencedRelation: "user_bikes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_completions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_completions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      course_reviews: {
        Row: {
          bike_id: string | null
          bike_model: string | null
          content: string | null
          course_id: string | null
          created_at: string | null
          id: string
          rating: number
          user_id: string | null
          user_name: string
        }
        Insert: {
          bike_id?: string | null
          bike_model?: string | null
          content?: string | null
          course_id?: string | null
          created_at?: string | null
          id?: string
          rating: number
          user_id?: string | null
          user_name: string
        }
        Update: {
          bike_id?: string | null
          bike_model?: string | null
          content?: string | null
          course_id?: string | null
          created_at?: string | null
          id?: string
          rating?: number
          user_id?: string | null
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_reviews_bike_id_fkey"
            columns: ["bike_id"]
            isOneToOne: false
            referencedRelation: "user_bikes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_reviews_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_reviews_profile_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      course_saves: {
        Row: {
          course_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          course_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          course_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_saves_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_saves_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          ai_reject_reason: string | null
          approved: boolean
          coordinates: Json
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          description: string | null
          difficulty: string
          distance: number
          duration: number
          id: string
          name: string
          rating: number | null
          rejected_reason: string | null
          review_count: number | null
          route_geometry: Json | null
          route_name: string | null
          section_from: string | null
          section_to: string | null
          tags: string[] | null
          waypoint_ids: string[] | null
        }
        Insert: {
          ai_reject_reason?: string | null
          approved?: boolean
          coordinates: Json
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          difficulty: string
          distance: number
          duration: number
          id?: string
          name: string
          rating?: number | null
          rejected_reason?: string | null
          review_count?: number | null
          route_geometry?: Json | null
          route_name?: string | null
          section_from?: string | null
          section_to?: string | null
          tags?: string[] | null
          waypoint_ids?: string[] | null
        }
        Update: {
          ai_reject_reason?: string | null
          approved?: boolean
          coordinates?: Json
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          difficulty?: string
          distance?: number
          duration?: number
          id?: string
          name?: string
          rating?: number | null
          rejected_reason?: string | null
          review_count?: number | null
          route_geometry?: Json | null
          route_name?: string | null
          section_from?: string | null
          section_to?: string | null
          tags?: string[] | null
          waypoint_ids?: string[] | null
        }
        Relationships: []
      }
      edge_rate_limits: {
        Row: {
          key_hash: string
          request_count: number
          scope: string
          updated_at: string
          window_started_at: string
        }
        Insert: {
          key_hash: string
          request_count?: number
          scope: string
          updated_at?: string
          window_started_at?: string
        }
        Update: {
          key_hash?: string
          request_count?: number
          scope?: string
          updated_at?: string
          window_started_at?: string
        }
        Relationships: []
      }
      favorites: {
        Row: {
          address: string | null
          created_at: string | null
          general_place_id: string | null
          id: string
          latitude: number | null
          longitude: number | null
          name: string | null
          phone: string | null
          place_id: string | null
          user_id: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string | null
          general_place_id?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string | null
          phone?: string | null
          place_id?: string | null
          user_id?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string | null
          general_place_id?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string | null
          phone?: string | null
          place_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "favorites_general_place_id_fkey"
            columns: ["general_place_id"]
            isOneToOne: false
            referencedRelation: "general_places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback: {
        Row: {
          content: string
          created_at: string | null
          id: string
          reply: string | null
          reply_at: string | null
          type: string
          user_id: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          reply?: string | null
          reply_at?: string | null
          type: string
          user_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          reply?: string | null
          reply_at?: string | null
          type?: string
          user_id?: string | null
        }
        Relationships: []
      }
      general_place_shares: {
        Row: {
          created_at: string
          general_place_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          general_place_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          general_place_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "general_place_shares_general_place_id_fkey"
            columns: ["general_place_id"]
            isOneToOne: false
            referencedRelation: "general_places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "general_place_shares_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      general_places: {
        Row: {
          address: string
          created_at: string
          id: string
          last_shared_at: string | null
          latitude: number
          longitude: number
          name: string
          phone: string | null
          place_url: string | null
          promoted_place_id: string | null
          provider: string
          provider_place_id: string
          rating: number
          review_count: number
          share_count: number
        }
        Insert: {
          address: string
          created_at?: string
          id?: string
          last_shared_at?: string | null
          latitude: number
          longitude: number
          name: string
          phone?: string | null
          place_url?: string | null
          promoted_place_id?: string | null
          provider: string
          provider_place_id: string
          rating?: number
          review_count?: number
          share_count?: number
        }
        Update: {
          address?: string
          created_at?: string
          id?: string
          last_shared_at?: string | null
          latitude?: number
          longitude?: number
          name?: string
          phone?: string | null
          place_url?: string | null
          promoted_place_id?: string | null
          provider?: string
          provider_place_id?: string
          rating?: number
          review_count?: number
          share_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "general_places_promoted_place_id_fkey"
            columns: ["promoted_place_id"]
            isOneToOne: true
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      google_place_hours: {
        Row: {
          business_status: string | null
          fetched_at: string
          google_place_id: string
          hours: Json | null
        }
        Insert: {
          business_status?: string | null
          fetched_at?: string
          google_place_id: string
          hours?: Json | null
        }
        Update: {
          business_status?: string | null
          fetched_at?: string
          google_place_id?: string
          hours?: Json | null
        }
        Relationships: []
      }
      google_place_links: {
        Row: {
          created_at: string
          google_place_id: string
          matched_name: string | null
          source_key: string
        }
        Insert: {
          created_at?: string
          google_place_id: string
          matched_name?: string | null
          source_key: string
        }
        Update: {
          created_at?: string
          google_place_id?: string
          matched_name?: string | null
          source_key?: string
        }
        Relationships: []
      }
      hazard_votes: {
        Row: {
          created_at: string
          hazard_id: string
          kind: string
          user_id: string
        }
        Insert: {
          created_at?: string
          hazard_id: string
          kind: string
          user_id: string
        }
        Update: {
          created_at?: string
          hazard_id?: string
          kind?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hazard_votes_hazard_id_fkey"
            columns: ["hazard_id"]
            isOneToOne: false
            referencedRelation: "live_road_hazards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hazard_votes_hazard_id_fkey"
            columns: ["hazard_id"]
            isOneToOne: false
            referencedRelation: "road_hazards"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          data: Json | null
          id: string
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          data?: Json | null
          id?: string
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          data?: Json | null
          id?: string
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      place_change_monitor_state: {
        Row: {
          consecutive_failures: number
          last_checked_at: string | null
          last_error: string | null
          last_result: string
          next_check_at: string
          place_id: string
          updated_at: string
        }
        Insert: {
          consecutive_failures?: number
          last_checked_at?: string | null
          last_error?: string | null
          last_result?: string
          next_check_at?: string
          place_id: string
          updated_at?: string
        }
        Update: {
          consecutive_failures?: number
          last_checked_at?: string | null
          last_error?: string | null
          last_result?: string
          next_check_at?: string
          place_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "place_change_monitor_state_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: true
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      place_change_reports: {
        Row: {
          created_at: string
          description: string | null
          discord_error: string | null
          discord_reported_at: string | null
          id: string
          place_id: string
          reason: string
          reported_place_snapshot: Json
          reporter_id: string
          resolution_note: string | null
          resolved_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          discord_error?: string | null
          discord_reported_at?: string | null
          id?: string
          place_id: string
          reason: string
          reported_place_snapshot?: Json
          reporter_id: string
          resolution_note?: string | null
          resolved_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          discord_error?: string | null
          discord_reported_at?: string | null
          id?: string
          place_id?: string
          reason?: string
          reported_place_snapshot?: Json
          reporter_id?: string
          resolution_note?: string | null
          resolved_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "place_change_reports_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      place_change_reviews: {
        Row: {
          change_types: string[]
          confidence: string
          current_snapshot: Json
          detected_at: string
          evidence: Json
          fingerprint: string
          id: string
          last_seen_at: string
          observed_snapshot: Json
          place_id: string
          proposed_changes: Json
          reported_at: string | null
          resolution_note: string | null
          reviewed_at: string | null
          source_provider: string
          status: string
        }
        Insert: {
          change_types: string[]
          confidence: string
          current_snapshot: Json
          detected_at?: string
          evidence?: Json
          fingerprint: string
          id?: string
          last_seen_at?: string
          observed_snapshot: Json
          place_id: string
          proposed_changes?: Json
          reported_at?: string | null
          resolution_note?: string | null
          reviewed_at?: string | null
          source_provider: string
          status?: string
        }
        Update: {
          change_types?: string[]
          confidence?: string
          current_snapshot?: Json
          detected_at?: string
          evidence?: Json
          fingerprint?: string
          id?: string
          last_seen_at?: string
          observed_snapshot?: Json
          place_id?: string
          proposed_changes?: Json
          reported_at?: string | null
          resolution_note?: string | null
          reviewed_at?: string | null
          source_provider?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "place_change_reviews_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      place_curation_actions: {
        Row: {
          acted_by: string
          action_type: string
          created_at: string
          evidence_id: string | null
          id: string
          new_state: Json
          place_id: string
          previous_state: Json
          reason: string
        }
        Insert: {
          acted_by?: string
          action_type: string
          created_at?: string
          evidence_id?: string | null
          id?: string
          new_state?: Json
          place_id: string
          previous_state?: Json
          reason: string
        }
        Update: {
          acted_by?: string
          action_type?: string
          created_at?: string
          evidence_id?: string | null
          id?: string
          new_state?: Json
          place_id?: string
          previous_state?: Json
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "place_curation_actions_evidence_place_fkey"
            columns: ["evidence_id", "place_id"]
            isOneToOne: false
            referencedRelation: "place_curation_evidence"
            referencedColumns: ["id", "place_id"]
          },
          {
            foreignKeyName: "place_curation_actions_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      place_curation_evidence: {
        Row: {
          created_at: string
          details: Json
          id: string
          observed_at: string
          place_id: string
          recorded_by: string
          signal: string
          source_name: string
          source_reference: string | null
          source_type: string
          source_url: string | null
          strength: string
        }
        Insert: {
          created_at?: string
          details?: Json
          id?: string
          observed_at: string
          place_id: string
          recorded_by?: string
          signal: string
          source_name: string
          source_reference?: string | null
          source_type: string
          source_url?: string | null
          strength: string
        }
        Update: {
          created_at?: string
          details?: Json
          id?: string
          observed_at?: string
          place_id?: string
          recorded_by?: string
          signal?: string
          source_name?: string
          source_reference?: string | null
          source_type?: string
          source_url?: string | null
          strength?: string
        }
        Relationships: [
          {
            foreignKeyName: "place_curation_evidence_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      place_rider_fact_votes: {
        Row: {
          created_at: string
          fact_code: string
          place_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          fact_code: string
          place_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          fact_code?: string
          place_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "place_rider_fact_votes_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "place_rider_fact_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      place_rides: {
        Row: {
          address: string | null
          bike_category: string | null
          bike_id: string | null
          bike_model: string | null
          created_at: string
          excluded_from_place_stats: boolean
          general_place_id: string | null
          id: string
          latitude: number | null
          longitude: number | null
          name: string | null
          place_id: string | null
          role: string
          user_id: string
        }
        Insert: {
          address?: string | null
          bike_category?: string | null
          bike_id?: string | null
          bike_model?: string | null
          created_at?: string
          excluded_from_place_stats?: boolean
          general_place_id?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string | null
          place_id?: string | null
          role?: string
          user_id: string
        }
        Update: {
          address?: string | null
          bike_category?: string | null
          bike_id?: string | null
          bike_model?: string | null
          created_at?: string
          excluded_from_place_stats?: boolean
          general_place_id?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string | null
          place_id?: string | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "place_rides_bike_id_fkey"
            columns: ["bike_id"]
            isOneToOne: false
            referencedRelation: "user_bikes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "place_rides_general_place_id_fkey"
            columns: ["general_place_id"]
            isOneToOne: false
            referencedRelation: "general_places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "place_rides_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      places: {
        Row: {
          address: string
          ai_reject_reason: string | null
          approved: boolean | null
          category: string
          created_at: string | null
          deleted_at: string | null
          description: string | null
          hours: Json | null
          id: string
          is_curation_protected: boolean
          last_verified_at: string | null
          location: unknown
          name: string
          next_verification_at: string | null
          opening_hours: string | null
          operational_status: string
          parking_info: string | null
          phone: string | null
          photos: string[] | null
          rating: number | null
          rejected_reason: string | null
          relevance_status: string
          review_count: number | null
          source_place_id: string | null
          source_provider: string | null
          submitted_by: string | null
          tags: string[] | null
        }
        Insert: {
          address: string
          ai_reject_reason?: string | null
          approved?: boolean | null
          category: string
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
          hours?: Json | null
          id?: string
          is_curation_protected?: boolean
          last_verified_at?: string | null
          location: unknown
          name: string
          next_verification_at?: string | null
          opening_hours?: string | null
          operational_status?: string
          parking_info?: string | null
          phone?: string | null
          photos?: string[] | null
          rating?: number | null
          rejected_reason?: string | null
          relevance_status?: string
          review_count?: number | null
          source_place_id?: string | null
          source_provider?: string | null
          submitted_by?: string | null
          tags?: string[] | null
        }
        Update: {
          address?: string
          ai_reject_reason?: string | null
          approved?: boolean | null
          category?: string
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
          hours?: Json | null
          id?: string
          is_curation_protected?: boolean
          last_verified_at?: string | null
          location?: unknown
          name?: string
          next_verification_at?: string | null
          opening_hours?: string | null
          operational_status?: string
          parking_info?: string | null
          phone?: string | null
          photos?: string[] | null
          rating?: number | null
          rejected_reason?: string | null
          relevance_status?: string
          review_count?: number | null
          source_place_id?: string | null
          source_provider?: string | null
          submitted_by?: string | null
          tags?: string[] | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bike_model: string | null
          created_at: string | null
          deleted_at: string | null
          id: string
          nickname: string
          onboarding_completed_at: string
        }
        Insert: {
          avatar_url?: string | null
          bike_model?: string | null
          created_at?: string | null
          deleted_at?: string | null
          id: string
          nickname: string
          onboarding_completed_at?: string
        }
        Update: {
          avatar_url?: string | null
          bike_model?: string | null
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          nickname?: string
          onboarding_completed_at?: string
        }
        Relationships: []
      }
      push_tokens: {
        Row: {
          platform: string | null
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          platform?: string | null
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          platform?: string | null
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string
          description: string | null
          id: string
          reason: string
          reporter_id: string
          status: string
          target_id: string
          target_type: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          reason: string
          reporter_id: string
          status?: string
          target_id: string
          target_type: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          reason?: string
          reporter_id?: string
          status?: string
          target_id?: string
          target_type?: string
        }
        Relationships: []
      }
      review_likes: {
        Row: {
          created_at: string
          review_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          review_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          review_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_likes_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          bike_id: string | null
          bike_model: string | null
          content: string | null
          created_at: string | null
          general_place_id: string | null
          id: string
          like_count: number
          photos: string[] | null
          place_id: string | null
          rating: number
          user_id: string | null
          user_name: string
        }
        Insert: {
          bike_id?: string | null
          bike_model?: string | null
          content?: string | null
          created_at?: string | null
          general_place_id?: string | null
          id?: string
          like_count?: number
          photos?: string[] | null
          place_id?: string | null
          rating: number
          user_id?: string | null
          user_name: string
        }
        Update: {
          bike_id?: string | null
          bike_model?: string | null
          content?: string | null
          created_at?: string | null
          general_place_id?: string | null
          id?: string
          like_count?: number
          photos?: string[] | null
          place_id?: string | null
          rating?: number
          user_id?: string | null
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_bike_id_fkey"
            columns: ["bike_id"]
            isOneToOne: false
            referencedRelation: "user_bikes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_general_place_id_fkey"
            columns: ["general_place_id"]
            isOneToOne: false
            referencedRelation: "general_places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_profile_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rides: {
        Row: {
          avg_speed: number
          coordinates: Json
          created_at: string
          distance: number
          duration: number
          ended_at: string | null
          id: string
          max_speed: number
          started_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          avg_speed?: number
          coordinates?: Json
          created_at?: string
          distance?: number
          duration?: number
          ended_at?: string | null
          id?: string
          max_speed?: number
          started_at?: string | null
          title?: string
          user_id: string
        }
        Update: {
          avg_speed?: number
          coordinates?: Json
          created_at?: string
          distance?: number
          duration?: number
          ended_at?: string | null
          id?: string
          max_speed?: number
          started_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      riding_guide_stops: {
        Row: {
          created_at: string
          general_place_id: string | null
          guide_id: string
          id: string
          note: string | null
          place_id: string | null
          position: number
          role: string
        }
        Insert: {
          created_at?: string
          general_place_id?: string | null
          guide_id: string
          id?: string
          note?: string | null
          place_id?: string | null
          position: number
          role: string
        }
        Update: {
          created_at?: string
          general_place_id?: string | null
          guide_id?: string
          id?: string
          note?: string | null
          place_id?: string | null
          position?: number
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "riding_guide_stops_general_place_id_fkey"
            columns: ["general_place_id"]
            isOneToOne: false
            referencedRelation: "general_places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "riding_guide_stops_guide_id_fkey"
            columns: ["guide_id"]
            isOneToOne: false
            referencedRelation: "riding_guides"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "riding_guide_stops_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      riding_guide_submission_stops: {
        Row: {
          created_at: string
          general_place_id: string | null
          id: string
          note: string | null
          place_id: string | null
          position: number
          role: string
          submission_id: string
        }
        Insert: {
          created_at?: string
          general_place_id?: string | null
          id?: string
          note?: string | null
          place_id?: string | null
          position: number
          role: string
          submission_id: string
        }
        Update: {
          created_at?: string
          general_place_id?: string | null
          id?: string
          note?: string | null
          place_id?: string | null
          position?: number
          role?: string
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "riding_guide_submission_stops_general_place_id_fkey"
            columns: ["general_place_id"]
            isOneToOne: false
            referencedRelation: "general_places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "riding_guide_submission_stops_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "riding_guide_submission_stops_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "riding_guide_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      riding_guide_submissions: {
        Row: {
          ai_judged_at: string | null
          ai_recommendation: Json | null
          created_at: string
          featured_roads: string[]
          id: string
          reason: string
          rejected_reason: string | null
          result_guide_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_by: string
          tags: string[]
          title: string | null
          updated_at: string
        }
        Insert: {
          ai_judged_at?: string | null
          ai_recommendation?: Json | null
          created_at?: string
          featured_roads?: string[]
          id?: string
          reason: string
          rejected_reason?: string | null
          result_guide_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_by: string
          tags?: string[]
          title?: string | null
          updated_at?: string
        }
        Update: {
          ai_judged_at?: string | null
          ai_recommendation?: Json | null
          created_at?: string
          featured_roads?: string[]
          id?: string
          reason?: string
          rejected_reason?: string | null
          result_guide_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_by?: string
          tags?: string[]
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "riding_guide_submissions_result_guide_id_fkey"
            columns: ["result_guide_id"]
            isOneToOne: false
            referencedRelation: "riding_guides"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "riding_guide_submissions_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      riding_guides: {
        Row: {
          cover_image_url: string | null
          created_at: string
          deleted_at: string | null
          description: string
          featured_roads: string[]
          id: string
          legacy_course_id: string | null
          published_at: string | null
          regions: string[]
          summary: string
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          cover_image_url?: string | null
          created_at?: string
          deleted_at?: string | null
          description: string
          featured_roads?: string[]
          id?: string
          legacy_course_id?: string | null
          published_at?: string | null
          regions?: string[]
          summary: string
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          cover_image_url?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string
          featured_roads?: string[]
          id?: string
          legacy_course_id?: string | null
          published_at?: string | null
          regions?: string[]
          summary?: string
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "riding_guides_legacy_course_id_fkey"
            columns: ["legacy_course_id"]
            isOneToOne: true
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      road_hazards: {
        Row: {
          address: string | null
          confirm_count: number
          created_at: string
          deleted_at: string | null
          id: string
          last_confirmed_at: string
          last_resolved_at: string | null
          location: unknown
          note: string | null
          photo: string | null
          reported_by: string | null
          resolved_count: number
          type: string
        }
        Insert: {
          address?: string | null
          confirm_count?: number
          created_at?: string
          deleted_at?: string | null
          id?: string
          last_confirmed_at?: string
          last_resolved_at?: string | null
          location: unknown
          note?: string | null
          photo?: string | null
          reported_by?: string | null
          resolved_count?: number
          type: string
        }
        Update: {
          address?: string | null
          confirm_count?: number
          created_at?: string
          deleted_at?: string | null
          id?: string
          last_confirmed_at?: string
          last_resolved_at?: string | null
          location?: unknown
          note?: string | null
          photo?: string | null
          reported_by?: string | null
          resolved_count?: number
          type?: string
        }
        Relationships: []
      }
      spatial_ref_sys: {
        Row: {
          auth_name: string | null
          auth_srid: number | null
          proj4text: string | null
          srid: number
          srtext: string | null
        }
        Insert: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid: number
          srtext?: string | null
        }
        Update: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid?: number
          srtext?: string | null
        }
        Relationships: []
      }
      user_bikes: {
        Row: {
          color: string | null
          created_at: string
          id: string
          is_active: boolean
          model: string
          model_year: number | null
          nickname: string | null
          photo_url: string | null
          retired_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          model: string
          model_year?: number | null
          nickname?: string | null
          photo_url?: string | null
          retired_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          model?: string
          model_year?: number | null
          nickname?: string | null
          photo_url?: string | null
          retired_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_bikes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_consents: {
        Row: {
          created_at: string
          location_accepted_at: string
          location_version: string
          privacy_accepted_at: string
          privacy_version: string
          terms_accepted_at: string
          terms_version: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          location_accepted_at: string
          location_version: string
          privacy_accepted_at: string
          privacy_version: string
          terms_accepted_at: string
          terms_version: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          location_accepted_at?: string
          location_version?: string
          privacy_accepted_at?: string
          privacy_version?: string
          terms_accepted_at?: string
          terms_version?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_consents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      geography_columns: {
        Row: {
          coord_dimension: number | null
          f_geography_column: unknown
          f_table_catalog: unknown
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Relationships: []
      }
      geometry_columns: {
        Row: {
          coord_dimension: number | null
          f_geometry_column: unknown
          f_table_catalog: string | null
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Insert: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Update: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Relationships: []
      }
      live_road_hazards: {
        Row: {
          address: string | null
          confirm_count: number | null
          created_at: string | null
          deleted_at: string | null
          id: string | null
          last_confirmed_at: string | null
          latitude: number | null
          location: unknown
          longitude: number | null
          note: string | null
          photo: string | null
          resolved_count: number | null
          staleness: number | null
          type: string | null
        }
        Insert: {
          address?: string | null
          confirm_count?: number | null
          created_at?: string | null
          deleted_at?: string | null
          id?: string | null
          last_confirmed_at?: string | null
          latitude?: never
          location?: unknown
          longitude?: never
          note?: string | null
          photo?: string | null
          resolved_count?: number | null
          staleness?: never
          type?: string | null
        }
        Update: {
          address?: string | null
          confirm_count?: number | null
          created_at?: string | null
          deleted_at?: string | null
          id?: string | null
          last_confirmed_at?: string | null
          latitude?: never
          location?: unknown
          longitude?: never
          note?: string | null
          photo?: string | null
          resolved_count?: number | null
          staleness?: never
          type?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _postgis_deprecate: {
        Args: { newname: string; oldname: string; version: string }
        Returns: undefined
      }
      _postgis_index_extent: {
        Args: { col: string; tbl: unknown }
        Returns: unknown
      }
      _postgis_pgsql_version: { Args: never; Returns: string }
      _postgis_scripts_pgsql_version: { Args: never; Returns: string }
      _postgis_selectivity: {
        Args: { att_name: string; geom: unknown; mode?: string; tbl: unknown }
        Returns: number
      }
      _postgis_stats: {
        Args: { ""?: string; att_name: string; tbl: unknown }
        Returns: string
      }
      _st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_crosses: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      _st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_intersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      _st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      _st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      _st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_sortablehash: { Args: { geom: unknown }; Returns: number }
      _st_touches: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_voronoi: {
        Args: {
          clip?: unknown
          g1: unknown
          return_polygons?: boolean
          tolerance?: number
        }
        Returns: unknown
      }
      _st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      active_place_operational_statuses: {
        Args: never
        Returns: {
          operational_status: string
          place_id: string
        }[]
      }
      addauth: { Args: { "": string }; Returns: boolean }
      addgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              new_dim: number
              new_srid_in: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
      all_places: {
        Args: { category_filter?: string }
        Returns: {
          address: string
          approved: boolean
          category: string
          created_at: string
          description: string
          hours: Json
          id: string
          latitude: number
          longitude: number
          name: string
          opening_hours: string
          parking_info: string
          phone: string
          photos: string[]
          rating: number
          review_count: number
          submitted_by: string
          tags: string[]
        }[]
      }
      bike_place_matches_v1: {
        Args: { p_bike_category?: string; p_place_ids: string[] }
        Returns: {
          exact_riders: number
          match_kind: string
          place_id: string
          similar_riders: number
          supporters: number
          visited_by_me: boolean
        }[]
      }
      broadcast_notice: {
        Args: { p_body: string; p_data?: Json; p_title: string }
        Returns: number
      }
      claim_place_change_monitor_batch: {
        Args: { p_limit?: number }
        Returns: {
          address: string
          category: string
          id: string
          is_curation_protected: boolean
          latitude: number
          longitude: number
          name: string
          phone: string
          source_place_id: string
          source_provider: string
        }[]
      }
      complete_onboarding: { Args: { p_nickname: string }; Returns: undefined }
      consume_edge_rate_limit: {
        Args: {
          p_key_hash: string
          p_limit: number
          p_scope: string
          p_window_seconds: number
        }
        Returns: {
          allowed: boolean
          retry_after_seconds: number
        }[]
      }
      course_exists_with_name: { Args: { p_name: string }; Returns: string }
      delete_my_account: { Args: never; Returns: undefined }
      delete_user_bike: { Args: { p_bike_id: string }; Returns: undefined }
      disablelongtransactions: { Args: never; Returns: string }
      exclude_personal_place_rides: {
        Args: { p_ride_ids: string[] }
        Returns: number
      }
      dropgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { column_name: string; table_name: string }; Returns: string }
      dropgeometrytable:
        | {
            Args: {
              catalog_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { schema_name: string; table_name: string }; Returns: string }
        | { Args: { table_name: string }; Returns: string }
      enablelongtransactions: { Args: never; Returns: string }
      enqueue_place_change_review: {
        Args: {
          p_change_types: string[]
          p_confidence: string
          p_current_snapshot: Json
          p_evidence: Json
          p_fingerprint: string
          p_observed_snapshot: Json
          p_place_id: string
          p_source_provider: string
        }
        Returns: {
          review_id: string
          should_report: boolean
        }[]
      }
      enqueue_place_change_review_v2: {
        Args: {
          p_change_types: string[]
          p_confidence: string
          p_current_snapshot: Json
          p_evidence: Json
          p_fingerprint: string
          p_observed_snapshot: Json
          p_place_id: string
          p_proposed_changes: Json
          p_source_provider: string
        }
        Returns: {
          review_id: string
          should_report: boolean
        }[]
      }
      equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      geometry: { Args: { "": string }; Returns: unknown }
      geometry_above: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_below: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_cmp: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_contained_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_distance_box: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_distance_centroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_eq: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_ge: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_gt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_le: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_left: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_lt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overabove: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overbelow: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overleft: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overright: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_right: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_within: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geomfromewkt: { Args: { "": string }; Returns: unknown }
      get_general_place_share: {
        Args: { p_general_place_id: string }
        Returns: {
          share_count: number
          shared_by_me: boolean
        }[]
      }
      get_place_change_monitor_batch: {
        Args: { p_limit?: number }
        Returns: {
          address: string
          category: string
          id: string
          is_curation_protected: boolean
          latitude: number
          longitude: number
          name: string
          phone: string
          source_place_id: string
          source_provider: string
        }[]
      }
      get_place_rider_facts: {
        Args: { p_place_id: string }
        Returns: {
          confirmations: number
          confirmed_by_me: boolean
          fact_code: string
        }[]
      }
      gettransactionid: { Args: never; Returns: unknown }
      hazard_expire_interval: { Args: { hazard_type: string }; Returns: string }
      hazard_fresh_interval: { Args: { hazard_type: string }; Returns: string }
      hazards_near_course: {
        Args: { course_id: string; radius_m?: number }
        Returns: {
          address: string
          confirm_count: number
          created_at: string
          id: string
          last_confirmed_at: string
          latitude: number
          longitude: number
          note: string
          photo: string
          resolved_count: number
          route_fraction: number
          staleness: number
          type: string
        }[]
      }
      longtransactionsenabled: { Args: never; Returns: boolean }
      mark_place_change_review_reported: {
        Args: { p_review_id: string }
        Returns: undefined
      }
      my_ride_stats: { Args: never; Returns: Json }
      my_unexcluded_place_ride_targets: {
        Args: never
        Returns: {
          latitude: number
          longitude: number
          ride_id: string
        }[]
      }
      nearby_hazards: {
        Args: { lat: number; lng: number; radius_meters?: number }
        Returns: {
          address: string
          confirm_count: number
          created_at: string
          id: string
          last_confirmed_at: string
          latitude: number
          longitude: number
          note: string
          photo: string
          resolved_count: number
          staleness: number
          type: string
        }[]
      }
      nearby_places: {
        Args: {
          category_filter?: string
          lat: number
          lng: number
          radius_meters?: number
        }
        Returns: {
          address: string
          approved: boolean
          category: string
          created_at: string
          description: string
          hours: Json
          id: string
          latitude: number
          longitude: number
          name: string
          opening_hours: string
          parking_info: string
          phone: string
          photos: string[]
          rating: number
          review_count: number
          submitted_by: string
          tags: string[]
        }[]
      }
      notify_place_change_report_result: {
        Args: { p_report_id: string }
        Returns: undefined
      }
      place_exists_at_address: { Args: { p_address: string }; Returns: string }
      place_ride_summary: {
        Args: { p_limit?: number; p_place_id: string }
        Returns: Json
      }
      places_near_course: {
        Args: { course_id: string; max_results?: number; radius_m?: number }
        Returns: {
          address: string
          approved: boolean
          category: string
          created_at: string
          description: string
          id: string
          latitude: number
          longitude: number
          name: string
          opening_hours: string
          parking_info: string
          phone: string
          photos: string[]
          rating: number
          review_count: number
          route_fraction: number
          submitted_by: string
          tags: string[]
        }[]
      }
      populate_geometry_columns:
        | { Args: { tbl_oid: unknown; use_typmod?: boolean }; Returns: number }
        | { Args: { use_typmod?: boolean }; Returns: string }
      postgis_constraint_dims: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_srid: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_type: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: string
      }
      postgis_extensions_upgrade: { Args: never; Returns: string }
      postgis_full_version: { Args: never; Returns: string }
      postgis_geos_version: { Args: never; Returns: string }
      postgis_lib_build_date: { Args: never; Returns: string }
      postgis_lib_revision: { Args: never; Returns: string }
      postgis_lib_version: { Args: never; Returns: string }
      postgis_libjson_version: { Args: never; Returns: string }
      postgis_liblwgeom_version: { Args: never; Returns: string }
      postgis_libprotobuf_version: { Args: never; Returns: string }
      postgis_libxml_version: { Args: never; Returns: string }
      postgis_proj_version: { Args: never; Returns: string }
      postgis_scripts_build_date: { Args: never; Returns: string }
      postgis_scripts_installed: { Args: never; Returns: string }
      postgis_scripts_released: { Args: never; Returns: string }
      postgis_svn_version: { Args: never; Returns: string }
      postgis_type_name: {
        Args: {
          coord_dimension: number
          geomname: string
          use_new_name?: boolean
        }
        Returns: string
      }
      postgis_version: { Args: never; Returns: string }
      postgis_wagyu_version: { Args: never; Returns: string }
      prepare_account_deletion: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      purge_google_place_hours: { Args: never; Returns: number }
      record_course_completion: {
        Args: { p_course_id: string }
        Returns: boolean
      }
      resolve_place_change_report: {
        Args: { p_acted_by: string; p_decision: string; p_report_id: string }
        Returns: {
          applied_changes: Json
          decision: string
          place_id: string
          place_name: string
        }[]
      }
      resolve_place_change_review: {
        Args: { p_acted_by: string; p_decision: string; p_review_id: string }
        Returns: {
          applied_changes: Json
          decision: string
          place_id: string
          place_name: string
        }[]
      }
      resolve_riding_guide_submission_review: {
        Args: {
          p_acted_by?: string
          p_action: string
          p_submission_id: string
          p_target_guide_id?: string
        }
        Returns: Json
      }
      retry_missing_judgements: { Args: never; Returns: undefined }
      search_courses_v2: {
        Args: {
          p_lat?: number
          p_limit?: number
          p_lng?: number
          p_near_only?: boolean
          p_query: string
          p_radius_meters?: number
          p_term_groups?: Json
        }
        Returns: {
          coordinates: Json
          created_at: string
          created_by: string
          description: string
          difficulty: string
          distance: number
          duration: number
          id: string
          name: string
          rating: number
          review_count: number
          route_geometry: Json
          route_name: string
          section_from: string
          section_to: string
          tags: string[]
          waypoint_ids: string[]
        }[]
      }
      search_places_v2: {
        Args: {
          p_lat?: number
          p_limit?: number
          p_lng?: number
          p_near_only?: boolean
          p_query: string
          p_radius_meters?: number
          p_term_groups?: Json
        }
        Returns: {
          address: string
          approved: boolean
          category: string
          created_at: string
          description: string
          hours: Json
          id: string
          latitude: number
          longitude: number
          name: string
          opening_hours: string
          parking_info: string
          phone: string
          photos: string[]
          rating: number
          review_count: number
          submitted_by: string
          tags: string[]
        }[]
      }
      search_riding_guides_v1: {
        Args: {
          p_lat?: number
          p_limit?: number
          p_lng?: number
          p_near_only?: boolean
          p_query: string
          p_radius_meters?: number
          p_term_groups?: Json
        }
        Returns: {
          cover_image_url: string
          featured_roads: string[]
          id: string
          primary_latitude: number
          primary_longitude: number
          published_at: string
          regions: string[]
          summary: string
          tags: string[]
          title: string
        }[]
      }
      set_active_user_bike: { Args: { p_bike_id: string }; Returns: undefined }
      st_3dclosestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3ddistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_3dlongestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmakebox: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmaxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dshortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_addpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_angle:
        | { Args: { line1: unknown; line2: unknown }; Returns: number }
        | {
            Args: { pt1: unknown; pt2: unknown; pt3: unknown; pt4?: unknown }
            Returns: number
          }
      st_area:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_asencodedpolyline: {
        Args: { geom: unknown; nprecision?: number }
        Returns: string
      }
      st_asewkt: { Args: { "": string }; Returns: string }
      st_asgeojson:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: {
              geom_column?: string
              maxdecimaldigits?: number
              pretty_bool?: boolean
              r: Record<string, unknown>
            }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_asgml:
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
            }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
      st_askml:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_aslatlontext: {
        Args: { geom: unknown; tmpl?: string }
        Returns: string
      }
      st_asmarc21: { Args: { format?: string; geom: unknown }; Returns: string }
      st_asmvtgeom: {
        Args: {
          bounds: unknown
          buffer?: number
          clip_geom?: boolean
          extent?: number
          geom: unknown
        }
        Returns: unknown
      }
      st_assvg:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_astext: { Args: { "": string }; Returns: string }
      st_astwkb:
        | {
            Args: {
              geom: unknown
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown[]
              ids: number[]
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
      st_asx3d: {
        Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
        Returns: string
      }
      st_azimuth:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: number }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_boundingdiagonal: {
        Args: { fits?: boolean; geom: unknown }
        Returns: unknown
      }
      st_buffer:
        | {
            Args: { geom: unknown; options?: string; radius: number }
            Returns: unknown
          }
        | {
            Args: { geom: unknown; quadsegs: number; radius: number }
            Returns: unknown
          }
      st_centroid: { Args: { "": string }; Returns: unknown }
      st_clipbybox2d: {
        Args: { box: unknown; geom: unknown }
        Returns: unknown
      }
      st_closestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_collect: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_concavehull: {
        Args: {
          param_allow_holes?: boolean
          param_geom: unknown
          param_pctconvex: number
        }
        Returns: unknown
      }
      st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_coorddim: { Args: { geometry: unknown }; Returns: number }
      st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_crosses: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_curvetoline: {
        Args: { flags?: number; geom: unknown; tol?: number; toltype?: number }
        Returns: unknown
      }
      st_delaunaytriangles: {
        Args: { flags?: number; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_difference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_disjoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_distance:
        | {
            Args: { geog1: unknown; geog2: unknown; use_spheroid?: boolean }
            Returns: number
          }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_distancesphere:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
        | {
            Args: { geom1: unknown; geom2: unknown; radius: number }
            Returns: number
          }
      st_distancespheroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_expand:
        | { Args: { box: unknown; dx: number; dy: number }; Returns: unknown }
        | {
            Args: { box: unknown; dx: number; dy: number; dz?: number }
            Returns: unknown
          }
        | {
            Args: {
              dm?: number
              dx: number
              dy: number
              dz?: number
              geom: unknown
            }
            Returns: unknown
          }
      st_force3d: { Args: { geom: unknown; zvalue?: number }; Returns: unknown }
      st_force3dm: {
        Args: { geom: unknown; mvalue?: number }
        Returns: unknown
      }
      st_force3dz: {
        Args: { geom: unknown; zvalue?: number }
        Returns: unknown
      }
      st_force4d: {
        Args: { geom: unknown; mvalue?: number; zvalue?: number }
        Returns: unknown
      }
      st_generatepoints:
        | { Args: { area: unknown; npoints: number }; Returns: unknown }
        | {
            Args: { area: unknown; npoints: number; seed: number }
            Returns: unknown
          }
      st_geogfromtext: { Args: { "": string }; Returns: unknown }
      st_geographyfromtext: { Args: { "": string }; Returns: unknown }
      st_geohash:
        | { Args: { geog: unknown; maxchars?: number }; Returns: string }
        | { Args: { geom: unknown; maxchars?: number }; Returns: string }
      st_geomcollfromtext: { Args: { "": string }; Returns: unknown }
      st_geometricmedian: {
        Args: {
          fail_if_not_converged?: boolean
          g: unknown
          max_iter?: number
          tolerance?: number
        }
        Returns: unknown
      }
      st_geometryfromtext: { Args: { "": string }; Returns: unknown }
      st_geomfromewkt: { Args: { "": string }; Returns: unknown }
      st_geomfromgeojson:
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": string }; Returns: unknown }
      st_geomfromgml: { Args: { "": string }; Returns: unknown }
      st_geomfromkml: { Args: { "": string }; Returns: unknown }
      st_geomfrommarc21: { Args: { marc21xml: string }; Returns: unknown }
      st_geomfromtext: { Args: { "": string }; Returns: unknown }
      st_gmltosql: { Args: { "": string }; Returns: unknown }
      st_hasarc: { Args: { geometry: unknown }; Returns: boolean }
      st_hausdorffdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_hexagon: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_hexagongrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_interpolatepoint: {
        Args: { line: unknown; point: unknown }
        Returns: number
      }
      st_intersection: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_intersects:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_isvaliddetail: {
        Args: { flags?: number; geom: unknown }
        Returns: Database["public"]["CompositeTypes"]["valid_detail"]
        SetofOptions: {
          from: "*"
          to: "valid_detail"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      st_length:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_letters: { Args: { font?: Json; letters: string }; Returns: unknown }
      st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      st_linefromencodedpolyline: {
        Args: { nprecision?: number; txtin: string }
        Returns: unknown
      }
      st_linefromtext: { Args: { "": string }; Returns: unknown }
      st_linelocatepoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_linetocurve: { Args: { geometry: unknown }; Returns: unknown }
      st_locatealong: {
        Args: { geometry: unknown; leftrightoffset?: number; measure: number }
        Returns: unknown
      }
      st_locatebetween: {
        Args: {
          frommeasure: number
          geometry: unknown
          leftrightoffset?: number
          tomeasure: number
        }
        Returns: unknown
      }
      st_locatebetweenelevations: {
        Args: { fromelevation: number; geometry: unknown; toelevation: number }
        Returns: unknown
      }
      st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makebox2d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makeline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makevalid: {
        Args: { geom: unknown; params: string }
        Returns: unknown
      }
      st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_minimumboundingcircle: {
        Args: { inputgeom: unknown; segs_per_quarter?: number }
        Returns: unknown
      }
      st_mlinefromtext: { Args: { "": string }; Returns: unknown }
      st_mpointfromtext: { Args: { "": string }; Returns: unknown }
      st_mpolyfromtext: { Args: { "": string }; Returns: unknown }
      st_multilinestringfromtext: { Args: { "": string }; Returns: unknown }
      st_multipointfromtext: { Args: { "": string }; Returns: unknown }
      st_multipolygonfromtext: { Args: { "": string }; Returns: unknown }
      st_node: { Args: { g: unknown }; Returns: unknown }
      st_normalize: { Args: { geom: unknown }; Returns: unknown }
      st_offsetcurve: {
        Args: { distance: number; line: unknown; params?: string }
        Returns: unknown
      }
      st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_perimeter: {
        Args: { geog: unknown; use_spheroid?: boolean }
        Returns: number
      }
      st_pointfromtext: { Args: { "": string }; Returns: unknown }
      st_pointm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
        }
        Returns: unknown
      }
      st_pointz: {
        Args: {
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_pointzm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_polyfromtext: { Args: { "": string }; Returns: unknown }
      st_polygonfromtext: { Args: { "": string }; Returns: unknown }
      st_project: {
        Args: { azimuth: number; distance: number; geog: unknown }
        Returns: unknown
      }
      st_quantizecoordinates: {
        Args: {
          g: unknown
          prec_m?: number
          prec_x: number
          prec_y?: number
          prec_z?: number
        }
        Returns: unknown
      }
      st_reduceprecision: {
        Args: { geom: unknown; gridsize: number }
        Returns: unknown
      }
      st_relate: { Args: { geom1: unknown; geom2: unknown }; Returns: string }
      st_removerepeatedpoints: {
        Args: { geom: unknown; tolerance?: number }
        Returns: unknown
      }
      st_segmentize: {
        Args: { geog: unknown; max_segment_length: number }
        Returns: unknown
      }
      st_setsrid:
        | { Args: { geog: unknown; srid: number }; Returns: unknown }
        | { Args: { geom: unknown; srid: number }; Returns: unknown }
      st_sharedpaths: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_shortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_simplifypolygonhull: {
        Args: { geom: unknown; is_outer?: boolean; vertex_fraction: number }
        Returns: unknown
      }
      st_split: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_square: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_squaregrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_srid:
        | { Args: { geog: unknown }; Returns: number }
        | { Args: { geom: unknown }; Returns: number }
      st_subdivide: {
        Args: { geom: unknown; gridsize?: number; maxvertices?: number }
        Returns: unknown[]
      }
      st_swapordinates: {
        Args: { geom: unknown; ords: unknown }
        Returns: unknown
      }
      st_symdifference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_symmetricdifference: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_tileenvelope: {
        Args: {
          bounds?: unknown
          margin?: number
          x: number
          y: number
          zoom: number
        }
        Returns: unknown
      }
      st_touches: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_transform:
        | {
            Args: { from_proj: string; geom: unknown; to_proj: string }
            Returns: unknown
          }
        | {
            Args: { from_proj: string; geom: unknown; to_srid: number }
            Returns: unknown
          }
        | { Args: { geom: unknown; to_proj: string }; Returns: unknown }
      st_triangulatepolygon: { Args: { g1: unknown }; Returns: unknown }
      st_union:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
        | {
            Args: { geom1: unknown; geom2: unknown; gridsize: number }
            Returns: unknown
          }
      st_voronoilines: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_voronoipolygons: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_wkbtosql: { Args: { wkb: string }; Returns: unknown }
      st_wkttosql: { Args: { "": string }; Returns: unknown }
      st_wrapx: {
        Args: { geom: unknown; move: number; wrap: number }
        Returns: unknown
      }
      submit_riding_guide_proposal: {
        Args: {
          p_featured_roads: string[]
          p_reason: string
          p_stops: Json
          p_tags: string[]
          p_title: string
        }
        Returns: string
      }
      toggle_general_place_share: {
        Args: { p_general_place_id: string }
        Returns: boolean
      }
      toggle_place_rider_fact: {
        Args: { p_fact_code: string; p_place_id: string }
        Returns: boolean
      }
      unlockrows: { Args: { "": string }; Returns: number }
      unregistered_ride_spots: {
        Args: { p_limit?: number }
        Returns: {
          address: string
          latitude: number
          longitude: number
          name: string
          riders: number
          rides: number
        }[]
      }
      updategeometrysrid: {
        Args: {
          catalogn_name: string
          column_name: string
          new_srid_in: number
          schema_name: string
          table_name: string
        }
        Returns: string
      }
      vote_hazard: {
        Args: { p_hazard_id: string; p_kind: string }
        Returns: undefined
      }
      with_object_josa: { Args: { word: string }; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      geometry_dump: {
        path: number[] | null
        geom: unknown
      }
      valid_detail: {
        valid: boolean | null
        reason: string | null
        location: unknown
      }
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
    Enums: {},
  },
} as const
