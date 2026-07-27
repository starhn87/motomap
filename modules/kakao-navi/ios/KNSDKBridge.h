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

@end

NS_ASSUME_NONNULL_END
