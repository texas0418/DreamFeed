#!/usr/bin/env bash
# Amazon Appstore build lane. Amazon takes a signed APK, not an AAB.
#
# EXPO_PUBLIC_STORE=amazon is inlined by Metro at bundle time; src/revenuecat.ts
# reads it to pick the Amazon RevenueCat key and set useAmazon on configure.
# Same release keystore as Play (android/keystore.properties must exist);
# Amazon accepts any signature we control and re-signs on their side anyway.
#
# Run from the repo root: ./scripts/build-amazon-apk.sh
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f android/keystore.properties ]; then
  echo "android/keystore.properties missing: the APK would be debug-signed." >&2
  echo "Copy it from the main checkout (it is untracked on purpose)." >&2
  exit 1
fi

if [ ! -f amazon/AppstoreAuthenticationKey.pem ]; then
  echo "amazon/AppstoreAuthenticationKey.pem missing: Amazon IAP would fail with" >&2
  echo "\"Failed to get user data\" and no purchase could start." >&2
  echo "Download it from the Developer Console: the app > Step 1 > Additional" >&2
  echo "information > View public key." >&2
  exit 1
fi

export EXPO_PUBLIC_STORE=amazon
(cd android && ./gradlew assembleRelease)

APK=android/app/build/outputs/apk/release/app-release.apk
# The key is only useful if it actually made it into the binary. Checking the
# artifact, not just the inputs, is the lesson from the Oct 2026 rejections.
APK_ENTRIES=$(unzip -Z1 "$APK")
case "$APK_ENTRIES" in
  *"assets/AppstoreAuthenticationKey.pem"*)
    echo "Verified: assets/AppstoreAuthenticationKey.pem is in the APK." ;;
  *)
    echo "APK does not contain assets/AppstoreAuthenticationKey.pem." >&2
    echo "Run: npx expo prebuild --platform android --no-install, then rebuild." >&2
    exit 1 ;;
esac

ls -lh "$APK"
echo "Amazon APK ready: $APK"
