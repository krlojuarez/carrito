'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Avatar, Button, Dropdown, Grid, Layout, Menu, Tag, Typography } from 'antd';
import {
  ApartmentOutlined,
  AppstoreOutlined,
  BarChartOutlined,
  CalendarOutlined,
  DashboardOutlined,
  LineChartOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SettingOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import type { Profile } from '@/lib/auth/getProfile';
import type { Branding } from '@/lib/types/domain';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

interface NavItem {
  key: string;
  href: string;
  label: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
}

const NAV: NavItem[] = [
  { key: '/dashboard', href: '/dashboard', label: 'Dashboard', icon: <DashboardOutlined /> },
  { key: '/sprints', href: '/sprints', label: 'Sprints', icon: <AppstoreOutlined /> },
  { key: '/backlog', href: '/backlog', label: 'Backlog', icon: <ApartmentOutlined /> },
  { key: '/calendar', href: '/calendar', label: 'Calendar & PTO', icon: <CalendarOutlined /> },
  { key: '/metrics', href: '/metrics', label: 'Scrum Metrics', icon: <LineChartOutlined /> },
  { key: '/reports', href: '/reports', label: 'Reports', icon: <BarChartOutlined /> },
  { key: '/admin', href: '/admin/team', label: 'Admin', icon: <SettingOutlined />, adminOnly: true },
];

export default function AppShell({
  profile,
  brand,
  children,
}: {
  profile: Profile;
  brand: Branding;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const screens = Grid.useBreakpoint();
  const [collapsed, setCollapsed] = useState(false);

  const items = NAV.filter((n) => !n.adminOnly || profile.role === 'admin').map((n) => ({
    key: n.key,
    icon: n.icon,
    label: <Link href={n.href}>{n.label}</Link>,
  }));

  const selected = NAV.filter((n) => pathname.startsWith(n.key)).map((n) => n.key);

  const userMenu = {
    items: [
      { key: 'role', disabled: true, label: <Text type="secondary">{profile.email}</Text> },
      { type: 'divider' as const },
      {
        key: 'signout',
        icon: <LogoutOutlined />,
        label: (
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              style={{ all: 'unset', cursor: 'pointer', width: '100%' }}
            >
              Sign out
            </button>
          </form>
        ),
      },
    ],
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        theme="dark"
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        breakpoint="lg"
        collapsedWidth={screens.md ? 80 : 0}
        trigger={null}
        width={230}
      >
        <div
          style={{
            height: 56,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '0 16px',
            color: '#fff',
            fontWeight: 700,
            fontSize: 18,
            overflow: 'hidden',
            whiteSpace: 'nowrap',
          }}
        >
          {brand.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logoUrl} alt="logo" style={{ height: 28 }} />
          ) : (
            <span>🛒</span>
          )}
          {!collapsed && <span>{brand.companyName || 'Carrito'}</span>}
        </div>
        <Menu theme="dark" mode="inline" selectedKeys={selected} items={items} />
      </Sider>

      <Layout>
        <Header
          style={{
            padding: '0 16px',
            background: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #f0f0f0',
            position: 'sticky',
            top: 0,
            zIndex: 10,
          }}
        >
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed((c) => !c)}
          />
          <Dropdown menu={userMenu} placement="bottomRight" trigger={['click']}>
            <Button type="text" style={{ height: 'auto', padding: 6 }}>
              <Avatar size="small" icon={<UserOutlined />} style={{ marginRight: 8 }} />
              {screens.sm && (
                <>
                  <span style={{ marginRight: 8 }}>{profile.full_name || profile.email}</span>
                  <Tag color={profile.role === 'admin' ? 'gold' : 'blue'} style={{ marginRight: 0 }}>
                    {profile.role}
                  </Tag>
                </>
              )}
            </Button>
          </Dropdown>
        </Header>

        <Content style={{ margin: 0, padding: screens.md ? 24 : 12, background: '#f5f6f8' }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  );
}
