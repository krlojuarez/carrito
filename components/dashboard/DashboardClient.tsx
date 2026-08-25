'use client';

import { useRouter } from 'next/navigation';
import { Card, Col, Progress, Row, Select, Space, Statistic, Tag, Typography } from 'antd';
import {
  CalendarOutlined,
  FieldTimeOutlined,
  RiseOutlined,
  ThunderboltOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import PageHeader from '@/components/common/PageHeader';
import WarningsList from '@/components/capacity/WarningsList';
import { Column, Bar } from '@/components/charts';
import type { FreeCapacity, TeamCapacity, Warning } from '@/lib/capacity/types';
import type { SprintAggregate } from '@/lib/data/aggregate';

const { Text } = Typography;

type MemberLite = Omit<TeamCapacity['members'][number], 'ledger'>;
type TeamLite = Omit<TeamCapacity, 'members'> & { members: MemberLite[] };

export default function DashboardClient({
  teamName,
  sprintName,
  sprintRange,
  selectedSprintId,
  sprintOptions,
  team,
  ideal,
  free,
  warnings,
  aggregates,
  memberCount,
}: {
  teamName: string;
  sprintName: string;
  sprintRange: { start: string; end: string };
  selectedSprintId: string;
  sprintOptions: { id: string; name: string }[];
  team: TeamLite;
  ideal: { totalAvailableDays: number };
  free: FreeCapacity | null;
  warnings: Warning[];
  aggregates: SprintAggregate[];
  memberCount: number;
}) {
  const router = useRouter();

  const drop =
    ideal.totalAvailableDays > 0 ? 1 - team.totalAvailableDays / ideal.totalAvailableDays : 0;
  const utilization = free ? (Number.isFinite(free.utilizationPct) ? free.utilizationPct : 1) : 0;
  const carryRatio =
    free && free.committedPoints + free.carryOverPoints > 0
      ? free.carryOverPoints / (free.committedPoints + free.carryOverPoints)
      : 0;

  // Velocity & carry-over trend (stacked committed vs carry-over per sprint).
  const trendData = aggregates.flatMap((a) => [
    { sprint: a.name, type: 'Committed', value: a.committedPoints },
    { sprint: a.name, type: 'Carry-over', value: a.carryOverPoints },
  ]);

  // Per-member capacity breakdown (person-days).
  const memberData = team.members.flatMap((m) => [
    { member: m.displayName, type: 'Available', value: m.availableDays },
    { member: m.displayName, type: 'PTO', value: m.ptoDays },
    { member: m.displayName, type: 'Holidays', value: m.holidayDays },
  ]);

  const critical = warnings.filter((w) => w.severity === 'critical').length;
  const warn = warnings.filter((w) => w.severity === 'warning').length;

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={
          <>
            {teamName} · {sprintName} ({sprintRange.start} → {sprintRange.end})
          </>
        }
        extra={
          <Select
            value={selectedSprintId}
            style={{ minWidth: 200 }}
            onChange={(v) => router.push(`/dashboard?sprint=${v}`)}
            options={sprintOptions.map((s) => ({ value: s.id, label: s.name }))}
          />
        }
      />

      <Row gutter={[16, 16]}>
        <Col xs={12} md={8} lg={4}>
          <Card>
            <Statistic
              title="Available person-days"
              value={team.totalAvailableDays}
              precision={1}
              prefix={<FieldTimeOutlined />}
            />
            <Text type="secondary">of {ideal.totalAvailableDays.toFixed(1)} ideal</Text>
          </Card>
        </Col>
        <Col xs={12} md={8} lg={4}>
          <Card>
            <Statistic
              title="Points capacity"
              value={team.totalAvailablePoints}
              precision={1}
              prefix={<ThunderboltOutlined />}
            />
            <Text type="secondary">{team.effectivePointsPerDay.toFixed(2)} pts/day · {team.pointsBasis}</Text>
          </Card>
        </Col>
        <Col xs={12} md={8} lg={4}>
          <Card>
            <Statistic title="Committed" value={free?.committedPoints ?? 0} precision={1} suffix="pts" />
            <Text type="secondary">{memberCount} members</Text>
          </Card>
        </Col>
        <Col xs={12} md={8} lg={4}>
          <Card>
            <Statistic
              title="Free capacity"
              value={free?.freePoints ?? 0}
              precision={1}
              suffix="pts"
              valueStyle={{ color: (free?.freePoints ?? 0) < 0 ? '#cf1322' : '#3f8600' }}
            />
            {free?.overCommitted ? <Tag color="red">Over-committed</Tag> : <Tag color="green">Room available</Tag>}
          </Card>
        </Col>
        <Col xs={12} md={8} lg={4}>
          <Card>
            <Statistic
              title="Carry-over"
              value={free?.carryOverPoints ?? 0}
              precision={1}
              suffix="pts"
              prefix={<RiseOutlined />}
              valueStyle={{ color: carryRatio >= 0.3 ? '#cf1322' : undefined }}
            />
            <Text type="secondary">{Math.round(carryRatio * 100)}% of load</Text>
          </Card>
        </Col>
        <Col xs={12} md={8} lg={4}>
          <Card>
            <Statistic
              title="Capacity drop"
              value={Math.round(drop * 100)}
              suffix="%"
              prefix={<CalendarOutlined />}
              valueStyle={{ color: drop >= 0.3 ? '#cf1322' : drop >= 0.15 ? '#d46b08' : undefined }}
            />
            <Text type="secondary">vs a full sprint</Text>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={8}>
          <Card
            title={
              <Space>
                <WarningOutlined />
                Awareness {critical + warn > 0 && <Tag color={critical ? 'red' : 'orange'}>{critical + warn}</Tag>}
              </Space>
            }
            style={{ height: '100%' }}
          >
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <Progress
                type="dashboard"
                percent={Math.min(100, Math.round(utilization * 100))}
                strokeColor={utilization > 1 ? '#cf1322' : utilization > 0.85 ? '#d46b08' : '#3f8600'}
                format={(p) => (
                  <span>
                    {p}%<br />
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      utilization
                    </Text>
                  </span>
                )}
              />
            </div>
            <WarningsList warnings={warnings} />
          </Card>
        </Col>

        <Col xs={24} lg={16}>
          <Card title="Velocity & carry-over trend">
            {trendData.length ? (
              <Column
                height={280}
                data={trendData}
                xField="sprint"
                yField="value"
                colorField="type"
                stack
                scale={{ color: { range: ['#1677ff', '#faad14'] } }}
                axis={{ y: { title: 'Story points' } }}
              />
            ) : (
              <Text type="secondary">No historical sprint data yet.</Text>
            )}
          </Card>
          <Card title="Capacity by member (person-days)" style={{ marginTop: 16 }}>
            {memberData.length ? (
              <Bar
                height={Math.max(200, team.members.length * 54)}
                data={memberData}
                xField="member"
                yField="value"
                colorField="type"
                stack
                scale={{ color: { range: ['#52c41a', '#faad14', '#ff4d4f'] } }}
                axis={{ y: { title: 'Days' } }}
              />
            ) : (
              <Text type="secondary">No members yet.</Text>
            )}
          </Card>
        </Col>
      </Row>
    </>
  );
}
