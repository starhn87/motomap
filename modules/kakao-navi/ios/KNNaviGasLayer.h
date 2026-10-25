#import <UIKit/UIKit.h>
#import <KNSDK/KNSDK.h>
#import <KNSDK/KNGPSData.h>
NS_ASSUME_NONNULL_BEGIN
// 안내 메뉴의 주유소 검색과 세션 내 유종별 캐시를 관리한다. 지도는 변경하지 않는다.
@interface KNNaviGasLayer : NSObject
@property(nonatomic, copy) void (^onFetch)(void);
@property(nonatomic, copy) void (^onRoute)(void);
@property(nonatomic, copy) BOOL (^isActive)(void);
@property(nonatomic, copy, nullable) KNGPSData *_Nullable (^getGPS)(void);
+ (BOOL)isUsableSearchGPS:(nullable KNGPSData *)gps;
@property(nonatomic, readonly, nullable) NSDictionary *context;
@property(nonatomic, readonly, nullable) NSDictionary *selection;
- (instancetype)initWithHost:(UIViewController *)host;
- (void)updateGPS:(nullable KNGPSData *)gps;
- (void)showSearch;
- (void)applyResponse:(NSDictionary *)response;
- (nullable NSDictionary *)takeSelection;
- (void)resetSearch;
- (void)invalidate;
@end
NS_ASSUME_NONNULL_END
