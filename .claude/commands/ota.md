---
description: JS 변경을 production OTA로 배포 (tsc → commit → push → eas update)
---
현재 변경사항을 production 채널 OTA로 배포한다. `$ARGUMENTS` 가 있으면 커밋 메시지 힌트로 쓴다.

1. `npx tsc --noEmit` 타입체크 (exit 0 확인). 실패하면 중단하고 보고.
2. 변경사항을 최소 논리 단위로 커밋 — 영어 conventional commit + 끝에 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
3. `git push origin main`.
4. `set -a; . ./.env; set +a` 로 env 주입 후 `eas update --channel production --platform ios --message "<커밋 요지>"`.
   - `--platform ios` 필수 (web static 번들 에러 회피).
5. update group ID와 적용 방법(앱 완전 종료 → 재실행 2번)을 보고.

주의: 네이티브/플러그인/expo-updates 설정이 바뀐 변경이면 OTA로 안 되니 `/eas-build`로 새 빌드가 필요하다.
