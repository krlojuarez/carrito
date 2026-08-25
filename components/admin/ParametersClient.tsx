'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  App,
  Button,
  Card,
  Col,
  Divider,
  Form,
  InputNumber,
  Row,
  Select,
  Space,
} from 'antd';
import PageHeader from '@/components/common/PageHeader';
import { createClient } from '@/lib/supabase/client';
import type { Settings } from '@/lib/types/domain';

const WEEKDAYS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

interface ParamsFormValues {
  default_focus_factor: number;
  points_per_day: number;
  min_capacity_per_member: number;
  default_sprint_length_days: number;
  working_days_per_week: number;
  working_weekdays: number[];
  warn_capacity_drop: number;
  crit_capacity_drop: number;
  warn_over_commit: number;
  crit_over_commit: number;
  warn_carryover_ratio: number;
  crit_carryover_ratio: number;
  warn_pto_cluster: number;
  crit_pto_cluster: number;
  velocity_avg_points?: number | null;
  velocity_avg_person_days?: number | null;
}

export default function ParametersClient({ settings }: { settings: Settings | null }) {
  const router = useRouter();
  const { message } = App.useApp();
  const [form] = Form.useForm<ParamsFormValues>();
  const [saving, setSaving] = useState(false);

  const initialValues: ParamsFormValues = {
    default_focus_factor: settings?.default_focus_factor ?? 0.8,
    points_per_day: settings?.points_per_day ?? 1,
    min_capacity_per_member: settings?.min_capacity_per_member ?? 0,
    default_sprint_length_days: settings?.default_sprint_length_days ?? 10,
    working_days_per_week: settings?.working_days_per_week ?? 5,
    working_weekdays: settings?.working_weekdays ?? [1, 2, 3, 4, 5],
    warn_capacity_drop: settings?.warn_capacity_drop ?? 0.15,
    crit_capacity_drop: settings?.crit_capacity_drop ?? 0.3,
    warn_over_commit: settings?.warn_over_commit ?? 0.9,
    crit_over_commit: settings?.crit_over_commit ?? 1,
    warn_carryover_ratio: settings?.warn_carryover_ratio ?? 0.2,
    crit_carryover_ratio: settings?.crit_carryover_ratio ?? 0.3,
    warn_pto_cluster: settings?.warn_pto_cluster ?? 0.15,
    crit_pto_cluster: settings?.crit_pto_cluster ?? 0.3,
    velocity_avg_points: settings?.velocity_avg_points ?? null,
    velocity_avg_person_days: settings?.velocity_avg_person_days ?? null,
  };

  async function onSave(values: ParamsFormValues) {
    setSaving(true);
    const supabase = createClient();
    const payload = {
      default_focus_factor: values.default_focus_factor,
      points_per_day: values.points_per_day,
      min_capacity_per_member: values.min_capacity_per_member,
      default_sprint_length_days: values.default_sprint_length_days,
      working_days_per_week: values.working_days_per_week,
      working_weekdays: values.working_weekdays,
      warn_capacity_drop: values.warn_capacity_drop,
      crit_capacity_drop: values.crit_capacity_drop,
      warn_over_commit: values.warn_over_commit,
      crit_over_commit: values.crit_over_commit,
      warn_carryover_ratio: values.warn_carryover_ratio,
      crit_carryover_ratio: values.crit_carryover_ratio,
      warn_pto_cluster: values.warn_pto_cluster,
      crit_pto_cluster: values.crit_pto_cluster,
      velocity_avg_points: values.velocity_avg_points ?? null,
      velocity_avg_person_days: values.velocity_avg_person_days ?? null,
    };
    try {
      if (settings) {
        const { error } = await supabase.from('settings').update(payload).eq('id', settings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('settings').insert({ ...payload, team_id: null });
        if (error) throw error;
      }
      message.success('Parameters saved');
      router.refresh();
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Could not save parameters');
    } finally {
      setSaving(false);
    }
  }

  const fraction = { min: 0, max: 5, step: 0.05, style: { width: '100%' } as const };

  return (
    <>
      <PageHeader
        title="Parameters"
        subtitle="Global defaults and warning thresholds for capacity planning"
        extra={
          <Button type="primary" loading={saving} onClick={() => form.submit()}>
            Save
          </Button>
        }
      />

      <Form<ParamsFormValues>
        form={form}
        layout="vertical"
        onFinish={onSave}
        requiredMark={false}
        initialValues={initialValues}
      >
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={12}>
            <Card title="Capacity defaults">
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item
                    name="default_focus_factor"
                    label="Default focus factor"
                    tooltip="0 to 1"
                    rules={[{ required: true }]}
                  >
                    <InputNumber min={0} max={1} step={0.05} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="points_per_day" label="Points / day" rules={[{ required: true }]}>
                    <InputNumber min={0} step={0.1} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="min_capacity_per_member"
                    label="Min capacity / member (days)"
                    rules={[{ required: true }]}
                  >
                    <InputNumber min={0} step={0.5} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="default_sprint_length_days"
                    label="Default sprint length (days)"
                    rules={[{ required: true }]}
                  >
                    <InputNumber min={1} step={1} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="working_days_per_week"
                    label="Working days / week"
                    rules={[{ required: true }]}
                  >
                    <InputNumber min={1} max={7} step={1} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item
                name="working_weekdays"
                label="Working weekdays"
                tooltip="Which weekdays count as working days"
                rules={[{ required: true }]}
              >
                <Select mode="multiple" options={WEEKDAYS} placeholder="Select working days" />
              </Form.Item>
            </Card>
          </Col>

          <Col xs={24} lg={12}>
            <Card title="Warning thresholds">
              <p style={{ marginTop: 0, color: 'rgba(0,0,0,0.45)' }}>
                Expressed as fractions (e.g. 0.15 = 15%).
              </p>
              <Divider orientation="left" plain style={{ margin: '8px 0 16px' }}>
                Capacity drop
              </Divider>
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item name="warn_capacity_drop" label="Warn">
                    <InputNumber {...fraction} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="crit_capacity_drop" label="Critical">
                    <InputNumber {...fraction} />
                  </Form.Item>
                </Col>
              </Row>
              <Divider orientation="left" plain style={{ margin: '8px 0 16px' }}>
                Over-commit
              </Divider>
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item name="warn_over_commit" label="Warn">
                    <InputNumber {...fraction} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="crit_over_commit" label="Critical">
                    <InputNumber {...fraction} />
                  </Form.Item>
                </Col>
              </Row>
              <Divider orientation="left" plain style={{ margin: '8px 0 16px' }}>
                Carry-over ratio
              </Divider>
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item name="warn_carryover_ratio" label="Warn">
                    <InputNumber {...fraction} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="crit_carryover_ratio" label="Critical">
                    <InputNumber {...fraction} />
                  </Form.Item>
                </Col>
              </Row>
              <Divider orientation="left" plain style={{ margin: '8px 0 16px' }}>
                PTO cluster
              </Divider>
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item name="warn_pto_cluster" label="Warn">
                    <InputNumber {...fraction} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="crit_pto_cluster" label="Critical">
                    <InputNumber {...fraction} />
                  </Form.Item>
                </Col>
              </Row>
            </Card>

            <Card title="Velocity baseline (optional)" style={{ marginTop: 16 }}>
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item name="velocity_avg_points" label="Avg points / sprint">
                    <InputNumber min={0} step={1} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="velocity_avg_person_days" label="Avg person-days / sprint">
                    <InputNumber min={0} step={1} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>
            </Card>
          </Col>
        </Row>

        <Space style={{ marginTop: 16 }}>
          <Button type="primary" htmlType="submit" loading={saving}>
            Save parameters
          </Button>
        </Space>
      </Form>
    </>
  );
}
