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
