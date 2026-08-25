import { requireUser } from '@/lib/auth/guards';
import { getBranding } from '@/lib/data/settings';
import AppShell from '@/components/layout/AppShell';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireUser();
  const brand = await getBranding();
  return (
    <AppShell profile={profile} brand={brand}>
      {children}
    </AppShell>
  );
}
