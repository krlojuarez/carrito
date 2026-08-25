import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';

export type Role = 'admin' | 'member';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  is_active: boolean;
}

/**
 * Returns the current user's profile row (with role), or null if unauthenticated.
 * cache() dedupes within a single render pass.
 */
export const getProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, is_active')
    .eq('id', user.id)
    .single();

  return (data as Profile) ?? null;
});
