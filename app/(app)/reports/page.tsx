import { Card, Empty } from 'antd';
import Link from 'next/link';
import PageHeader from '@/components/common/PageHeader';
import ReportsClient from '@/components/reports/ReportsClient';
import { aggregateBySprint } from '@/lib/data/aggregate';
import { getBranding } from '@/lib/data/settings';
import { getMembers, getPrimaryTeam, getSprints, getStories } from '@/lib/data/queries';

export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  const team = await getPrimaryTeam();

  if (!team) {
    return (
      <>
        <PageHeader title="Reports" subtitle="Velocity, carry-over & branded exports" />
        <Card>
          <Empty description="No team yet. An admin needs to create a team in Admin → Team.">
            <Link href="/admin/team">Go to Admin → Team</Link>
          </Empty>
        </Card>
      </>
    );
  }

  const [sprints, stories, members, branding] = await Promise.all([
    getSprints(team.id),
    getStories(team.id),
    getMembers(team.id),
    getBranding(),
  ]);

  const aggregates = aggregateBySprint(sprints, stories);

  return (
    <ReportsClient
      teamName={team.name}
      aggregates={aggregates}
      stories={stories}
      sprints={sprints.map((s) => ({ id: s.id, name: s.name }))}
      members={members.map((m) => ({
        id: m.id,
        full_name: m.full_name,
        email: m.email,
      }))}
      branding={branding}
    />
  );
}
