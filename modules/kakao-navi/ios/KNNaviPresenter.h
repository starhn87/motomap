#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

// 길안내를 네이티브 전체화면으로 띄운다.
// KNNaviView 를 RN 뷰 계층(ExpoView) 안에 넣으면 지도가 그려지지 않아
// 자체 UIViewController 로 present 한다 — 공식 예제도 이 형태다.
@interface KNNaviPresenter : NSObject

// priority 는 KNRoutePriority 원시값(0 추천 · 1 시간 · 2 거리 · 3 고속도로 · 4 큰길).
+ (void)presentFromLng:(double)startLng
                   lat:(double)startLat
                 toLng:(double)goalLng
                   lat:(double)goalLat
                  name:(NSString *)goalName
                  vias:(NSArray<NSNumber *> *_Nullable)flatVias
              priority:(NSInteger)priority
             onStarted:(void (^_Nullable)(void))onStarted
                onMenu:(void (^_Nullable)(NSInteger menuId))onMenu
            onDismiss:(void (^)(void))onDismiss
              onError:(void (^)(NSString *message))onError;

// ── 안내 화면 위 상호작용 (JS 가 내용을 채운다) ──────────────────────────

// 액션시트를 안내 화면 위에 띄운다. completion 에 고른 인덱스, 취소면 -1.
+ (void)showOptionsWithTitle:(NSString *)title
                      labels:(NSArray<NSString *> *)labels
                  completion:(void (^)(NSInteger pickedIndex))completion;

// 잠깐 떴다 사라지는 알림(버튼 없음, 1.8초).
+ (void)showNotice:(NSString *)message;

// 안내 중 목적지 변경 — 현 위치에서 새 목적지로 경로를 다시 잡는다.
+ (void)changeDestinationToLng:(double)lng
                           lat:(double)lat
                          name:(NSString *)name
                      priority:(NSInteger)priority
                    completion:(void (^)(NSString *_Nullable errorMessage))completion;

@end

NS_ASSUME_NONNULL_END
