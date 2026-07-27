#import "KNSDKBridge.h"
#import <KNSDK/KNSDK.h>
#import <AVFoundation/AVFoundation.h>

@implementation KNSDKBridge

+ (void)initializeWithAppKey:(NSString *)appKey
               clientVersion:(NSString *)clientVersion
                  completion:(void (^)(NSString *_Nullable))completion {
  KNSDK *sdk = [KNSDK sharedInstance];
  if (sdk == nil) {
    completion(@"KNSDK 인스턴스를 가져오지 못했다");
    return;
  }

  // 음성 안내용. SDK 초기화 전에 잡아두라고 문서가 요구한다.
  AVAudioSession *session = AVAudioSession.sharedInstance;
  [session setActive:NO error:nil];
  [session setMode:AVAudioSessionModeDefault error:nil];
  [session setCategory:AVAudioSessionCategoryPlayback
           withOptions:AVAudioSessionCategoryOptionMixWithOthers
                 error:nil];
  [session setActive:YES error:nil];

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

+ (void)requestBikeRouteFromLng:(double)startLng
                            lat:(double)startLat
                          toLng:(double)goalLng
                            lat:(double)goalLat
                     completion:(void (^)(NSString *_Nullable, NSInteger, NSInteger))completion {
  KNSDK *sdk = [KNSDK sharedInstance];
  if (sdk == nil) {
    completion(@"KNSDK 인스턴스를 가져오지 못했다", 0, 0);
    return;
  }

  // KNSDK 는 KATEC 정수 좌표를 쓴다. 변환은 SDK 가 제공한다(경도, 위도 순).
  IntPoint start = [sdk convertWGS84ToKATECWithLongitude:startLng latitude:startLat];
  IntPoint goal = [sdk convertWGS84ToKATECWithLongitude:goalLng latitude:goalLat];

  KNPOI *startPOI = [[KNPOI alloc] initWithName:@"출발" x:start.x y:start.y];
  KNPOI *goalPOI = [[KNPOI alloc] initWithName:@"도착" x:goal.x y:goal.y];

  [sdk makeTripWithStart:startPOI
                    goal:goalPOI
                    vias:nil
              completion:^(KNError *_Nullable tripError, KNTrip *_Nullable trip) {
                if (tripError != nil || trip == nil) {
                  completion(tripError ? [NSString stringWithFormat:@"[%@] %@", tripError.code, tripError.msg ?: @"경로 생성 실패"]
                                       : @"경로를 만들지 못했다",
                             0, 0);
                  return;
                }

                trip.routeConfig = [[KNRouteConfiguration alloc] initWithCarType:KNCarType_Bike];
                [trip routeWithPriority:KNRoutePriority_Recommand
                           avoidOptions:KNRouteAvoidOption_None
                             completion:^(KNError *_Nullable routeError, NSArray<KNRoute *> *_Nullable routes) {
                               KNRoute *route = routes.firstObject;
                               if (routeError != nil || route == nil) {
                                 completion(routeError ? [NSString stringWithFormat:@"[%@] %@", routeError.code, routeError.msg ?: @"경로 탐색 실패"]
                                                       : @"경로를 찾지 못했다",
                                            0, 0);
                                 return;
                               }
                               completion(nil, route.totalDist, route.totalTime);
                             }];
              }];
}

@end
