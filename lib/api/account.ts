import { supabase } from '@/lib/supabase';
import { clearRecentLoginProvider } from '@/lib/recentLogin';

export async function discardIncompleteOnboardingAccount(): Promise<void> {
  const { error } = await supabase.functions.invoke('discard-onboarding-account');
  if (error) throw error;
}

export async function deleteAccount(): Promise<void> {
  const { error } = await supabase.functions.invoke('delete-account');
  if (error) throw error;
  await supabase.auth.signOut();
  await clearRecentLoginProvider();
}
