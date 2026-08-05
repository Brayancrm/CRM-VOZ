const { withAndroidManifest } = require('@expo/config-plugins');

/** Receiver + visibilidade do pacote Helper (Android 11+). */
function withKoomindHelper(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const app = manifest.manifest.application?.[0];
    if (!app) return config;

    const helperPackage = 'com.koomind.helper';
    if (!manifest.manifest.queries) {
      manifest.manifest.queries = [{ package: [] }];
    }
    const queriesBlock = manifest.manifest.queries[0];
    queriesBlock.package = queriesBlock.package ?? [];
    if (
      !queriesBlock.package.some(
        (p) => p.$?.['android:name'] === helperPackage
      )
    ) {
      queriesBlock.package.push({ $: { 'android:name': helperPackage } });
    }

    app.receiver = app.receiver ?? [];
    const receiverName = 'com.pritesh.calldetection.KoomindHelperReceiver';
    if (!app.receiver.some((r) => r.$?.['android:name'] === receiverName)) {
      app.receiver.push({
        $: {
          'android:name': receiverName,
          'android:enabled': 'true',
          'android:exported': 'true',
        },
        'intent-filter': [
          {
            action: [
              { $: { 'android:name': 'com.koomind.action.HELPER_CALL_OFFHOOK' } },
              { $: { 'android:name': 'com.koomind.action.HELPER_CALL_IDLE' } },
              { $: { 'android:name': 'com.koomind.action.HELPER_CONNECTOR_READY' } },
              { $: { 'android:name': 'com.koomind.action.HELPER_RECORDING_READY' } },
            ],
          },
        ],
      });
    }

    return config;
  });
}

module.exports = withKoomindHelper;
