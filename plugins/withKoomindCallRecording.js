const { withAndroidManifest } = require('@expo/config-plugins');

function serviceEntry(name, fgsType = 'microphone') {
  const entry = {
    $: {
      'android:name': name,
      'android:enabled': 'true',
      'android:exported': 'false',
      'android:stopWithTask': 'false',
    },
  };
  if (fgsType) {
    entry.$['android:foregroundServiceType'] = fgsType;
  }
  return entry;
}

/** Foreground service + receiver para detecção com app/Telefone aberto. */
function withKoomindCallRecording(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const app = manifest.manifest.application?.[0];
    if (!app) return config;

    const usesPerm = manifest.manifest['uses-permission'] ?? [];
    const extraPerms = [
      'android.permission.WAKE_LOCK',
      'android.permission.FOREGROUND_SERVICE_MICROPHONE',
      'android.permission.FOREGROUND_SERVICE_SPECIAL_USE',
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.RECEIVE_BOOT_COMPLETED',
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.USE_FULL_SCREEN_INTENT',
    ];
    for (const perm of extraPerms) {
      if (!usesPerm.some((p) => p.$?.['android:name'] === perm)) {
        usesPerm.push({ $: { 'android:name': perm } });
      }
    }
    manifest.manifest['uses-permission'] = usesPerm.filter(
      (p) =>
        p.$?.['android:name'] !==
        'android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION'
    );

    app.service = app.service ?? [];
    const services = [
      ['com.pritesh.calldetection.KoomindCallRecordingService', 'microphone'],
      ['com.pritesh.calldetection.KoomindCallMonitorService', 'microphone'],
      ['com.pritesh.calldetection.KoomindBubbleService', 'microphone'],
    ];
    for (const [name, fgsType] of services) {
      if (!app.service.some((s) => s.$?.['android:name'] === name)) {
        app.service.push(serviceEntry(name, fgsType));
      }
    }
    app.service = app.service.filter(
      (s) =>
        s.$?.['android:name'] !==
        'com.pritesh.calldetection.KoomindMediaProjectionService'
    );

    app.receiver = app.receiver ?? [];
    const receiverName = 'com.pritesh.calldetection.KoomindPhoneStateReceiver';
    if (!app.receiver.some((r) => r.$?.['android:name'] === receiverName)) {
      app.receiver.push({
        $: {
          'android:name': receiverName,
          'android:enabled': 'true',
          'android:exported': 'true',
        },
        'intent-filter': [
          {
            $: { 'android:priority': '999' },
            action: [
              { $: { 'android:name': 'android.intent.action.PHONE_STATE' } },
            ],
          },
        ],
      });
    }

    const bubbleBoot = 'com.pritesh.calldetection.KoomindBubbleBootReceiver';
    if (!app.receiver.some((r) => r.$?.['android:name'] === bubbleBoot)) {
      app.receiver.push({
        $: {
          'android:name': bubbleBoot,
          'android:enabled': 'true',
          'android:exported': 'true',
        },
        'intent-filter': [
          {
            action: [
              {
                $: { 'android:name': 'android.intent.action.BOOT_COMPLETED' },
              },
              {
                $: {
                  'android:name': 'android.intent.action.LOCKED_BOOT_COMPLETED',
                },
              },
              {
                $: {
                  'android:name': 'android.intent.action.QUICKBOOT_POWERON',
                },
              },
            ],
          },
        ],
      });
    }

    app.activity = (app.activity ?? []).filter(
      (a) =>
        a.$?.['android:name'] !==
        'com.pritesh.calldetection.KoomindCaptureConsentActivity'
    );

    const postCallActivity =
      'com.pritesh.calldetection.KoomindPostCallLaunchActivity';
    if (!app.activity.some((a) => a.$?.['android:name'] === postCallActivity)) {
      app.activity.push({
        $: {
          'android:name': postCallActivity,
          'android:exported': 'true',
          'android:theme': '@android:style/Theme.Translucent.NoTitleBar',
          'android:excludeFromRecents': 'true',
          'android:launchMode': 'singleTask',
          'android:showWhenLocked': 'true',
          'android:turnScreenOn': 'true',
        },
      });
    }

    return config;
  });
}

module.exports = withKoomindCallRecording;
