import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/getProfile';
import { getBranding } from '@/lib/data/settings';
import AppShell from '@/components/layout/AppShell';
import NotProvisioned from '@/components/layout/NotProvisioned';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Not authenticated -> login.
  if (!user) redirect('/login');

  const profile = await getProfile();

  // Authenticated but no profiles row (DB not migrated / account not provisioned).
  // Show a clear message instead of silently bouncing back to /login.
  if (!profile) {
    return <NotProvisioned email={user.email} />;
  }

  const brand = await getBranding();
  return (
    <AppShell profile={profile} brand={brand}>
      {children}
    </AppShell>
  );
}
