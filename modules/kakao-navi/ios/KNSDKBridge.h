#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

// KNSDK 는 Swift 모듈 인터페이스(.swiftmodule)를 배포에 넣지 않는다.
// framework 안의 module.modulemap 이 내부용 KNSDKManager 만 노출하기 때문에
// Swift 에서 `import KNSDK` 가 되지 않는다. ObjC 로 한 겹 감싸 필요한 것만 넘긴다.
@interface KNSDKBridge : NSObject

// 인증 성공이면 errorMessage 가 nil.
+ (void)initializeWithAppKey:(NSString *)appKey
               clientVersion:(NSString *)clientVersion
                  completion:(void (^)(NSString *_Nullable errorMessage))completion;

// 백그라운드 위치 허용 토글 — 안내 중에만 YES. 자세한 사연은 구현부 주석.
+ (void)setBackgroundLocationAllowed:(BOOL)allowed;

// 이륜차 경로를 계산한다. 성공하면 distance(m)·duration(초)와
// polyline([lng, lat, lng, lat, ...] 평면 배열, WGS84)이 채워진다.
// vias 도 같은 평면 배열 형식(비면 nil 허용). priority 는 KNRoutePriority 원시값.
+ (void)requestBikeRouteFromLng:(double)startLng
                            lat:(double)startLat
                          toLng:(double)goalLng
                            lat:(double)goalLat
                           vias:(NSArray<NSNumber *> *_Nullable)flatVias
                       priority:(NSInteger)priority
                     completion:(void (^)(NSString *_Nullable errorMessage,
                                          NSInteger distance,
                                          NSInteger duration,
                                          NSArray<NSNumber *> *_Nullable polyline))completion;

// [lng, lat, ...] 평면 배열을 KNPOI 경유지 목록으로 바꾼다. 비면 nil.
+ (NSArray *_Nullable)viasFromFlat:(NSArray<NSNumber *> *_Nullable)flatVias;

@end

NS_ASSUME_NONNULL_END
