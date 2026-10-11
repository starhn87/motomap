# 내부 실기기 UI 반복 측정

> 2026-10-11: 출시 우선으로 추가 실행 보류(PERF-006). 검색 전후 각 3블록과 사진 smoke는
> 통과했다. `photo` 연속 trace/PID 연결·회복 export는 미완료이며 검증된 수집 절차로
> 간주하지 않는다. 사용자가 성능 작업 재개를 요청하기 전에는 실행하지 않는다.

2026-10-11 후속: 사용자가 출시 실기기 검증을 승인했다. 기존 승인된 XCTest 러너로
`testPhotoGestureSmoke`, `testReleaseWeatherToggle`, `testReleaseProfileSettingsReadOnly`,
`testReleaseColdWarmPlaceLink`, `testReleaseUniversalPlaceLink`만
선택해 기능 smoke를 실행할 수 있다. 이 다섯 테스트는 measure/CPU/메모리/trace와 계정·리뷰·
즐겨찾기 변경을 실행하지 않는다. 성능 시나리오 `photo`/`search`의 보류는 그대로다.
`test-without-building`은 위 다섯 `-only-testing:MotoMapProfile/MotoMapProfile/<함수명>`을
명시하고 `-parallel-testing-enabled NO -collect-test-diagnostics never`로 실행한다.
성능 테스트가 함께 실행되는 전체 suite 명령은 쓰지 않는다. 최초 실행은 UI 자동화 활성화
시간 초과로 테스트 시작 전에 실패했으므로 기능 실패나 성능 결과로 집계하지 않는다.
UI 자동화 허용은 사용자만 기기에서 확인하며 원본 xcresult는 저장소 밖에 유지한다.

사용자가 승인한 Xcode 기본 XCTest 러너다. 이미 설치된 `com.ridemap.app`을 제어하며,
별도 `com.ridemap.app.perf-uitests.xctrunner`만 자동 서명·설치한다. 앱 데이터·캐시를
지우거나 DB/공급자/운영 상태를 바꾸지 않는다. Git/EAS/OTA 배포 명령은 없다.

## 준비와 실행

- Xcode와 기기 Developer Mode·개발 서명·테스트 러너 설치/실행 승인이 필요하다.
- 아이폰의 최초 `Enable UI Automation` 암호 확인은 사용자가 직접 한다. 암호를 수집하지 않는다.
- 기존 CocoaPods의 `xcodeproj` Ruby gem을 재사용한다. 새 테스트 프레임워크/패키지는 설치하지 않는다.
- 화면 전송 창은 종료하고 동일 케이블·Wi-Fi·저전력 모드·열 상태로 비교한다.
- 원본 xcresult/trace에는 화면·기기 정보가 포함되므로 출력은 **새 저장소 밖 디렉터리**만 허용한다.

```sh
PYTHONDONTWRITEBYTECODE=1 python3 scripts/ios-ui-profile/run.py \
  --device "$MOTOMAP_DEVICE_ID" --team "$MOTOMAP_TEAM_ID" \
  --output /tmp/motomap-photo-new --scenario photo --blocks 3 \
  --ruby "$MOTOMAP_RUBY" --gem-home "$MOTOMAP_COCOAPODS_GEMS"
PYTHONDONTWRITEBYTECODE=1 python3 tests/test_ios_ui_profile.py
```

`--scenario smoke`는 사진 제스처 1회 검증, `search`는 검색 대기, `photo`는 사진 연속 반복이다.
실패하면 다음 블록으로 넘어가지 않는다. 앱 삭제·캐시 초기화로 실패를 우회하지 않는다.
첫 시작은 앱 프로세스만 종료 후 다시 실행한다. 외부에서 이미 실행된 앱은 XCTest 접근성
연결에 실패한 경험이 있어 `activate`+URL로 기존 프로세스를 재활용하지 않는다.

## 측정 의미

- 공개 장소 `다산생태공원`의 기존 사진 4장을 이용한다. 테스트 데이터·리뷰를 만들지 않는다.
  사진이 사라지거나 3장 미만이면 fixture 실패로 중단한다.
- 실제 접근성 버튼으로 검색·선택·확장·사진 열기를 수행한다. 1→2장 이동, 확대 중 pan 시
  2장 유지, 축소 후 3장 이동, X로 닫기를 assert한다. 시트 자체 그룹화는 MAP-038에 따른다.
- `photo`: XCTest 10개 유효 측정 + 도구가 제외하는 준비 1회 = **실제 11회 조작/블록**.
  CPU time·physical memory peak·physical memory 변화·wall clock을 앱 대상으로 기록한다.
  10번이라는 보고가 실제 조작 수와 같다고 주장하지 않는다.
- `search`: 20초 대기 3개 유효 측정 + 준비 1회 = **80초 대기/블록**.
  키보드·검색 입력 화면 존재를 확인하고 측정한다. 화면 로드/키보드 시간은 측정 대상 밖이다.
- 사진은 실제 앱 PID에 Activity Monitor를 붙여 반복과 마지막 30초·120초 회복 구간을 함께
  기록한다. 블록 중 앱을 재시작하지 않는다. 표본은 `scripts/profile-ios.py`의 모토맵 필터로
  검증하고 종료 marker를 기준으로 분석한다. PID·marker 원문은 공개 집계에 포함하지 않는다.
- XCTest `Memory Physical`은 **구간 종료-시작 변화**이며 절대 footprint가 아니다. `CPU Time`
  역시 CPU 사용률과 다르다. 명시된 단위·구간을 유지하고 서로 다른 계측의 수치를 섞지 않는다.
- warm cache·준비 반복·자동화 부하가 있는 표본이다. 시작 30초 launch trace나 수동 사진
  기록을 대조군으로 재사용하지 않는다. 한 기기의 짧은 반복으로 장시간 누수/배터리를 확정하지 않는다.

`summary.json`은 기기·경로·화면 정보를 제거한 메트릭이다. 저장소에는 검토한 집계와 한계만
보고하고 원본 로그·프로필·스크린샷·xcresult·trace를 커밋하지 않는다.
