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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      announcement_reads: {
        Row: {
          announcement_id: string
          id: string
          read_at: string
          user_id: string
        }
        Insert: {
          announcement_id: string
          id?: string
          read_at?: string
          user_id: string
        }
        Update: {
          announcement_id?: string
          id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_reads_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          title: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          title: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          title?: string
        }
        Relationships: []
      }
      data_templates: {
        Row: {
          cost_file_name: string | null
          created_at: string | null
          facility_name: string | null
          id: string
          inv_date: string | null
          inv_number: string | null
          job_ticket_file_name: string | null
          name: string
          status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          cost_file_name?: string | null
          created_at?: string | null
          facility_name?: string | null
          id?: string
          inv_date?: string | null
          inv_number?: string | null
          job_ticket_file_name?: string | null
          name: string
          status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          cost_file_name?: string | null
          created_at?: string | null
          facility_name?: string | null
          id?: string
          inv_date?: string | null
          inv_number?: string | null
          job_ticket_file_name?: string | null
          name?: string
          status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      drugs: {
        Row: {
          created_at: string
          dea_schedule: string | null
          drug_name: string
          fda_status: string | null
          id: string
          manufacturer: string | null
          ndc: string
          package_description: string | null
          source: string | null
          unit_cost: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          dea_schedule?: string | null
          drug_name: string
          fda_status?: string | null
          id?: string
          manufacturer?: string | null
          ndc: string
          package_description?: string | null
          source?: string | null
          unit_cost?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          dea_schedule?: string | null
          drug_name?: string
          fda_status?: string | null
          id?: string
          manufacturer?: string | null
          ndc?: string
          package_description?: string | null
          source?: string | null
          unit_cost?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          first_name: string | null
          full_name: string | null
          id: string
          last_name: string | null
          middle_name: string | null
          phone: string | null
          profile_completed: boolean | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          full_name?: string | null
          id: string
          last_name?: string | null
          middle_name?: string | null
          phone?: string | null
          profile_completed?: boolean | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          full_name?: string | null
          id?: string
          last_name?: string | null
          middle_name?: string | null
          phone?: string | null
          profile_completed?: boolean | null
          updated_at?: string
        }
        Relationships: []
      }
      scheduled_jobs: {
        Row: {
          address: string | null
          arrival_note: string | null
          client_id: string | null
          client_name: string
          corporate_contact: string | null
          created_at: string
          created_by: string | null
          email_data_to: string | null
          final_invoice_to: string | null
          hotel_info: string | null
          id: string
          invoice_number: string | null
          is_travel_day: boolean | null
          job_date: string
          notes: string | null
          onsite_contact: string | null
          phone: string | null
          previous_inventory_value: string | null
          special_notes: string | null
          start_time: string | null
          status: string | null
          team_count: number | null
          team_members: string[] | null
          travel_info: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          arrival_note?: string | null
          client_id?: string | null
          client_name: string
          corporate_contact?: string | null
          created_at?: string
          created_by?: string | null
          email_data_to?: string | null
          final_invoice_to?: string | null
          hotel_info?: string | null
          id?: string
          invoice_number?: string | null
          is_travel_day?: boolean | null
          job_date: string
          notes?: string | null
          onsite_contact?: string | null
          phone?: string | null
          previous_inventory_value?: string | null
          special_notes?: string | null
          start_time?: string | null
          status?: string | null
          team_count?: number | null
          team_members?: string[] | null
          travel_info?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          arrival_note?: string | null
          client_id?: string | null
          client_name?: string
          corporate_contact?: string | null
          created_at?: string
          created_by?: string | null
          email_data_to?: string | null
          final_invoice_to?: string | null
          hotel_info?: string | null
          id?: string
          invoice_number?: string | null
          is_travel_day?: boolean | null
          job_date?: string
          notes?: string | null
          onsite_contact?: string | null
          phone?: string | null
          previous_inventory_value?: string | null
          special_notes?: string | null
          start_time?: string | null
          status?: string | null
          team_count?: number | null
          team_members?: string[] | null
          travel_info?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      team_members: {
        Row: {
          color: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean | null
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      template_cost_items: {
        Row: {
          billing_date: string | null
          created_at: string | null
          dose: string | null
          generic: string | null
          id: string
          manufacturer: string | null
          material: string | null
          material_description: string | null
          ndc: string | null
          size: string | null
          source: string | null
          strength: string | null
          template_id: string
          unit_price: number | null
        }
        Insert: {
          billing_date?: string | null
          created_at?: string | null
          dose?: string | null
          generic?: string | null
          id?: string
          manufacturer?: string | null
          material?: string | null
          material_description?: string | null
          ndc?: string | null
          size?: string | null
          source?: string | null
          strength?: string | null
          template_id: string
          unit_price?: number | null
        }
        Update: {
          billing_date?: string | null
          created_at?: string | null
          dose?: string | null
          generic?: string | null
          id?: string
          manufacturer?: string | null
          material?: string | null
          material_description?: string | null
          ndc?: string | null
          size?: string | null
          source?: string | null
          strength?: string | null
          template_id?: string
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "template_cost_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "data_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      template_issues: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_resolved: boolean | null
          issue_type: string
          notes: string | null
          template_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_resolved?: boolean | null
          issue_type: string
          notes?: string | null
          template_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_resolved?: boolean | null
          issue_type?: string
          notes?: string | null
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_issues_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "data_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      template_sections: {
        Row: {
          created_at: string | null
          description: string | null
          full_section: string | null
          id: string
          sect: string
          template_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          full_section?: string | null
          id?: string
          sect: string
          template_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          full_section?: string | null
          id?: string
          sect?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_sections_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "data_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      timesheet_entries: {
        Row: {
          break_minutes: number | null
          client_name: string | null
          created_at: string
          end_time: string | null
          hours_worked: number
          id: string
          job_id: string | null
          notes: string | null
          start_time: string | null
          status: string | null
          team_member_id: string | null
          updated_at: string
          user_id: string
          work_date: string
        }
        Insert: {
          break_minutes?: number | null
          client_name?: string | null
          created_at?: string
          end_time?: string | null
          hours_worked?: number
          id?: string
          job_id?: string | null
          notes?: string | null
          start_time?: string | null
          status?: string | null
          team_member_id?: string | null
          updated_at?: string
          user_id: string
          work_date: string
        }
        Update: {
          break_minutes?: number | null
          client_name?: string | null
          created_at?: string
          end_time?: string | null
          hours_worked?: number
          id?: string
          job_id?: string | null
          notes?: string | null
          start_time?: string | null
          status?: string | null
          team_member_id?: string | null
          updated_at?: string
          user_id?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "timesheet_entries_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "scheduled_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timesheet_entries_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_developer: { Args: { _user_id: string }; Returns: boolean }
      is_owner: { Args: { _user_id: string }; Returns: boolean }
      is_privileged: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role:
        | "auditor"
        | "developer"
        | "coordinator"
        | "owner"
        | "office_admin"
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
      app_role: [
        "auditor",
        "developer",
        "coordinator",
        "owner",
        "office_admin",
      ],
    },
  },
} as const
