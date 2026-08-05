/**
 * Garante entradas KooMind no AndroidManifest e remove MediaProjection legado.
 */
const fs = require('fs');
const path = require('path');

const manifestPath = path.join(
  __dirname,
  '..',
  'android',
  'app',
  'src',
  'main',
  'AndroidManifest.xml'
);

if (!fs.existsSync(manifestPath)) {
  console.warn('patch-android-manifest: android/ ainda não existe — rode prebuild:android');
  process.exit(0);
}

let xml = fs.readFileSync(manifestPath, 'utf8');
let changed = false;

const legacyPatterns = [
  /<uses-permission android:name="android\.permission\.FOREGROUND_SERVICE_MEDIA_PROJECTION"\/>[\r\n]*/g,
  /\s*<activity android:name="com\.pritesh\.calldetection\.KoomindCaptureConsentActivity"[^/]*\/>[\r\n]*/g,
  /\s*<service android:name="com\.pritesh\.calldetection\.KoomindMediaProjectionService"[^/]*\/>[\r\n]*/g,
];

for (const pattern of legacyPatterns) {
  const next = xml.replace(pattern, '');
  if (next !== xml) {
    xml = next;
    changed = true;
  }
}

if (changed) {
  fs.writeFileSync(manifestPath, xml, 'utf8');
  console.log('patch-android-manifest: removido MediaProjection legado');
} else {
  console.log('patch-android-manifest: manifest OK');
}

const helperQuery = '<package android:name="com.koomind.helper"/>';
if (!xml.includes('com.koomind.helper')) {
  if (xml.includes('<queries>')) {
    xml = xml.replace('<queries>', `<queries>\n    ${helperQuery}`);
  } else {
    xml = xml.replace(
      '<manifest',
      `<manifest`
    );
    xml = xml.replace(
      /(<manifest[^>]*>)/,
      `$1\n  <queries>\n    ${helperQuery}\n  </queries>`
    );
  }
  changed = true;
  console.log('patch-android-manifest: queries KooMind Helper');
}

const helperReceiver = `    <receiver android:name="com.pritesh.calldetection.KoomindHelperReceiver" android:enabled="true" android:exported="true">
      <intent-filter>
        <action android:name="com.koomind.action.HELPER_CALL_OFFHOOK"/>
        <action android:name="com.koomind.action.HELPER_CALL_IDLE"/>
        <action android:name="com.koomind.action.HELPER_CONNECTOR_READY"/>
        <action android:name="com.koomind.action.HELPER_RECORDING_READY"/>
      </intent-filter>
    </receiver>`;

if (!xml.includes('KoomindHelperReceiver')) {
  xml = xml.replace(
    '</application>',
    `${helperReceiver}\n  </application>`
  );
  changed = true;
  console.log('patch-android-manifest: KoomindHelperReceiver');
}

if (!xml.includes('android.permission.SYSTEM_ALERT_WINDOW')) {
  xml = xml.replace(
    '<uses-permission android:name="android.permission.INTERNET"/>',
    `<uses-permission android:name="android.permission.INTERNET"/>
  <uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW"/>
  <uses-permission android:name="android.permission.FOREGROUND_SERVICE_SPECIAL_USE"/>
  <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED"/>`
  );
  if (!xml.includes('android.permission.SYSTEM_ALERT_WINDOW')) {
    xml = xml.replace(
      /(<manifest[^>]*>)/,
      `$1\n  <uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW"/>\n  <uses-permission android:name="android.permission.FOREGROUND_SERVICE_SPECIAL_USE"/>\n  <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED"/>`
    );
  }
  changed = true;
  console.log('patch-android-manifest: SYSTEM_ALERT_WINDOW');
}

const bubbleService = `    <service android:name="com.pritesh.calldetection.KoomindBubbleService" android:enabled="true" android:exported="false" android:stopWithTask="false" android:foregroundServiceType="microphone"/>`;

if (!xml.includes('KoomindBubbleService')) {
  xml = xml.replace('</application>', `${bubbleService}\n  </application>`);
  changed = true;
  console.log('patch-android-manifest: KoomindBubbleService');
} else if (xml.includes('KoomindBubbleService') && xml.includes('specialUse')) {
  xml = xml.replace(
    /android:name="com\.pritesh\.calldetection\.KoomindBubbleService"[^>]*>[\s\S]*?<\/service>/,
    'android:name="com.pritesh.calldetection.KoomindBubbleService" android:enabled="true" android:exported="false" android:stopWithTask="false" android:foregroundServiceType="microphone"/>'
  );
  // if self-closing already with specialUse
  xml = xml.replace(
    /android:name="com\.pritesh\.calldetection\.KoomindBubbleService"[^/]*specialUse[^/]*\/>/,
    'android:name="com.pritesh.calldetection.KoomindBubbleService" android:enabled="true" android:exported="false" android:stopWithTask="false" android:foregroundServiceType="microphone"/>'
  );
  changed = true;
  console.log('patch-android-manifest: KoomindBubbleService → microphone');
}

const bubbleBoot = `    <receiver android:name="com.pritesh.calldetection.KoomindBubbleBootReceiver" android:enabled="true" android:exported="true">
      <intent-filter>
        <action android:name="android.intent.action.BOOT_COMPLETED"/>
        <action android:name="android.intent.action.LOCKED_BOOT_COMPLETED"/>
        <action android:name="android.intent.action.QUICKBOOT_POWERON"/>
      </intent-filter>
    </receiver>`;

if (!xml.includes('KoomindBubbleBootReceiver')) {
  xml = xml.replace('</application>', `${bubbleBoot}\n  </application>`);
  changed = true;
  console.log('patch-android-manifest: KoomindBubbleBootReceiver');
}

if (changed) {
  fs.writeFileSync(manifestPath, xml, 'utf8');
} else {
  console.log('patch-android-manifest: manifest OK');
}
