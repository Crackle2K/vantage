import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

let singleton: ReturnType<typeof createBrowserClient> | null = null

export function createClient() {
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error('Supabase frontend environment is missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
  }

  if (!singleton) {
    singleton = createBrowserClient(supabaseUrl, supabasePublishableKey)
  }

  return singleton
}
