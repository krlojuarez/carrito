import { renderToBuffer } from '@react-pdf/renderer';
import { getBranding } from '@/lib/data/settings';
import { getPrimaryTeam, getSprints, getStories } from '@/lib/data/queries';
import { aggregateBySprint } from '@/lib/data/aggregate';
import { buildReport } from '@/lib/pdf/reportDocument';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let body: { sprintId?: string; all?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const generatedAt = new Date().toISOString().slice(0, 19).replace('T', ' ') + ' UTC';

  const branding = await getBranding();
  const team = await getPrimaryTeam();

  let aggregates: ReturnType<typeof aggregateBySprint> = [];

  if (team) {
    const [sprints, stories] = await Promise.all([
      getSprints(team.id),
      getStories(team.id),
    ]);
    let allAggregates = aggregateBySprint(sprints, stories);
    if (body.sprintId && !body.all) {
      allAggregates = allAggregates.filter((a) => a.sprintId === body.sprintId);
    }
    aggregates = allAggregates;
  }

  let buffer: Buffer;
  try {
    buffer = await renderToBuffer(buildReport({ branding, aggregates, generatedAt }));
  } catch {
    // A bad/unreachable logo URL can make react-pdf reject. Retry without the logo
    // so the export degrades gracefully instead of 500ing the whole request.
    try {
      buffer = await renderToBuffer(
        buildReport({ branding: { ...branding, logoUrl: null }, aggregates, generatedAt }),
      );
    } catch (e) {
      return new Response(
        JSON.stringify({ error: e instanceof Error ? e.message : 'PDF generation failed' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }
  }

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="carrito-report.pdf"',
      'Cache-Control': 'no-store',
    },
  });
}
