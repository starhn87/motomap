const path = require('path');

function probeEnabled(env = process.env) {
  return env.EXPO_PUBLIC_ERROR_TRACKING_PROBE === '1';
}

function probeHostModule(root, env = process.env) {
  const file = probeEnabled(env)
    ? 'lib/errorTrackingProbeHost.verify.tsx'
    : 'lib/errorTrackingProbeHost.tsx';
  return path.join(root, file);
}

function probeConfigPlugins(env = process.env) {
  return probeEnabled(env) ? ['./plugins/withErrorTrackingProbe'] : [];
}

module.exports = { probeEnabled, probeHostModule, probeConfigPlugins };
