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
