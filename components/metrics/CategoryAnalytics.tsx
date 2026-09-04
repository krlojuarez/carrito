'use client';

import { useMemo, useState } from 'react';
import { App, Button, Card, Empty, Segmented, Select, Space, Table, Tag, Typography } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import Papa from 'papaparse';
import { Column } from '@/components/charts';
import { downloadCsv } from '@/lib/ado/export';
import { VIZ_LIGHT } from '@/lib/theme/vizPalette';
import type { CategoryPoints } from '@/lib/metrics/types';

const { Text, Paragraph } = Typography;
const P = VIZ_LIGHT;
const num = (v: number | null | undefined, d = 0) =>
  v == null ? '0' : Number(v).toLocaleString(undefined, { maximumFractionDigits: d });

type Metric = 'done_points' | 'committed_points' | 'total_points';
const METRIC_LABEL: Record<Metric, string> = {
  done_points: 'Done',
  committed_points: 'Committed',
  total_points: 'Total',
};

interface SprintOption {
  id: string;
  name: string;
}

interface Agg {
  category: string;
  label: string;
  stories: number;
  committed_points: number;
  done_points: number;
  total_points: number;
  sprints: Set<string>;
}

/**
 * Points spent per category (tag) across a chosen set of sprints. Answers
 * "how much capacity went to DigitSec vs Trust360 in sprints 1–2?". A story
 * tagged with several categories counts under each, so category totals can add
 * up to more than the sprint total — that's deliberate, and noted on screen.
 */
export default function CategoryAnalytics({
  rows,
  sprints,
}: {
  rows: CategoryPoints[];
  sprints: SprintOption[];
}) {
  const { message } = App.useApp();
  const [metric, setMetric] = useState<Metric>('done_points');
  // Default to all sprints that actually have tagged work.
  const sprintIdsWithData = useMemo(() => new Set(rows.map((r) => r.sprint_id)), [rows]);
  const sprintOptions = useMemo(
    () => sprints.filter((s) => sprintIdsWithData.has(s.id)),
    [sprints, sprintIdsWithData],
  );
  const [selected, setSelected] = useState<string[]>([]); // empty = all

  const active = selected.length ? new Set(selected) : null;

  const aggregated = useMemo(() => {
    const byCat = new Map<string, Agg>();
    for (const r of rows) {
      if (active && !active.has(r.sprint_id)) continue;
      const a =
        byCat.get(r.category) ??
        {
          category: r.category,
          label: r.category_label,
          stories: 0,
          committed_points: 0,
          done_points: 0,
          total_points: 0,
          sprints: new Set<string>(),
        };
      a.stories += r.story_count;
      a.committed_points += Number(r.committed_points);
      a.done_points += Number(r.done_points);
      a.total_points += Number(r.total_points);
      a.sprints.add(r.sprint_id);
      byCat.set(r.category, a);
    }
    return [...byCat.values()].sort((x, y) => y[metric] - x[metric]);
  }, [rows, active, metric]);

  const chartData = useMemo(
    () =>
      aggregated
        .filter((a) => a[metric] > 0)
        .slice(0, 15)
        .map((a) => ({ category: a.label, value: Math.round(a[metric] * 10) / 10 })),
    [aggregated, metric],
  );

  const chart = useMemo(
    () => ({
      data: chartData,
      xField: 'category',
      yField: 'value',
      colorField: () => 'cat',
      scale: { color: { range: [P.categorical[0]] } },
      legend: false as const,
      axis: {
        x: { title: null, labelAutoRotate: true, labelAutoHide: false },
        y: { title: `${METRIC_LABEL[metric]} story points`, grid: true, gridStroke: P.grid },
      },
      style: { radiusTopLeft: 4, radiusTopRight: 4, insetLeft: 2, insetRight: 2 },
      height: 320,
      autoFit: true,
    }),
    [chartData, metric],
  );

  const totalForMetric = aggregated.reduce((sum, a) => sum + a[metric], 0);

  const columns: ColumnsType<Agg> = [
    {
      title: 'Category',
      dataIndex: 'label',
      key: 'label',
      render: (v: string) => <Tag color="blue">{v}</Tag>,
    },
    { title: 'Stories', dataIndex: 'stories', key: 'stories', align: 'right', width: 90 },
    {
      title: 'Committed',
      key: 'committed_points',
      align: 'right',
      width: 110,
      render: (_, a) => num(a.committed_points, 1),
    },
    {
      title: 'Done',
      key: 'done_points',
      align: 'right',
      width: 90,
      render: (_, a) => num(a.done_points, 1),
    },
    {
      title: 'Total',
      key: 'total_points',
      align: 'right',
      width: 90,
      render: (_, a) => num(a.total_points, 1),
    },
    {
      title: 'Sprints',
      key: 'sprints',
      align: 'right',
      width: 90,
      render: (_, a) => a.sprints.size,
    },
  ];

  function exportCsv() {
    if (!aggregated.length) return;
    const csv = Papa.unparse(
      aggregated.map((a) => ({
        Category: a.label,
        Stories: a.stories,
        Committed: a.committed_points,
        Done: a.done_points,
        Total: a.total_points,
        Sprints: a.sprints.size,
      })),
      { quotes: true, newline: '\r\n' },
    );
    downloadCsv(csv, `capacity-by-category-${new Date().toISOString().slice(0, 10)}.csv`);
    message.success('Category breakdown exported');
  }

  return (
    <Card
      title="Capacity by category"
      style={{ marginTop: 16 }}
      extra={
        <Space wrap>
          <Segmented<Metric>
            value={metric}
            onChange={setMetric}
            options={[
              { label: 'Done', value: 'done_points' },
              { label: 'Committed', value: 'committed_points' },
              { label: 'Total', value: 'total_points' },
            ]}
          />
          <Select
            mode="multiple"
            allowClear
            style={{ minWidth: 220 }}
            placeholder="All sprints"
            maxTagCount="responsive"
            value={selected}
            onChange={setSelected}
            options={sprintOptions.map((s) => ({ value: s.id, label: s.name }))}
          />
          <Button icon={<DownloadOutlined />} onClick={exportCsv}>
            Export
          </Button>
        </Space>
      }
    >
      {chartData.length ? (
        <>
          <Column {...chart} />
          <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
            {METRIC_LABEL[metric]} story points per category across{' '}
            {active ? `${selected.length} selected sprint${selected.length === 1 ? '' : 's'}` : 'all sprints'}
            {' — '}
            {num(totalForMetric, 1)} {METRIC_LABEL[metric].toLowerCase()} points over{' '}
            {aggregated.length} categories. A story with several tags counts under each, so
            categories can total more than the sprint itself. Categories are story tags; tag work
            with a feature name (e.g. <Text code>DigitSec</Text>, <Text code>Trust360</Text>) to see
            it here.
          </Paragraph>
          <Table<Agg>
            rowKey="category"
            size="small"
            style={{ marginTop: 16 }}
            dataSource={aggregated}
            columns={columns}
            pagination={aggregated.length > 20 ? { pageSize: 20, size: 'small' } : false}
            scroll={{ x: 'max-content' }}
          />
        </>
      ) : (
        <Empty
          description={
            rows.length
              ? 'No tagged work in the selected sprints.'
              : 'No categories yet. Tag stories with a feature name (e.g. DigitSec) and it will show here.'
          }
        />
      )}
    </Card>
  );
}
