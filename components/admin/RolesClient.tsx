'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  App,
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Space,
  Table,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '@/components/common/PageHeader';
import { createClient } from '@/lib/supabase/client';
import type { Role, Seniority } from '@/lib/types/domain';

type Kind = 'role' | 'seniority';

interface EditorState {
  kind: Kind;
  editing: Role | Seniority | null;
}

export default function RolesClient({
  roles,
  seniorities,
}: {
  roles: Role[];
  seniorities: Seniority[];
}) {
  const router = useRouter();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [editor, setEditor] = useState<EditorState | null>(null);

  function openEditor(kind: Kind, editing: Role | Seniority | null) {
    setEditor({ kind, editing });
    if (editing) {
      form.setFieldsValue(editing);
    } else {
      form.resetFields();
      form.setFieldsValue({ sort_order: 0, ...(kind === 'seniority' ? { focus_modifier: 1 } : {}) });
    }
  }

  async function onSave(values: Record<string, unknown>) {
    if (!editor) return;
    setSaving(true);
    const supabase = createClient();
    const table = editor.kind === 'role' ? 'roles' : 'seniorities';
    const payload: Record<string, unknown> =
      editor.kind === 'role'
        ? {
            name: values.name,
            description: (values.description as string) || null,
            sort_order: values.sort_order ?? 0,
          }
        : {
            name: values.name,
            focus_modifier: values.focus_modifier ?? 1,
            sort_order: values.sort_order ?? 0,
          };
    try {
      if (editor.editing) {
        const { error } = await supabase.from(table).update(payload).eq('id', editor.editing.id);
        if (error) throw error;
        message.success('Saved');
      } else {
        const { error } = await supabase.from(table).insert(payload);
        if (error) throw error;
        message.success('Created');
      }
      setEditor(null);
      router.refresh();
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(kind: Kind, id: string) {
    const supabase = createClient();
    const table = kind === 'role' ? 'roles' : 'seniorities';
    try {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
      message.success('Deleted');
      router.refresh();
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Could not delete');
    }
  }

  const roleColumns: ColumnsType<Role> = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      render: (v: string | null) => v ?? '—',
    },
    { title: 'Sort', dataIndex: 'sort_order', key: 'sort_order', width: 80 },
    {
      title: 'Actions',
      key: 'actions',
      width: 160,
      render: (_, r) => (
        <Space>
          <Button size="small" onClick={() => openEditor('role', r)}>
            Edit
          </Button>
          <Popconfirm
            title="Delete this role?"
            okText="Delete"
            okButtonProps={{ danger: true }}
            onConfirm={() => onDelete('role', r.id)}
          >
            <Button size="small" danger>
              Delete
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const seniorityColumns: ColumnsType<Seniority> = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Focus modifier', dataIndex: 'focus_modifier', key: 'focus_modifier' },
    { title: 'Sort', dataIndex: 'sort_order', key: 'sort_order', width: 80 },
    {
      title: 'Actions',
      key: 'actions',
      width: 160,
      render: (_, s) => (
        <Space>
          <Button size="small" onClick={() => openEditor('seniority', s)}>
            Edit
          </Button>
          <Popconfirm
            title="Delete this seniority?"
            okText="Delete"
            okButtonProps={{ danger: true }}
            onConfirm={() => onDelete('seniority', s.id)}
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
      <PageHeader title="Roles & seniorities" subtitle="Lookups used to model member capacity" />

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card
            title="Roles"
            extra={
              <Button
                type="primary"
                size="small"
                icon={<PlusOutlined />}
                onClick={() => openEditor('role', null)}
              >
                Add role
              </Button>
            }
          >
            <Table<Role>
              rowKey="id"
              columns={roleColumns}
              dataSource={roles}
              scroll={{ x: 'max-content' }}
              pagination={{ pageSize: 10, hideOnSinglePage: true }}
            />
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card
            title="Seniorities"
            extra={
              <Button
                type="primary"
                size="small"
                icon={<PlusOutlined />}
                onClick={() => openEditor('seniority', null)}
              >
                Add seniority
              </Button>
            }
          >
            <Table<Seniority>
              rowKey="id"
              columns={seniorityColumns}
              dataSource={seniorities}
              scroll={{ x: 'max-content' }}
              pagination={{ pageSize: 10, hideOnSinglePage: true }}
            />
          </Card>
        </Col>
      </Row>

      <Modal
        title={
          editor
            ? `${editor.editing ? 'Edit' : 'Add'} ${editor.kind === 'role' ? 'role' : 'seniority'}`
            : ''
        }
        open={!!editor}
        onCancel={() => setEditor(null)}
        onOk={() => form.submit()}
        confirmLoading={saving}
        okText="Save"
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={onSave} requiredMark={false} preserve={false}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input placeholder={editor?.kind === 'role' ? 'Backend Engineer' : 'Senior'} />
          </Form.Item>
          {editor?.kind === 'role' ? (
            <Form.Item name="description" label="Description">
              <Input.TextArea rows={2} placeholder="Optional description" />
            </Form.Item>
          ) : (
            <Form.Item
              name="focus_modifier"
              label="Focus modifier"
              tooltip="Multiplier applied to focus factor (e.g. 1.1 for senior)"
              rules={[{ required: true }]}
            >
              <InputNumber min={0} step={0.05} style={{ width: '100%' }} />
            </Form.Item>
          )}
          <Form.Item name="sort_order" label="Sort order">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
