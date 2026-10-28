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
// 일반 지도와 같은 이미지 자산을 쓰고 안내 지도용 배치와 글자만 합성한다.
+ (UIImage *)markerImageForPoi:(NSDictionary *)poi {
  NSString *personal=poi[@"personal"];
  if(!personal) {
    NSSet *categories=[NSSet setWithArray:@[@"cafe",@"restaurant",@"rest_stop",@"gas_station",@"repair_shop",@"viewpoint",@"gear_shop",@"camping",@"car_wash"]];
    NSString *category=[categories containsObject:poi[@"category"]?:@""]?poi[@"category"]:@"general";
    NSString *file=[NSString stringWithFormat:@"%@_circle%@",category,[poi[@"favorite"] boolValue]?@"_fav":@""];
    NSURL *url=[NSBundle.mainBundle URLForResource:@"MotoMapNavigationUI" withExtension:@"bundle"];
    NSString *path=[[NSBundle bundleWithURL:url] pathForResource:file ofType:@"png"];
    UIImage *image=path?[UIImage imageWithContentsOfFile:path]:nil;
    if(image)return image;
  }
  return [[[UIGraphicsImageRenderer alloc] initWithSize:CGSizeMake(30,30)] imageWithActions:^(UIGraphicsImageRendererContext *context){
    [[UIColor colorWithRed:0.443 green:0.369 blue:0.294 alpha:1] setFill];
    [[UIBezierPath bezierPathWithOvalInRect:CGRectMake(1,1,28,28)] fill];
    NSString *symbol=[personal isEqual:@"home"]?@"house.fill":[personal isEqual:@"work"]?@"briefcase.fill":@"mappin";
    UIImage *icon=[UIImage systemImageNamed:symbol withConfiguration:[UIImageSymbolConfiguration configurationWithPointSize:16 weight:UIImageSymbolWeightSemibold]];
    CGFloat scale=MIN(17/icon.size.width,17/icon.size.height);CGSize fitted=CGSizeMake(icon.size.width*scale,icon.size.height*scale);
    [[icon imageWithTintColor:UIColor.whiteColor renderingMode:UIImageRenderingModeAlwaysOriginal] drawInRect:CGRectMake(15-fitted.width/2,15-fitted.height/2,fitted.width,fitted.height)];
  }];
}
+ (UIImage *)imageForPoi:(NSDictionary *)poi {
  if ([poi[@"price"] doubleValue]>0) return [self priceImage:poi];
  NSString *name=poi[@"name"]?:@"";
  UIFont *font=[UIFont systemFontOfSize:12 weight:UIFontWeightMedium];
  NSMutableParagraphStyle *paragraph=[NSMutableParagraphStyle new];
  paragraph.alignment=NSTextAlignmentCenter;paragraph.lineBreakMode=NSLineBreakByWordWrapping;
  NSDictionary *attributes=@{NSFontAttributeName:font,NSForegroundColorAttributeName:[UIColor colorWithWhite:0.1 alpha:1],
    NSStrokeColorAttributeName:UIColor.whiteColor,NSStrokeWidthAttributeName:@-4,NSParagraphStyleAttributeName:paragraph};
  CGFloat textWidth=MIN(108,MAX(30,ceil([name sizeWithAttributes:@{NSFontAttributeName:font}].width)));
  CGRect measured=[name boundingRectWithSize:CGSizeMake(textWidth,CGFLOAT_MAX) options:NSStringDrawingUsesLineFragmentOrigin|NSStringDrawingUsesFontLeading attributes:attributes context:nil];
  CGFloat textHeight=MIN(ceil(font.lineHeight*2),MAX(ceil(font.lineHeight),ceil(measured.size.height)));
  CGSize size=CGSizeMake(textWidth+6,30+3+textHeight+4);
  UIImage *icon=[self markerImageForPoi:poi];
  return [[[UIGraphicsImageRenderer alloc] initWithSize:size] imageWithActions:^(UIGraphicsImageRendererContext *context) {
    [icon drawInRect:CGRectMake((size.width-30)/2,0,30,30)];
    // 상호는 아이콘 아래 최대 두 줄, 긴 마지막 줄만 말줄임한다.
    UILabel *label=[[UILabel alloc] initWithFrame:CGRectMake(3,33,textWidth,textHeight)];
    label.numberOfLines=2;label.lineBreakMode=NSLineBreakByTruncatingTail;label.attributedText=[[NSAttributedString alloc] initWithString:name attributes:attributes];
    CGContextSaveGState(context.CGContext);CGContextTranslateCTM(context.CGContext,label.frame.origin.x,label.frame.origin.y);
    [label.layer renderInContext:context.CGContext];CGContextRestoreGState(context.CGContext);
  }];
}
@end
