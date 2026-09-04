'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Collapse,
  Empty,
  Row,
  Segmented,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { DownloadOutlined, InfoCircleOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import Papa from 'papaparse';
import PageHeader from '@/components/common/PageHeader';
import { Column, DualAxes } from '@/components/charts';
import { downloadCsv } from '@/lib/ado/export';
import { SERIES_ORDER, VIZ_LIGHT, VIZ_STATUS, colorForSeries } from '@/lib/theme/vizPalette';
import CategoryAnalytics from '@/components/metrics/CategoryAnalytics';
import { DATA_QUALITY_SEVERITY } from '@/lib/metrics/types';
import type {
  CategoryPoints,
  DataQualityIssue,
  MemberCapacityProfile,
  MemberSprintCapacity,
  SprintForecast,
  SprintVelocity,
} from '@/lib/metrics/types';

const { Text, Paragraph } = Typography;

const P = VIZ_LIGHT;
const num = (v: number | null | undefined, digits = 0) =>
  v == null ? '—' : Number(v).toLocaleString(undefined, { maximumFractionDigits: digits });
const pct = (v: number | null | undefined, digits = 1) =>
  v == null ? '—' : `${(Number(v) * 100).toFixed(digits)}%`;

type DoneBasis = 'sheet' | 'dod';

export default function MetricsClient({
  teamName,
  velocity,
  memberCapacity,
  capacityProfile,
  forecast,
  issues,
  categories,
}: {
  teamName: string;
  velocity: SprintVelocity[];
  memberCapacity: MemberSprintCapacity[];
  capacityProfile: MemberCapacityProfile[];
  forecast: SprintForecast[];
  issues: DataQualityIssue[];
  categories: CategoryPoints[];
}) {
  const { message } = App.useApp();
  const [doneBasis, setDoneBasis] = useState<DoneBasis>('sheet');
  const [focusSprint, setFocusSprint] = useState<string | undefined>(
    velocity.length ? velocity[velocity.length - 1].sprint_id : undefined,
  );

  const doneOf = useCallback(
    (v: SprintVelocity) => (doneBasis === 'dod' ? v.delivered_points : v.done_points),
    [doneBasis],
  );

  // ---- Chart 1 — the workbook's "SF Platform Metrics" -------------------
  // Bars: Commitment / Unplanned / Done. Lines: Velocity AVG / Capacity SP.
  // All five series are Story Points, so they share ONE y axis.
  const barData = useMemo(
    () =>
      velocity.flatMap((v) => [
        { sprint: v.sprint_name, series: 'Commitment', value: Number(v.committed_points) },
        { sprint: v.sprint_name, series: 'Unplanned', value: Number(v.unplanned_points) },
        { sprint: v.sprint_name, series: 'Done', value: Number(doneOf(v)) },
      ]),
    [velocity, doneOf],
  );

  const lineData = useMemo(
    () =>
      velocity.flatMap((v) => [
        {
          sprint: v.sprint_name,
          series: 'Velocity AVG',
          value: v.velocity_avg_points == null ? null : Number(v.velocity_avg_points),
        },
        { sprint: v.sprint_name, series: 'Capacity SP', value: Number(v.capacity_points) },
      ]),
    [velocity],
  );

  const lastSprintName = velocity.length ? velocity[velocity.length - 1].sprint_name : '';

  // Verified by rendering: a top-level shared y scale (`key`) plus a top-level
  // axis is the only DualAxes shape in @ant-design/plots v2 that puts bars and
  // lines on ONE Story Points scale AND still draws that axis. Declaring the
  // colour scale per child makes the last child's range win for all series;
  // declaring `legend: false` on a child removes the chart's whole legend.
  const metricsChart = useMemo(
    () => ({
      xField: 'sprint',
      scale: {
        y: { key: 'sp', independent: false, nice: true },
        color: { domain: SERIES_ORDER, range: SERIES_ORDER.map((s) => colorForSeries(s, P)) },
      },
      legend: { color: { position: 'top' as const, layout: { justifyContent: 'flex-start' } } },
      axis: {
        x: { title: null },
        y: { title: 'Story Points', tickCount: 5, grid: true, gridStroke: P.grid },
      },
      children: [
        {
          type: 'interval',
          data: barData,
          xField: 'sprint',
          yField: 'value',
          colorField: 'series',
          transform: [{ type: 'dodgeX', padding: 0.08 }],
          // 1px surface stroke = the 2px gap between adjacent bars.
          style: { radiusTopLeft: 4, radiusTopRight: 4, stroke: P.surface, lineWidth: 1 },
        },
        {
          type: 'line',
          data: lineData,
          xField: 'sprint',
          yField: 'value',
          colorField: 'series',
          style: { lineWidth: 2, lineJoin: 'round' },
          // Direct-label the final point of each line only — never every point.
          labels: [
            {
              text: (d: { sprint: string; series: string }) =>
                d.sprint === lastSprintName ? d.series : '',
              dx: 6,
              dy: -8,
              style: { fontSize: 11, fill: P.textSecondary, textAlign: 'start' },
            },
          ],
        },
        {
          type: 'point',
          data: lineData,
          xField: 'sprint',
          yField: 'value',
          colorField: 'series',
          style: { r: 4, stroke: P.surface, lineWidth: 1.5, fillOpacity: 1 },
          tooltip: false,
        },
      ],
      height: 360,
      autoFit: true,
      insetRight: 72,
      insetTop: 8,
    }),
    [barData, lineData, lastSprintName],
  );

  // ---- Chart 2 — the workbook's per-member "AVG Capacity per day" -------
  const capacityChartData = useMemo(
    () =>
      capacityProfile
        .filter((m) => m.avg_points_per_day != null)
        .map((m) => ({
          member: m.member_name,
          value: Number(m.avg_points_per_day),
        }))
        .sort((a, b) => b.value - a.value),
    [capacityProfile],
  );

  const capacityChart = useMemo(
    () => ({
      data: capacityChartData,
      xField: 'member',
      yField: 'value',
      // One series: the title names it, so no legend box.
      colorField: () => 'avg',
      scale: { color: { range: [P.categorical[0]] } },
      legend: false as const,
      axis: {
        x: { title: null, labelAutoRotate: true, labelAutoHide: false },
        y: { title: 'Story points per working day', grid: true, gridStroke: P.grid },
      },
      style: { radiusTopLeft: 4, radiusTopRight: 4, insetLeft: 2, insetRight: 2 },
      height: 320,
      autoFit: true,
    }),
    [capacityChartData],
  );

  // ---- Velocity table — also the accessible view of chart 1 -------------
  const velocityColumns: ColumnsType<SprintVelocity> = [
    { title: 'Sprint', dataIndex: 'sprint_name', key: 'sprint', fixed: 'left', width: 130 },
    { title: 'Start', dataIndex: 'start_date', key: 'start', width: 110 },
    { title: 'End', dataIndex: 'end_date', key: 'end', width: 110 },
    {
      title: <SeriesHead name="Commitment" />,
      key: 'committed',
      align: 'right',
      render: (_, v) => num(v.committed_points),
    },
    {
      title: <SeriesHead name="Unplanned" />,
      key: 'unplanned',
      align: 'right',
      render: (_, v) => num(v.unplanned_points),
    },
    {
      title: <SeriesHead name="Done" />,
      key: 'done',
      align: 'right',
      render: (_, v) => num(doneOf(v)),
    },
    {
      title: 'Done %',
      key: 'done_pct',
      align: 'right',
      render: (_, v) => {
        const p =
          doneBasis === 'dod' && v.committed_points
            ? v.delivered_points / v.committed_points
            : v.done_pct;
        return (
          <Text style={{ color: p != null && p >= 1 ? VIZ_STATUS.good : undefined }}>{pct(p)}</Text>
        );
      },
    },
    {
      title: <SeriesHead name="Velocity AVG" />,
      key: 'velocity',
      align: 'right',
      render: (_, v) => num(v.velocity_avg_points, 1),
    },
    { title: 'Total SP', key: 'total', align: 'right', render: (_, v) => num(v.total_points) },
    {
      title: 'Carry-over SP',
      key: 'carry',
      align: 'right',
      render: (_, v) => num(v.carry_over_points),
    },
    {
      title: 'Carry-over %',
      key: 'carry_pct',
      align: 'right',
      render: (_, v) => (
        <Text style={{ color: (v.carry_over_pct ?? 0) >= 0.3 ? VIZ_STATUS.serious : undefined }}>
          {pct(v.carry_over_pct)}
        </Text>
      ),
    },
    {
      title: <SeriesHead name="Capacity SP" />,
      key: 'capacity',
      align: 'right',
      render: (_, v) => num(v.capacity_points),
    },
    {
      title: 'Workday %',
      key: 'workday',
      align: 'right',
      render: (_, v) => pct(v.workday_pct),
    },
    {
      title: 'Stories done',
      key: 'stories_done',
      align: 'right',
      render: (_, v) => `${v.stories_done} / ${v.story_count}`,
    },
  ];

  // ---- Capacity matrix — the workbook's Capacity sheet ------------------
  const sprintNames = useMemo(() => velocity.map((v) => v.sprint_name), [velocity]);

  const capacityRows = useMemo(() => {
    const byMember = new Map<
      string,
      { member: string; country: string | null; fte: number; cells: Record<string, MemberSprintCapacity> }
    >();
    for (const c of memberCapacity) {
      const row =
        byMember.get(c.member_id) ??
        { member: c.member_name, country: c.country_code, fte: Number(c.capacity_factor), cells: {} };
      row.cells[c.sprint_name] = c;
      byMember.set(c.member_id, row);
    }
    return [...byMember.entries()].map(([id, r]) => ({ key: id, ...r }));
  }, [memberCapacity]);

  type CapacityRow = (typeof capacityRows)[number];

  const capacityColumns: ColumnsType<CapacityRow> = [
    { title: 'Member', dataIndex: 'member', key: 'member', fixed: 'left', width: 170 },
    {
      title: 'Location',
      dataIndex: 'country',
      key: 'country',
      width: 90,
      render: (v: string | null) => v ?? <Text type="secondary">—</Text>,
    },
    {
      title: (
        <Tooltip title="Full-time equivalent. 1 = full time, 0.5 = half time.">
          <span>
            FTE <InfoCircleOutlined style={{ color: P.textSecondary }} />
          </span>
        </Tooltip>
      ),
      dataIndex: 'fte',
      key: 'fte',
      width: 70,
      align: 'right',
      render: (v: number) => v.toFixed(2).replace(/\.00$/, ''),
    },
    ...sprintNames.map((name) => ({
      title: name,
      key: name,
      children: [
        {
          title: 'Hol',
          key: `${name}-h`,
          width: 60,
          align: 'right' as const,
          render: (_: unknown, r: CapacityRow) => num(r.cells[name]?.holiday_days, 1),
        },
        {
          title: 'PTO',
          key: `${name}-p`,
          width: 60,
          align: 'right' as const,
          render: (_: unknown, r: CapacityRow) => num(r.cells[name]?.pto_days, 1),
        },
        {
          title: 'Days',
          key: `${name}-n`,
          width: 64,
          align: 'right' as const,
          render: (_: unknown, r: CapacityRow) => num(r.cells[name]?.net_days, 1),
        },
        {
          title: 'Done',
          key: `${name}-d`,
          width: 64,
          align: 'right' as const,
          render: (_: unknown, r: CapacityRow) => num(r.cells[name]?.completed_points, 1),
        },
        {
          title: 'SP/day',
          key: `${name}-r`,
          width: 74,
          align: 'right' as const,
          render: (_: unknown, r: CapacityRow) => num(r.cells[name]?.points_per_day, 2),
        },
      ],
    })),
  ];

  // ---- Headline numbers for one sprint ---------------------------------
  const selected = velocity.find((v) => v.sprint_id === focusSprint) ?? velocity[velocity.length - 1];
  const selectedForecast = forecast.find((f) => f.sprint_id === selected?.sprint_id);
  const sprintIssues = issues.filter((i) => i.sprint_id === selected?.sprint_id);
  const errorIssues = issues.filter((i) => DATA_QUALITY_SEVERITY[i.issue_code] === 'error');

  function exportVelocity() {
    if (!velocity.length) return;
    const csv = Papa.unparse(
      velocity.map((v) => ({
        Sprint: v.sprint_name,
        'Sprint Start Date': v.start_date,
        'Sprint End Date': v.end_date,
        Commitment: v.committed_points,
        Unplanned: v.unplanned_points,
        Done: v.done_points,
        'Delivered (DoD)': v.delivered_points,
        'Done Percentage': v.done_pct ?? '',
        'Velocity AVG': v.velocity_avg_points ?? '',
        'Total Sprint SP': v.total_points,
        'Carry Over SP': v.carry_over_points,
        'Carry Over Percentage': v.carry_over_pct ?? '',
        'Capacity SP': v.capacity_points,
        'Workday %': v.workday_pct ?? '',
        'User Stories Done': v.stories_done,
      })),
      { quotes: true, newline: '\r\n' },
    );
    downloadCsv(csv, `velocity-${new Date().toISOString().slice(0, 10)}.csv`);
    message.success('Velocity exported');
  }

  if (!velocity.length) {
    return (
      <>
        <PageHeader title="Scrum Metrics" subtitle={teamName} />
        <Card>
          <Empty description="No sprints with imported stories yet. Import an ADO export and the metrics build themselves." />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Scrum Metrics"
        subtitle={`${teamName} · velocity, commitment and capacity, computed from the imported work items`}
        extra={
          <Space>
            <Segmented<DoneBasis>
              value={doneBasis}
              onChange={setDoneBasis}
              options={[
                { label: 'Done (sheet rule)', value: 'sheet' },
                { label: 'Delivered (DoD)', value: 'dod' },
              ]}
            />
            <Button icon={<DownloadOutlined />} onClick={exportVelocity}>
              Export CSV
            </Button>
          </Space>
        }
      />

      {errorIssues.length > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={`${errorIssues.length} work item${errorIssues.length === 1 ? '' : 's'} would distort these metrics`}
          description={
            <Collapse
              ghost
              size="small"
              items={[
                {
                  key: 'issues',
                  label: 'Show what needs attention',
                  children: <IssuesTable issues={issues} />,
                },
              ]}
            />
          }
        />
      )}

      <Card
        style={{ marginBottom: 16 }}
        title="Sprint at a glance"
        extra={
          <Select
            style={{ minWidth: 200 }}
            value={selected?.sprint_id}
            onChange={setFocusSprint}
            options={velocity.map((v) => ({ value: v.sprint_id, label: v.sprint_name }))}
          />
        }
      >
        <Row gutter={[16, 16]}>
          <Col xs={12} md={6} xl={4}>
            <Statistic title="Commitment" value={num(selected?.committed_points)} suffix="SP" />
          </Col>
          <Col xs={12} md={6} xl={4}>
            <Statistic title="Unplanned" value={num(selected?.unplanned_points)} suffix="SP" />
          </Col>
          <Col xs={12} md={6} xl={4}>
            <Statistic title="Done" value={num(selected ? doneOf(selected) : null)} suffix="SP" />
          </Col>
          <Col xs={12} md={6} xl={4}>
            <Statistic title="Velocity AVG" value={num(selected?.velocity_avg_points, 1)} suffix="SP" />
          </Col>
          <Col xs={12} md={6} xl={4}>
            <Statistic title="Carry-over" value={pct(selected?.carry_over_pct)} />
          </Col>
          <Col xs={12} md={6} xl={4}>
            <Statistic title="Workday %" value={pct(selected?.workday_pct)} />
          </Col>
        </Row>
        {selectedForecast && (
          <Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
            Forecast for this sprint: {num(selectedForecast.available_person_days, 1)} person-days ·{' '}
            {num(selectedForecast.capacity_points, 1)} SP of capacity ·{' '}
            <Text
              strong
              style={{
                color: selectedForecast.free_points < 0 ? VIZ_STATUS.critical : VIZ_STATUS.good,
              }}
            >
              {num(selectedForecast.free_points, 1)} SP free
            </Text>{' '}
            after {num(selectedForecast.committed_points, 1)} committed and{' '}
            {num(selectedForecast.carry_over_points, 1)} carried over.
          </Paragraph>
        )}
        {sprintIssues.length > 0 && (
          <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
            {sprintIssues.length} data-quality note{sprintIssues.length === 1 ? '' : 's'} on this sprint.
          </Text>
        )}
      </Card>

      <Card title="SF Platform Metrics" style={{ marginBottom: 16 }}>
        <DualAxes {...metricsChart} />
        <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
          Bars are per-sprint totals; lines are the cumulative velocity average and the sprint&apos;s
          capacity (total SP minus carry-over). All five series are story points on one axis. The
          table below carries the same numbers.
        </Text>
      </Card>

      <Card title="Velocity" style={{ marginBottom: 16 }}>
        <Table<SprintVelocity>
          rowKey="sprint_id"
          size="small"
          dataSource={velocity}
          columns={velocityColumns}
          pagination={false}
          scroll={{ x: 'max-content' }}
        />
        {doneBasis === 'sheet' && velocity.some((v) => v.unverified_done_points > 0) && (
          <Alert
            type="info"
            showIcon
            style={{ marginTop: 12 }}
            message="Some work counted as Done is not in a done state"
            description={
              <>
                The spreadsheet rule counts a story as Done whenever no carry-over was recorded
                against it, whatever its state says. Switch to <Text code>Delivered (DoD)</Text> to
                count only what reached a done state, net of anything that spilled — the difference
                is{' '}
                {velocity
                  .filter((v) => v.unverified_done_points > 0)
                  .map((v) => `${v.sprint_name}: ${num(v.unverified_done_points)} SP`)
                  .join(' · ')}
                .
              </>
            }
          />
        )}
      </Card>

      <Card title="AVG capacity per day" style={{ marginBottom: 16 }}>
        {capacityChartData.length ? (
          <>
            <Column {...capacityChart} />
            <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
              Each member&apos;s completed story points divided by the days they actually worked,
              averaged across sprints. This is what the workbook computed by hand in Capacity!E.
            </Text>
          </>
        ) : (
          <Empty description="No completed work yet to measure a per-day rate." />
        )}
      </Card>

      <Card title="Capacity by member and sprint">
        <Table<CapacityRow>
          rowKey="key"
          size="small"
          bordered
          dataSource={capacityRows}
          columns={capacityColumns}
          pagination={false}
          scroll={{ x: 'max-content' }}
        />
        <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
          Hol = public and company holidays that land on a working weekday. PTO = booked time off.
          Days = working days left after both. Every number here is derived — nothing is typed in.
        </Text>
      </Card>

      <CategoryAnalytics
        rows={categories}
        sprints={velocity.map((v) => ({ id: v.sprint_id, name: v.sprint_name }))}
      />
    </>
  );
}

function SeriesHead({ name }: { name: string }) {
  return (
    <Space size={6}>
      <span
        aria-hidden
        style={{
          display: 'inline-block',
          width: 8,
          height: 8,
          borderRadius: 2,
          background: colorForSeries(name, P),
        }}
      />
      {name}
    </Space>
  );
}

function IssuesTable({ issues }: { issues: DataQualityIssue[] }) {
  const columns: ColumnsType<DataQualityIssue> = [
    { title: 'Sprint', dataIndex: 'sprint_name', key: 'sprint', width: 130 },
    {
      title: 'Work item',
      key: 'id',
      width: 120,
      render: (_, i) => <Text code>{i.ado_work_item_id}</Text>,
    },
    { title: 'Title', dataIndex: 'title', key: 'title', ellipsis: true },
    {
      title: 'State',
      dataIndex: 'state_raw',
      key: 'state',
      width: 130,
      render: (v: string | null) => v ?? '—',
    },
    {
      title: 'Needs attention',
      key: 'issue',
      render: (_, i) => (
        <Space>
          <Tag color={DATA_QUALITY_SEVERITY[i.issue_code] === 'error' ? 'red' : 'gold'}>
            {i.issue_code.replace(/_/g, ' ').toLowerCase()}
          </Tag>
          <Text type="secondary">{i.issue}</Text>
        </Space>
      ),
    },
  ];
  return (
    <Table<DataQualityIssue>
      rowKey={(i) => `${i.story_id}-${i.issue_code}`}
      size="small"
      dataSource={issues}
      columns={columns}
      pagination={{ pageSize: 10, size: 'small' }}
      scroll={{ x: 'max-content' }}
    />
  );
}
