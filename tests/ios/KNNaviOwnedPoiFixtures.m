#import "KNNaviOwnedPoiFixtures.h"

NSArray<NSDictionary *> *KNNaviOwnedPoiFixtures(IntPoint center) {
  NSArray *rows=@[
    @[@"home",@"house.fill",@"테스트 집",@0],
    @[@"work",@"briefcase.fill",@"테스트 회사",@0],
    @[@"favorite",@"star.fill",@"저장 테스트",@1],
    @[@"cafe",@"cup.and.saucer.fill",@"카페 테스트",@3],
    @[@"gas",@"fuelpump.fill",@"1,699원 테스트",@2],
    @[@"no-price",@"fuelpump",@"가격 없음",@2],
  ];
  NSMutableArray *items=[NSMutableArray new];
  for (NSUInteger i=0;i<rows.count;i++) {
    NSArray *row=rows[i];
    UIGraphicsImageRenderer *renderer=[[UIGraphicsImageRenderer alloc] initWithSize:CGSizeMake(116,34)];
    UIImage *image=[renderer imageWithActions:^(UIGraphicsImageRendererContext *context) {
      UIBezierPath *shape=[UIBezierPath bezierPathWithRoundedRect:CGRectMake(1,1,114,32) cornerRadius:10];
      [UIColor.whiteColor setFill];[shape fill];[UIColor.grayColor setStroke];shape.lineWidth=1;[shape stroke];
      UIImage *icon=[UIImage systemImageNamed:row[1] withConfiguration:[UIImageSymbolConfiguration configurationWithPointSize:18 weight:UIImageSymbolWeightRegular]];
      [[icon imageWithTintColor:UIColor.systemOrangeColor renderingMode:UIImageRenderingModeAlwaysOriginal] drawInRect:CGRectMake(7,8,18,18)];
      [row[2] drawInRect:CGRectMake(30,9,82,19) withAttributes:@{NSFontAttributeName:[UIFont systemFontOfSize:11 weight:UIFontWeightSemibold],NSForegroundColorAttributeName:UIColor.blackColor}];
    }];
    [items addObject:@{@"key":row[0],@"label":row[2],@"priority":row[3],@"image":image,
      @"x":@(center.x+(i%2?45:-45)),@"y":@(center.y+(1-(NSInteger)(i/2))*70)}];
  }
  return items;
}
