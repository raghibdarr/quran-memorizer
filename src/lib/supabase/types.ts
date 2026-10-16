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

export type PushSubscriptionRow = {
  endpoint: string
  user_id: string
  p256dh: string
  auth: string
  tz: string
  reminder_hour: number
  last_sent_on: string | null
  created_at: string
}

export type NotificationPrefsRow = {
  user_id: string
  email_digest: boolean
  tz: string
  last_digest_at: string | null
  updated_at: string
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
      // 003_notifications.sql (M8 web push + email digest)
      push_subscriptions: {
        Row: PushSubscriptionRow
        Insert: Omit<PushSubscriptionRow, 'tz' | 'reminder_hour' | 'last_sent_on' | 'created_at'> & Partial<Pick<PushSubscriptionRow, 'tz' | 'reminder_hour' | 'last_sent_on'>>
        Update: Partial<PushSubscriptionRow>
        Relationships: []
      }
      notification_prefs: {
        Row: NotificationPrefsRow
        Insert: Pick<NotificationPrefsRow, 'user_id'> & Partial<Omit<NotificationPrefsRow, 'user_id'>>
        Update: Partial<NotificationPrefsRow>
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      // migration 004
      delete_my_account: { Args: Record<string, never>; Returns: undefined }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
