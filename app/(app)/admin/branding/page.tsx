import BrandingClient from '@/components/admin/BrandingClient';
import { getSettings } from '@/lib/data/queries';

export const dynamic = 'force-dynamic';

export default async function AdminBrandingPage() {
  const settings = await getSettings();
  return <BrandingClient settings={settings} />;
}
