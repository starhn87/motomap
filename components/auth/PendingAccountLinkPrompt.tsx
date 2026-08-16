import { useEffect, useRef } from 'react';

import { appAlert } from '@/lib/dialog';
import {
  clearPendingAccountLink,
  getPendingAccountLink,
  SOCIAL_PROVIDER_LABELS,
  socialProviderFromIdentity,
} from '@/lib/pendingAccountLink';
import { toast } from '@/lib/toast';
import { useAuthStore } from '@/stores/useAuthStore';

export default function PendingAccountLinkPrompt() {
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const shownForUser = useRef<string | null>(null);

  useEffect(() => {
    if (status !== 'signed_in' || !user || shownForUser.current === user.id) return;
    shownForUser.current = user.id;

    const timer = setTimeout(() => {
      void getPendingAccountLink().then((provider) => {
        if (!provider) return;

        const alreadyLinked = user.identities?.some(
          (identity) => socialProviderFromIdentity(identity.provider) === provider,
        );
        if (alreadyLinked) {
          void clearPendingAccountLink();
          return;
        }

        const label = SOCIAL_PROVIDER_LABELS[provider];
        appAlert(
          `${label} 로그인 연결`,
          `기존 모토맵 계정으로 로그인했습니다. 지금 ${label} 로그인을 이 계정에 연결하면 어느 방식으로 로그인해도 같은 기록을 사용합니다.`,
          [
            {
              text: '지금 연결',
              onPress: () => {
                void import('@/lib/socialAuth')
                  .then(({ linkSocialProvider }) => linkSocialProvider(provider))
                  .then(async (completed) => {
                    if (!completed) return;
                    await clearPendingAccountLink();
                    toast.success(`${label} 로그인을 연결했어요.`);
                  })
                  .catch((error) => {
                    toast.error('로그인 수단을 연결하지 못했습니다.', (error as Error).message);
                  });
              },
            },
            {
              text: '나중에',
              style: 'cancel',
              onPress: () => void clearPendingAccountLink(),
            },
          ],
        );
      });
    }, 700);

    return () => clearTimeout(timer);
  }, [status, user]);

  return null;
}
