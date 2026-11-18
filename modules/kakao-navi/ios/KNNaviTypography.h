#pragma once
#import <UIKit/UIKit.h>

// 모토맵이 만든 조작부만 바꾼다. SDK·시스템 뷰의 서체는 건드리지 않는다.
static inline UIFont *MMPreferredAppFont(UIFontTextStyle style) {
  UITraitCollection *standard = [UITraitCollection traitCollectionWithPreferredContentSizeCategory:UIContentSizeCategoryLarge];
  UIFontDescriptor *descriptor = [UIFontDescriptor preferredFontDescriptorWithTextStyle:style compatibleWithTraitCollection:standard];
  NSString *name = (descriptor.symbolicTraits & UIFontDescriptorTraitBold) ? @"Pretendard-SemiBold" : @"Pretendard-Regular";
  UIFont *font = [UIFont fontWithName:name size:descriptor.pointSize];
  return font ? [[UIFontMetrics metricsForTextStyle:style] scaledFontForFont:font] : [UIFont preferredFontForTextStyle:style];
}

static inline UIFont *MMAppSemiboldFont(CGFloat size) {
  return [UIFont fontWithName:@"Pretendard-SemiBold" size:size] ?: [UIFont systemFontOfSize:size weight:UIFontWeightSemibold];
}
