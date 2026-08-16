import { supabase } from '@/lib/supabase';
import { clearRecentLoginProvider } from '@/lib/recentLogin';

export async function deleteAccount(): Promise<void> {
  const { error } = await supabase.functions.invoke('delete-account');
  if (error) throw error;
  await supabase.auth.signOut();
  await clearRecentLoginProvider();
}
