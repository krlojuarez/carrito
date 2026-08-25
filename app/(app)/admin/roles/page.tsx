import RolesClient from '@/components/admin/RolesClient';
import { getRoles, getSeniorities } from '@/lib/data/queries';

export const dynamic = 'force-dynamic';

export default async function AdminRolesPage() {
  const [roles, seniorities] = await Promise.all([getRoles(), getSeniorities()]);
  return <RolesClient roles={roles} seniorities={seniorities} />;
}
