export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      bankroll: {
        Row: {
          created_at: string | null
          current_amount: number
          id: number
          last_updated: string | null
          monthly_goal_percent: number | null
          start_date: string
          starting_amount: number
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          current_amount?: number
          id?: number
          last_updated?: string | null
          monthly_goal_percent?: number | null
          start_date?: string
          starting_amount?: number
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          current_amount?: number
          id?: number
          last_updated?: string | null
          monthly_goal_percent?: number | null
          start_date?: string
          starting_amount?: number
          user_id?: string | null
        }
        Relationships: []
      }
      daily_picks: {
        Row: {
          created_at: string | null
          date: string
          id: string
          picks: Json | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          date?: string
          id?: string
          picks?: Json | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          date?: string
          id?: string
          picks?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      game_results: {
        Row: {
          created_at: string | null
          final_score: string | null
          game_date: string
          id: string
          league: string | null
          matchup: string | null
          pick_id: string
          pick_text: string
          result: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          final_score?: string | null
          game_date: string
          id?: string
          league?: string | null
          matchup?: string | null
          pick_id: string
          pick_text: string
          result: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          final_score?: string | null
          game_date?: string
          id?: string
          league?: string | null
          matchup?: string | null
          pick_id?: string
          pick_text?: string
          result?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "game_results_pick_id_fkey"
            columns: ["pick_id"]
            isOneToOne: false
            referencedRelation: "daily_picks"
            referencedColumns: ["id"]
          },
        ]
      }
      prop_picks: {
        Row: {
          created_at: string | null
          date: string
          id: string
          picks: Json
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          date: string
          id?: string
          picks: Json
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          date?: string
          id?: string
          picks?: Json
          updated_at?: string | null
        }
        Relationships: []
      }
      prop_results: {
        Row: {
          actual_value: number | null
          created_at: string | null
          game_date: string | null
          id: string
          line_value: number | null
          matchup: string | null
          odds: string | null
          pick_text: string | null
          player_name: string | null
          prop_pick_id: string | null
          prop_type: string | null
          result: string | null
          updated_at: string | null
        }
        Insert: {
          actual_value?: number | null
          created_at?: string | null
          game_date?: string | null
          id?: string
          line_value?: number | null
          matchup?: string | null
          odds?: string | null
          pick_text?: string | null
          player_name?: string | null
          prop_pick_id?: string | null
          prop_type?: string | null
          result?: string | null
          updated_at?: string | null
        }
        Update: {
          actual_value?: number | null
          created_at?: string | null
          game_date?: string | null
          id?: string
          line_value?: number | null
          matchup?: string | null
          odds?: string | null
          pick_text?: string | null
          player_name?: string | null
          prop_pick_id?: string | null
          prop_type?: string | null
          result?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prop_results_prop_pick_id_fkey"
            columns: ["prop_pick_id"]
            isOneToOne: false
            referencedRelation: "prop_picks"
            referencedColumns: ["id"]
          },
        ]
      }
      user_picks: {
        Row: {
          created_at: string | null
          decision: string
          id: string
          outcome: string | null
          pick_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          decision: string
          id?: string
          outcome?: string | null
          pick_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          decision?: string
          id?: string
          outcome?: string | null
          pick_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_stats: {
        Row: {
          created_at: string
          current_streak: number | null
          fade_count: number | null
          id: string
          last_result: string | null
          longest_streak: number | null
          loss_count: number | null
          recent_results: string[] | null
          ride_count: number | null
          total_picks: number | null
          updated_at: string
          win_count: number | null
        }
        Insert: {
          created_at?: string
          current_streak?: number | null
          fade_count?: number | null
          id: string
          last_result?: string | null
          longest_streak?: number | null
          loss_count?: number | null
          recent_results?: string[] | null
          ride_count?: number | null
          total_picks?: number | null
          updated_at?: string
          win_count?: number | null
        }
        Update: {
          created_at?: string
          current_streak?: number | null
          fade_count?: number | null
          id?: string
          last_result?: string | null
          longest_streak?: number | null
          loss_count?: number | null
          recent_results?: string[] | null
          ride_count?: number | null
          total_picks?: number | null
          updated_at?: string
          win_count?: number | null
        }
        Relationships: []
      }
      users: {
        Row: {
          created_at: string
          email: string | null
          id: string
          plan: string | null
          stats: Json | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_period_end: string | null
          subscription_period_start: string | null
          subscription_status: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          plan?: string | null
          stats?: Json | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_period_end?: string | null
          subscription_period_start?: string | null
          subscription_status?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          plan?: string | null
          stats?: Json | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_period_end?: string | null
          subscription_period_start?: string | null
          subscription_status?: string | null
        }
        Relationships: []
      }
      wagers: {
        Row: {
          actual_score: string | null
          amount: number
          bankroll_id: number | null
          bet_score: string | null
          bet_type: string | null
          created_at: string | null
          game_id: string | null
          game_time: string | null
          id: number
          is_free_bet: boolean | null
          is_parlay: boolean | null
          league: string | null
          notes: string | null
          odds: string | null
          parlay_id: number | null
          pick_id: string | null
          placed_date: string | null
          potential_payout: number | null
          status: string | null
          team_bet_on: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          actual_score?: string | null
          amount?: number
          bankroll_id?: number | null
          bet_score?: string | null
          bet_type?: string | null
          created_at?: string | null
          game_id?: string | null
          game_time?: string | null
          id?: number
          is_free_bet?: boolean | null
          is_parlay?: boolean | null
          league?: string | null
          notes?: string | null
          odds?: string | null
          parlay_id?: number | null
          pick_id?: string | null
          placed_date?: string | null
          potential_payout?: number | null
          status?: string | null
          team_bet_on?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          actual_score?: string | null
          amount?: number
          bankroll_id?: number | null
          bet_score?: string | null
          bet_type?: string | null
          created_at?: string | null
          game_id?: string | null
          game_time?: string | null
          id?: number
          is_free_bet?: boolean | null
          is_parlay?: boolean | null
          league?: string | null
          notes?: string | null
          odds?: string | null
          parlay_id?: number | null
          pick_id?: string | null
          placed_date?: string | null
          potential_payout?: number | null
          status?: string | null
          team_bet_on?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wagers_fixed_bankroll_id_fkey"
            columns: ["bankroll_id"]
            isOneToOne: false
            referencedRelation: "bankroll"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_wager_amount: {
        Args: { confidence: number; bankroll: number }
        Returns: number
      }
      jsonb_extract_path_text: {
        Args:
          | { from_json: Json }
          | { from_record: Record<string, unknown>; path_elem: string }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
