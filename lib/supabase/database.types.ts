export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string;
          avatar_url: string | null;
          preferences: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name?: string;
          avatar_url?: string | null;
          preferences?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string;
          avatar_url?: string | null;
          preferences?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      youtube_channels: {
        Row: {
          id: string;
          owner_id: string;
          youtube_channel_id: string;
          channel_name: string;
          description: string;
          custom_url: string | null;
          thumbnail_url: string | null;
          country_code: string | null;
          published_at: string | null;
          subscriber_count: number | null;
          hidden_subscriber_count: boolean;
          view_count: number | null;
          video_count: number | null;
          synced_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          youtube_channel_id: string;
          channel_name: string;
          description?: string;
          custom_url?: string | null;
          thumbnail_url?: string | null;
          country_code?: string | null;
          published_at?: string | null;
          subscriber_count?: number | null;
          hidden_subscriber_count?: boolean;
          view_count?: number | null;
          video_count?: number | null;
          synced_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          youtube_channel_id?: string;
          channel_name?: string;
          description?: string;
          custom_url?: string | null;
          thumbnail_url?: string | null;
          country_code?: string | null;
          published_at?: string | null;
          subscriber_count?: number | null;
          hidden_subscriber_count?: boolean;
          view_count?: number | null;
          video_count?: number | null;
          synced_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      youtube_videos: {
        Row: {
          id: string;
          owner_id: string;
          channel_id: string;
          youtube_video_id: string;
          title: string;
          description: string;
          thumbnail_url: string | null;
          published_at: string | null;
          duration_seconds: number | null;
          privacy_status: "public" | "unlisted" | "private" | null;
          view_count: number | null;
          like_count: number | null;
          comment_count: number | null;
          synced_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          channel_id: string;
          youtube_video_id: string;
          title: string;
          description?: string;
          thumbnail_url?: string | null;
          published_at?: string | null;
          duration_seconds?: number | null;
          privacy_status?: "public" | "unlisted" | "private" | null;
          view_count?: number | null;
          like_count?: number | null;
          comment_count?: number | null;
          synced_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          channel_id?: string;
          youtube_video_id?: string;
          title?: string;
          description?: string;
          thumbnail_url?: string | null;
          published_at?: string | null;
          duration_seconds?: number | null;
          privacy_status?: "public" | "unlisted" | "private" | null;
          view_count?: number | null;
          like_count?: number | null;
          comment_count?: number | null;
          synced_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      youtube_playlists: {
        Row: {
          id: string;
          owner_id: string;
          channel_id: string;
          youtube_playlist_id: string;
          title: string;
          description: string;
          thumbnail_url: string | null;
          published_at: string | null;
          item_count: number | null;
          privacy_status: "public" | "unlisted" | "private" | null;
          synced_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          channel_id: string;
          youtube_playlist_id: string;
          title: string;
          description?: string;
          thumbnail_url?: string | null;
          published_at?: string | null;
          item_count?: number | null;
          privacy_status?: "public" | "unlisted" | "private" | null;
          synced_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          channel_id?: string;
          youtube_playlist_id?: string;
          title?: string;
          description?: string;
          thumbnail_url?: string | null;
          published_at?: string | null;
          item_count?: number | null;
          privacy_status?: "public" | "unlisted" | "private" | null;
          synced_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      youtube_analytics_daily: {
        Row: {
          id: string;
          owner_id: string;
          channel_id: string;
          report_date: string;
          views: number | null;
          watch_time_minutes: number | null;
          average_view_duration_seconds: number | null;
          subscribers_gained: number | null;
          subscribers_lost: number | null;
          synced_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          channel_id: string;
          report_date: string;
          views?: number | null;
          watch_time_minutes?: number | null;
          average_view_duration_seconds?: number | null;
          subscribers_gained?: number | null;
          subscribers_lost?: number | null;
          synced_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          channel_id?: string;
          report_date?: string;
          views?: number | null;
          watch_time_minutes?: number | null;
          average_view_duration_seconds?: number | null;
          subscribers_gained?: number | null;
          subscribers_lost?: number | null;
          synced_at?: string;
        };
        Relationships: [];
      };
      characters: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          character_type: "Human" | "Animal" | "Robot" | "Vegetable" | "Fantasy" | "Other";
          personality: string;
          appearance: string;
          clothing: string;
          voice_style: string;
          special_features: string;
          role: string;
          prompt: string;
          created_at: string;
          updated_at: string;
        };

        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          character_type: "Human" | "Animal" | "Robot" | "Vegetable" | "Fantasy" | "Other";
          personality: string;
          appearance: string;
          clothing: string;
          voice_style: string;
          special_features?: string;
          role: string;
          prompt: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          name?: string;
          character_type?: string;
          personality?: string;
          appearance?: string;
          clothing?: string;
          voice_style?: string;
          special_features?: string;
          role?: string;
          prompt?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      stories: {
        Row: {
          id: string;
          owner_id: string;
          title: string;
          topic: string;
          style: string;
          duration: string;
          characters: string;
          language: string;
          introduction: string;
          narrator_script: string;
          dialogue: Json;
          ending: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          title: string;
          topic: string;
          style: string;
          duration: string;
          characters: string;
          language: string;
          introduction: string;
          narrator_script: string;
          dialogue?: Json;
          ending: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          title?: string;
          topic?: string;
          style?: string;
          duration?: string;
          characters?: string;
          language?: string;
          introduction?: string;
          narrator_script?: string;
          dialogue?: Json;
          ending?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      story_scenes: {
        Row: {
          id: string;
          owner_id: string;
          story_id: string;
          position: number;
          title: string;
          description: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          story_id: string;
          position: number;
          title: string;
          description: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          story_id?: string;
          position?: number;
          title?: string;
          description?: string;
        };
        Relationships: [];
      };
      content_projects: {
        Row: {
          id: string;
          owner_id: string;
          title: string;
          project_type: string;
          status: string;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          title: string;
          project_type: string;
          status?: string;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          title?: string;
          project_type?: string;
          status?: string;
          metadata?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      media_assets: {
        Row: {
          id: string;
          owner_id: string;
          bucket_id: string;
          object_path: string;
          mime_type: string | null;
          size_bytes: number | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          bucket_id: string;
          object_path: string;
          mime_type?: string | null;
          size_bytes?: number | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          bucket_id?: string;
          object_path?: string;
          mime_type?: string | null;
          size_bytes?: number | null;
          metadata?: Json;
        };
        Relationships: [];
      };
      app_settings: {
        Row: {
          id: string;
          owner_id: string;
          key: string;
          value: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          key: string;
          value?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          key?: string;
          value?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      thumbnail_prompts: {
        Row: {
          id: string;
          owner_id: string;
          prompt_text: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          prompt_text: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          prompt_text?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };

    Views: Record<string, never>;
    Functions: {
      is_authorized_user: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      save_story: {
        Args: {
          p_story_id: string | null;
          p_title: string;
          p_topic: string;
          p_style: string;
          p_duration: string;
          p_characters: string;
          p_language: string;
          p_introduction: string;
          p_narrator_script: string;
          p_dialogue: Json;
          p_ending: string;
          p_scenes: Json;
        };
        Returns: string;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type YouTubeChannelRow =
  Database["public"]["Tables"]["youtube_channels"]["Row"];
export type YouTubeVideoRow =
  Database["public"]["Tables"]["youtube_videos"]["Row"];
export type YouTubeAnalyticsDailyRow =
  Database["public"]["Tables"]["youtube_analytics_daily"]["Row"];
