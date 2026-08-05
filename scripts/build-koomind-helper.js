/**
 * Build KooMind Helper APK (Accessibility connector).
 * Requer pasta android/ (expo prebuild) para usar gradlew.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const helperDir = path.join(root, 'helper-android');
const androidDir = path.join(root, 'android');
const gradlew = path.join(androidDir, 'gradlew.bat');
const localProps = path.join(helperDir, 'local.properties');

function findSdk() {
  const fromEnv = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  const home = os.homedir();
  const candidates = [
    path.join(home, 'AppData', 'Local', 'Android', 'Sdk'),
    path.join(home, 'Library', 'Android', 'sdk'),
    path.join(home, 'Android', 'Sdk'),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

const sdk = findSdk();
if (!sdk) {
  console.error('Android SDK não encontrado.');
  process.exit(1);
}

if (!fs.existsSync(gradlew)) {
  console.error(
    'android/gradlew não encontrado. Rode: npm run prebuild:android'
  );
  process.exit(1);
}

fs.writeFileSync(
  localProps,
  `sdk.dir=${sdk.replace(/\\/g, '\\\\')}\n`,
  'utf8'
);

console.log('A compilar KooMind Helper…');
execSync(`"${gradlew}" -p "..\\helper-android" clean assembleRelease --no-daemon`, {
  cwd: androidDir,
  stdio: 'inherit',
  shell: true,
});

const apkCandidates = [
  path.join(helperDir, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk'),
  path.join(helperDir, 'app', 'build', 'outputs', 'apk', 'release', 'app-release-unsigned.apk'),
  path.join(helperDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk'),
];
const apk = apkCandidates.find((p) => fs.existsSync(p));
if (!apk) {
  console.error('APK Helper não encontrado.');
  process.exit(1);
}

const outDir = path.join(root, 'dist');
fs.mkdirSync(outDir, { recursive: true });
const dest = path.join(outDir, 'KooMindHelper.apk');
fs.copyFileSync(apk, dest);
console.log(`KooMindHelper.apk → ${dest}`);
