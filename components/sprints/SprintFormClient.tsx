'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { App, Button, Card, DatePicker, Form, Input, InputNumber, Space } from 'antd';
import type { Dayjs } from 'dayjs';
import PageHeader from '@/components/common/PageHeader';
import { createClient } from '@/lib/supabase/client';

const { RangePicker } = DatePicker;

interface FormValues {
  name: string;
  range: [Dayjs, Dayjs];
  ado_iteration_path?: string;
  working_days?: number;
}

export default function SprintFormClient({
  teamId,
  teamName,
  defaultSprintLengthDays,
}: {
  teamId: string;
  teamName: string;
  defaultSprintLengthDays: number;
}) {
  const router = useRouter();
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const [loading, setLoading] = useState(false);

  // When the user picks a start date, prefill the end date to start + default length.
  function onStartPicked(start: Dayjs | null) {
    if (!start) return;
    const current = form.getFieldValue('range') as [Dayjs, Dayjs] | undefined;
    const hasEnd = current && current[1];
    if (!hasEnd) {
      const end = start.add(Math.max(1, defaultSprintLengthDays) - 1, 'day');
      form.setFieldsValue({ range: [start, end] });
    }
  }

  async function onFinish(values: FormValues) {
    setLoading(true);
    const supabase = createClient();
    try {
      const [start, end] = values.range;
      const { data, error } = await supabase
        .from('sprints')
        .insert({
          team_id: teamId,
          name: values.name,
          start_date: start.format('YYYY-MM-DD'),
          end_date: end.format('YYYY-MM-DD'),
          ado_iteration_path: values.ado_iteration_path?.trim() || null,
          working_days: values.working_days ?? null,
        })
        .select('id')
        .single();
      if (error) throw error;
      message.success('Sprint created');
      const newId = (data as { id: string }).id;
      router.push(`/sprints/${newId}`);
      router.refresh();
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Failed to create sprint');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <PageHeader title="New sprint" subtitle={teamName} />
      <Card style={{ maxWidth: 640 }}>
        <Form form={form} layout="vertical" onFinish={onFinish} requiredMark>
          <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Name is required' }]}>
            <Input placeholder="Sprint 24" size="large" />
          </Form.Item>
          <Form.Item
            name="range"
            label="Start & end dates"
            rules={[{ required: true, message: 'Pick a date range' }]}
          >
            <RangePicker
              style={{ width: '100%' }}
              size="large"
              format="YYYY-MM-DD"
              onCalendarChange={(dates) => {
                const start = dates?.[0] ?? null;
                onStartPicked(start);
              }}
            />
          </Form.Item>
          <Form.Item
            name="ado_iteration_path"
            label="ADO iteration path"
            tooltip="Optional. Used to match imported Azure DevOps stories to this sprint."
          >
            <Input placeholder="Project\\Team\\Sprint 24" />
          </Form.Item>
          <Form.Item
            name="working_days"
            label="Working days"
            tooltip="Optional override for the number of working days in this sprint."
          >
            <InputNumber min={1} max={60} style={{ width: '100%' }} placeholder="Auto" />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={loading}>
                Create sprint
              </Button>
              <Button onClick={() => router.push('/sprints')} disabled={loading}>
                Cancel
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </>
  );
}
