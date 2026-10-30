#!/bin/bash
# The app's own signing certificate, made once on your Mac and kept as the repository's MACOS_SIGNING secret, so CI
# signs every build with the same identity. The builds are otherwise signed ad hoc: macOS then sees each update as a
# new app and asks again for what you allowed (the external drive your sync folder is on, say), freezing the app at
# launch until you answer. Signed with one certificate, the permission stays across updates.
#
#   curl -fsSL https://raw.githubusercontent.com/mbradaschia/zotero-companion-launcher/master/macos/scripts/make-signing-cert.sh | bash
#
# It makes a self-signed code-signing certificate (20 years) and its key in a private temporary folder, checks that
# macOS can sign with it, then hands it to GitHub: with `gh` (signed in) it sets the secret itself; otherwise it
# copies the secret to the clipboard and opens the page to paste it in. Nothing is printed and nothing is kept: the
# folder is deleted when it ends. Run it again only to replace the certificate (macOS then asks once more).
set -euo pipefail

REPO="mbradaschia/zotero-companion-launcher"
NAME="MACOS_SIGNING"
SSL=/usr/bin/openssl # (macOS's own: its .p12 is one macOS's security tool imports)

[[ $(uname -s) == Darwin ]] || { echo "This runs on a Mac." >&2; exit 1; }
umask 077
work=$(mktemp -d)
keychain="$work/check.keychain-db"
cleanup() {
  security delete-keychain "$keychain" 2>/dev/null || true
  rm -rf "$work"
}
trap cleanup EXIT

cat > "$work/cert.cfg" <<'EOF'
[req]
distinguished_name = dn
x509_extensions = ext
prompt = no
[dn]
CN = Zotero Launcher (self-signed)
[ext]
basicConstraints = critical,CA:false
keyUsage = critical,digitalSignature
extendedKeyUsage = critical,codeSigning
subjectKeyIdentifier = hash
EOF

password=$("$SSL" rand -hex 24)
"$SSL" req -x509 -newkey rsa:2048 -nodes -days 7300 -config "$work/cert.cfg" -keyout "$work/key.pem" -out "$work/cert.pem" 2>/dev/null
"$SSL" pkcs12 -export -inkey "$work/key.pem" -in "$work/cert.pem" -name "Zotero Launcher" -out "$work/signing.p12" -passout "pass:$password"

# Checked the way CI uses it: imported into a keychain of its own, then signing a copy of a small program.
kpass=$("$SSL" rand -hex 16)
security create-keychain -p "$kpass" "$keychain"
security unlock-keychain -p "$kpass" "$keychain"
security import "$work/signing.p12" -k "$keychain" -P "$password" -T /usr/bin/codesign >/dev/null
security set-key-partition-list -S apple-tool:,apple: -s -k "$kpass" "$keychain" >/dev/null
identity=$(security find-identity -p codesigning "$keychain" | awk '/\)/ { print $2; exit }')
[[ -n $identity ]] || { echo "macOS didn't take the certificate: nothing was saved." >&2; exit 1; }
cp /usr/bin/true "$work/probe"
codesign --force --sign "$identity" --keychain "$keychain" "$work/probe" 2>/dev/null
codesign --verify "$work/probe" || { echo "Signing with it didn't check out: nothing was saved." >&2; exit 1; }

# The secret: the .p12's password, a colon, the .p12 in base64 (one value to paste).
printf '%s:%s' "$password" "$(base64 < "$work/signing.p12" | tr -d '\n')" > "$work/secret"

if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  gh secret set "$NAME" -R "$REPO" < "$work/secret"
  echo "Done: the repository's $NAME secret is set. The next release is signed with it."
else
  pbcopy < "$work/secret"
  open "https://github.com/$REPO/settings/secrets/actions/new"
  echo "The secret is on your clipboard. On the page that just opened: Name $NAME, paste it as the Secret, then Add secret."
  echo "(Then copy something else, so it doesn't stay on the clipboard.)"
fi
