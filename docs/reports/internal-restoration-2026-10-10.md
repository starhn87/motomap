# 1.2.8 내부 검증 정비 창

공개 운영 재개 보고서가 아니다. 운영자가 기존 환경 복구와 구버전 호출 가능성을 포함한
정비 창, 내부 채널 로컬 빌드·실기기 검증 및 preparing 상태의 제한적 웹 배포를 승인했다.
Git 푸시·TestFlight 업로드·App Store 제출/판매 재개·production OTA·재개 공지/푸시는 하지 않는다.

## 실제 운영 변경

| 대상 | 확인 결과 |
|---|---|
| production Supabase | `INACTIVE → ACTIVE_HEALTHY`. 기존 프로젝트·키·데이터를 복구함 |
| DB 버전 | Postgres 17.6 유지. DB 메이저/마이너 업그레이드를 따로 실행하지 않음 |
| 데이터 집계 | 장소 181개, 프로필 165개, 장소 도착/경유 기록 39개. 사용자 식별자·위치 원문 미조회 |
| Data API·Auth | 기존 anon 키의 장소 읽기 200, Auth 설정 조회 200 |
| 자동 작업 | AI 판정 재시도·미완료 가입 계정 정리·장소 변경 검토 3개 모두 `active=false`. 일정·정의는 보존 |
| 네이버 ridemap | Dynamic Map·Directions 5·Geocoding·Reverse Geocoding 복구. 임시 Static Map 해제. iOS/Android 식별자 유지 |
| 카카오 RideMap | 카카오맵 ON·기존 무료 쿼터 유지. 기존 네이티브 앱 키에 iOS 번들 ID·App Store ID 복구 |
| EAS 내부 채널 | `internal-testflight` 채널/빈 브랜치 생성. iOS runtime 1.2.8 업데이트 조회 204. OTA 미발행 |
| 공개 상태 | `preparing`, 최소 버전 1.2.8. production 채널은 계속 정상 앱 진입 불가 |
| 웹 | 홈·place/course/riding 공유는 503, 법률 문서·AASA는 200 |

복구 직후 정지 전 AI 판정 재시도 cron 1회가 2026-10-10 23:30 KST에 SQL 성공으로 기록됐다.
이는 AI 처리 완료를 뜻하지 않는다. 후속 확인 당시 최근 1시간의 재시도 후보와 HTTP queue는 0,
실행 중 cron은 0이었다. 계정 정리·장소 검토가 이번 정비 창에 실행된 기록은 확인되지 않았다.
정지는 `cron.alter_job(active := false)`로 수행했다. cron.job 직접 UPDATE는 권한 오류였으며
권한을 넓혀 우회하지 않았다. 자동 작업 재개는 공개 준비가 끝난 뒤 별도 승인한다.

## 제한적 Worker 배포

- 이전 실제 Worker 버전: `f1b67106-2cb6-46af-84ba-246dc3bddda1`.
- 정비 창 Worker 버전: `8f5c099f-12e2-46c4-8cde-bb3ee2f5c948`.
- 제한된 승인 범위를 지키기 위해 `origin/main`의 `5a88acc`를 별도 사본으로 만들고
  `website/src/serviceStatus.js`의 상태·상태 설명만 수정해 배포했다. 준비 중인 운영자 법률 문서
  개정과 다른 저장소 변경은 이 배포에 포함하지 않았다. 정적 자산 업로드 변화도 없었다.
- 원격 홈·세 법률 문서·AASA·세 공유 경로·상태 응답을 배포 사본과 비교해 HTTP 상태와 본문이
  일치함을 확인했다. 상태 응답과 홈·공유는 `no-store`다.
- 앱의 순수 게이트 검사에서 production preparing 차단, 내부 1.2.8 허용, 내부 1.2.7 업데이트
  유도, suspended에서 모든 채널 차단이 유지됨을 확인했다. 이 검사만으로 실기기 회귀 완료를
  선언하지 않는다.

## 네이티브 빌드 준비와 경계

- `EAS_BUILD_PROFILE=internal-testflight`만 내부 업데이트 헤더를 생성한다.
  빌드용 사본의 Expo.plist에서 `expo-channel-name=internal-testflight`를 확인했다.
- 로컬 생성은 기존 저장소의 ignored iOS 폴더가 아닌 이전 측정용 사본에서 수행했다.
  Expo prebuild가 그 사본의 ios를 재생성했으므로 Pods를 다시 설치했다. 원래 저장소 iOS와
  사용자 변경은 보존했다. 이후 설정 변경에서 기존 Pods 보존을 무조건 가정하지 않는다.
- SDK 조합은 Expo 57.0.27·RN 0.86.3·NMapsMap 3.24.0·KNSDK-UI 1.12.14·PostHog iOS 3.88.2다.
- RNCore·Hermes의 지연 다운로드는 동일한 공식 Maven URL에서 재개했고 공급자 SHA1 일치를
  확인했다. 임시 캐시 재사용 실행만 적용했으며 공용 Ruby·패키지 소스·검증 정책은 바꾸지 않았다.
- 로컬 Apple Development 서명 Release 빌드는 exit 0 / BUILD SUCCEEDED로 완료했다.
  서명 무결성, build 1·runtime 1.2.8·internal-testflight 헤더, Apple 로그인·Associated Domains·
  get-task-allow를 서명된 앱에서 확인하고 기존 앱을 삭제하지 않고 덮어 설치했다.
- 처음 실행은 기기 잠금으로 거부됐으며 사용자가 잠금을 푼 뒤 모토맵 프로세스 실행을 확인했다.
  console 연결의 결과 JSON은 연결 종료 전 과거 실패 값이 남을 수 있어 프로세스 목록과 실제
  실행 로그를 함께 대조했다. 프로세스 실행만으로 지도·로그인·길안내 성공을 선언하지 않는다.
- 네이티브 로그에 `distanvePerminWidth is 0` 진단이 1개 관측됐다. 이 문자열을 앱 크래시나
  사용자에게 노출된 오류로 단정하지 않고 화면·반복 여부와 함께 후속 확인한다.
- 실제 활성 화면·실기기 기능 회귀 및 CPU/메모리 개선 효과는 이 기록 시점에 미완료다.

## 공개 재개 전에 남은 항목

1. 실제 설치·지도·검색·장소·날씨·경로·길안내·인증과 수명주기 회귀를 검증한다.
   계정 삭제·전체 푸시 등 파괴적/외부 발송 검증은 본인 테스트 계정·대상 범위를 별도로 확정한다.
2. `public.rides`는 0행/0사용자다. 원문 좌표는 읽지 않았다. RIDE-004의 테이블·계정 삭제 참조
   제거 마이그레이션은 아직 수행하지 않았다. 장소 기록 `place_rides`는 별도 보존 대상이다.
3. 보안 advisor의 기존 경고를 공개 재개 전 검토한다. RLS 없는 PostGIS spatial_ref_sys 1개,
   search_path 경고 5개, public 확장 2개, 익명/인증 SECURITY DEFINER 접근 19/24개,
   유출 비밀번호 보호 비활성 1개가 남는다. RLS 정책 없는 11개는 내부 전용 의도를 대조한다.
   경고 개수만으로 실제 취약성을 단정하거나 모든 RPC를 일괄 폐쇄하지 않는다.
   [Advisor 안내](https://supabase.com/docs/guides/database/database-linter)
4. 이번 복구에서는 ltree/btree_gist 미설치, 비확장 사용자 정의 위험 operator 0개,
   public/private 함수의 legacy PGP cipher 설정 0개를 확인했다. 사용자 데이터 암호문 전체를
   분석한 결과는 아니다. Postgres 보안 업데이트는 별도 정비 범위로 검토한다.
5. 원격 버전 정책은 latest/recommended 1.2.6·minimum 1.2.4 그대로다. 내부 후보를 스토어
   최신 버전으로 표시하지 않았다. 법률 문서 개정 고지·심사 접근·구버전 연결 OTA·공지 멱등성은
   [재개 점검](../relaunch-readiness.md)에 따라 후속 진행한다.

## 유지·복원 절차

내부 검증 중에는 preparing·공개 웹 503·자동 작업 정지를 유지한다. 비정상 제공 또는 데이터
위험이 발견되면 상태를 suspended로 되돌리고 필요 시 공급자·DB를 다시 중단한다. App Store
판매 상태나 production 업데이트를 내부 테스트 결과만으로 열지 않는다. 실제 active 전환과
자동 작업 재개, 사용자 공지 발송은 별도 승인 후 OPS-003 순서로 한다.
