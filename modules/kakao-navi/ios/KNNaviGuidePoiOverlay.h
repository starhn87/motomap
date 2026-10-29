#import <UIKit/UIKit.h>
#import <KNSDK/KNSDK.h>
#import <KNSDK/KNMapView.h>

NS_ASSUME_NONNULL_BEGIN
// 데이터 조회와 분리된 SDK 마커 표시 계층(NAV-056). 좌표는 KATEC, 이미지는 snapshot당 한 번 만든다.
// 마커는 SDK 렌더 안에서 그려지므로 줌 크기는 연속이 아니라 노출 구간(정상/축소)으로 전환한다.
@interface KNNaviGuidePoiOverlay : NSObject
@property(nonatomic, copy, nullable) void (^onSelect)(NSString *key);
@property(nonatomic, copy, nullable) BOOL (^isActive)(void);
@property(nonatomic, readonly) BOOL hasItems;
// SDK 마커는 UIKit 패널 아래에 그려지므로 현재는 값을 보관만 한다(NAV-056).
@property(nonatomic, copy) NSArray<NSValue *> *exclusionRects;
@property(nonatomic, copy, nullable) NSString *selectedKey;
- (instancetype)initWithMap:(KNMapView *)map;
// key, x, y, image, label, priority. 작은 priority가 먼저 표시된다.
- (void)showItems:(NSArray<NSDictionary *> *)items expiresAt:(NSDate *)expiresAt;
// 만료·동의 철회·비활성·지도 분리를 즉시 점검한다. 평소에는 1초 간격 타이머가 호출한다.
- (void)revalidate;
- (void)clear;
- (void)invalidate;
@end
NS_ASSUME_NONNULL_END
