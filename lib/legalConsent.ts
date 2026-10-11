import { supabase } from '@/lib/supabase';
import { LEGAL_PUBLICATION, LEGAL_RELAUNCH_READY } from '@/constants/legal';

export function currentLegalVersion(): string {
  if (!LEGAL_RELAUNCH_READY || !LEGAL_PUBLICATION.consentVersion) {
    throw new Error('약관 정비 중입니다. 잠시 후 다시 시도해 주세요.');
  }
  return LEGAL_PUBLICATION.consentVersion;
}

export async function hasCurrentLegalConsent(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const { data, error } = await supabase.rpc('has_accepted_legal_documents', {
      p_version: currentLegalVersion(),
    }).abortSignal(controller.signal);
    if (error) throw error;
    if (typeof data !== 'boolean') throw new Error('동의 상태를 확인하지 못했습니다.');
    return data;
  } finally {
    clearTimeout(timer);
  }
}

export async function acceptCurrentLegalDocuments(): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const { error } = await supabase.rpc('accept_legal_documents', {
      p_version: currentLegalVersion(),
    }).abortSignal(controller.signal);
    if (error) throw error;
  } finally {
    clearTimeout(timer);
  }
}
