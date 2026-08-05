const fs = require('fs');
const path = require('path');
const os = require('os');

const root = path.join(__dirname, '..');
const localProps = path.join(root, 'android', 'local.properties');

function escapeSdkPath(p) {
  return p.replace(/\\/g, '\\\\');
}

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
  console.error(
    'Android SDK não encontrado. Instale o Android Studio ou defina ANDROID_HOME.'
  );
  process.exit(1);
}

fs.mkdirSync(path.dirname(localProps), { recursive: true });
fs.writeFileSync(localProps, `sdk.dir=${escapeSdkPath(sdk)}\n`, 'utf8');
console.log(`android/local.properties → ${sdk}`);
