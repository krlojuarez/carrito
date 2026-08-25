'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  App,
  Button,
  Card,
  Col,
  Empty,
  Input,
  Row,
  Segmented,
  Select,
  Space,
  Switch,
  Table,
  Tag,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DownloadOutlined, ImportOutlined, SearchOutlined } from '@ant-design/icons';
import PageHeader from '@/components/common/PageHeader';
import { createClient } from '@/lib/supabase/client';
import { downloadCsv, toCsv } from '@/lib/ado/export';
import type { UserStory } from '@/lib/types/domain';

type SprintLite = { id: string; name: string };
type MemberLite = { id: string; full_name: string; email: string | null };
type CarryFilter = 'all' | 'carry' | 'not';

export default function BacklogClient({
  stories,
  sprints,
  members,
  isAdmin,
  initialSprintId,
  teamName,
}: {
  stories: UserStory[];
  sprints: SprintLite[];
  members: MemberLite[];
  isAdmin: boolean;
  initialSprintId: string | null;
  teamName: string;
}) {
  const router = useRouter();
  const { message } = App.useApp();

  const [rows, setRows] = useState<UserStory[]>(stories);
  const [sprintFilter, setSprintFilter] = useState<string>(
    initialSprintId && sprints.some((s) => s.id === initialSprintId) ? initialSprintId : 'all',
  );
  const [carryFilter, setCarryFilter] = useState<CarryFilter>('all');
  const [search, setSearch] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  const sprintName = useMemo(() => {
    const m = new Map(sprints.map((s) => [s.id, s.name]));
    return (id: string | null) => (id ? m.get(id) ?? '—' : '—');
  }, [sprints]);

  const memberName = useMemo(() => {
    const m = new Map(members.filter((x) => x.email).map((x) => [x.email!.toLowerCase(), x.full_name]));
    return m;
  }, [members]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((s) => {
      if (sprintFilter === 'unassigned') {
        if (s.sprint_id) return false;
      } else if (sprintFilter !== 'all' && s.sprint_id !== sprintFilter) {
        return false;
      }
      if (carryFilter === 'carry' && !s.is_carry_over) return false;
      if (carryFilter === 'not' && s.is_carry_over) return false;
      if (q) {
        const hay = `${s.ado_work_item_id} ${s.title}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, sprintFilter, carryFilter, search]);

  async function toggleCarryOver(row: UserStory, checked: boolean) {
    setSavingId(row.id);
    const supabase = createClient();
    const { error } = await supabase
      .from('user_stories')
      .update({ is_carry_over: checked })
      .eq('id', row.id);
    setSavingId(null);
    if (error) {
      message.error(`Could not update carry-over: ${error.message}`);
      return;
    }
    setRows((prev) => prev.map((s) => (s.id === row.id ? { ...s, is_carry_over: checked } : s)));
    message.success(`Marked #${row.ado_work_item_id} as ${checked ? 'carry-over' : 'not carry-over'}`);
    router.refresh();
  }

  function assigneeLabel(s: UserStory): string {
    if (s.assignee_email && memberName.has(s.assignee_email.toLowerCase())) {
      return memberName.get(s.assignee_email.toLowerCase())!;
    }
    return s.assignee_raw ?? s.assignee_email ?? '—';
  }

  function exportCsv(mode: 'ado' | 'enriched') {
    if (!filtered.length) {
      message.warning('No stories to export with the current filters.');
      return;
    }
    const csv = toCsv(filtered, mode);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(csv, `backlog-${mode}-${stamp}.csv`);
    message.success(`Exported ${filtered.length} stories`);
  }

  const columns: ColumnsType<UserStory> = [
    {
      title: 'ADO ID',
      dataIndex: 'ado_work_item_id',
      key: 'ado_work_item_id',
      width: 100,
      sorter: (a, b) => a.ado_work_item_id - b.ado_work_item_id,
      render: (v: number) => <Tag>{v}</Tag>,
    },
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
      sorter: (a, b) => a.title.localeCompare(b.title),
    },
    {
      title: 'Type',
      dataIndex: 'work_item_type',
      key: 'work_item_type',
      width: 130,
      render: (v: string | null) => (v ? <Tag color="blue">{v}</Tag> : '—'),
    },
    {
      title: 'State',
      dataIndex: 'state_raw',
      key: 'state_raw',
      width: 130,
      render: (v: string | null) => v ?? '—',
    },
    {
      title: 'Story Points',
      dataIndex: 'story_points',
      key: 'story_points',
      width: 120,
      align: 'right',
      sorter: (a, b) => (a.story_points ?? 0) - (b.story_points ?? 0),
      render: (v: number | null) => (v != null ? v : '—'),
    },
    {
      title: 'Assignee',
      key: 'assignee',
      width: 180,
      ellipsis: true,
      render: (_, s) => assigneeLabel(s),
    },
    {
      title: 'Sprint',
      key: 'sprint',
      width: 160,
      ellipsis: true,
      render: (_, s) => sprintName(s.sprint_id),
    },
    {
      title: 'Tags',
      dataIndex: 'tags',
      key: 'tags',
      render: (tags: string[]) =>
        tags && tags.length ? (
          <Space size={[0, 4]} wrap>
            {tags.map((t) => (
              <Tag key={t} color="geekblue">
                {t}
              </Tag>
            ))}
          </Space>
        ) : (
          '—'
        ),
    },
    {
      title: 'Carry-over',
      key: 'is_carry_over',
      width: 110,
      align: 'center',
      filters: [
        { text: 'Carry-over', value: true },
        { text: 'Not', value: false },
      ],
      onFilter: (value, s) => s.is_carry_over === value,
      render: (_, s) => (
        <Switch
          checked={s.is_carry_over}
          loading={savingId === s.id}
          onChange={(checked) => toggleCarryOver(s, checked)}
        />
      ),
    },
  ];

  const sprintOptions = [
    { value: 'all', label: 'All sprints' },
    { value: 'unassigned', label: 'Unassigned' },
    ...sprints.map((s) => ({ value: s.id, label: s.name })),
  ];

  return (
    <>
      <PageHeader
        title="Backlog"
        subtitle={`${teamName} · ${rows.length} stories`}
        extra={
          <Space wrap>
            <Button icon={<DownloadOutlined />} onClick={() => exportCsv('ado')}>
              Export (ADO CSV)
            </Button>
            <Button icon={<DownloadOutlined />} onClick={() => exportCsv('enriched')}>
              Export (Enriched CSV)
            </Button>
            {isAdmin && (
              <Link href="/backlog/import">
                <Button type="primary" icon={<ImportOutlined />}>
                  Import from ADO
                </Button>
              </Link>
            )}
          </Space>
        }
      />

      <Card style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} md={8} lg={6}>
            <Select
              style={{ width: '100%' }}
              value={sprintFilter}
              onChange={setSprintFilter}
              options={sprintOptions}
            />
          </Col>
          <Col xs={24} md={10} lg={10}>
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="Search by title or ADO ID"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Col>
          <Col xs={24} md={6} lg={8}>
            <Segmented
              block
              value={carryFilter}
              onChange={(v) => setCarryFilter(v as CarryFilter)}
              options={[
                { label: 'All', value: 'all' },
                { label: 'Carry-over', value: 'carry' },
                { label: 'Not', value: 'not' },
              ]}
            />
          </Col>
        </Row>
      </Card>

      <Card>
        <Table<UserStory>
          rowKey="id"
          columns={columns}
          dataSource={filtered}
          size="middle"
          scroll={{ x: 1100 }}
          locale={{ emptyText: <Empty description="No stories match the current filters." /> }}
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `${t} stories` }}
        />
      </Card>
    </>
  );
}
