import type { ThemeConfig } from 'antd';
import type { Branding } from '@/lib/types/domain';
import { DEFAULT_BRANDING } from '@/lib/types/domain';

export function brandTheme(brand: Branding, dark = false): ThemeConfig {
  return {
    cssVar: true,
    hashed: false,
    token: {
      colorPrimary: brand.primaryColor || DEFAULT_BRANDING.primaryColor,
      colorInfo: brand.primaryColor || DEFAULT_BRANDING.primaryColor,
      borderRadius: 6,
      fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
    },
    components: {
      Layout: {
        headerBg: '#ffffff',
        siderBg: '#001529',
      },
    },
    algorithm: undefined,
  } satisfies ThemeConfig;
}
