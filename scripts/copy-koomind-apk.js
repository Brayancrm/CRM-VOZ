const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const candidates = [
  path.join(root, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk'),
  path.join(root, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk'),
];

const src = candidates.find((p) => fs.existsSync(p));
if (!src) {
  console.error('APK não encontrado. Rode assembleRelease ou assembleDebug antes.');
  process.exit(1);
}

const outDir = path.join(root, 'dist');
fs.mkdirSync(outDir, { recursive: true });
const dest = path.join(outDir, 'SeCretina.apk');
fs.copyFileSync(src, dest);
console.log(`SeCretina.apk → ${dest}`);
