/**
 * Instala fontes KooMind no @huddle01/react-native-call-detection:
 * detecção, emitDeviceEvent, foreground service + AudioRecord.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(
  __dirname,
  '..',
  'node_modules',
  '@huddle01',
  'react-native-call-detection'
);
const javaDir = path.join(
  root,
  'android',
  'src',
  'main',
  'java',
  'com',
  'pritesh',
  'calldetection'
);
const koomindDir = path.join(__dirname, 'koomind');
const indexPath = path.join(root, 'index.js');

const JAVA_FILES = [
  'CallDetectionManagerModule.java',
  'KoomindCallRecordingService.java',
  'KoomindCallRecordingStore.java',
  'KoomindPhoneStateReceiver.java',
  'KoomindCallMonitorService.java',
  'KoomindVadAudioRecorder.java',
  'KoomindAppContext.java',
  'KoomindCallLogHelper.java',
  'KoomindHelperBridge.java',
  'KoomindHelperReceiver.java',
  'KoomindPostCallLaunchActivity.java',
  'KoomindBubbleService.java',
  'KoomindBubbleBootReceiver.java',
];

if (!fs.existsSync(javaDir)) {
  process.exit(0);
}

for (const file of JAVA_FILES) {
  const source = path.join(koomindDir, file);
  const target = path.join(javaDir, file);
  if (!fs.existsSync(source)) {
    console.warn('patch-huddle-call-detection: ausente', file);
    continue;
  }
  fs.copyFileSync(source, target);
  console.log('patch-huddle-call-detection:', file);
}

const removedMediaProjection = [
  'KoomindMediaProjectionHolder.java',
  'KoomindCaptureConsentActivity.java',
  'KoomindMediaProjectionService.java',
  'KoomindAcrKeepAlive.java',
];
for (const file of removedMediaProjection) {
  const target = path.join(javaDir, file);
  if (fs.existsSync(target)) {
    fs.unlinkSync(target);
    console.log('patch-huddle-call-detection: removido', file);
  }
}

if (fs.existsSync(indexPath)) {
  let index = fs.readFileSync(indexPath, 'utf8');
  if (index.includes('BatchedBridge.registerCallableModule') && !index.includes('try {')) {
    index = index.replace(
      `const BatchedBridge = require('react-native/Libraries/BatchedBridge/BatchedBridge')

const NativeCallDetector = NativeModules.CallDetectionManager
const NativeCallDetectorAndroid = NativeModules.CallDetectionManagerAndroid

var CallStateUpdateActionModule = require('./CallStateUpdateActionModule')
BatchedBridge.registerCallableModule('CallStateUpdateActionModule', CallStateUpdateActionModule)`,
      `const NativeCallDetector = NativeModules.CallDetectionManager
const NativeCallDetectorAndroid = NativeModules.CallDetectionManagerAndroid

var CallStateUpdateActionModule = require('./CallStateUpdateActionModule')
try {
  const BatchedBridge = require('react-native/Libraries/BatchedBridge/BatchedBridge')
  BatchedBridge.registerCallableModule('CallStateUpdateActionModule', CallStateUpdateActionModule)
} catch (e) {
  console.warn('CallDetection: BatchedBridge indisponível', e)
}`
    );
    fs.writeFileSync(indexPath, index, 'utf8');
  }
}
