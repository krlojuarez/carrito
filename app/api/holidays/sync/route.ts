import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/getProfile';
import { getMembers, getPrimaryTeam, getSprints } from '@/lib/data/queries';
import { SYNC_SOURCE, planHolidaySync } from '@/lib/capacity/holidaySync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

/**
 * Refresh the public-holiday rows in public.holidays for every country the team
 * actually has members in, across the years the team's sprints span.
 *
 * Replaces only rows this sync owns (is_manual = false, source = 'date-holidays').
 * Company holidays entered by an admin (is_manual = true) are left alone.
 *
 * Writes go through the caller's session, so RLS still enforces admin-only.
 */
export async function POST() {
  const profile = await getProfile();
  if (!profile) return json({ error: 'Not signed in' }, 401);
  if (profile.role !== 'admin') return json({ error: 'Admins only' }, 403);

  const team = await getPrimaryTeam();
  if (!team) return json({ error: 'No team yet' }, 400);

  const [members, sprints] = await Promise.all([getMembers(team.id), getSprints(team.id)]);

  const plan = planHolidaySync(members, sprints);
  if (!plan.countries.length) {
    return json({
      synced: 0,
      countries: [],
      years: plan.years,
      message: 'No member has a country set, so there are no public holidays to sync.',
    });
  }
  if (!plan.window) return json({ error: 'Could not determine a year range' }, 400);

  const supabase = await createClient();
  const countryCodes = plan.countries.map((c) => c.country);

  const { error: deleteError } = await supabase
    .from('holidays')
    .delete()
    .eq('is_manual', false)
    .eq('source', SYNC_SOURCE)
    .in('country_code', countryCodes)
    .gte('holiday_date', plan.window.start)
    .lte('holiday_date', plan.window.end);
  if (deleteError) return json({ error: `Could not clear old holidays: ${deleteError.message}` }, 500);

  let inserted = 0;
  const CHUNK = 500;
  for (let i = 0; i < plan.rows.length; i += CHUNK) {
    const slice = plan.rows.slice(i, i + CHUNK);
    const { error } = await supabase.from('holidays').insert(slice);
    if (error) return json({ error: `Could not write holidays: ${error.message}` }, 500);
    inserted += slice.length;
  }

  return json({
    synced: inserted,
    countries: countryCodes,
    years: plan.years,
    window: plan.window,
  });
}
