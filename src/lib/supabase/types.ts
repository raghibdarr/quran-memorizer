// Hand-written Database type for the one table the app uses. Mirrors
// supabase/migrations/001_initial_schema.sql + 002_user_data_rev.sql — keep in
// sync if the schema changes (replaces the old `as any` cast on the sync path).

// NOTE: type alias, not interface — interfaces lack implicit index signatures and
// fail postgrest-js's `Record<string, unknown>` row constraint (rows become never).
export type UserDataRow = {
  user_id: string
  store_name: string
  data: Record<string, unknown>
  updated_at: string
  rev: number
}

export type Database = {
  public: {
    Tables: {
      user_data: {
        Row: UserDataRow
        Insert: {
          user_id: string
          store_name: string
          data: Record<string, unknown>
          updated_at?: string
          rev?: number
        }
        Update: Partial<UserDataRow>
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
