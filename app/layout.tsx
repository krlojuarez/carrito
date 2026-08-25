import type { Metadata } from 'next';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import ThemeProvider from '@/components/providers/ThemeProvider';
import { getBranding } from '@/lib/data/settings';
import './globals.css';

export const metadata: Metadata = {
  title: 'Carrito — Sprint Capacity Planning',
  description: 'Capacity planning and carry-over tracking for the Salesforce Platform support team.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const brand = await getBranding();
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <AntdRegistry>
          <ThemeProvider brand={brand}>{children}</ThemeProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
