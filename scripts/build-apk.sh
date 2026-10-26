#!/usr/bin/env bash
# Compila el APK de la app móvil y lo deja en services/web/public/app.apk, que sirve /app.apk.
# Lo usan ci.yml (valida que el APK compila) y deploy.yml (lo mete en la imagen de web).
# Si no hay APK real, falla: nunca se publica el APK de respaldo del servidor.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
apk="services/mobile/android/app/build/outputs/apk/release/app-release.apk"

cd "$root"
pnpm --filter @mcet/schemas build
pnpm --filter @mcet/i18n build

cd services/mobile
npm ci
npx expo prebuild --platform android --clean --no-install

cd android
chmod +x gradlew
./gradlew assembleRelease --no-daemon
cd "$root"

if [ ! -f "$apk" ]; then
  echo "::error::No se generó $apk" >&2
  exit 1
fi
# Un APK real pesa varios MB y lleva AndroidManifest.xml; el respaldo del servidor no.
size=$(wc -c < "$apk")
if [ "$size" -lt 5000000 ] || ! unzip -l "$apk" | grep -q "AndroidManifest.xml"; then
  echo "::error::$apk no es un APK válido (${size} bytes)" >&2
  exit 1
fi

cp "$apk" services/web/public/app.apk
echo "APK ($size bytes) copiado a services/web/public/app.apk"
