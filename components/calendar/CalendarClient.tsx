'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  App,
  Badge,
  Button,
  Calendar,
  Card,
  DatePicker,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { CalendarOutlined, CloudSyncOutlined, PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import Holidays from 'date-holidays';
import PageHeader from '@/components/common/PageHeader';
import { createClient } from '@/lib/supabase/client';
import { COUNTRIES } from '@/lib/data/countries';
import type { Holiday, Pto, PtoType } from '@/lib/types/domain';

const { Text } = Typography;

type MemberLite = { id: string; full_name: string; country_code: string | null };

const PTO_TYPES: { label: string; value: PtoType }[] = [
  { label: 'Vacation', value: 'vacation' },
  { label: 'Sick', value: 'sick' },
  { label: 'Personal', value: 'personal' },
  { label: 'Other', value: 'other' },
];

const PTO_COLOR: Record<PtoType, string> = {
  vacation: 'blue',
  sick: 'red',
  personal: 'purple',
  other: 'default',
};

type DayItem = { key: string; color: string; text: string };

export default function CalendarClient({
  teamId,
  teamName,
  isAdmin,
  members,
  ptos,
  holidays,
}: {
  teamId: string;
  teamName: string;
  isAdmin: boolean;
  members: MemberLite[];
  ptos: Pto[];
  holidays: Holiday[];
  workingWeekdays?: number[];
}) {
  const router = useRouter();
  const { message } = App.useApp();
  const [syncing, setSyncing] = useState(false);

  async function syncHolidays() {
    setSyncing(true);
    try {
      const res = await fetch('/api/holidays/sync', { method: 'POST' });
      const body = (await res.json()) as {
        synced?: number;
        countries?: string[];
        years?: number[];
        message?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(body.error ?? 'Sync failed');
      message.success(
        body.message ??
          `Synced ${body.synced ?? 0} public holidays for ${(body.countries ?? []).join(', ')}`,
      );
      router.refresh();
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Could not sync holidays');
    } finally {
      setSyncing(false);
    }
  }

  const [panelDate, setPanelDate] = useState<Dayjs>(dayjs());
  const [ptoOpen, setPtoOpen] = useState(false);
  const [holidayOpen, setHolidayOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ptoForm] = Form.useForm();
  const [holidayForm] = Form.useForm();

  const memberName = useMemo(() => {
    const m = new Map<string, string>();
    members.forEach((x) => m.set(x.id, x.full_name));
    return m;
  }, [members]);

  // Manual / company holidays keyed by 'YYYY-MM-DD'
  const manualHolidaysByDay = useMemo(() => {
    const map = new Map<string, DayItem[]>();
    holidays.forEach((h) => {
      const day = h.holiday_date.slice(0, 10);
      const list = map.get(day) ?? [];
      list.push({ key: `h-${h.id}`, color: 'gold', text: h.name });
      map.set(day, list);
    });
    return map;
  }, [holidays]);

  // Public holidays computed client-side for the distinct member countries,
  // for the visible year (plus neighbours so month spillover is covered).
  const publicHolidaysByDay = useMemo(() => {
    const map = new Map<string, DayItem[]>();
    const countries = Array.from(
      new Set(members.map((m) => m.country_code).filter((c): c is string => !!c)),
    );
    const years = Array.from(
      new Set([panelDate.year() - 1, panelDate.year(), panelDate.year() + 1]),
    );
    countries.forEach((code) => {
      let hd: Holidays;
      try {
        hd = new Holidays(code);
      } catch {
        return;
      }
      years.forEach((year) => {
        let entries: ReturnType<Holidays['getHolidays']> = [];
        try {
          entries = hd.getHolidays(year) || [];
        } catch {
          entries = [];
        }
        entries
          .filter((e) => e.type === 'public')
          .forEach((e) => {
            const day = e.date.slice(0, 10);
            const list = map.get(day) ?? [];
            if (!list.some((it) => it.text === e.name && it.key.startsWith('p-'))) {
              list.push({
                key: `p-${code}-${day}-${e.name}`,
                color: 'green',
                text: `${e.name} (${code})`,
              });
            }
            map.set(day, list);
          });
      });
    });
    return map;
  }, [members, panelDate]);

  // PTO expanded per day keyed by 'YYYY-MM-DD'
  const ptoByDay = useMemo(() => {
    const map = new Map<string, DayItem[]>();
    ptos.forEach((p) => {
      const start = dayjs(p.start_date);
      const end = dayjs(p.end_date);
      if (!start.isValid() || !end.isValid()) return;
      let cur = start;
      let guard = 0;
      while ((cur.isBefore(end) || cur.isSame(end, 'day')) && guard < 400) {
        const day = cur.format('YYYY-MM-DD');
        const list = map.get(day) ?? [];
        const name = memberName.get(p.member_id) ?? 'Unknown';
        const frac = p.day_fraction && p.day_fraction !== 1 ? ` ½` : '';
        list.push({
          key: `pto-${p.id}-${day}`,
          color: PTO_COLOR[p.pto_type] ?? 'default',
          text: `${name} (${p.pto_type})${frac}`,
        });
        map.set(day, list);
        cur = cur.add(1, 'day');
        guard += 1;
      }
    });
    return map;
  }, [ptos, memberName]);

  function itemsForDay(value: Dayjs): DayItem[] {
    const day = value.format('YYYY-MM-DD');
    return [
      ...(manualHolidaysByDay.get(day) ?? []),
      ...(publicHolidaysByDay.get(day) ?? []),
      ...(ptoByDay.get(day) ?? []),
    ];
  }

  function cellRender(value: Dayjs) {
    const items = itemsForDay(value);
    if (!items.length) return null;
    const shown = items.slice(0, 3);
    const extra = items.length - shown.length;
    return (
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {shown.map((it) => (
          <li key={it.key} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <Badge color={it.color} text={<span style={{ fontSize: 12 }}>{it.text}</span>} />
          </li>
        ))}
        {extra > 0 && (
          <li>
            <Text type="secondary" style={{ fontSize: 12 }}>
              +{extra} more
            </Text>
          </li>
        )}
      </ul>
    );
  }

  async function submitPto() {
    let values: {
      member_id: string;
      range: [Dayjs, Dayjs];
      pto_type: PtoType;
      day_fraction: number;
      note?: string;
    };
    try {
      values = await ptoForm.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from('pto').insert({
      member_id: values.member_id,
      start_date: values.range[0].format('YYYY-MM-DD'),
      end_date: values.range[1].format('YYYY-MM-DD'),
      pto_type: values.pto_type,
      day_fraction: values.day_fraction ?? 1,
      note: values.note?.trim() || null,
    });
    setSaving(false);
    if (error) {
      const overlap = /overlap|exclus|conflict|23P01/i.test(`${error.message} ${error.code ?? ''}`);
      message.error(overlap ? 'That PTO overlaps an existing entry for this member.' : error.message);
      return;
    }
    message.success('PTO added');
    setPtoOpen(false);
    ptoForm.resetFields();
    router.refresh();
  }

  async function submitHoliday() {
    let values: { date: Dayjs; name: string; country_code?: string };
    try {
      values = await holidayForm.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from('holidays').insert({
      holiday_date: values.date.format('YYYY-MM-DD'),
      name: values.name.trim(),
      country_code: values.country_code || 'US',
      is_manual: true,
      source: 'manual',
      team_id: teamId,
    });
    setSaving(false);
    if (error) {
      message.error(error.message);
      return;
    }
    message.success('Holiday added');
    setHolidayOpen(false);
    holidayForm.resetFields();
    router.refresh();
  }

  async function deletePto(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from('pto').delete().eq('id', id);
    if (error) {
      message.error(error.message);
      return;
    }
    message.success('PTO removed');
    router.refresh();
  }

  const today = dayjs();
  const upcoming = useMemo(
    () =>
      [...ptos]
        .filter((p) => dayjs(p.end_date).isValid() && !dayjs(p.end_date).isBefore(today, 'day'))
        .sort((a, b) => a.start_date.localeCompare(b.start_date)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ptos],
  );

  const columns: ColumnsType<Pto> = [
    {
      title: 'Member',
      dataIndex: 'member_id',
      key: 'member',
      render: (id: string) => memberName.get(id) ?? 'Unknown',
    },
    {
      title: 'Dates',
      key: 'dates',
      render: (_, r) =>
        r.start_date === r.end_date ? r.start_date : `${r.start_date} → ${r.end_date}`,
    },
    {
      title: 'Type',
      dataIndex: 'pto_type',
      key: 'pto_type',
      render: (t: PtoType) => <Tag color={PTO_COLOR[t] === 'default' ? undefined : PTO_COLOR[t]}>{t}</Tag>,
    },
    {
      title: 'Fraction',
      dataIndex: 'day_fraction',
      key: 'day_fraction',
      render: (f: number) => (f === 1 ? 'Full day' : `${f} day`),
    },
    ...(isAdmin
      ? [
          {
            title: '',
            key: 'actions',
            width: 90,
            render: (_: unknown, r: Pto) => (
              <Popconfirm title="Remove this PTO?" onConfirm={() => deletePto(r.id)} okText="Remove">
                <Button size="small" danger type="link">
                  Delete
                </Button>
              </Popconfirm>
            ),
          },
        ]
      : []),
  ];

  if (!members.length) {
    return (
      <>
        <PageHeader title="Calendar" subtitle={teamName} />
        <Card>
          <Empty description="No members yet. An admin needs to add members before tracking PTO and holidays." />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Calendar"
        subtitle={`${teamName} · PTO & holidays`}
        extra={
          isAdmin ? (
            <Space wrap>
              <Button icon={<PlusOutlined />} onClick={() => setPtoOpen(true)}>
                Add PTO
              </Button>
              <Button icon={<CalendarOutlined />} onClick={() => setHolidayOpen(true)}>
                Add company holiday
              </Button>
              <Tooltip title="Load every member country's public holidays into the database, so capacity and the Scrum Metrics views both see the same calendar. Company holidays you added by hand are left untouched.">
                <Button icon={<CloudSyncOutlined />} loading={syncing} onClick={syncHolidays}>
                  Sync public holidays
                </Button>
              </Tooltip>
            </Space>
          ) : undefined
        }
      />

      <Card>
        <Calendar
          value={panelDate}
          onChange={(v) => setPanelDate(v)}
          onPanelChange={(v) => setPanelDate(v)}
          cellRender={(current, info) => (info.type === 'date' ? cellRender(current) : info.originNode)}
        />
      </Card>

      <Card title="Upcoming PTO" style={{ marginTop: 16 }}>
        <Table<Pto>
          rowKey="id"
          columns={columns}
          dataSource={upcoming}
          size="small"
          pagination={{ pageSize: 10, hideOnSinglePage: true }}
          locale={{ emptyText: <Empty description="No upcoming PTO" /> }}
        />
      </Card>

      <Modal
        title="Add PTO"
        open={ptoOpen}
        onOk={submitPto}
        onCancel={() => setPtoOpen(false)}
        confirmLoading={saving}
        okText="Add PTO"
        destroyOnClose
      >
        <Form form={ptoForm} layout="vertical" preserve={false} initialValues={{ pto_type: 'vacation', day_fraction: 1 }}>
          <Form.Item name="member_id" label="Member" rules={[{ required: true, message: 'Select a member' }]}>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Select member"
              options={members.map((m) => ({ value: m.id, label: m.full_name }))}
            />
          </Form.Item>
          <Form.Item name="range" label="Dates" rules={[{ required: true, message: 'Pick a date range' }]}>
            <DatePicker.RangePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="pto_type" label="Type" rules={[{ required: true }]}>
            <Select options={PTO_TYPES} />
          </Form.Item>
          <Form.Item name="day_fraction" label="Day fraction" tooltip="1 = full day, 0.5 = half day">
            <InputNumber min={0.5} max={1} step={0.5} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="note" label="Note (optional)">
            <Input.TextArea rows={2} maxLength={280} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Add company holiday"
        open={holidayOpen}
        onOk={submitHoliday}
        onCancel={() => setHolidayOpen(false)}
        confirmLoading={saving}
        okText="Add holiday"
        destroyOnClose
      >
        <Form form={holidayForm} layout="vertical" preserve={false}>
          <Form.Item name="date" label="Date" rules={[{ required: true, message: 'Pick a date' }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Enter a name' }]}>
            <Input placeholder="e.g. Company offsite" />
          </Form.Item>
          <Form.Item
            name="country_code"
            label="Country"
            tooltip="Leave empty to apply company-wide (defaults to US)"
          >
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Company-wide (US)"
              options={COUNTRIES.map((c) => ({ value: c.code, label: `${c.name} (${c.code})` }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
