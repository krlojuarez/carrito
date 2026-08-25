import { redirect } from 'next/navigation';
import { getProfile } from '@/lib/auth/getProfile';

export default async function Home() {
  const profile = await getProfile();
  redirect(profile ? '/dashboard' : '/login');
}
