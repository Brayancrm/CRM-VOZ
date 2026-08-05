const { withAndroidManifest } = require('@expo/config-plugins');

/** Resolve conflito allowBackup com @huddle01/react-native-call-detection */
function withAndroidManifestMerge(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const app = manifest.manifest.application?.[0];
    if (!app) return config;

    manifest.manifest.$ = manifest.manifest.$ ?? {};
    manifest.manifest.$['xmlns:tools'] =
      'http://schemas.android.com/tools';

    app.$ = app.$ ?? {};
    app.$['tools:replace'] = 'android:allowBackup';

    return config;
  });
}

module.exports = withAndroidManifestMerge;
