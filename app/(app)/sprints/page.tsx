import Link from 'next/link';
import { Button, Card, Empty } from 'antd';
import PageHeader from '@/components/common/PageHeader';
import SprintsClient from '@/components/sprints/SprintsClient';
import { aggregateBySprint } from '@/lib/data/aggregate';
import { getProfile } from '@/lib/auth/getProfile';
import { getPrimaryTeam, getSprints, getStories } from '@/lib/data/queries';

export const dynamic = 'force-dynamic';

export default async function SprintsPage() {
  const [team, profile] = await Promise.all([getPrimaryTeam(), getProfile()]);
  const isAdmin = profile?.role === 'admin';

  if (!team) {
    return (
      <>
        <PageHeader title="Sprints" subtitle="Plan and track your sprints" />
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

  const [sprints, allStories] = await Promise.all([getSprints(team.id), getStories(team.id)]);
  const aggregates = aggregateBySprint(sprints, allStories);
  const aggById = new Map(aggregates.map((a) => [a.sprintId, a]));

  const rows = sprints.map((s) => {
    const agg = aggById.get(s.id);
    return {
      id: s.id,
      name: s.name,
      startDate: s.start_date,
      endDate: s.end_date,
      workingDays: s.working_days,
      isClosed: s.is_closed,
      committedPoints: agg?.committedPoints ?? 0,
      carryOverPoints: agg?.carryOverPoints ?? 0,
      completedPoints: agg?.completedPoints ?? 0,
      storyCount: agg?.storyCount ?? 0,
    };
  });

  return <SprintsClient teamName={team.name} sprints={rows} isAdmin={isAdmin} />;
}
