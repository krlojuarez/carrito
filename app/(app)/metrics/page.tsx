import Link from 'next/link';
import { Alert, Button, Card, Empty, Typography } from 'antd';
import PageHeader from '@/components/common/PageHeader';
import MetricsClient from '@/components/metrics/MetricsClient';
import { getMetricsBundle } from '@/lib/data/metrics';
import { getPrimaryTeam } from '@/lib/data/queries';

const { Paragraph, Text } = Typography;

export const dynamic = 'force-dynamic';

export default async function MetricsPage() {
  const team = await getPrimaryTeam();

  if (!team) {
    return (
      <>
        <PageHeader title="Scrum Metrics" subtitle="Velocity, commitment and capacity" />
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

  const bundle = await getMetricsBundle(team.id);

  if (!bundle.available) {
    return (
      <>
        <PageHeader title="Scrum Metrics" subtitle={team.name} />
        <Alert
          type="info"
          showIcon
          message="One migration away"
          description={
            <>
              <Paragraph style={{ marginBottom: 8 }}>
                The metrics views are not in this database yet. Run{' '}
                <Text code>supabase/migrations/0003_scrum_metrics.sql</Text> in Supabase → SQL
                Editor, then reload this page.
              </Paragraph>
              <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                It is idempotent and only adds columns, views and functions — nothing existing is
                dropped.
              </Paragraph>
            </>
          }
        />
      </>
    );
  }

  return (
    <MetricsClient
      teamName={team.name}
      velocity={bundle.velocity}
      memberCapacity={bundle.memberCapacity}
      capacityProfile={bundle.capacityProfile}
      forecast={bundle.forecast}
      issues={bundle.issues}
    />
  );
}
