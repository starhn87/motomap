#import <UIKit/UIKit.h>
#import <KNSDK/KNSDK.h>
// 공개 검사 좌표 주변의 가짜 장소. 제품 snapshot/운영 조회에는 포함하지 않는다.
NSArray<NSDictionary *> *KNNaviOwnedPoiFixtures(IntPoint center);
