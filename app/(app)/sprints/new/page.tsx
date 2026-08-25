import Link from 'next/link';
import { Button, Card, Empty } from 'antd';
import PageHeader from '@/components/common/PageHeader';
import SprintFormClient from '@/components/sprints/SprintFormClient';
import { getPrimaryTeam, getSettings } from '@/lib/data/queries';

export const dynamic = 'force-dynamic';

export default async function NewSprintPage() {
  const [team, settings] = await Promise.all([getPrimaryTeam(), getSettings()]);

  if (!team) {
    return (
      <>
        <PageHeader title="New sprint" subtitle="Create a sprint" />
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

  return (
    <SprintFormClient
      teamId={team.id}
      teamName={team.name}
      defaultSprintLengthDays={settings?.default_sprint_length_days ?? 14}
    />
  );
}
