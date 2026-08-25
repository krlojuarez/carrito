'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  App,
  Button,
  Card,
  Col,
  DatePicker,
  Drawer,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tag,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import PageHeader from '@/components/common/PageHeader';
import { createClient } from '@/lib/supabase/client';
import { COUNTRIES, countryName } from '@/lib/data/countries';
import type { Member, Role, Seniority, Team } from '@/lib/types/domain';

const { RangePicker } = DatePicker;

interface MemberFormValues {
  full_name: string;
  email?: string;
  country_code?: string;
  region_code?: string;
  role_id?: string;
  seniority_id?: string;
  hours_per_day: number;
  focus_factor?: number;
  points_per_day?: number;
  min_capacity_days?: number;
  range?: [dayjs.Dayjs | null, dayjs.Dayjs | null];
  is_active: boolean;
}

export default function TeamClient({
  team,
  members,
  roles,
  seniorities,
}: {
  team: Team | null;
  members: Member[];
  roles: Role[];
  seniorities: Seniority[];
}) {
  const router = useRouter();
  const { message } = App.useApp();
  const [createForm] = Form.useForm();
  const [memberForm] = Form.useForm<MemberFormValues>();
  const [saving, setSaving] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);

  async function onCreateTeam(values: { name: string; description?: string }) {
    setSaving(true);
    const supabase = createClient();
    try {
      const { error } = await supabase.from('teams').insert({
        name: values.name,
        description: values.description ?? null,
        is_active: true,
      });
      if (error) throw error;
      message.success('Team created');
      router.refresh();
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Could not create team');
    } finally {
      setSaving(false);
    }
  }

  function openAdd() {
    setEditing(null);
    memberForm.resetFields();
    memberForm.setFieldsValue({ hours_per_day: 8, is_active: true });
    setDrawerOpen(true);
  }

  function openEdit(m: Member) {
    setEditing(m);
    memberForm.setFieldsValue({
      full_name: m.full_name,
      email: m.email ?? undefined,
      country_code: m.country_code ?? undefined,
      region_code: m.region_code ?? undefined,
      role_id: m.role_id ?? undefined,
      seniority_id: m.seniority_id ?? undefined,
      hours_per_day: m.hours_per_day,
      focus_factor: m.focus_factor ?? undefined,
      points_per_day: m.points_per_day ?? undefined,
      min_capacity_days: m.min_capacity_days ?? undefined,
      range: [
        m.start_date ? dayjs(m.start_date) : null,
        m.end_date ? dayjs(m.end_date) : null,
      ],
      is_active: m.is_active,
    });
    setDrawerOpen(true);
  }

  async function onSaveMember(values: MemberFormValues) {
    if (!team) return;
    setSaving(true);
    const supabase = createClient();
    const payload = {
      team_id: team.id,
      full_name: values.full_name,
      email: values.email ?? null,
      country_code: values.country_code ?? null,
      region_code: values.region_code ?? null,
      role_id: values.role_id ?? null,
      seniority_id: values.seniority_id ?? null,
      hours_per_day: values.hours_per_day,
      focus_factor: values.focus_factor ?? null,
      points_per_day: values.points_per_day ?? null,
      min_capacity_days: values.min_capacity_days ?? null,
      start_date: values.range?.[0] ? values.range[0].format('YYYY-MM-DD') : null,
      end_date: values.range?.[1] ? values.range[1].format('YYYY-MM-DD') : null,
      is_active: values.is_active,
    };
    try {
      if (editing) {
        const { error } = await supabase.from('members').update(payload).eq('id', editing.id);
        if (error) throw error;
        message.success('Member updated');
      } else {
        const { error } = await supabase.from('members').insert(payload);
        if (error) throw error;
        message.success('Member added');
      }
      setDrawerOpen(false);
      router.refresh();
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Could not save member');
    } finally {
      setSaving(false);
    }
  }

  async function onDeleteMember(m: Member) {
    const supabase = createClient();
    try {
      const { error } = await supabase.from('members').delete().eq('id', m.id);
      if (error) throw error;
      message.success('Member removed');
      router.refresh();
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Could not remove member');
    }
  }

  if (!team) {
    return (
      <>
        <PageHeader title="Team" subtitle="Create your team to get started" />
        <Row justify="center">
          <Col xs={24} md={16} lg={10}>
            <Card>
              <Form form={createForm} layout="vertical" onFinish={onCreateTeam} requiredMark={false}>
                <Form.Item name="name" label="Team name" rules={[{ required: true }]}>
                  <Input placeholder="Platform Squad" size="large" />
                </Form.Item>
                <Form.Item name="description" label="Description">
                  <Input.TextArea placeholder="What this team owns" rows={3} />
                </Form.Item>
                <Button type="primary" htmlType="submit" size="large" block loading={saving}>
                  Create team
                </Button>
              </Form>
            </Card>
          </Col>
        </Row>
      </>
    );
  }

  const columns: ColumnsType<Member> = [
    { title: 'Name', dataIndex: 'full_name', key: 'full_name' },
    { title: 'Email', dataIndex: 'email', key: 'email', render: (v: string | null) => v ?? '—' },
    {
      title: 'Country',
      dataIndex: 'country_code',
      key: 'country_code',
      render: (v: string | null) => (v ? countryName(v) : '—'),
    },
    {
      title: 'Role',
      key: 'role',
      render: (_, m) => m.role?.name ?? '—',
    },
    {
      title: 'Seniority',
      key: 'seniority',
      render: (_, m) => m.seniority?.name ?? '—',
    },
    { title: 'Hours/day', dataIndex: 'hours_per_day', key: 'hours_per_day' },
    {
      title: 'Active',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (v: boolean) => (v ? <Tag color="green">Active</Tag> : <Tag>Inactive</Tag>),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, m) => (
        <Space>
          <Button size="small" onClick={() => openEdit(m)}>
            Edit
          </Button>
          <Popconfirm
            title="Remove this member?"
            okText="Remove"
            okButtonProps={{ danger: true }}
            onConfirm={() => onDeleteMember(m)}
          >
            <Button size="small" danger>
              Delete
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Team"
        subtitle={team.name}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>
            Add member
          </Button>
        }
      />

      <Card>
        <Table<Member>
          rowKey="id"
          columns={columns}
          dataSource={members}
          scroll={{ x: 'max-content' }}
          pagination={{ pageSize: 20, hideOnSinglePage: true }}
        />
      </Card>

      <Drawer
        title={editing ? 'Edit member' : 'Add member'}
        width={480}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        destroyOnClose
        extra={
          <Space>
            <Button onClick={() => setDrawerOpen(false)}>Cancel</Button>
            <Button type="primary" loading={saving} onClick={() => memberForm.submit()}>
              Save
            </Button>
          </Space>
        }
      >
        <Form<MemberFormValues>
          form={memberForm}
          layout="vertical"
          onFinish={onSaveMember}
          requiredMark={false}
          initialValues={{ hours_per_day: 8, is_active: true }}
        >
          <Form.Item name="full_name" label="Full name" rules={[{ required: true }]}>
            <Input placeholder="Jane Doe" />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ type: 'email' }]}>
            <Input placeholder="jane@company.com" />
          </Form.Item>
          <Form.Item
            name="country_code"
            label="Country"
            tooltip="Optional. Recommended so the member's public holidays reduce capacity accurately."
          >
            <Select
              showSearch
              allowClear
              optionFilterProp="label"
              placeholder="Select country (optional)"
              options={COUNTRIES.map((c) => ({ value: c.code, label: c.name }))}
            />
          </Form.Item>
          <Form.Item name="region_code" label="Region code" tooltip="Optional sub-region for holidays">
            <Input placeholder="e.g. CA" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="role_id" label="Role">
                <Select
                  allowClear
                  placeholder="Role"
                  options={roles.map((r) => ({ value: r.id, label: r.name }))}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="seniority_id" label="Seniority">
                <Select
                  allowClear
                  placeholder="Seniority"
                  options={seniorities.map((s) => ({ value: s.id, label: s.name }))}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="hours_per_day" label="Hours / day" rules={[{ required: true }]}>
                <InputNumber min={0} max={24} step={0.5} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="focus_factor" label="Focus factor" tooltip="0 to 1 (optional)">
                <InputNumber min={0} max={1} step={0.05} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="points_per_day" label="Points / day">
                <InputNumber min={0} step={0.1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="min_capacity_days" label="Min capacity days">
                <InputNumber min={0} step={0.5} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="range" label="Start / end (optional)">
            <RangePicker style={{ width: '100%' }} allowEmpty={[true, true]} />
          </Form.Item>
          <Form.Item name="is_active" label="Active" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Drawer>
    </>
  );
}
