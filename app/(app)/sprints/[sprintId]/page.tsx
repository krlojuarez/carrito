import Link from 'next/link';
import { Button, Card, Empty } from 'antd';
import PageHeader from '@/components/common/PageHeader';
import SprintDetailClient from '@/components/sprints/SprintDetailClient';
import { computeSprintCapacity } from '@/lib/capacity';
import { getProfile } from '@/lib/auth/getProfile';
import {
  getManualHolidays,
  getMembers,
  getPrimaryTeam,
  getPtos,
  getSettings,
  getSprint,
  getStories,
} from '@/lib/data/queries';
import type { StoryLoad } from '@/lib/capacity/engine';

export const dynamic = 'force-dynamic';

export default async function SprintDetailPage({
  params,
}: {
  params: Promise<{ sprintId: string }>;
}) {
  const { sprintId } = await params;
  const [team, sprint, profile] = await Promise.all([
    getPrimaryTeam(),
    getSprint(sprintId),
    getProfile(),
  ]);
  const isAdmin = profile?.role === 'admin';

  if (!team || !sprint) {
    return (
      <>
        <PageHeader title="Sprint" subtitle="Sprint details" />
        <Card>
          <Empty description="Sprint not found.">
            <Link href="/sprints">
              <Button type="primary">Back to sprints</Button>
            </Link>
          </Empty>
        </Card>
      </>
    );
  }

  const [members, settings, ptos, holidays, stories] = await Promise.all([
    getMembers(team.id),
    getSettings(),
    getPtos(team.id),
    getManualHolidays(team.id),
    getStories(team.id, sprintId),
  ]);

  const storyLoad: StoryLoad[] = stories.map((s) => ({
    points: s.story_points ?? 0,
    isCarryOver: s.is_carry_over,
    plannedInNextSprint: true,
  }));

  const result = computeSprintCapacity({
    sprint,
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

  const storyRows = stories.map((s) => ({
    id: s.id,
    workItemId: s.ado_work_item_id,
    title: s.title,
    type: s.work_item_type,
    state: s.state_raw,
    points: s.story_points ?? 0,
    isCarryOver: s.is_carry_over,
  }));

  return (
    <SprintDetailClient
      sprintId={sprint.id}
      sprintName={sprint.name}
      sprintRange={{ start: sprint.start_date, end: sprint.end_date }}
      isClosed={sprint.is_closed}
      team={teamLite}
      ideal={{ totalAvailableDays: result.ideal.totalAvailableDays }}
      free={result.free}
      warnings={result.warnings}
      stories={storyRows}
      isAdmin={isAdmin}
    />
  );
}
