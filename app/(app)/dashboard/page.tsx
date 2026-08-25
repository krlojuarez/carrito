import Link from 'next/link';
import { Alert, Button, Card, Empty } from 'antd';
import PageHeader from '@/components/common/PageHeader';
import DashboardClient from '@/components/dashboard/DashboardClient';
import { computeSprintCapacity } from '@/lib/capacity';
import { aggregateBySprint, pickCurrentSprint } from '@/lib/data/aggregate';
import {
  getManualHolidays,
  getMembers,
  getPrimaryTeam,
  getPtos,
  getSettings,
  getSprints,
  getStories,
} from '@/lib/data/queries';
import type { StoryLoad } from '@/lib/capacity/engine';

export const dynamic = 'force-dynamic';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ sprint?: string }>;
}) {
  const { sprint: sprintParam } = await searchParams;
  const team = await getPrimaryTeam();

  if (!team) {
    return (
      <>
        <PageHeader title="Dashboard" subtitle="Sprint capacity at a glance" />
        <Card>
          <Empty description="No team yet. An admin needs to create a team and add members.">
            <Link href="/admin/team">
              <Button type="primary">Go to Admin → Team</Button>
            </Link>
          </Empty>
        </Card>
      </>
    );
  }

  const [sprints, members, settings, ptos, holidays, allStories] = await Promise.all([
    getSprints(team.id),
    getMembers(team.id),
    getSettings(),
    getPtos(team.id),
    getManualHolidays(team.id),
    getStories(team.id),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const selected =
    (sprintParam && sprints.find((s) => s.id === sprintParam)) || pickCurrentSprint(sprints, today);

  const aggregates = aggregateBySprint(sprints, allStories);

  if (!selected) {
    return (
      <>
        <PageHeader title="Dashboard" subtitle={team.name} />
        <Card>
          <Empty description="No sprints yet. Create a sprint and import your ADO stories.">
            <Link href="/sprints/new">
              <Button type="primary">Create a sprint</Button>
            </Link>
          </Empty>
        </Card>
      </>
    );
  }

  const sprintStories = allStories.filter((s) => s.sprint_id === selected.id);
  const storyLoad: StoryLoad[] = sprintStories.map((s) => ({
    points: s.story_points ?? 0,
    isCarryOver: s.is_carry_over,
    plannedInNextSprint: true,
  }));

  const result = computeSprintCapacity({
    sprint: selected,
    members,
    ptos,
    manualHolidays: holidays,
    settings,
    stories: storyLoad,
  });

  // Strip heavy ledgers before sending to the client.
  const teamLite = {
    ...result.team,
    members: result.team.members.map(({ ledger, ...m }) => m),
  };

  return (
    <DashboardClient
      teamName={team.name}
      sprintName={selected.name}
      sprintRange={{ start: selected.start_date, end: selected.end_date }}
      selectedSprintId={selected.id}
      sprintOptions={sprints.map((s) => ({ id: s.id, name: s.name }))}
      team={teamLite}
      ideal={{ totalAvailableDays: result.ideal.totalAvailableDays }}
      free={result.free}
      warnings={result.warnings}
      aggregates={aggregates}
      memberCount={members.length}
    />
  );
}
