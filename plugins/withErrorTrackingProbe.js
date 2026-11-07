const { withDangerousMod, withXcodeProject } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const SOURCE = `#import <React/RCTBridgeModule.h>

@interface MotomapErrorTrackingProbe : NSObject <RCTBridgeModule>
@end

@implementation MotomapErrorTrackingProbe

RCT_EXPORT_MODULE();

RCT_EXPORT_METHOD(triggerNativeCrash)
{
  abort();
}

@end
`;

function withProbeSource(config) {
  return withDangerousMod(config, [
    'ios',
    (config) => {
      const file = path.join(
        config.modRequest.platformProjectRoot,
        config.modRequest.projectName,
        'MotomapErrorTrackingProbe.m',
      );
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, SOURCE);
      return config;
    },
  ]);
}

function withProbeXcode(config) {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const filePath = `${config.modRequest.projectName}/MotomapErrorTrackingProbe.m`;
    const target = project.getFirstTarget().uuid;
    if (!project.hasFile(filePath)) {
      project.addSourceFile(filePath, { target });
    }
    return config;
  });
}

/** 검증 프로필의 prebuild에서만 app.config가 이 플러그인을 넣는다. */
module.exports = function withErrorTrackingProbe(config) {
  return withProbeXcode(withProbeSource(config));
};
module.exports.SOURCE = SOURCE;
