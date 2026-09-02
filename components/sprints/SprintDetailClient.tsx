'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  App,
  Button,
  Card,
  Col,
  Empty,
  Popconfirm,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
} from 'antd';
import {
  CheckCircleOutlined,
  FieldTimeOutlined,
  RiseOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '@/components/common/PageHeader';
import WarningsList from '@/components/capacity/WarningsList';
import CloseSprintModal, { type SprintOption } from '@/components/sprints/CloseSprintModal';
import { createClient } from '@/lib/supabase/client';
import { isDoneState, isRemovedState } from '@/lib/ado/fields';
import type { FreeCapacity, TeamCapacity, Warning } from '@/lib/capacity/types';

type MemberLite = Omit<TeamCapacity['members'][number], 'ledger'>;
type TeamLite = Omit<TeamCapacity, 'members'> & { members: MemberLite[] };

interface StoryRow {
  id: string;
  workItemId: number;
  title: string;
  type: string | null;
  state: string | null;
  points: number;
  isCarryOver: boolean;
}

const round = (x: number) => Math.round(x * 10) / 10;

export default function SprintDetailClient({
  teamId,
  sprintId,
  sprintName,
  sprintRange,
  isClosed,
  team,
  ideal,
  free,
  warnings,
  stories,
  isAdmin,
  otherSprints,
  defaultSprintLengthDays,
}: {
  teamId: string;
  sprintId: string;
  sprintName: string;
  sprintRange: { start: string; end: string };
  isClosed: boolean;
  team: TeamLite;
  ideal: { totalAvailableDays: number };
  free: FreeCapacity | null;
  warnings: Warning[];
  stories: StoryRow[];
  isAdmin: boolean;
  otherSprints: SprintOption[];
  defaultSprintLengthDays: number;
}) {
  const router = useRouter();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);

  const committedPoints = round(
    stories.filter((s) => !s.isCarryOver).reduce((a, s) => a + s.points, 0)
  );
  const completedPoints = round(
    stories.filter((s) => isDoneState(s.state)).reduce((a, s) => a + s.points, 0)
  );
  // What close_sprint() will flag as carry-over: neither done nor removed.
  const unfinished = stories.filter((s) => !isDoneState(s.state) && !isRemovedState(s.state));
  const unfinishedPoints = round(unfinished.reduce((a, s) => a + s.points, 0));

  async function toggleClosed() {
    setLoading(true);
    const supabase = createClient();
    try {
      const { error } = await supabase
        .from('sprints')
        .update({
          is_closed: !isClosed,
          velocity_committed_points: committedPoints,
          velocity_completed_points: completedPoints,
        })
        .eq('id', sprintId);
      if (error) throw error;
      message.success(isClosed ? 'Sprint reopened' : 'Sprint closed');
      router.refresh();
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Failed to update sprint');
    } finally {
      setLoading(false);
    }
  }

  const memberColumns: ColumnsType<MemberLite> = [
    { title: 'Member', dataIndex: 'displayName', key: 'displayName' },
    {
      title: 'Business days',
      dataIndex: 'grossBusinessDays',
      key: 'grossBusinessDays',
      align: 'right',
      render: (v: number) => round(v),
    },
    {
      title: 'Holidays',
      dataIndex: 'holidayDays',
      key: 'holidayDays',
      align: 'right',
      render: (v: number) => round(v),
    },
    {
      title: 'PTO days',
      dataIndex: 'ptoDays',
      key: 'ptoDays',
      align: 'right',
      render: (v: number) => round(v),
    },
    {
      title: 'Net days',
      dataIndex: 'netWorkingDays',
      key: 'netWorkingDays',
      align: 'right',
      render: (v: number) => round(v),
    },
    {
      title: 'Available days',
      dataIndex: 'availableDays',
      key: 'availableDays',
      align: 'right',
      render: (v: number) => round(v),
    },
    {
      title: 'Available points',
      dataIndex: 'availablePoints',
      key: 'availablePoints',
      align: 'right',
      render: (v: number) => round(v),
    },
    {
      title: 'Status',
      dataIndex: 'belowMinimum',
      key: 'belowMinimum',
      render: (below: boolean) =>
        below ? <Tag color="orange">Below minimum</Tag> : <Tag color="green">OK</Tag>,
    },
  ];

  const storyColumns: ColumnsType<StoryRow> = [
    { title: 'ID', dataIndex: 'workItemId', key: 'workItemId', width: 90 },
    { title: 'Title', dataIndex: 'title', key: 'title' },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      render: (t: string | null) => t ?? '—',
    },
    {
      title: 'State',
      dataIndex: 'state',
      key: 'state',
      render: (s: string | null) => s ?? '—',
    },
    {
      title: 'Points',
      dataIndex: 'points',
      key: 'points',
      align: 'right',
    },
    {
      title: 'Carry-over',
      dataIndex: 'isCarryOver',
      key: 'isCarryOver',
      render: (c: boolean) => (c ? <Tag color="gold">Carry-over</Tag> : null),
    },
  ];

  return (
    <>
      <PageHeader
        title={
          <Space>
            {sprintName}
            {isClosed ? <Tag color="default">Closed</Tag> : <Tag color="green">Open</Tag>}
          </Space>
        }
        subtitle={
          <>
            {sprintRange.start} → {sprintRange.end}
          </>
        }
        extra={
          isAdmin ? (
            isClosed ? (
              <Popconfirm
                title="Reopen this sprint?"
                description="The sprint will be marked open again. Carry-over already recorded is kept."
                okText="Yes"
                cancelText="Cancel"
                onConfirm={toggleClosed}
              >
                <Button loading={loading}>Reopen sprint</Button>
              </Popconfirm>
            ) : (
              <CloseSprintModal
                teamId={teamId}
                sprintId={sprintId}
                sprintName={sprintName}
                sprintEnd={sprintRange.end}
                otherSprints={otherSprints}
                defaultSprintLengthDays={defaultSprintLengthDays}
                unfinishedCount={unfinished.length}
                unfinishedPoints={unfinishedPoints}
              />
            )
          ) : undefined
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
          </Card>
        </Col>
        <Col xs={12} md={8} lg={4}>
          <Card>
            <Statistic
              title="Committed"
              value={free?.committedPoints ?? committedPoints}
              precision={1}
              suffix="pts"
            />
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
            />
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
            {free?.overCommitted ? (
              <Tag color="red">Over-committed</Tag>
            ) : (
              <Tag color="green">Room available</Tag>
            )}
          </Card>
        </Col>
        <Col xs={12} md={8} lg={4}>
          <Card>
            <Statistic
              title="Completed"
              value={completedPoints}
              precision={1}
              suffix="pts"
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Card title="Awareness" style={{ marginTop: 16 }}>
        <WarningsList warnings={warnings} />
      </Card>

      <Card title="Capacity by member" style={{ marginTop: 16 }}>
        {team.members.length ? (
          <Table
            columns={memberColumns}
            dataSource={team.members}
            rowKey="memberId"
            pagination={false}
            size="middle"
            scroll={{ x: 'max-content' }}
          />
        ) : (
          <Empty description="No members on this team yet." />
        )}
      </Card>

      <Card title={`Stories (${stories.length})`} style={{ marginTop: 16 }}>
        {stories.length ? (
          <Table
            columns={storyColumns}
            dataSource={stories}
            rowKey="id"
            pagination={{ pageSize: 20, hideOnSinglePage: true }}
            size="middle"
            scroll={{ x: 'max-content' }}
          />
        ) : (
          <Empty description="No stories assigned to this sprint yet." />
        )}
      </Card>
    </>
  );
}
