#!/bin/bash
# The reading companion as the app carries it (Resources/CompanionKit): its server and page, and the files it reads
# in place, in the same tree as this checkout (the Mac app's JavaScript, the runner's paths, bridge and atomic writes,
# contracts/Paths.js and Merge.js), so each relative require finds what it does here. The app's build runs it
# (project.yml › CompanionKit); companion/tests/kit.test.mjs runs the server from what it lays out.
#   companion-kit.sh DEST
set -euo pipefail
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
DEST=${1:?usage: companion-kit.sh DEST}
rm -rf "$DEST"
mkdir -p "$DEST/macos/companion" "$DEST/macos/js" "$DEST/macos/ZoteroLauncher/Core" "$DEST/macos/ZoteroLauncher/Review" "$DEST/macos/runner/lib" "$DEST/contracts"
cp -R "$ROOT/companion/server.mjs" "$ROOT/companion/lib" "$ROOT/companion/web" "$DEST/macos/companion/"
cp -R "$ROOT/js/lib" "$ROOT/js/vendor" "$DEST/macos/js/"
cp "$ROOT"/ZoteroLauncher/Core/Glue*.js "$DEST/macos/ZoteroLauncher/Core/"
cp "$ROOT/ZoteroLauncher/Review/ReviewCore.js" "$DEST/macos/ZoteroLauncher/Review/"
cp "$ROOT/runner/lib/paths.mjs" "$ROOT/runner/lib/bridge.mjs" "$ROOT/runner/lib/atomic.mjs" "$DEST/macos/runner/lib/"
cp "$ROOT/../contracts/Paths.js" "$ROOT/../contracts/Merge.js" "$DEST/contracts/"
