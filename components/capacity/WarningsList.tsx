'use client';

import { Alert, Empty, Space } from 'antd';
import type { Severity, Warning } from '@/lib/capacity/types';

const typeFor: Record<Severity, 'info' | 'warning' | 'error'> = {
  info: 'info',
  warning: 'warning',
  critical: 'error',
};

export default function WarningsList({ warnings }: { warnings: Warning[] }) {
  if (!warnings.length) {
    return <Alert type="success" showIcon message="No capacity warnings for this sprint." />;
  }
  const sorted = [...warnings].sort((a, b) => sev(b.severity) - sev(a.severity));
  return (
    <Space direction="vertical" style={{ width: '100%' }} size={8}>
      {sorted.map((w, i) => (
        <Alert key={`${w.code}-${i}`} type={typeFor[w.severity]} showIcon message={w.message} />
      ))}
    </Space>
  );
}

function sev(s: Severity): number {
  return s === 'critical' ? 2 : s === 'warning' ? 1 : 0;
}

export function NoData({ text }: { text: string }) {
  return <Empty description={text} style={{ padding: 32 }} />;
}
