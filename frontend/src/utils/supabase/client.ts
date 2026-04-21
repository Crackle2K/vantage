/**
 * @fileoverview Supabase browser client singleton. Creates and caches a
 * single Supabase client instance using environment variables for the
 * URL and anonymous key. Throws if required env vars are missing.
 */

import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

let singleton: ReturnType<typeof createBrowserClient> | null = null

/**
 * Returns the Supabase browser client singleton. Creates it on first
 * call and reuses the same instance for all subsequent calls.
 *
 * @returns {ReturnType<typeof createBrowserClient>} The Supabase client instance.
 * @throws {Error} If VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is not set.
 */
export function createClient() {
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error('Supabase frontend environment is missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
  }

  if (!singleton) {
    singleton = createBrowserClient(supabaseUrl, supabasePublishableKey)
  }

  return singleton
}
