'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { App, Button, Card, Form, Input, Segmented, Typography } from 'antd';
import { LockOutlined, MailOutlined, UserOutlined } from '@ant-design/icons';
import { createClient } from '@/lib/supabase/client';

const { Title, Text } = Typography;

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/dashboard';
  const { message } = App.useApp();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [loading, setLoading] = useState(false);

  async function onFinish(values: { email: string; password: string; full_name?: string }) {
    setLoading(true);
    const supabase = createClient();
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({
          email: values.email,
          password: values.password,
        });
        if (error) throw error;
        message.success('Welcome back');
        router.replace(next);
        router.refresh();
      } else {
        const { error } = await supabase.auth.signUp({
          email: values.email,
          password: values.password,
          options: { data: { full_name: values.full_name } },
        });
        if (error) throw error;
        message.success('Account created. You can sign in now.');
        setMode('signin');
      }
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card style={{ width: 400, maxWidth: '100%', boxShadow: '0 10px 40px rgba(0,0,0,0.25)' }}>
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <Title level={2} style={{ marginBottom: 0 }}>
          🛒 Carrito
        </Title>
        <Text type="secondary">Sprint capacity & carry-over planning</Text>
      </div>

      <Segmented
        block
        value={mode}
        onChange={(v) => setMode(v as 'signin' | 'signup')}
        options={[
          { label: 'Sign in', value: 'signin' },
          { label: 'Sign up', value: 'signup' },
        ]}
        style={{ marginBottom: 16 }}
      />

      <Form layout="vertical" onFinish={onFinish} requiredMark={false}>
        {mode === 'signup' && (
          <Form.Item name="full_name" label="Full name" rules={[{ required: true }]}>
            <Input prefix={<UserOutlined />} placeholder="Jane Doe" size="large" />
          </Form.Item>
        )}
        <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
          <Input prefix={<MailOutlined />} placeholder="you@company.com" size="large" autoComplete="email" />
        </Form.Item>
        <Form.Item
          name="password"
          label="Password"
          rules={[{ required: true, min: 6, message: 'At least 6 characters' }]}
        >
          <Input.Password prefix={<LockOutlined />} placeholder="••••••••" size="large" autoComplete="current-password" />
        </Form.Item>
        <Button type="primary" htmlType="submit" size="large" block loading={loading}>
          {mode === 'signin' ? 'Sign in' : 'Create account'}
        </Button>
      </Form>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<Card style={{ width: 400, maxWidth: '100%' }} loading />}>
      <LoginForm />
    </Suspense>
  );
}
