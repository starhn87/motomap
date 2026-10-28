#import "KNNaviGuidePoiArtwork.h"
@implementation KNNaviGuidePoiArtwork
+ (UIImage *)brandImage:(NSString *)brand {
  if (![brand isKindOfClass:NSString.class] || !brand.length) return nil;
  NSDictionary *files = @{@"SK에너지":@"sk.png",@"GS칼텍스":@"gs.png",@"S-OIL":@"soil.png",@"HD현대오일뱅크":@"hd.png",@"자영알뜰":@"altteul.png",@"NH알뜰":@"altteul.png"};
  NSString *file = files[brand]; if (!file) return nil;
  NSURL *url = [NSBundle.mainBundle URLForResource:@"MotoMapNavigationUI" withExtension:@"bundle"];
  NSBundle *bundle = url ? [NSBundle bundleWithURL:url] : nil;
  NSString *path = [bundle pathForResource:file.stringByDeletingPathExtension ofType:file.pathExtension];
  return path ? [UIImage imageWithContentsOfFile:path] : nil;
}
+ (UIImage *)priceImage:(NSDictionary *)station {
  CGSize size = CGSizeMake(116,34);
  // 비트맵은 최초 한 번만 만들고 UIView 변환으로 축척을 연속 반영한다.
  UIGraphicsImageRendererFormat *format=[UIGraphicsImageRendererFormat defaultFormat];
  UIGraphicsImageRenderer *renderer = [[UIGraphicsImageRenderer alloc] initWithSize:size format:format];
  return [renderer imageWithActions:^(UIGraphicsImageRendererContext *context) {
    UIColor *ink=[UIColor colorWithWhite:0.095 alpha:1];
    UIBezierPath *shape=[UIBezierPath bezierPathWithRoundedRect:CGRectInset((CGRect){CGPointZero,size},1,1) cornerRadius:11];
    [UIColor.whiteColor setFill];[shape fill]; [[UIColor colorWithWhite:0.55 alpha:1] setStroke];shape.lineWidth=1;[shape stroke];
    CGRect logoRect=CGRectMake(7,7,36,20);
    UIImage *logo=[self brandImage:station[@"brand"]];
    if (logo && logo.size.width>0 && logo.size.height>0) {
      CGFloat scale=MIN(logoRect.size.width/logo.size.width,logoRect.size.height/logo.size.height);
      CGSize fitted=CGSizeMake(logo.size.width*scale,logo.size.height*scale);
      [logo drawInRect:CGRectMake(CGRectGetMidX(logoRect)-fitted.width/2,CGRectGetMidY(logoRect)-fitted.height/2,fitted.width,fitted.height)];
    } else {
      NSString *brand=[station[@"brand"] containsString:@"알뜰"]?@"알뜰":@"주유";
      [brand drawInRect:logoRect withAttributes:@{NSFontAttributeName:[UIFont systemFontOfSize:12 weight:UIFontWeightSemibold],NSForegroundColorAttributeName:ink}];
    }
    NSNumberFormatter *formatter=[NSNumberFormatter new];formatter.numberStyle=NSNumberFormatterDecimalStyle;
    NSString *price=[formatter stringFromNumber:station[@"price"]];
    CGRect priceRect=CGRectMake(47,7,64,23);
    UIFont *font=[UIFont monospacedDigitSystemFontOfSize:17 weight:UIFontWeightBold];
    CGFloat width=[price sizeWithAttributes:@{NSFontAttributeName:font}].width;
    if (width>priceRect.size.width) font=[font fontWithSize:font.pointSize*priceRect.size.width/width];
    [price drawInRect:priceRect withAttributes:@{NSFontAttributeName:font,NSForegroundColorAttributeName:ink}];
  }];
}
+ (UIImage *)imageForPoi:(NSDictionary *)poi {
  if ([poi[@"price"] doubleValue]>0) return [self priceImage:poi];
  NSDictionary *symbols=@{@"cafe":@"cup.and.saucer.fill",@"restaurant":@"fork.knife",@"rest_stop":@"parkingsign.circle.fill",
    @"gas_station":@"fuelpump.fill",@"repair_shop":@"wrench.and.screwdriver.fill",@"viewpoint":@"camera.fill",
    @"gear_shop":@"bag.fill",@"camping":@"tent.fill",@"car_wash":@"drop.fill"};
  NSString *personal=poi[@"personal"];
  NSString *symbol=[personal isEqual:@"home"]?@"house.fill":[personal isEqual:@"work"]?@"briefcase.fill":
    [poi[@"favorite"] boolValue]?@"star.fill":symbols[poi[@"category"]?:@""]?:@"mappin.circle.fill";
  NSString *name=poi[@"name"]?:@"";
  UIFont *font=[UIFont systemFontOfSize:12 weight:UIFontWeightSemibold];
  CGFloat textWidth=MIN(126,ceil([name sizeWithAttributes:@{NSFontAttributeName:font}].width));
  CGSize size=CGSizeMake(28+textWidth+4,28);
  return [[[UIGraphicsImageRenderer alloc] initWithSize:size] imageWithActions:^(UIGraphicsImageRendererContext *context) {
    UIImage *logo=[self brandImage:poi[@"brand"]];
    if (logo && !personal && ![poi[@"favorite"] boolValue]) {
      CGFloat scale=MIN(22/logo.size.width,20/logo.size.height);
      CGSize fitted=CGSizeMake(logo.size.width*scale,logo.size.height*scale);
      [logo drawInRect:CGRectMake(12-fitted.width/2,14-fitted.height/2,fitted.width,fitted.height)];
    } else {
      UIImageSymbolConfiguration *configuration=[UIImageSymbolConfiguration configurationWithPointSize:18 weight:UIImageSymbolWeightSemibold];
      UIImage *icon=[UIImage systemImageNamed:symbol withConfiguration:configuration]?:[UIImage systemImageNamed:@"mappin.circle.fill" withConfiguration:configuration];
      NSDictionary *colors=@{@"cafe":@0xA16207,@"restaurant":@0xEF4444,@"rest_stop":@0x3B82F6,@"gas_station":@0x22C55E,
        @"repair_shop":@0x8B5CF6,@"viewpoint":@0xEC4899,@"gear_shop":@0x0EA5E9,@"camping":@0xF97316,@"car_wash":@0x14B8A6};
      unsigned int hex=personal?0x715E4B:[poi[@"favorite"] boolValue]?0xFBBF24:[colors[poi[@"category"]?:@""]?:@0x715E4B unsignedIntValue];
      UIColor *color=[UIColor colorWithRed:((hex>>16)&255)/255.0 green:((hex>>8)&255)/255.0 blue:(hex&255)/255.0 alpha:1];
      CGFloat scale=MIN(20/icon.size.width,20/icon.size.height);
      CGSize fitted=CGSizeMake(icon.size.width*scale,icon.size.height*scale);
      // 배경 박스 없이 기존 아이콘의 비율을 보존하고 지도 위 대비만 확보한다.
      CGContextSetShadowWithColor(context.CGContext,CGSizeZero,2,UIColor.whiteColor.CGColor);
      [[icon imageWithTintColor:color renderingMode:UIImageRenderingModeAlwaysOriginal] drawInRect:CGRectMake(12-fitted.width/2,14-fitted.height/2,fitted.width,fitted.height)];
      CGContextSetShadowWithColor(context.CGContext,CGSizeZero,0,nil);
    }
    NSMutableParagraphStyle *paragraph=[NSMutableParagraphStyle new];paragraph.lineBreakMode=NSLineBreakByTruncatingTail;
    [name drawInRect:CGRectMake(28,6,textWidth,17) withAttributes:@{NSFontAttributeName:font,NSForegroundColorAttributeName:[UIColor colorWithWhite:0.1 alpha:1],
      NSStrokeColorAttributeName:UIColor.whiteColor,NSStrokeWidthAttributeName:@-4,NSParagraphStyleAttributeName:paragraph}];
  }];
}
@end
