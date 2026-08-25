import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser Supabase client. Safe to use in Client Components.
 * The publishable/anon key is public by design; RLS protects the data.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
