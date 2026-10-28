#import "KNNaviOwnedPoiFixtures.h"
#import "KNNaviGuidePoiArtwork.h"

NSArray<NSDictionary *> *KNNaviOwnedPoiFixtures(IntPoint center) {
  // 위치·가격은 가짜지만 표시는 실제 제품 artwork를 그대로 사용한다.
  NSArray *rows=@[
    @{@"key":@"home",@"name":@"집",@"personal":@"home",@"priority":@0},
    @{@"key":@"work",@"name":@"회사",@"personal":@"work",@"priority":@0},
    @{@"key":@"favorite",@"name":@"저장한 장소",@"favorite":@YES,@"priority":@1},
    @{@"key":@"cafe",@"name":@"라이더들이 쉬어가는 모토 카페",@"category":@"cafe",@"priority":@3},
    @{@"key":@"gas",@"name":@"검사 주유소",@"brand":@"S-OIL",@"price":@1699,@"priority":@2},
    @{@"key":@"no-price",@"name":@"가격 없는 주유소",@"brand":@"HD현대오일뱅크",@"category":@"gas_station",@"priority":@2},
  ];
  NSMutableArray *items=[NSMutableArray new];
  for (NSUInteger i=0;i<rows.count;i++) {
    NSDictionary *row=rows[i];
    UIImage *image=[KNNaviGuidePoiArtwork imageForPoi:row];BOOL price=[row[@"price"] doubleValue]>0;
    [items addObject:@{@"key":row[@"key"],@"label":row[@"name"],@"priority":row[@"priority"],
      @"image":image,@"price":@(price),@"anchor":[NSValue valueWithCGPoint:CGPointMake(0.5,price?1:15/image.size.height)],
      @"x":@(center.x+(i%2?45:-45)),@"y":@(center.y+(1-(NSInteger)(i/2))*70)}];
  }
  return items;
}
