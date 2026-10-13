// Copies the Amazon Appstore public key into the Android assets at prebuild.
//
// Amazon's IAP SDK verifies the Appstore client's authentication token against
// an app-specific PUBLIC key that must ship inside the APK at
//   assets/AppstoreAuthenticationKey.pem
// Without it the SDK logs "DataAuthenticationKeyLoaderV3: Unable to load
// authentication Key", getUserData() fails, and RevenueCat reports
// StoreProblemError / "Failed to get user data". No purchase can start and no
// receipt is ever produced. That cost this fleet three review cycles in Oct 2026
// because the paywall still renders a correct price: RevenueCat serves offering
// metadata from its own backend, so the catalog looks healthy while the on-device
// Amazon session was never authenticated at all.
//
// Get the key from the Developer Console: the app > Additional information >
// View public key > download. It is per-app and it is a public key, so it is
// safe to commit. Keep it at amazon/AppstoreAuthenticationKey.pem in the repo.
//
// android/ is gitignored prebuild output in this fleet, so dropping the file
// into android/app/src/main/assets by hand gets wiped by the next prebuild.
// That is why this is a plugin.
const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

const PEM_NAME = 'AppstoreAuthenticationKey.pem';
const SOURCE = path.join('amazon', PEM_NAME);

module.exports = function withAmazonAuthKey(config) {
  return withDangerousMod(config, [
    'android',
    (config) => {
      const src = path.join(config.modRequest.projectRoot, SOURCE);
      const assetsDir = path.join(
        config.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'assets'
      );
      const dest = path.join(assetsDir, PEM_NAME);

      if (!fs.existsSync(src)) {
        // Warn rather than throw: iOS and Play builds do not need this, and a
        // fresh clone should still prebuild. scripts/build-amazon-apk.sh is the
        // hard gate for Amazon builds.
        console.warn(
          `[withAmazonAuthKey] ${SOURCE} not found. Amazon in-app purchases ` +
            `will fail with "Failed to get user data" in any Amazon build made ` +
            `from this prebuild.`
        );
        return config;
      }

      fs.mkdirSync(assetsDir, { recursive: true });
      fs.copyFileSync(src, dest);
      return config;
    },
  ]);
};
