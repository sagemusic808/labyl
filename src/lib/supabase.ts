import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// Falls back to a no-op client if env vars are not configured yet
const url = supabaseUrl?.startsWith('http') ? supabaseUrl : 'https://placeholder.supabase.co'
const key = supabaseAnonKey || 'placeholder'

export const supabase = createClient(url, key)
