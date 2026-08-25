import TeamClient from '@/components/admin/TeamClient';
import {
  getMembers,
  getPrimaryTeam,
  getRoles,
  getSeniorities,
} from '@/lib/data/queries';

export const dynamic = 'force-dynamic';

export default async function AdminTeamPage() {
  const team = await getPrimaryTeam();
  const [roles, seniorities] = await Promise.all([getRoles(), getSeniorities()]);
  const members = team ? await getMembers(team.id) : [];

  return (
    <TeamClient
      team={team}
      members={members}
      roles={roles}
      seniorities={seniorities}
    />
  );
}
