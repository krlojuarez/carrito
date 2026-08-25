'use client';

import '@ant-design/v5-patch-for-react-19';
import { ConfigProvider, App as AntdApp } from 'antd';
import enUS from 'antd/locale/en_US';
import dayjs from 'dayjs';
import 'dayjs/locale/en';
import weekday from 'dayjs/plugin/weekday';
import localeData from 'dayjs/plugin/localeData';
import isoWeek from 'dayjs/plugin/isoWeek';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import { brandTheme } from '@/lib/theme/theme';
import type { Branding } from '@/lib/types/domain';

dayjs.extend(weekday);
dayjs.extend(localeData);
dayjs.extend(isoWeek);
dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);
dayjs.locale('en');

export default function ThemeProvider({
  brand,
  children,
}: {
  brand: Branding;
  children: React.ReactNode;
}) {
  return (
    <ConfigProvider locale={enUS} theme={brandTheme(brand)}>
      <AntdApp style={{ minHeight: '100vh' }}>{children}</AntdApp>
    </ConfigProvider>
  );
}
