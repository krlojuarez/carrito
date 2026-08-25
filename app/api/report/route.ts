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

  const doc = buildReport({ branding, aggregates, generatedAt });
  const buffer = await renderToBuffer(doc);

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="carrito-report.pdf"',
      'Cache-Control': 'no-store',
    },
  });
}
