'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  ColorPicker,
  Form,
  Input,
  Row,
  Space,
  Typography,
  Upload,
} from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import type { Color } from 'antd/es/color-picker';
import type { RcFile } from 'antd/es/upload';
import PageHeader from '@/components/common/PageHeader';
import { createClient } from '@/lib/supabase/client';
import { DEFAULT_BRANDING, type Settings } from '@/lib/types/domain';

const { Text } = Typography;

function toHex(v: string | Color): string {
  return typeof v === 'string' ? v : v.toHexString();
}

export default function BrandingClient({ settings }: { settings: Settings | null }) {
  const router = useRouter();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [primary, setPrimary] = useState<string>(
    settings?.brand_primary_color ?? DEFAULT_BRANDING.primaryColor,
  );
  const [secondary, setSecondary] = useState<string>(
    settings?.brand_secondary_color ?? DEFAULT_BRANDING.secondaryColor,
  );
  const [companyName, setCompanyName] = useState<string>(
    settings?.company_name ?? DEFAULT_BRANDING.companyName ?? '',
  );
  const [logoUrl, setLogoUrl] = useState<string | null>(settings?.logo_url ?? null);

  async function handleUpload(file: RcFile): Promise<boolean> {
    setUploading(true);
    const supabase = createClient();
    try {
      const ext = file.name.split('.').pop() || 'png';
      const path = `logo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('branding')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const publicUrl = supabase.storage.from('branding').getPublicUrl(path).data.publicUrl;
      setLogoUrl(publicUrl);
      message.success('Logo uploaded. Remember to Save.');
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
    return false; // prevent antd's default upload
  }

  async function onSave() {
    setSaving(true);
    const supabase = createClient();
    const payload = {
      company_name: companyName || null,
      brand_primary_color: primary,
      brand_secondary_color: secondary,
      logo_url: logoUrl,
    };
    try {
      if (settings) {
        const { error } = await supabase.from('settings').update(payload).eq('id', settings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('settings').insert({ ...payload, team_id: null });
        if (error) throw error;
      }
      message.success('Branding saved. Changes apply after reload.');
      router.refresh();
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Could not save branding');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Branding"
        subtitle="Company name, colors and logo"
        extra={
          <Button type="primary" loading={saving} onClick={onSave}>
            Save
          </Button>
        }
      />

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Changes apply after reload."
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="Settings">
            <Form form={form} layout="vertical" requiredMark={false}>
              <Form.Item label="Company name">
                <Input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Carrito"
                />
              </Form.Item>
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item label="Primary color">
                    <ColorPicker
                      value={primary}
                      onChange={(c) => setPrimary(toHex(c))}
                      showText
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="Secondary color">
                    <ColorPicker
                      value={secondary}
                      onChange={(c) => setSecondary(toHex(c))}
                      showText
                    />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item label="Logo">
                <Upload
                  accept="image/*"
                  maxCount={1}
                  showUploadList={false}
                  beforeUpload={(file) => handleUpload(file as RcFile)}
                >
                  <Button icon={<UploadOutlined />} loading={uploading}>
                    Upload logo
                  </Button>
                </Upload>
                <div style={{ marginTop: 8 }}>
                  <Text type="secondary">Stored in the &quot;branding&quot; bucket.</Text>
                </div>
              </Form.Item>
            </Form>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="Preview">
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: 16,
                  borderRadius: 8,
                  background: primary,
                  color: '#fff',
                }}
              >
                {logoUrl ? (
                  <Image
                    src={logoUrl}
                    alt="Logo"
                    width={40}
                    height={40}
                    style={{ objectFit: 'contain', background: '#fff', borderRadius: 4 }}
                    unoptimized
                  />
                ) : (
                  <span style={{ fontSize: 24 }}>🛒</span>
                )}
                <strong style={{ fontSize: 18 }}>{companyName || 'Carrito'}</strong>
              </div>
              <Space>
                <div>
                  <div
                    style={{
                      width: 64,
                      height: 32,
                      borderRadius: 4,
                      background: primary,
                      border: '1px solid rgba(0,0,0,0.1)',
                    }}
                  />
                  <Text type="secondary">{primary}</Text>
                </div>
                <div>
                  <div
                    style={{
                      width: 64,
                      height: 32,
                      borderRadius: 4,
                      background: secondary,
                      border: '1px solid rgba(0,0,0,0.1)',
                    }}
                  />
                  <Text type="secondary">{secondary}</Text>
                </div>
              </Space>
            </Space>
          </Card>
        </Col>
      </Row>
    </>
  );
}
