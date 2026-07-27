#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

// 길안내를 네이티브 전체화면으로 띄운다.
// KNNaviView 를 RN 뷰 계층(ExpoView) 안에 넣으면 지도가 그려지지 않아
// 자체 UIViewController 로 present 한다 — 공식 예제도 이 형태다.
@interface KNNaviPresenter : NSObject

+ (void)presentFromLng:(double)startLng
                   lat:(double)startLat
                 toLng:(double)goalLng
                   lat:(double)goalLat
                  name:(NSString *)goalName
            onDismiss:(void (^)(void))onDismiss
              onError:(void (^)(NSString *message))onError;

@end

NS_ASSUME_NONNULL_END
