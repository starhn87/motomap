const { withDangerousMod, withMainApplication, withXcodeProject } = require('expo/config-plugins');
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

const ANDROID_MODULE = `package com.ridemap.app.errortracking;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

public class MotomapErrorTrackingProbeModule extends ReactContextBaseJavaModule {
  public MotomapErrorTrackingProbeModule(ReactApplicationContext context) {
    super(context);
  }

  @Override
  public String getName() {
    return "MotomapErrorTrackingProbe";
  }

  @ReactMethod
  public void triggerNativeCrash() {
    new Thread(() -> {
      throw new RuntimeException("motomap error tracking probe native");
    }).start();
  }
}
`;

const ANDROID_PACKAGE = `package com.ridemap.app.errortracking;

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;
import java.util.Collections;
import java.util.List;

public class MotomapErrorTrackingProbePackage implements ReactPackage {
  @Override
  public List<NativeModule> createNativeModules(ReactApplicationContext context) {
    return Collections.singletonList(new MotomapErrorTrackingProbeModule(context));
  }

  @Override
  public List<ViewManager> createViewManagers(ReactApplicationContext context) {
    return Collections.emptyList();
  }
}
`;

function withProbeAndroidSource(config) {
  return withDangerousMod(config, [
    'android',
    (config) => {
      const dir = path.join(
        config.modRequest.platformProjectRoot,
        'app/src/main/java/com/ridemap/app/errortracking',
      );
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'MotomapErrorTrackingProbeModule.java'), ANDROID_MODULE);
      fs.writeFileSync(path.join(dir, 'MotomapErrorTrackingProbePackage.java'), ANDROID_PACKAGE);
      return config;
    },
  ]);
}

function withProbeAndroidPackage(config) {
  return withMainApplication(config, (config) => {
    let contents = config.modResults.contents;
    const registration = 'add(com.ridemap.app.errortracking.MotomapErrorTrackingProbePackage())';
    if (!contents.includes(registration)) {
      const anchor = 'PackageList(this).packages.apply {';
      if (!contents.includes(anchor)) {
        throw new Error('withErrorTrackingProbe: MainApplication package list anchor was not found');
      }
      contents = contents.replace(anchor, `${anchor}\n              ${registration}`);
    }
    config.modResults.contents = contents;
    return config;
  });
}

/** 검증 프로필의 prebuild에서만 app.config가 이 플러그인을 넣는다. */
module.exports = function withErrorTrackingProbe(config) {
  config = withProbeSource(config);
  config = withProbeXcode(config);
  config = withProbeAndroidSource(config);
  return withProbeAndroidPackage(config);
};
module.exports.SOURCE = SOURCE;
