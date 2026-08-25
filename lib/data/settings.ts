import { createClient } from '@/lib/supabase/server';
import { DEFAULT_BRANDING, type Branding, type Settings } from '@/lib/types/domain';

/** Fetch the global settings row (team_id is null). Returns null if not present. */
export async function getGlobalSettings(): Promise<Settings | null> {
  const supabase = await createClient();
  const { data } = await supabase.from('settings').select('*').is('team_id', null).maybeSingle();
  return (data as Settings) ?? null;
}

export function settingsToBranding(s: Settings | null): Branding {
  if (!s) return DEFAULT_BRANDING;
  return {
    companyName: s.company_name ?? DEFAULT_BRANDING.companyName,
    logoUrl: s.logo_url ?? null,
    primaryColor: s.brand_primary_color ?? DEFAULT_BRANDING.primaryColor,
    secondaryColor: s.brand_secondary_color ?? DEFAULT_BRANDING.secondaryColor,
  };
}

/** Branding for the root layout. Never throws (DB may be unmigrated on first boot). */
export async function getBranding(): Promise<Branding> {
  try {
    const s = await getGlobalSettings();
    return settingsToBranding(s);
  } catch {
    return DEFAULT_BRANDING;
  }
}
