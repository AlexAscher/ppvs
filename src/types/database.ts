export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json }
  | Json[];

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          display_name: string | null;
          role: "chatter" | "agency";
          agency_name: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          email: string;
          display_name?: string | null;
          role: "chatter" | "agency";
          agency_name?: string | null;
          created_at?: string;
        };
        Update: {
          display_name?: string | null;
          role?: "chatter" | "agency";
          agency_name?: string | null;
        };
      };
      vault_items: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          file_path: string;
          thumb_path: string;
          file_type: "image" | "video";
          default_price: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          file_path: string;
          thumb_path: string;
          file_type: "image" | "video";
          default_price: number;
          created_at?: string;
        };
        Update: {
          title?: string;
          default_price?: number;
        };
      };
      ppv_links: {
        Row: {
          id: string;
          user_id: string;
          vault_item_id: string;
          code: string;
          price: number;
          fan_telegram: string | null;
          is_paid: boolean;
          created_at: string;
          paid_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          vault_item_id: string;
          code: string;
          price: number;
          fan_telegram?: string | null;
          is_paid?: boolean;
          created_at?: string;
          paid_at?: string | null;
        };
        Update: {
          is_paid?: boolean;
          paid_at?: string | null;
        };
      };
      invitations: {
        Row: {
          id: string;
          agency_id: string;
          agency_name: string;
          chatter_email: string;
          chatter_id: string | null;
          status: "pending" | "accepted" | "declined";
          created_at: string;
        };
        Insert: {
          id?: string;
          agency_id: string;
          agency_name: string;
          chatter_email: string;
          chatter_id?: string | null;
          status?: "pending" | "accepted" | "declined";
          created_at?: string;
        };
        Update: {
          chatter_id?: string | null;
          status?: "pending" | "accepted" | "declined";
        };
      };
      agency_chatters: {
        Row: {
          id: string;
          agency_id: string;
          chatter_id: string;
          joined_at: string;
        };
        Insert: {
          id?: string;
          agency_id: string;
          chatter_id: string;
          joined_at?: string;
        };
        Update: Record<string, never>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      user_role: "chatter" | "agency";
      file_type: "image" | "video";
    };
  };
}
