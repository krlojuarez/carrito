'use client';

import { useMemo, useState } from 'react';
import {
  App,
  Button,
  Card,
  Col,
  Row,
  Segmented,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import { DownloadOutlined, FilePdfOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '@/components/common/PageHeader';
import { Column, Line } from '@/components/charts';
import { toCsv, downloadCsv } from '@/lib/ado/export';
import type { SprintAggregate } from '@/lib/data/aggregate';
import type { Branding, UserStory } from '@/lib/types/domain';

const { Text } = Typography;

type SprintOption = { id: string; name: string };
type MemberOption = { id: string; full_name: string; email: string | null };
type CarryFilter = 'all' | 'carry' | 'planned';

export default function ReportsClient({
  teamName,
  aggregates,
  stories,
  sprints,
  members,
  branding,
}: {
  teamName: string;
  aggregates: SprintAggregate[];
  stories: UserStory[];
  sprints: SprintOption[];
  members: MemberOption[];
  branding: Branding;
}) {
  const { message } = App.useApp();

  // ---- Chart data ------------------------------------------------------
  const trendData = useMemo(
    () =>
      aggregates.flatMap((a) => [
        { sprint: a.name, type: 'Committed', value: a.committedPoints },
        { sprint: a.name, type: 'Carry-over', value: a.carryOverPoints },
      ]),
    [aggregates],
  );

  const carryPctData = useMemo(
    () =>
      aggregates.map((a) => {
        const load = a.committedPoints + a.carryOverPoints;
        return {
          sprint: a.name,
          value: load > 0 ? Math.round((a.carryOverPoints / load) * 1000) / 10 : 0,
        };
      }),
    [aggregates],
  );

  const completedVsCommitted = useMemo(
    () =>
      aggregates.flatMap((a) => [
        { sprint: a.name, type: 'Committed', value: a.committedPoints },
        { sprint: a.name, type: 'Completed', value: a.completedPoints },
      ]),
    [aggregates],
  );

  // ---- Ad-hoc query filters -------------------------------------------
  const [sprintFilter, setSprintFilter] = useState<string | undefined>(undefined);
  const [assigneeFilter, setAssigneeFilter] = useState<string | undefined>(undefined);
  const [stateFilter, setStateFilter] = useState<string | undefined>(undefined);
  const [carryFilter, setCarryFilter] = useState<CarryFilter>('all');

  const memberNameByEmail = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members) {
      if (m.email) map.set(m.email.toLowerCase(), m.full_name);
    }
    return map;
  }, [members]);

  const assigneeOptions = useMemo(() => {
    const emails = new Set<string>();
    for (const s of stories) {
      if (s.assignee_email) emails.add(s.assignee_email.toLowerCase());
    }
    return Array.from(emails)
      .sort()
      .map((email) => ({
        value: email,
        label: memberNameByEmail.get(email) ?? email,
      }));
  }, [stories, memberNameByEmail]);

  const stateOptions = useMemo(() => {
    const states = new Set<string>();
    for (const s of stories) {
      if (s.state_raw) states.add(s.state_raw);
    }
    return Array.from(states)
      .sort()
      .map((v) => ({ value: v, label: v }));
  }, [stories]);

  const filtered = useMemo(() => {
    return stories.filter((s) => {
      if (sprintFilter && s.sprint_id !== sprintFilter) return false;
      if (assigneeFilter && (s.assignee_email ?? '').toLowerCase() !== assigneeFilter) return false;
      if (stateFilter && s.state_raw !== stateFilter) return false;
      if (carryFilter === 'carry' && !s.is_carry_over) return false;
      if (carryFilter === 'planned' && s.is_carry_over) return false;
      return true;
    });
  }, [stories, sprintFilter, assigneeFilter, stateFilter, carryFilter]);

  const columns: ColumnsType<UserStory> = [
    {
      title: 'ID',
      dataIndex: 'ado_work_item_id',
      width: 90,
      sorter: (a, b) => a.ado_work_item_id - b.ado_work_item_id,
    },
    {
      title: 'Title',
      dataIndex: 'title',
      ellipsis: true,
    },
    {
      title: 'Assignee',
      dataIndex: 'assignee_email',
      width: 200,
      render: (_: unknown, s) =>
        s.assignee_email
          ? memberNameByEmail.get(s.assignee_email.toLowerCase()) ?? s.assignee_email
          : s.assignee_raw ?? <Text type="secondary">—</Text>,
    },
    {
      title: 'State',
      dataIndex: 'state_raw',
      width: 130,
      render: (v: string | null) => v ?? <Text type="secondary">—</Text>,
    },
    {
      title: 'Points',
      dataIndex: 'story_points',
      width: 90,
      align: 'right',
      sorter: (a, b) => (a.story_points ?? 0) - (b.story_points ?? 0),
      render: (v: number | null) => (v != null ? v : <Text type="secondary">—</Text>),
    },
    {
      title: 'Carry-over',
      dataIndex: 'is_carry_over',
      width: 110,
      align: 'center',
      render: (v: boolean) =>
        v ? <Tag color="orange">Carry-over</Tag> : <Tag color="blue">Planned</Tag>,
    },
  ];

  function onExportCsv() {
    if (!filtered.length) {
      message.info('No stories match the current filters.');
      return;
    }
    const csv = toCsv(filtered, 'enriched');
    downloadCsv(csv, 'carrito-stories.csv');
    message.success(`Exported ${filtered.length} stories.`);
  }

  // ---- Branded PDF export ---------------------------------------------
  const [pdfScope, setPdfScope] = useState<string>('all');
  const [pdfLoading, setPdfLoading] = useState(false);

  async function onExportPdf() {
    setPdfLoading(true);
    try {
      const payload =
        pdfScope === 'all' ? { all: true } : { sprintId: pdfScope };
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Report failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'carrito-report.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      message.success('Report downloaded.');
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Failed to generate report.');
    } finally {
      setPdfLoading(false);
    }
  }

  const chartConfigCommon = { height: 260, xField: 'sprint', yField: 'value' } as const;

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle={`${teamName} · velocity, carry-over & branded exports`}
        extra={
          <Space>
            <Select
              value={pdfScope}
              style={{ minWidth: 180 }}
              onChange={setPdfScope}
              options={[
                { value: 'all', label: 'All sprints' },
                ...sprints.map((s) => ({ value: s.id, label: s.name })),
              ]}
            />
            <Button
              type="primary"
              icon={<FilePdfOutlined />}
              loading={pdfLoading}
              onClick={onExportPdf}
            >
              Export branded PDF
            </Button>
          </Space>
        }
      />

      {/* Section 1: Charts */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="Velocity & carry-over trend">
            {trendData.length ? (
              <Column
                {...chartConfigCommon}
                data={trendData}
                colorField="type"
                stack
                scale={{ color: { range: [branding.primaryColor, branding.secondaryColor] } }}
                axis={{ y: { title: 'Story points' } }}
              />
            ) : (
              <Text type="secondary">No sprint data yet.</Text>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Carry-over %">
            {carryPctData.length ? (
              <Line
                {...chartConfigCommon}
                data={carryPctData}
                scale={{ color: { range: [branding.secondaryColor] } }}
                axis={{ y: { title: '% of load' } }}
              />
            ) : (
              <Text type="secondary">No sprint data yet.</Text>
            )}
          </Card>
        </Col>
        <Col xs={24}>
          <Card title="Completed vs committed">
            {completedVsCommitted.length ? (
              <Column
                {...chartConfigCommon}
                height={300}
                data={completedVsCommitted}
                colorField="type"
                group
                scale={{ color: { range: [branding.primaryColor, '#52c41a'] } }}
                axis={{ y: { title: 'Story points' } }}
              />
            ) : (
              <Text type="secondary">No sprint data yet.</Text>
            )}
          </Card>
        </Col>
      </Row>

      {/* Section 2: Ad-hoc query */}
      <Card title="Ad-hoc story query" style={{ marginTop: 16 }}>
        <Space wrap style={{ marginBottom: 16 }}>
          <Select
            allowClear
            placeholder="Sprint"
            style={{ minWidth: 180 }}
            value={sprintFilter}
            onChange={setSprintFilter}
            options={sprints.map((s) => ({ value: s.id, label: s.name }))}
          />
          <Select
            allowClear
            showSearch
            placeholder="Assignee"
            style={{ minWidth: 200 }}
            value={assigneeFilter}
            onChange={setAssigneeFilter}
            options={assigneeOptions}
            optionFilterProp="label"
          />
          <Select
            allowClear
            placeholder="State"
            style={{ minWidth: 160 }}
            value={stateFilter}
            onChange={setStateFilter}
            options={stateOptions}
          />
          <Segmented
            value={carryFilter}
            onChange={(v) => setCarryFilter(v as CarryFilter)}
            options={[
              { label: 'All', value: 'all' },
              { label: 'Carry-over', value: 'carry' },
              { label: 'Planned', value: 'planned' },
            ]}
          />
          <Button icon={<DownloadOutlined />} onClick={onExportCsv}>
            Export CSV
          </Button>
        </Space>
        <Table<UserStory>
          rowKey="id"
          size="small"
          columns={columns}
          dataSource={filtered}
          scroll={{ x: 800 }}
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `${t} stories` }}
        />
      </Card>
    </>
  );
}
