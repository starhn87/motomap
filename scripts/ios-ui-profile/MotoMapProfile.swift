import XCTest

// 별도 러너로 이미 설치된 앱만 조작한다. 계정·리뷰·즐겨찾기를 변경하지 않는다.
final class MotoMapProfile: XCTestCase {
    let app = XCUIApplication(bundleIdentifier: "com.ridemap.app")

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    override func tearDownWithError() throws {
        let hierarchy = XCTAttachment(string: app.debugDescription)
        hierarchy.name = "private-ui-hierarchy"
        hierarchy.lifetime = .keepAlways
        add(hierarchy)
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "private-ui-screen"
        screenshot.lifetime = .keepAlways
        add(screenshot)
    }

    func openSearch() {
        app.terminate()
        app.launch()
        let search = app.otherElements.matching(NSPredicate(format: "label CONTAINS %@", "장소, 라이딩 검색")).firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 20))
        search.tap()
    }

    func openPhotoFixture() {
        openSearch()
        let input = app.textFields["장소, 라이딩 검색"]
        XCTAssertTrue(input.waitForExistence(timeout: 15))
        input.tap()
        input.typeText("다산생태공원")
        let result = app.otherElements.matching(NSPredicate(format: "label CONTAINS %@", "다산생태공원,")).firstMatch
        XCTAssertTrue(result.waitForExistence(timeout: 20))
        result.tap()
        XCTAssertTrue(app.buttons["다산생태공원 상세 펼치기"].waitForExistence(timeout: 15))
        app.buttons["다산생태공원 상세 펼치기"].tap()
        let photo = app.buttons["장소 사진 1 확대"]
        XCTAssertTrue(photo.waitForExistence(timeout: 20))
        for _ in 0..<4 {
            if photo.isHittable { break }
            guard let scroll = app.scrollViews.allElementsBoundByIndex.first(where: { $0.frame.width > 300 && $0.frame.height > 300 }) else {
                XCTFail("장소 상세 스크롤 영역 없음")
                return
            }
            scroll.swipeUp()
        }
        XCTAssertTrue(photo.isHittable, "사진 fixture가 실제 화면에 보여야 한다")
    }

    func photoCycle(capture: Bool = false) {
        app.buttons["장소 사진 1 확대"].tap()
        let close = app.buttons["사진 닫기"]
        XCTAssertTrue(close.waitForExistence(timeout: 5))
        let counter = app.staticTexts.matching(NSPredicate(format: "label MATCHES %@", "[0-9]+ / [0-9]+" )).firstMatch
        XCTAssertTrue(counter.waitForExistence(timeout: 5))
        guard let count = counter.label.split(separator: "/").last,
              let total = Int(count.trimmingCharacters(in: .whitespaces)) else {
            XCTFail("사진 페이지 수를 해석할 수 없음")
            return
        }
        XCTAssertGreaterThanOrEqual(total, 3, "페이지 이동을 검증할 사진 3장 이상 필요")
        app.swipeLeft()
        XCTAssertEqual(counter.label, "2 / \(total)")
        if capture {
            let image = XCTAttachment(screenshot: app.screenshot())
            image.name = "private-photo-before-pinch"
            image.lifetime = .keepAlways
            add(image)
        }
        app.pinch(withScale: 1.7, velocity: 1)
        if capture {
            let image = XCTAttachment(screenshot: app.screenshot())
            image.name = "private-photo-after-pinch"
            image.lifetime = .keepAlways
            add(image)
        }
        app.swipeLeft()
        // 확대 중에는 이동이 사진 pan으로 해석돼 다음 페이지가 나오지 않는다.
        XCTAssertEqual(counter.label, "2 / \(total)")
        app.pinch(withScale: 0.4, velocity: -1)
        app.swipeLeft()
        XCTAssertEqual(counter.label, "3 / \(total)")
        close.tap()
        XCTAssertFalse(close.exists)
    }

    func testInspectSearch() throws {
        openPhotoFixture()
    }

    func testPhotoGestureSmoke() throws {
        openPhotoFixture()
        photoCycle(capture: true)
    }

    // 등록 장소 미리보기까지만 연다. 안내 시작/종료·방문 기록 쓰기는 실행하지 않는다.
    func testReleaseNavigationPreviewReadOnly() throws {
        openSearch()
        let input = app.textFields["장소, 라이딩 검색"]
        XCTAssertTrue(input.waitForExistence(timeout: 15))
        input.tap()
        input.typeText("다산생태공원")
        let result = app.otherElements.matching(NSPredicate(format: "label CONTAINS %@", "다산생태공원,")).firstMatch
        XCTAssertTrue(result.waitForExistence(timeout: 20))
        result.tap()
        let destination = app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "도착")).firstMatch
        XCTAssertTrue(destination.waitForExistence(timeout: 15))
        XCTAssertTrue(destination.isHittable)
        destination.tap()
        let warning = app.alerts.firstMatch
        if warning.waitForExistence(timeout: 3) {
            let proceed = warning.buttons["출발"]
            XCTAssertTrue(proceed.exists, "경로 진입 전 안내만 승인한다")
            proceed.tap()
        }
        let start = app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "안내 시작")).firstMatch
        XCTAssertTrue(start.waitForExistence(timeout: 30))
        XCTAssertFalse(app.staticTexts["경로를 불러오지 못했어요"].exists)
        for option in ["추천", "시간 우선", "거리 우선", "큰길 우선"] {
            XCTAssertTrue(app.otherElements[option].exists, "경로 옵션 표시: \(option)")
        }
        let distance = app.staticTexts.matching(NSPredicate(format: "label MATCHES %@", "([0-9]+m|[0-9]+\\.[0-9]km)")).firstMatch
        XCTAssertTrue(distance.waitForExistence(timeout: 5), "실제 경로 거리가 표시돼야 한다")
        let duration = app.staticTexts.matching(NSPredicate(format: "label MATCHES %@", "([0-9]+분|[0-9]+시간 [0-9]+분)")).firstMatch
        XCTAssertTrue(duration.exists, "실제 경로 예상 시간이 표시돼야 한다")
        let preview = XCTAttachment(screenshot: app.screenshot())
        preview.name = "private-navigation-preview"
        preview.lifetime = .keepAlways
        add(preview)
        app.terminate()
        app.launch()
        let search = app.otherElements.matching(NSPredicate(format: "label CONTAINS %@", "장소, 라이딩 검색")).firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 20))
    }

    // 출시 검증용 읽기 전용 smoke다. measure/trace·계정 변경은 실행하지 않는다.
    func testReleaseWeatherToggle() throws {
        openSearch()
        app.terminate()
        app.launch()
        let weather = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "라이딩 날씨 ")).firstMatch
        XCTAssertTrue(weather.waitForExistence(timeout: 30), "실제 날씨 데이터와 진입 버튼이 필요하다")
        weather.tap()
        let opened = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label ENDSWITH %@", "닫기"), object: weather)
        XCTAssertEqual(XCTWaiter.wait(for: [opened], timeout: 5), .completed)
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "private-weather-open"
        screenshot.lifetime = .keepAlways
        add(screenshot)
        weather.tap()
        let closed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label ENDSWITH %@", "보기"), object: weather)
        XCTAssertEqual(XCTWaiter.wait(for: [closed], timeout: 5), .completed)
    }

    func testReleaseProfileSettingsReadOnly() throws {
        app.terminate()
        app.launch()
        let profile = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "내 정보")).firstMatch
        XCTAssertTrue(profile.waitForExistence(timeout: 20))
        profile.tap()
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "private-profile-read-only"
        screenshot.lifetime = .keepAlways
        add(screenshot)
        // Pressable이 아이콘과 문구를 하나의 Other 접근성 요소로 묶는다.
        let settings = app.otherElements.matching(NSPredicate(format: "label ENDSWITH %@", ", 설정")).firstMatch
        XCTAssertTrue(settings.waitForExistence(timeout: 15))
        settings.tap()
        XCTAssertTrue(app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", "햅틱 피드백")).firstMatch.waitForExistence(timeout: 15))
    }

    // 법률 동의는 이용자가 직접 한다. 자동 검증은 미선택 상태와 문서 보기만 확인한다.
    func testReleaseConsentReadOnly() throws {
        app.terminate()
        app.launch()
        let title = app.staticTexts["모토맵 시작하기"]
        if !title.waitForExistence(timeout: 5) {
            // 이미 본인이 동의한 계정은 재동의 화면을 읽기만 한다. 저장·철회하지 않는다.
            openLocationPrivacySettings()
            let scope = app.buttons["동의 범위 변경"]
            XCTAssertTrue(scope.waitForExistence(timeout: 5))
            scope.tap()
        }
        XCTAssertTrue(title.waitForExistence(timeout: 15))
        let start = app.buttons["동의하고 시작하기"]
        XCTAssertTrue(start.exists)
        XCTAssertFalse(start.isEnabled, "자동으로 동의 체크를 채우지 않아야 한다")
        let document = app.buttons["위치기반 서비스 이용약관 보기"]
        XCTAssertTrue(document.exists)
        document.tap()
        XCTAssertTrue(app.staticTexts["위치 전달 범위"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["약관 문서 닫기"].exists)
        app.buttons["약관 문서 닫기"].tap()
        XCTAssertTrue(start.waitForExistence(timeout: 5))
        XCTAssertFalse(start.isEnabled, "문서를 읽어도 자동 동의되지 않아야 한다")
    }

    func openLocationPrivacySettings() {
        app.terminate()
        app.launch()
        let profile = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "내 정보")).firstMatch
        XCTAssertTrue(profile.waitForExistence(timeout: 20))
        profile.tap()
        let settings = app.otherElements.matching(NSPredicate(format: "label ENDSWITH %@", ", 설정")).firstMatch
        XCTAssertTrue(settings.waitForExistence(timeout: 15))
        settings.tap()
        let privacy = app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", "위치정보 동의·기록 관리")).firstMatch
        XCTAssertTrue(privacy.waitForExistence(timeout: 10))
        if !privacy.isHittable { app.swipeUp() }
        privacy.tap()
        XCTAssertTrue(app.staticTexts["위치정보 관리"].waitForExistence(timeout: 10))
    }

    // 기존 자료 삭제·전체 철회는 하지 않고 현재 위치만 OFF/ON 후 원상태로 둔다.
    func testReleaseLocationPrivacyControls() throws {
        openLocationPrivacySettings()
        let location = app.switches["현재 위치 사용"]
        XCTAssertTrue(location.waitForExistence(timeout: 5))
        XCTAssertEqual(location.value as? String, "1")
        location.tap()
        let off = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == %@ AND enabled == true", "0"), object: location)
        XCTAssertEqual(XCTWaiter.wait(for: [off], timeout: 15), .completed)
        location.tap()
        let on = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == %@ AND enabled == true", "1"), object: location)
        XCTAssertEqual(XCTWaiter.wait(for: [on], timeout: 15), .completed)
        let history = app.switches["방문 기록 저장"]
        if history.exists {
            let original = history.value as? String ?? "0"
            history.tap()
            let changed = original == "1" ? "0" : "1"
            let updated = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == %@ AND enabled == true", changed), object: history)
            XCTAssertEqual(XCTWaiter.wait(for: [updated], timeout: 15), .completed)
            history.tap()
            let restored = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == %@ AND enabled == true", original), object: history)
            XCTAssertEqual(XCTWaiter.wait(for: [restored], timeout: 15), .completed)
        }
        app.buttons["내 기록 열람·삭제"].tap()
        XCTAssertTrue(app.staticTexts["내 기록 열람·삭제"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["이용·제공 내역"].exists)
        app.buttons["위치정보 관리로 돌아가기"].tap()
        XCTAssertTrue(location.waitForExistence(timeout: 5))
        XCTAssertEqual(location.value as? String, "1")
    }

    func testReleaseColdWarmPlaceLink() throws {
        // 공개·미삭제 fixture의 ID만 쓴다. OS 전달을 검증하며 앱 상태를 직접 주입하지 않는다.
        let placeID = "fc26f71a-ee51-4c66-af61-8bb955ca8796"
        let link = URL(string: "ridemap://place/\(placeID)")!
        app.terminate()
        app.open(link)
        let detail = app.buttons["다산생태공원 상세 펼치기"]
        XCTAssertTrue(detail.waitForExistence(timeout: 25), "콜드 링크가 실제 장소 상세를 열어야 한다")
        leaveSharedPlaceBeforeWarmLink()
        XCUIDevice.shared.press(.home)
        app.open(link)
        XCTAssertTrue(detail.waitForExistence(timeout: 15), "웜 링크에서도 같은 장소 상세를 열어야 한다")
        XCTAssertFalse(app.textFields["장소, 라이딩 검색"].exists)
    }

    func testReleaseUniversalPlaceLink() throws {
        let link = URL(string: "https://motomap.kr/place/fc26f71a-ee51-4c66-af61-8bb955ca8796")!
        app.terminate()
        XCUIDevice.shared.system.open(link)
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 20), "HTTPS 링크는 OS가 앱으로 전달해야 한다")
        let detail = app.buttons["다산생태공원 상세 펼치기"]
        XCTAssertTrue(detail.waitForExistence(timeout: 20))
        leaveSharedPlaceBeforeWarmLink()
        XCUIDevice.shared.press(.home)
        XCUIDevice.shared.system.open(link)
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 15))
        XCTAssertTrue(detail.waitForExistence(timeout: 15))
        XCTAssertFalse(app.textFields["장소, 라이딩 검색"].exists)
    }

    func leaveSharedPlaceBeforeWarmLink() {
        // 상세를 남겨둔 채 복귀만 확인하면 링크 이벤트가 누락돼도 성공할 수 있다.
        let search = app.otherElements.matching(NSPredicate(format: "label CONTAINS %@", "장소, 라이딩 검색")).firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 10))
        search.tap()
        XCTAssertTrue(app.textFields["장소, 라이딩 검색"].waitForExistence(timeout: 10))
    }

    func testPhotoLoops() throws {
        openPhotoFixture()
        NSLog("MOTOMAP_PHOTO_READY")
        Thread.sleep(forTimeInterval: 8)
        let options = XCTMeasureOptions()
        options.iterationCount = 10
        measure(metrics: [XCTClockMetric(), XCTCPUMetric(application: app), XCTMemoryMetric(application: app)], options: options) {
            photoCycle()
        }
        NSLog("MOTOMAP_PHOTO_CLOSED")
        // 회차마다 기다리지 않고 블록의 마지막 닫기 후에만 관찰한다.
        Thread.sleep(forTimeInterval: 30)
        NSLog("MOTOMAP_RECOVERY_30")
        for _ in 0..<3 { Thread.sleep(forTimeInterval: 30) }
        NSLog("MOTOMAP_RECOVERY_120")
    }

    func testSearchIdle() throws {
        openSearch()
        XCTAssertTrue(app.textFields["장소, 라이딩 검색"].waitForExistence(timeout: 15))
        let options = XCTMeasureOptions()
        options.iterationCount = 3
        measure(metrics: [XCTCPUMetric(application: app), XCTMemoryMetric(application: app)], options: options) {
            Thread.sleep(forTimeInterval: 20)
        }
    }
}
