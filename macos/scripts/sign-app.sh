#!/bin/bash
# Signs an app with the app's own certificate: MACOS_SIGNING (the p12's password, a colon, the p12 in base64, as
# make-signing-cert.sh makes it) in the environment, the app as the argument. CI runs it on every release build.
#
#   MACOS_SIGNING=... scripts/sign-app.sh build/Build/Products/Release/ZoteroLauncher.app
#
# The certificate goes into a keychain of its own, put on the search list only while signing (codesign finds no
# identity in a keychain that isn't on it, --keychain or not), then removed. The secret is never printed.
set -euo pipefail

app=${1:?usage: sign-app.sh ZoteroLauncher.app}
[[ -n ${MACOS_SIGNING:-} ]] || { echo "no MACOS_SIGNING in the environment" >&2; exit 1; }
[[ -d $app ]] || { echo "no app at $app" >&2; exit 1; }

umask 077
work=$(mktemp -d)
keychain="$work/signing.keychain-db"
searched=()
while IFS= read -r k; do
  k=${k#*\"}; searched+=("${k%\"}")
done < <(security list-keychains -d user)
cleanup() {
  security list-keychains -d user -s ${searched[@]+"${searched[@]}"} 2>/dev/null || true
  security delete-keychain "$keychain" 2>/dev/null || true
  rm -rf "$work"
}
trap cleanup EXIT

kpass=$(openssl rand -hex 16)
security create-keychain -p "$kpass" "$keychain"
security set-keychain-settings -lut 3600 "$keychain"
security unlock-keychain -p "$kpass" "$keychain"
printf '%s' "${MACOS_SIGNING#*:}" | base64 --decode > "$work/signing.p12"
security import "$work/signing.p12" -k "$keychain" -P "${MACOS_SIGNING%%:*}" -T /usr/bin/codesign >/dev/null
rm -f "$work/signing.p12"
security set-key-partition-list -S apple-tool:,apple: -s -k "$kpass" "$keychain" >/dev/null
security list-keychains -d user -s "$keychain" ${searched[@]+"${searched[@]}"}

id=$(security find-identity -p codesigning "$keychain" | awk '/\)/ { print $2; exit }')
[[ -n $id ]] || { echo "the certificate in MACOS_SIGNING isn't a code-signing identity" >&2; exit 1; }
codesign --force --deep --sign "$id" --keychain "$keychain" --preserve-metadata=identifier,entitlements,flags "$app"
codesign --verify --deep --strict "$app"
# Signed with a certificate, the requirement names it; ad hoc, it's only the build's hash (cdhash), new every build.
if codesign -d -r- "$app" 2>&1 | grep designated | grep -q 'cdhash'; then
  echo "the app's requirement is still a build hash: not signed with the certificate" >&2
  exit 1
fi
echo "signed with the app's certificate"
