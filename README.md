# 🏍️ 모토맵

> 바이커(오토바이 라이더) 전용 지도 · 라이딩 기록 · 커뮤니티 앱

[![Download on the App Store](https://img.shields.io/badge/Download_on_the-App_Store-0D96F6?style=flat-square&logo=apple&logoColor=white)](https://apps.apple.com/app/id6773636183)
![Platform](https://img.shields.io/badge/platform-iOS-lightgrey?style=flat-square)
![Expo SDK](https://img.shields.io/badge/Expo_SDK-54-000020?style=flat-square&logo=expo&logoColor=white)
![React Native](https://img.shields.io/badge/React_Native-0.81-61DAFB?style=flat-square&logo=react&logoColor=black)

라이딩 맛집·카페·뷰포인트·주유소·정비소를 지도에서 찾고, 리뷰·평점·코스 공유로 라이더끼리 정보를 나눕니다. **App Store 정식 출시.**

## 📱 스크린샷

| 지도 · 장소 탐색 | 라이딩 코스 | 코스 상세 |
|:---:|:---:|:---:|
| <img src="https://raw.githubusercontent.com/starhn87/ridemap/main/docs/screenshots/01-map.png" width="240"/> | <img src="https://raw.githubusercontent.com/starhn87/ridemap/main/docs/screenshots/02-courses.png" width="240"/> | <img src="https://raw.githubusercontent.com/starhn87/ridemap/main/docs/screenshots/03-course-detail.png" width="240"/> |
| **장소 상세** | **장소 검색** | **마이 페이지** |
| <img src="https://raw.githubusercontent.com/starhn87/ridemap/main/docs/screenshots/04-place-detail.png" width="240"/> | <img src="https://raw.githubusercontent.com/starhn87/ridemap/main/docs/screenshots/05-search.png" width="240"/> | <img src="https://raw.githubusercontent.com/starhn87/ridemap/main/docs/screenshots/06-profile.png" width="240"/> |

## ✨ 주요 기능

- 🗺️ **지도 + POI**: 네이버지도 기반 바이커 장소 탐색 (카페, 맛집, 휴게소, 주유소, 정비소, 뷰포인트, 용품점)
- 📍 **장소 제보**: 크라우드소싱으로 장소 추가 (사진 포함, 관리자 승인)
- ⭐ **리뷰·평점**: 장소/코스 리뷰, 사진 첨부, 수정·삭제
- 🛣️ **라이딩 코스**: 추천 코스 목록 + 경로 미리보기 + 상세
- 🧭 **외부 네비 연동**: 카카오내비(이륜차 모드), T맵, 네이버지도, Apple 지도 딥링크
- 🛡️ **커뮤니티 위생**: 신고/차단, 회원 탈퇴

## 🧰 기술 스택

| 영역 | 사용 |
| --- | --- |
| 앱 | React Native 0.81 / Expo SDK 54 / TypeScript |
| 라우팅 | expo-router (typed routes) |
| 지도 | @mj-studio/react-native-naver-map |
| 위치 | expo-location (현재 위치 표시) |
| 푸시 | expo-notifications + Expo Push (제보 승인 알림) |
| 인증·DB·스토리지 | Supabase (Postgres + PostGIS + RLS) |
| 상태/데이터 | Zustand, @tanstack/react-query |
| 소셜 | @react-native-kakao/core, navi |
| 모니터링 | Sentry |
| 배포 | EAS Build + Submit |

## 📂 프로젝트 구조

```
app/                  expo-router 파일 기반 라우팅
  (tabs)/             탭 (index 지도 · courses 탐색 · submit 제보 · profile 마이)
  course/[id].tsx     코스 상세
  legal/[type].tsx    약관·정책 뷰어
  settings.tsx        설정
components/            재사용 UI (map, review, submit, auth, ...)
lib/                  Supabase 클라이언트 · API 래퍼 · 유틸
  api/                places, courses, reviews, reports, blocks, ...
hooks/                React Query 훅 (useCourses, useFavorites, useBlocks, ...)
stores/               Zustand (auth, theme, navPref, map)
constants/            Colors, categories, 문서
supabase/migrations/  스키마 마이그레이션 (001 신고·차단 · 002 탈퇴 · 004 용품점 카테고리)
```

> 🧭 **코드 레벨 아키텍처**(레이어·데이터 흐름·상태·DB 스키마)는 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) 참조.

## 🚀 개발 환경 설정

```bash
# 1. 의존성 설치
npm install

# 2. 환경 변수
cp .env.example .env
# .env 에 Supabase / 네이버 / 카카오 키 입력

# 3. Supabase 마이그레이션 실행
# Supabase 대시보드 > SQL Editor 에서 supabase/migrations/*.sql 을 순서대로 실행 (001 → 002 → 003)

# 4. 개발 빌드 실행 (네이티브 모듈이 있어 Expo Go 불가, dev client 필요)
npm run ios
npm run android
```

> ⚠️ 네이버 지도·카카오 등 네이티브 모듈을 사용하므로 **Expo Go로는 실행되지 않습니다.** `npm run ios`/`android`(로컬 dev client) 또는 EAS development 빌드를 사용하세요.

## 🔑 환경 변수

| 변수 | 설명 |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon 키 |
| `NAVER_MAP_CLIENT_ID` | 네이버지도 SDK 클라이언트 ID |
| `EXPO_PUBLIC_NAVER_CLIENT_ID` | 네이버 Directions API 클라이언트 ID |
| `EXPO_PUBLIC_NAVER_CLIENT_SECRET` | 네이버 Directions API 시크릿 |
| `KAKAO_NATIVE_APP_KEY` | 카카오 네이티브 앱 키 |
| `EXPO_PUBLIC_SENTRY_DSN` | Sentry DSN (선택) |
| `SUPABASE_SERVICE_ROLE_KEY` | 시드 스크립트 전용 (선택) |

> 로컬 EAS 명령(`eas build`/`submit`)은 `.env`를 자동 로드하지 않으므로, 클라우드 빌드용 키는 EAS 환경 변수에 등록되어 있습니다 (`eas env:list --environment production`).

## 📦 빌드 & 배포 (EAS)

```bash
# 최초 1회
npx eas login

# 빌드
npx eas build --profile development --platform ios     # dev client (실기기 디버깅)
npx eas build --profile production  --platform ios     # 스토어 / TestFlight 제출용

# 스토어 제출 (App Store Connect API Key 사용 → 보안 지연 없이 비인터랙티브)
npx eas submit --profile production --platform ios --latest
```

> ⚠️ 이미 App Store에 출시된 버전 위에 새 빌드를 올릴 때는 **`app.config.js`의 `version`을 반드시 상향**해야 합니다 (동일 버전은 `ITMS-90186` train closed 로 거부). 빌드 번호는 production 프로파일의 `autoIncrement`가 처리합니다.
