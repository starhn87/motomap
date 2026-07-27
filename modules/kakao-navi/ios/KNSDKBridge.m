#import "KNSDKBridge.h"
#import <KNSDK/KNSDK.h>

@implementation KNSDKBridge

+ (void)initializeWithAppKey:(NSString *)appKey
               clientVersion:(NSString *)clientVersion
                  completion:(void (^)(NSString *_Nullable))completion {
  KNSDK *sdk = [KNSDK sharedInstance];
  if (sdk == nil) {
    completion(@"KNSDK 인스턴스를 가져오지 못했다");
    return;
  }

  [sdk initializeWithAppKey:appKey
              clientVersion:clientVersion
                 completion:^(KNError *_Nullable error) {
                   if (error == nil) {
                     completion(nil);
                     return;
                   }
                   completion([NSString stringWithFormat:@"[%@] %@", error.code, error.msg ?: @"알 수 없는 오류"]);
                 }];
}

@end
