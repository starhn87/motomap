const { withInfoPlist } = require('expo/config-plugins');

module.exports = function withQuerySchemes(config) {
  return withInfoPlist(config, (config) => {
    config.modResults.LSApplicationQueriesSchemes = [
      ...(config.modResults.LSApplicationQueriesSchemes || []),
      'kakaomap',
      'tmap',
      'nmap',
      'maps',
    ];
    return config;
  });
};
