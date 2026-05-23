/**
 * Corrige react-native-call-detection: troca support library antiga por AndroidX.
 * Necessário após cada npm install.
 */
const fs = require('fs');
const path = require('path');

const target = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-native-call-detection',
  'android',
  'build.gradle'
);

if (!fs.existsSync(target)) {
  process.exit(0);
}

const content = `apply plugin: 'com.android.library'

def DEFAULT_COMPILE_SDK_VERSION     = 28
def DEFAULT_BUILD_TOOLS_VERSION     = "28.0.3"
def DEFAULT_TARGET_SDK_VERSION      = 27

def safeExtGet(prop, fallback) {
    rootProject.ext.has(prop) ? rootProject.ext.get(prop) : fallback
}

android {
    compileSdkVersion safeExtGet('compileSdkVersion', DEFAULT_COMPILE_SDK_VERSION)
    buildToolsVersion safeExtGet('buildToolsVersion', DEFAULT_BUILD_TOOLS_VERSION)

    defaultConfig {
        minSdkVersion 16
        targetSdkVersion safeExtGet('targetSdkVersion', DEFAULT_TARGET_SDK_VERSION)
        versionCode 1
        versionName "1.0"
    }
}

repositories {
    google()
    mavenCentral()
}

dependencies {
    implementation 'com.facebook.react:react-native:+'
    implementation 'androidx.appcompat:appcompat:1.6.1'
}
`;

fs.writeFileSync(target, content, 'utf8');
console.log('patch-call-detection: AndroidX aplicado em react-native-call-detection');
