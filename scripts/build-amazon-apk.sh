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

export EXPO_PUBLIC_STORE=amazon
(cd android && ./gradlew assembleRelease)

APK=android/app/build/outputs/apk/release/app-release.apk
ls -lh "$APK"
echo "Amazon APK ready: $APK"
