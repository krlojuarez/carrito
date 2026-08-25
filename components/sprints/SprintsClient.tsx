'use client';

import Link from 'next/link';
import { Button, Card, Empty, Table, Tag } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '@/components/common/PageHeader';

export interface SprintRow {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  workingDays: number | null;
  isClosed: boolean;
  committedPoints: number;
  carryOverPoints: number;
  completedPoints: number;
  storyCount: number;
}

export default function SprintsClient({
  teamName,
  sprints,
  isAdmin,
}: {
  teamName: string;
  sprints: SprintRow[];
  isAdmin: boolean;
}) {
  const columns: ColumnsType<SprintRow> = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, row) => <Link href={`/sprints/${row.id}`}>{name}</Link>,
    },
    {
      title: 'Dates',
      key: 'dates',
      render: (_, row) => (
        <span>
          {row.startDate} → {row.endDate}
        </span>
      ),
    },
    {
      title: 'Working days',
      dataIndex: 'workingDays',
      key: 'workingDays',
      align: 'right',
      render: (d: number | null) => (d ?? '—'),
    },
    {
      title: 'Committed',
      dataIndex: 'committedPoints',
      key: 'committedPoints',
      align: 'right',
      render: (v: number) => `${v} pts`,
    },
    {
      title: 'Carry-over',
      dataIndex: 'carryOverPoints',
      key: 'carryOverPoints',
      align: 'right',
      render: (v: number) => `${v} pts`,
    },
    {
      title: 'Completed',
      dataIndex: 'completedPoints',
      key: 'completedPoints',
      align: 'right',
      render: (v: number) => `${v} pts`,
    },
    {
      title: 'Stories',
      dataIndex: 'storyCount',
      key: 'storyCount',
      align: 'right',
    },
    {
      title: 'Status',
      dataIndex: 'isClosed',
      key: 'isClosed',
      render: (closed: boolean) =>
        closed ? <Tag color="default">Closed</Tag> : <Tag color="green">Open</Tag>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Sprints"
        subtitle={teamName}
        extra={
          isAdmin ? (
            <Link href="/sprints/new">
              <Button type="primary" icon={<PlusOutlined />}>
                New sprint
              </Button>
            </Link>
          ) : undefined
        }
      />
      <Card>
        {sprints.length ? (
          <Table
            columns={columns}
            dataSource={sprints}
            rowKey="id"
            pagination={false}
            scroll={{ x: 'max-content' }}
          />
        ) : (
          <Empty description="No sprints yet.">
            {isAdmin && (
              <Link href="/sprints/new">
                <Button type="primary">Create a sprint</Button>
              </Link>
            )}
          </Empty>
        )}
      </Card>
    </>
  );
}
