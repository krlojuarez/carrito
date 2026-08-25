import { redirect } from 'next/navigation';
import { getProfile, type Profile } from './getProfile';

export async function requireUser(): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect('/login');
  return profile;
}

export async function requireAdmin(): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect('/login');
  if (profile.role !== 'admin') redirect('/dashboard');
  return profile;
}
