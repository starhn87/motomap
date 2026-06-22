---
description: production iOS 빌드 후 TestFlight submit
---
production iOS 빌드를 만들고 TestFlight에 올린다.

먼저 정말 새 빌드가 필요한지 확인한다 — 네이티브 모듈/플러그인/`app.config.js`(권한·expo-updates 설정 등) 변경이 없으면 `/ota`로 충분하다.

1. `set -a; . ./.env; set +a` 로 env 주입 (안 하면 `app.config.js` 평가에서 KAKAO 키 등이 비어 실패).
2. `eas build -p ios --profile production` — 시간이 걸리므로 백그라운드로 실행하고 진행 상황을 알린다.
3. 빌드 완료 후 빌드 ID로 `eas submit -p ios --id <buildId> --profile production` (ASC API key는 EAS 서버에 등록돼 있어 `--non-interactive` 가능).
4. Apple 처리(5~10분) 후 TestFlight에 뜨면 설치하라고 안내. 이후 JS 변경은 다시 `/ota`로 나간다.
