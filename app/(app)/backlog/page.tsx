import Link from 'next/link';
import { Button, Card, Empty } from 'antd';
import PageHeader from '@/components/common/PageHeader';
import BacklogClient from '@/components/backlog/BacklogClient';
import { getProfile } from '@/lib/auth/getProfile';
import { getMembers, getPrimaryTeam, getSprints, getStories } from '@/lib/data/queries';

export const dynamic = 'force-dynamic';

export default async function BacklogPage({
  searchParams,
}: {
  searchParams: Promise<{ sprint?: string }>;
}) {
  const { sprint } = await searchParams;
  const team = await getPrimaryTeam();

  if (!team) {
    return (
      <>
        <PageHeader title="Backlog" subtitle="User stories imported from Azure DevOps" />
        <Card>
          <Empty description="No team yet. An admin needs to create a team in Admin → Team.">
            <Link href="/admin/team">
              <Button type="primary">Go to Admin → Team</Button>
            </Link>
          </Empty>
        </Card>
      </>
    );
  }

  const [profile, sprints, members, stories] = await Promise.all([
    getProfile(),
    getSprints(team.id),
    getMembers(team.id),
    getStories(team.id),
  ]);

  const isAdmin = profile?.role === 'admin';

  return (
    <BacklogClient
      stories={stories}
      sprints={sprints.map((s) => ({ id: s.id, name: s.name }))}
      members={members.map((m) => ({ id: m.id, full_name: m.full_name, email: m.email }))}
      isAdmin={isAdmin}
      initialSprintId={sprint ?? null}
      teamName={team.name}
    />
  );
}
