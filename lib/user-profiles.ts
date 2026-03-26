import type { User } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type UserProfile = {
  user_id: string
  full_name?: string | null
  avatar_url?: string | null
  phone?: string | null
  reminder_prefs?: string | null
  onboarding_complete: boolean
  last_sign_in?: string | null
  created_at: string
  updated_at: string
}

export async function upsertUserProfile(user: User) {
  const payload = {
    user_id: user.id,
    full_name: (user.user_metadata as Record<string, any>)?.full_name ?? user.email,
    avatar_url: (user.user_metadata as Record<string, any>)?.avatar_url ?? null,
    onboarding_complete: false,
    last_sign_in: new Date().toISOString(),
  }

  const { error } = await supabase
    .from('user_profiles')
    .upsert(payload, { onConflict: 'user_id' })

  if (error) {
    console.error('Failed to upsert user profile', error)
    throw error
  }
}

export async function updateUserPhone(userId: string, phone: string) {
  const { error } = await supabase
    .from('user_profiles')
    .update({ phone })
    .eq('user_id', userId)

  if (error) {
    console.error('Failed to update user phone', error)
    throw error
  }
}
