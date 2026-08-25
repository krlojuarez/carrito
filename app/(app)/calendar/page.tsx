import Link from 'next/link';
import { Button, Card, Empty } from 'antd';
import PageHeader from '@/components/common/PageHeader';
import CalendarClient from '@/components/calendar/CalendarClient';
import { getProfile } from '@/lib/auth/getProfile';
import {
  getManualHolidays,
  getMembers,
  getPrimaryTeam,
  getPtos,
  getSettings,
} from '@/lib/data/queries';

export const dynamic = 'force-dynamic';

export default async function CalendarPage() {
  const team = await getPrimaryTeam();

  if (!team) {
    return (
      <>
        <PageHeader title="Calendar" subtitle="PTO & holidays" />
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

  const [profile, members, ptos, holidays, settings] = await Promise.all([
    getProfile(),
    getMembers(team.id),
    getPtos(team.id),
    getManualHolidays(team.id),
    getSettings(),
  ]);

  const isAdmin = profile?.role === 'admin';

  return (
    <CalendarClient
      teamId={team.id}
      teamName={team.name}
      isAdmin={isAdmin}
      members={members.map((m) => ({
        id: m.id,
        full_name: m.full_name,
        country_code: m.country_code,
      }))}
      ptos={ptos}
      holidays={holidays}
      workingWeekdays={settings?.working_weekdays ?? [1, 2, 3, 4, 5]}
    />
  );
}
