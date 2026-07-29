#import "KNSDKBridge.h"
#import <KNSDK/KNSDK.h>
#import <AVFoundation/AVFoundation.h>
#import <UIKit/UIKit.h>
#import <CoreLocation/CoreLocation.h>
#import <objc/runtime.h>

// KNSDK 는 초기화만으로 CLLocationManager 의 백그라운드 위치를 켜서, 안내를
// 안 해도 앱이 백그라운드에서 GPS 를 계속 받는다(locationd 실측 — 밤새 배터리
// 소모). KNGPSManager.backgroundUpdateType 은 문서(주행중=기본)와 달리 이를
// 제어하지 못하고, 매니저 인스턴스는 SDK 내부(Swift)에 감춰져 ivar 스캔으로도
// 안 잡힌다(실측 2연속 실패). 그래서 setter 자체를 스위즐한다:
//  - 안내 중이 아니면 YES 설정을 무시하고, 켜려던 매니저를 기억해 둔다
//  - 안내가 시작되면(setBackgroundLocationAllowed:YES) 기억한 매니저들에 YES 를
//    적용하고, 끝나면 NO 로 되돌린다 — 화면 꺼짐 안내는 유지, 종료 후엔 차단
static BOOL gBackgroundLocationAllowed = NO;
static NSHashTable<CLLocationManager *> *gBackgroundRequesters;

@interface CLLocationManager (MotoMapBackgroundGate)
@end

@implementation CLLocationManager (MotoMapBackgroundGate)
- (void)mm_setAllowsBackgroundLocationUpdates:(BOOL)allows {
  if (allows) {
    [gBackgroundRequesters addObject:self];
    if (!gBackgroundLocationAllowed) {
      NSLog(@"[KNSDK] 백그라운드 위치 요청 차단(안내 중 아님)");
      [self mm_setAllowsBackgroundLocationUpdates:NO]; // 스위즐 후 원본 구현
      return;
    }
  }
  [self mm_setAllowsBackgroundLocationUpdates:allows];
}
@end

static void installBackgroundGate(void) {
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    gBackgroundRequesters = [NSHashTable weakObjectsHashTable];
    Method orig = class_getInstanceMethod(CLLocationManager.class,
                                          @selector(setAllowsBackgroundLocationUpdates:));
    Method swz = class_getInstanceMethod(CLLocationManager.class,
                                         @selector(mm_setAllowsBackgroundLocationUpdates:));
    method_exchangeImplementations(orig, swz);
  });
}

@implementation KNSDKBridge

+ (void)setBackgroundLocationAllowed:(BOOL)allowed {
  dispatch_async(dispatch_get_main_queue(), ^{
    gBackgroundLocationAllowed = allowed;
    for (CLLocationManager *manager in gBackgroundRequesters) {
      // 스위즐 후의 mm_ 셀렉터가 원본 구현 — 게이트를 거치지 않고 직접 적용
      [manager mm_setAllowsBackgroundLocationUpdates:allowed];
    }
    NSLog(@"[KNSDK] 백그라운드 위치 %@ (매니저 %lu개)", allowed ? @"허용" : @"차단",
          (unsigned long)gBackgroundRequesters.count);
  });
}

+ (void)initializeWithAppKey:(NSString *)appKey
               clientVersion:(NSString *)clientVersion
                  completion:(void (^)(NSString *_Nullable))completion {
  installBackgroundGate(); // SDK 가 첫 YES 를 설정하기 전에 걸어야 한다
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
                     // 초기화만으로 백그라운드 위치 구독이 켜져, 안내를 안 해도
                     // 앱이 백그라운드에서 GPS 를 계속 받는다(locationd 실측 —
                     // 밤새 배터리 소모의 원인). 여기서 끄고, 안내 화면이 떠
                     // 있는 동안만 켠다(KNNaviPresenter 가 올리고 내린다).
                     [self setBackgroundLocationAllowed:NO];
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
                           vias:(NSArray<NSNumber *> *_Nullable)flatVias
                       priority:(NSInteger)priority
                     completion:(void (^)(NSString *_Nullable, NSInteger, NSInteger,
                                          NSArray<NSNumber *> *_Nullable))completion {
  KNSDK *sdk = [KNSDK sharedInstance];
  if (sdk == nil) {
    completion(@"KNSDK 인스턴스를 가져오지 못했다", 0, 0, nil);
    return;
  }

  // KNSDK 는 KATEC 정수 좌표를 쓴다. 변환은 SDK 가 제공한다(경도, 위도 순).
  IntPoint start = [sdk convertWGS84ToKATECWithLongitude:startLng latitude:startLat];
  IntPoint goal = [sdk convertWGS84ToKATECWithLongitude:goalLng latitude:goalLat];

  KNPOI *startPOI = [[KNPOI alloc] initWithName:@"출발" x:start.x y:start.y];
  KNPOI *goalPOI = [[KNPOI alloc] initWithName:@"도착" x:goal.x y:goal.y];

  [sdk makeTripWithStart:startPOI
                    goal:goalPOI
                    vias:[self viasFromFlat:flatVias]
              completion:^(KNError *_Nullable tripError, KNTrip *_Nullable trip) {
                if (tripError != nil || trip == nil) {
                  completion(tripError ? [NSString stringWithFormat:@"[%@] %@", tripError.code, tripError.msg ?: @"경로 생성 실패"]
                                       : @"경로를 만들지 못했다",
                             0, 0, nil);
                  return;
                }

                trip.routeConfig = [[KNRouteConfiguration alloc] initWithCarType:KNCarType_Bike];
                [trip routeWithPriority:(KNRoutePriority)priority
                           avoidOptions:KNRouteAvoidOption_None
                             completion:^(KNError *_Nullable routeError, NSArray<KNRoute *> *_Nullable routes) {
                               KNRoute *route = routes.firstObject;
                               if (routeError != nil || route == nil) {
                                 completion(routeError ? [NSString stringWithFormat:@"[%@] %@", routeError.code, routeError.msg ?: @"경로 탐색 실패"]
                                                       : @"경로를 찾지 못했다",
                                            0, 0, nil);
                                 return;
                               }

                               NSString *convertError = nil;
                               NSArray<NSNumber *> *polyline =
                                   [self flattenPolyline:[route routePolylineWGS84] error:&convertError];
                               if (convertError != nil) {
                                 completion(convertError, 0, 0, nil);
                                 return;
                               }
                               completion(nil, route.totalDist, route.totalTime, polyline);
                             }];
              }];
}

+ (NSArray *_Nullable)viasFromFlat:(NSArray<NSNumber *> *_Nullable)flatVias {
  if (flatVias.count < 2) return nil;
  KNSDK *sdk = [KNSDK sharedInstance];
  NSMutableArray *vias = [NSMutableArray arrayWithCapacity:flatVias.count / 2];
  for (NSUInteger i = 0; i + 1 < flatVias.count; i += 2) {
    IntPoint pt = [sdk convertWGS84ToKATECWithLongitude:flatVias[i].doubleValue
                                               latitude:flatVias[i + 1].doubleValue];
    NSString *name = [NSString stringWithFormat:@"경유지 %lu", (unsigned long)(i / 2 + 1)];
    [vias addObject:[[KNPOI alloc] initWithName:name x:pt.x y:pt.y]];
  }
  return vias;
}

// routePolylineWGS84 의 원소 타입이 문서화돼 있지 않아 방어적으로 푼다.
// [lng, lat, lng, lat, ...] 평면 배열로 편다.
+ (NSArray<NSNumber *> *)flattenPolyline:(NSArray *)raw error:(NSString **)error {
  NSMutableArray<NSNumber *> *flat = [NSMutableArray arrayWithCapacity:raw.count * 2];
  for (id p in raw) {
    if ([p isKindOfClass:NSValue.class]) {
      CGPoint pt = [(NSValue *)p CGPointValue];
      [flat addObject:@(pt.x)];
      [flat addObject:@(pt.y)];
    } else if ([p isKindOfClass:CLLocation.class]) {
      CLLocationCoordinate2D c = [(CLLocation *)p coordinate];
      [flat addObject:@(c.longitude)];
      [flat addObject:@(c.latitude)];
    } else if ([p isKindOfClass:NSArray.class] && [(NSArray *)p count] >= 2) {
      [flat addObject:[(NSArray *)p objectAtIndex:0]];
      [flat addObject:[(NSArray *)p objectAtIndex:1]];
    } else if ([p isKindOfClass:NSDictionary.class]) {
      // 실측: 원소가 NSDictionary 로 온다. 흔한 키 이름을 순서대로 시도한다.
      NSDictionary *d = (NSDictionary *)p;
      id lng = d[@"x"] ?: d[@"lng"] ?: d[@"longitude"] ?: d[@"lon"];
      id lat = d[@"y"] ?: d[@"lat"] ?: d[@"latitude"];
      if (![lng respondsToSelector:@selector(doubleValue)] ||
          ![lat respondsToSelector:@selector(doubleValue)]) {
        *error = [NSString stringWithFormat:@"경로 좌표 딕셔너리 키를 모른다: %@",
                                            [d.allKeys componentsJoinedByString:@", "]];
        return nil;
      }
      [flat addObject:@([lng doubleValue])];
      [flat addObject:@([lat doubleValue])];
    } else {
      *error = [NSString stringWithFormat:@"경로 좌표 형식을 알 수 없다: %@",
                                          NSStringFromClass([p class])];
      return nil;
    }
  }
  return flat;
}

@end
