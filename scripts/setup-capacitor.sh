#!/bin/bash

set -e

echo "Building web app..."
npm run build

echo "Initializing Capacitor platforms..."
npx cap add ios 2>/dev/null || echo "iOS platform already exists"
npx cap add android 2>/dev/null || echo "Android platform already exists"

echo "Syncing Capacitor..."
npx cap sync

echo "Patching iOS permissions..."
PLIST="ios/App/App/Info.plist"
if [ -f "$PLIST" ]; then
  if ! grep -q "NSCameraUsageDescription" "$PLIST"; then
    sed -i '' 's|</dict>|  <key>NSCameraUsageDescription</key>\n  <string>QuickStack uses your camera to scan comic book covers and automatically identify your comics.</string>\n  <key>NSPhotoLibraryUsageDescription</key>\n  <string>QuickStack accesses your photo library to let you select comic cover images for your collection.</string>\n  <key>NSPhotoLibraryAddUsageDescription</key>\n  <string>QuickStack saves comic cover photos to your photo library.</string>\n</dict>|' "$PLIST"
    echo "iOS permissions added."
  else
    echo "iOS permissions already present."
  fi
else
  echo "iOS Info.plist not found - run after adding iOS platform."
fi

echo "Patching Android permissions..."
MANIFEST="android/app/src/main/AndroidManifest.xml"
if [ -f "$MANIFEST" ]; then
  if ! grep -q "CAMERA" "$MANIFEST"; then
    sed -i 's|<uses-permission android:name="android.permission.INTERNET" />|<uses-permission android:name="android.permission.INTERNET" />\n    <uses-permission android:name="android.permission.CAMERA" />\n    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />\n    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="29" />\n    <uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />\n    <uses-feature android:name="android.hardware.camera" android:required="false" />|' "$MANIFEST"
    echo "Android permissions added."
  else
    echo "Android permissions already present."
  fi
else
  echo "Android AndroidManifest.xml not found - run after adding Android platform."
fi

echo ""
echo "Capacitor setup complete!"
echo ""
echo "Next steps:"
echo "  iOS:     npx cap open ios     (requires Xcode on macOS)"
echo "  Android: npx cap open android (requires Android Studio)"
echo ""
echo "To rebuild after code changes:"
echo "  npm run build && npx cap sync"
