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
      chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          room_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          room_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          room_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "chat_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_room_members: {
        Row: {
          id: string
          is_admin: boolean | null
          joined_at: string
          room_id: string
          user_id: string
        }
        Insert: {
          id?: string
          is_admin?: boolean | null
          joined_at?: string
          room_id: string
          user_id: string
        }
        Update: {
          id?: string
          is_admin?: boolean | null
          joined_at?: string
          room_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_room_members_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "chat_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_room_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_rooms: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_rooms_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      live_tracker_jobs: {
        Row: {
          assigned_to: string | null
          automation_notes: string | null
          closed_final_date: string | null
          comments: string | null
          created_at: string
          created_by: string | null
          draft_out_date: string | null
          group_name: string | null
          id: string
          invoiced_date: string | null
          job_name: string
          job_number: string | null
          master_review_by: string | null
          overdue_days: number | null
          pricing_done: boolean | null
          promise_invoice_number: string | null
          ptf_sum: string | null
          schedule_job_id: string | null
          stage: Database["public"]["Enums"]["job_workflow_stage"]
          stage_changed_at: string | null
          template_done: string | null
          ticket_done: string | null
          updated_at: string
          updates_date: string | null
          who_has_auto: string | null
        }
        Insert: {
          assigned_to?: string | null
          automation_notes?: string | null
          closed_final_date?: string | null
          comments?: string | null
          created_at?: string
          created_by?: string | null
          draft_out_date?: string | null
          group_name?: string | null
          id?: string
          invoiced_date?: string | null
          job_name: string
          job_number?: string | null
          master_review_by?: string | null
          overdue_days?: number | null
          pricing_done?: boolean | null
          promise_invoice_number?: string | null
          ptf_sum?: string | null
          schedule_job_id?: string | null
          stage?: Database["public"]["Enums"]["job_workflow_stage"]
          stage_changed_at?: string | null
          template_done?: string | null
          ticket_done?: string | null
          updated_at?: string
          updates_date?: string | null
          who_has_auto?: string | null
        }
        Update: {
          assigned_to?: string | null
          automation_notes?: string | null
          closed_final_date?: string | null
          comments?: string | null
          created_at?: string
          created_by?: string | null
          draft_out_date?: string | null
          group_name?: string | null
          id?: string
          invoiced_date?: string | null
          job_name?: string
          job_number?: string | null
          master_review_by?: string | null
          overdue_days?: number | null
          pricing_done?: boolean | null
          promise_invoice_number?: string | null
          ptf_sum?: string | null
          schedule_job_id?: string | null
          stage?: Database["public"]["Enums"]["job_workflow_stage"]
          stage_changed_at?: string | null
          template_done?: string | null
          ticket_done?: string | null
          updated_at?: string
          updates_date?: string | null
          who_has_auto?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "live_tracker_jobs_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_tracker_jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_tracker_jobs_schedule_job_id_fkey"
            columns: ["schedule_job_id"]
            isOneToOne: false
            referencedRelation: "scheduled_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      live_tracker_stage_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          from_stage: Database["public"]["Enums"]["job_workflow_stage"] | null
          id: string
          job_id: string
          notes: string | null
          to_stage: Database["public"]["Enums"]["job_workflow_stage"]
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          from_stage?: Database["public"]["Enums"]["job_workflow_stage"] | null
          id?: string
          job_id: string
          notes?: string | null
          to_stage: Database["public"]["Enums"]["job_workflow_stage"]
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          from_stage?: Database["public"]["Enums"]["job_workflow_stage"] | null
          id?: string
          job_id?: string
          notes?: string | null
          to_stage?: Database["public"]["Enums"]["job_workflow_stage"]
        }
        Relationships: [
          {
            foreignKeyName: "live_tracker_stage_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_tracker_stage_history_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "live_tracker_jobs"
            referencedColumns: ["id"]
          },
        ]
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
      scan_records: {
        Row: {
          additional_notes: string | null
          ahfs: string | null
          audit_criteria: string | null
          auditor_initials: string | null
          blank: string | null
          created_at: string
          dea_class: string | null
          device: string | null
          dose_form: string | null
          extended: number | null
          fda_size: string | null
          generic: string | null
          generic_code: string | null
          id: string
          item_number: string | null
          loc: string | null
          manufacturer: string | null
          med_desc: string | null
          meridian_desc: string | null
          mis_count_method: string | null
          mis_divisor: number | null
          ndc: string | null
          original_qty: number | null
          pack_cost: number | null
          pack_sz: string | null
          qty: number | null
          rec: string | null
          results: string | null
          scanned_ndc: string | null
          section_id: string
          sheet_type: string | null
          size_txt: string | null
          source: string | null
          strength: string | null
          template_id: string
          time: string | null
          trade: string | null
          unit_cost: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          additional_notes?: string | null
          ahfs?: string | null
          audit_criteria?: string | null
          auditor_initials?: string | null
          blank?: string | null
          created_at?: string
          dea_class?: string | null
          device?: string | null
          dose_form?: string | null
          extended?: number | null
          fda_size?: string | null
          generic?: string | null
          generic_code?: string | null
          id?: string
          item_number?: string | null
          loc?: string | null
          manufacturer?: string | null
          med_desc?: string | null
          meridian_desc?: string | null
          mis_count_method?: string | null
          mis_divisor?: number | null
          ndc?: string | null
          original_qty?: number | null
          pack_cost?: number | null
          pack_sz?: string | null
          qty?: number | null
          rec?: string | null
          results?: string | null
          scanned_ndc?: string | null
          section_id: string
          sheet_type?: string | null
          size_txt?: string | null
          source?: string | null
          strength?: string | null
          template_id: string
          time?: string | null
          trade?: string | null
          unit_cost?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          additional_notes?: string | null
          ahfs?: string | null
          audit_criteria?: string | null
          auditor_initials?: string | null
          blank?: string | null
          created_at?: string
          dea_class?: string | null
          device?: string | null
          dose_form?: string | null
          extended?: number | null
          fda_size?: string | null
          generic?: string | null
          generic_code?: string | null
          id?: string
          item_number?: string | null
          loc?: string | null
          manufacturer?: string | null
          med_desc?: string | null
          meridian_desc?: string | null
          mis_count_method?: string | null
          mis_divisor?: number | null
          ndc?: string | null
          original_qty?: number | null
          pack_cost?: number | null
          pack_sz?: string | null
          qty?: number | null
          rec?: string | null
          results?: string | null
          scanned_ndc?: string | null
          section_id?: string
          sheet_type?: string | null
          size_txt?: string | null
          source?: string | null
          strength?: string | null
          template_id?: string
          time?: string | null
          trade?: string | null
          unit_cost?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scan_records_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "template_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scan_records_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "data_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scan_records_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_jobs: {
        Row: {
          address: string | null
          arrival_note: string | null
          client_id: string | null
          client_name: string
          client_onsite: boolean | null
          corporate_contact: string | null
          created_at: string
          created_by: string | null
          email_data_to: string | null
          end_date: string | null
          event_title: string | null
          event_type: Database["public"]["Enums"]["schedule_event_type"] | null
          exact_count_required: boolean | null
          final_invoice_to: string | null
          hotel_info: string | null
          id: string
          invoice_number: string | null
          is_travel_day: boolean | null
          job_date: string
          location_from: string | null
          location_to: string | null
          notes: string | null
          onsite_contact: string | null
          partial_inventory: boolean | null
          phone: string | null
          previous_inventory_value: string | null
          special_notes: string | null
          start_time: string | null
          status: string | null
          team_count: number | null
          team_members: string[] | null
          tracker_job_id: string | null
          travel_info: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          arrival_note?: string | null
          client_id?: string | null
          client_name: string
          client_onsite?: boolean | null
          corporate_contact?: string | null
          created_at?: string
          created_by?: string | null
          email_data_to?: string | null
          end_date?: string | null
          event_title?: string | null
          event_type?: Database["public"]["Enums"]["schedule_event_type"] | null
          exact_count_required?: boolean | null
          final_invoice_to?: string | null
          hotel_info?: string | null
          id?: string
          invoice_number?: string | null
          is_travel_day?: boolean | null
          job_date: string
          location_from?: string | null
          location_to?: string | null
          notes?: string | null
          onsite_contact?: string | null
          partial_inventory?: boolean | null
          phone?: string | null
          previous_inventory_value?: string | null
          special_notes?: string | null
          start_time?: string | null
          status?: string | null
          team_count?: number | null
          team_members?: string[] | null
          tracker_job_id?: string | null
          travel_info?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          arrival_note?: string | null
          client_id?: string | null
          client_name?: string
          client_onsite?: boolean | null
          corporate_contact?: string | null
          created_at?: string
          created_by?: string | null
          email_data_to?: string | null
          end_date?: string | null
          event_title?: string | null
          event_type?: Database["public"]["Enums"]["schedule_event_type"] | null
          exact_count_required?: boolean | null
          final_invoice_to?: string | null
          hotel_info?: string | null
          id?: string
          invoice_number?: string | null
          is_travel_day?: boolean | null
          job_date?: string
          location_from?: string | null
          location_to?: string | null
          notes?: string | null
          onsite_contact?: string | null
          partial_inventory?: boolean | null
          phone?: string | null
          previous_inventory_value?: string | null
          special_notes?: string | null
          start_time?: string | null
          status?: string | null
          team_count?: number | null
          team_members?: string[] | null
          tracker_job_id?: string | null
          travel_info?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_jobs_tracker_job_id_fkey"
            columns: ["tracker_job_id"]
            isOneToOne: false
            referencedRelation: "live_tracker_jobs"
            referencedColumns: ["id"]
          },
        ]
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
          sheet_name: string | null
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
          sheet_name?: string | null
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
          sheet_name?: string | null
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
          cost_sheet: string | null
          created_at: string | null
          description: string | null
          full_section: string | null
          id: string
          sect: string
          template_id: string
        }
        Insert: {
          cost_sheet?: string | null
          created_at?: string | null
          description?: string | null
          full_section?: string | null
          id?: string
          sect: string
          template_id: string
        }
        Update: {
          cost_sheet?: string | null
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
      is_room_admin: {
        Args: { _room_id: string; _user_id: string }
        Returns: boolean
      }
      is_room_member: {
        Args: { _room_id: string; _user_id: string }
        Returns: boolean
      }
      room_has_members: { Args: { _room_id: string }; Returns: boolean }
    }
    Enums: {
      app_role:
        | "auditor"
        | "developer"
        | "coordinator"
        | "owner"
        | "office_admin"
      job_workflow_stage:
        | "making_price_files"
        | "pricing_complete"
        | "files_built"
        | "needs_automation"
        | "jobs_on_hold"
        | "ready_for_review"
        | "out_on_draft"
        | "in_for_updates"
        | "out_for_final"
        | "to_be_invoiced"
        | "final_approved"
      schedule_event_type: "work" | "travel" | "off" | "note"
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
      job_workflow_stage: [
        "making_price_files",
        "pricing_complete",
        "files_built",
        "needs_automation",
        "jobs_on_hold",
        "ready_for_review",
        "out_on_draft",
        "in_for_updates",
        "out_for_final",
        "to_be_invoiced",
        "final_approved",
      ],
      schedule_event_type: ["work", "travel", "off", "note"],
    },
  },
} as const
