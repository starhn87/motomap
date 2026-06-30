# RideMap 안드로이드 출시 가이드

iOS는 출시 완료. 이 문서는 **안드로이드(Google Play) 출시** 절차를 단계별로 정리한다.
코드·설정은 [app.config.js](../app.config.js)·[eas.json](../eas.json)에 이미 안드로이드 대응(`android.package`,
위치·포그라운드 서비스 권한, 네이버 Maven, 카카오 android 옵션)이 들어가 있다. 남은 일은
**빌드 → 외부 콘솔 등록 → Play 심사**다.

> ⚠️ 두 개의 핵심 관문 — (1) 네이버·카카오 콘솔에 **android 키해시/패키지 등록**(안 하면 빌드돼도
> 지도·내비가 안 뜸), (2) **백그라운드 위치 권한** Play 추가 심사. 둘 다 아래 단계에 있다.

---

## 0. 사전 준비물

- **Google Play 개발자 계정** (최초 $25 등록비)
- EAS 계정 (이미 사용 중)
- 네이버 클라우드 플랫폼 콘솔 (Maps Application — iOS용이 이미 있을 것)
- 카카오 개발자 콘솔 (iOS 플랫폼이 이미 등록돼 있을 것)

## 1. 안드로이드 빌드 + keystore 생성

```bash
set -a; . ./.env; set +a
eas build -p android --profile preview    # 내부 테스트용 apk
```

- 첫 빌드 시 EAS가 **release keystore를 자동 생성·보관**한다(로컬 분실 위험 없음).
- `preview` 프로필은 `internal` 배포 → apk 다운로드 링크 제공.

## 2. keystore 지문(SHA-1) / 키해시 확보

네이버·카카오 콘솔 등록에 필요하다.

```bash
eas credentials -p android      # Keystore → SHA-1 Fingerprint 확인
```

- 카카오는 **키 해시(base64)** 형식을 요구한다. SHA-1(hex, 콜론 제거)을 변환:
  ```bash
  echo <SHA1_HEX_콜론제거> | xxd -r -p | openssl base64
  ```

## 3. 네이버 지도 — android 앱 등록

- 네이버 클라우드 플랫폼 > Services > **Maps** > 기존 Application(또는 신규) > **Android 추가**
- **패키지 이름**: `com.ridemap.app`
- 클라이언트 ID는 iOS와 공유(`NAVER_MAP_CLIENT_ID`). NCP Maps는 보통 패키지명 기반 인증.
- ⚠️ 등록 누락 시 안드로이드에서 **지도가 빈/회색 화면**으로 뜬다.

## 4. 카카오 — android 플랫폼 등록

- developers.kakao.com > 내 앱 > **플랫폼 > Android 등록**
- 패키지명: `com.ridemap.app`, 마켓 URL, **키 해시**(2단계 값) 등록
- ⚠️ 키해시 누락 시 카카오내비 실행/카카오 로그인 실패.

## 5. 실기기 테스트 체크리스트

preview apk를 안드로이드 기기에 설치 후:

- [ ] 지도 표시 + 마커 + 카메라 이동
- [ ] 위치 권한 허용 → 내 위치 표시
- [ ] 주행 기록: 시작 → **백그라운드(화면 잠금) → 이동 → 종료 → 저장** (A1 백그라운드 영속 검증 겸)
- [ ] 포그라운드 서비스 알림("RideMap 주행 기록 중") 표시
- [ ] 외부 내비 딥링크(카카오내비/T맵 설치 시)
- [ ] 카카오 로그인(사용하는 경우)
- [ ] 리뷰 사진 첨부

## 6. Google Play Console — 앱 생성 + 등록정보

- play.google.com/console > 앱 만들기 (RideMap, 무료)
- **스토어 등록정보**: 짧은/긴 설명([app-store-listing.md](app-store-listing.md) 재활용),
  폰 스크린샷(iOS와 비율이 다르면 재캡처 — `.maestro` 플로우 활용 가능), 아이콘(512×512),
  피처 그래픽(1024×500)

## 7. 데이터 안전(Data safety) 양식

수집 항목 선언:
- **위치**(정밀 + 백그라운드), **사진/동영상**, **이메일·계정**, **사용자 콘텐츠**(리뷰·제보)
- 전송 중 암호화, 사용자 **삭제 요청 가능**(앱 내 계정 탈퇴 기능 있음 — `delete_my_account`)

## 8. ⚠️ 백그라운드 위치 권한 선언 (핵심 관문)

`ACCESS_BACKGROUND_LOCATION` 사용 앱은 Play 추가 심사를 받는다.

- 앱 콘텐츠 > 권한 > **백그라운드 위치 선언**
- **핵심 기능 사유**: "주행 경로 GPS 기록 — 화면이 꺼지거나 내비 앱을 함께 써도 끊김 없이 기록"
- **시연 영상**(백그라운드에서 주행 기록이 동작하는 화면)이 요구될 수 있음
- 출시 지연의 가장 흔한 원인 → 미리 준비할 것

## 9. production 빌드(aab) + 제출

```bash
set -a; . ./.env; set +a
eas build  -p android --profile production           # aab 생성
eas submit -p android --profile production --latest  # Play 업로드
```

- `eas.json`의 `submit.production.android`: `track: internal`(처음엔 내부 테스트) → 검증 후
  Play Console에서 production 트랙으로 승급.
- **service account**: Google Cloud(Play Console 연결 프로젝트)에서 서비스 계정 JSON 발급 →
  `eas credentials`로 EAS에 등록(iOS의 ASC API key와 동일 패턴, `--non-interactive` 가능).
  로컬 파일로 쓸 경우 `eas.json`에 `serviceAccountKeyPath`를 추가하고 **반드시 `.gitignore`** 처리.

## 10. 버전 · OTA 정합

- `version`은 iOS와 공유(`1.1.0`). android `versionCode`는 EAS `appVersionSource: remote` +
  `autoIncrement`가 자동 관리.
- OTA는 같은 `production` 채널. 단 expo-updates 포함 빌드를 설치한 뒤부터 적용.
- 출시 후 JS 변경 배포는 **iOS와 별도로 platform 지정**:
  ```bash
  eas update --channel production --platform android --message "..."
  ```

---

참고: iOS 출시 자료 — [app-store-submission.md](app-store-submission.md) · [submission-checklist.md](submission-checklist.md)
