import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Button, Card, Empty } from 'antd';
import PageHeader from '@/components/common/PageHeader';
import ImportWizard from '@/components/backlog/ImportWizard';
import { getProfile } from '@/lib/auth/getProfile';
import { getMembers, getPrimaryTeam, getSettings, getSprints } from '@/lib/data/queries';

export const dynamic = 'force-dynamic';

export default async function BacklogImportPage() {
  const profile = await getProfile();
  if (!profile || profile.role !== 'admin') {
    redirect('/backlog');
  }

  const team = await getPrimaryTeam();
  if (!team) {
    return (
      <>
        <PageHeader title="Import from ADO" subtitle="Bring Azure DevOps stories into Carrito" />
        <Card>
          <Empty description="No team yet. Create a team in Admin → Team first.">
            <Link href="/admin/team">
              <Button type="primary">Go to Admin → Team</Button>
            </Link>
          </Empty>
        </Card>
      </>
    );
  }

  const [sprints, members, settings] = await Promise.all([
    getSprints(team.id),
    getMembers(team.id),
    getSettings(),
  ]);

  return (
    <ImportWizard
      teamId={team.id}
      teamName={team.name}
      sprints={sprints.map((s) => ({ id: s.id, name: s.name }))}
      members={members.map((m) => ({ id: m.id, email: m.email }))}
      defaultSprintLengthDays={settings?.default_sprint_length_days ?? 14}
    />
  );
}
