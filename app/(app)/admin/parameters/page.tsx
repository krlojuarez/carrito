import ParametersClient from '@/components/admin/ParametersClient';
import { getSettings } from '@/lib/data/queries';

export const dynamic = 'force-dynamic';

export default async function AdminParametersPage() {
  const settings = await getSettings();
  return <ParametersClient settings={settings} />;
}
