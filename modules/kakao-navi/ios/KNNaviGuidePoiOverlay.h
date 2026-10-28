#import <UIKit/UIKit.h>
#import <KNSDK/KNSDK.h>
#import <KNSDK/KNMapView.h>

NS_ASSUME_NONNULL_BEGIN
// 데이터 조회와 분리된 지도 자식 표시 계층. 좌표는 KATEC, 이미지는 snapshot당 한 번 만든다.
@interface KNNaviGuidePoiOverlay : NSObject
@property(nonatomic, copy, nullable) void (^onSelect)(NSString *key);
@property(nonatomic, copy, nullable) BOOL (^isActive)(void);
@property(nonatomic, readonly) BOOL hasItems;
@property(nonatomic, copy) NSArray<NSValue *> *exclusionRects;
@property(nonatomic, copy, nullable) NSString *selectedKey;
- (instancetype)initWithMap:(KNMapView *)map;
// key, x, y, image, label, priority. 작은 priority가 먼저 표시된다.
- (void)showItems:(NSArray<NSDictionary *> *)items expiresAt:(NSDate *)expiresAt;
- (void)clear;
- (void)invalidate;
@end
NS_ASSUME_NONNULL_END
