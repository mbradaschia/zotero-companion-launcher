#!/bin/bash
# Cut a release: make release VERSION=1.2.3 (semver: breaking.feature.fix).
#
#   1. checks: clean tree on master, the tag is new, the CHANGELOG's [Unreleased] has entries
#   2. sets the version in manifest.json, zotero-bridge/manifest.in.json, daemon/package.json
#      (+ its lockfile)
#   3. dates the CHANGELOG: [Unreleased] → [1.2.3] - YYYY-MM-DD, with its compare link (the Mac app's
#      sections stay under [Unreleased]: scripts/release-changelog.js)
#   4. runs the tests, builds dist/zotero-companion-bridge-1.2.3.xpi and zotero-bridge/updates.json
#   5. commits "Release v1.2.3"
#
# Nothing is pushed: check the commit, then `git push origin master` (or merge it by a pull
# request). The new version on master starts .github/workflows/release.yml, which rebuilds the
# .xpi, checks it byte for byte against updates.json, tags v1.2.3 on that commit and publishes
# the GitHub release with it. Zotero updates installed bridges from updates.json on master
# (manifest.json's update_url); `omarchy plugin update` pulls the shell plugin from master.
# From another branch (RELEASE_BRANCH=…), push a tag v1.2.3 yourself: the workflow takes that too.
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT"
VERSION=${1:-}
BRANCH=${RELEASE_BRANCH:-master}
REPO_URL=${OMA_ZOTERO_REPO_URL:-https://github.com/mbradaschia/zotero-companion-launcher}

fail() { echo "release: $*" >&2; exit 1; }

[[ $VERSION =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail "usage: make release VERSION=X.Y.Z (semver)"
[[ -z $(git status --porcelain) ]] || fail "the working tree has changes: commit or stash them first"
[[ $(git branch --show-current) == "$BRANCH" ]] || fail "releases are cut from $BRANCH (RELEASE_BRANCH=… to override)"
# CI makes the release tags on the remote: fetch them, for the checks below and the CHANGELOG's compare link.
git fetch -q --tags origin 2>/dev/null || echo "release: couldn't fetch the tags from origin: going by the local ones" >&2
git rev-parse -q --verify "refs/tags/v$VERSION" >/dev/null && fail "tag v$VERSION already exists"

current=$(scripts/check-versions.sh)
newest=$(printf '%s\n%s\n' "$current" "$VERSION" | sort -V | tail -1)
[[ $newest == "$VERSION" ]] || fail "$VERSION is older than the current $current"
if [[ $VERSION == "$current" ]] && git tag -l 'v*' | grep -q .; then
  fail "$VERSION is already the current version: pick the next one"
fi

# The [Unreleased] section must say what changed (the Mac app's sections aside: they stay under
# [Unreleased], scripts/release-changelog.js).
notes=$(node scripts/release-changelog.js pending | grep -v '^\s*$' || true)
[[ -n $notes ]] || fail "CHANGELOG.md: [Unreleased] has nothing but the Mac app's sections; list the changes first"

echo "== version $current → $VERSION"
tmp=$(mktemp)
for f in manifest.json zotero-bridge/manifest.in.json daemon/package.json; do
  jq --indent 2 --arg v "$VERSION" '.version = $v' "$f" >"$tmp" && cat "$tmp" >"$f"
done
jq --indent 2 --arg v "$VERSION" '.version = $v | .packages[""].version = $v' daemon/package-lock.json >"$tmp" && cat "$tmp" >daemon/package-lock.json
rm -f "$tmp"
scripts/check-versions.sh "$VERSION" >/dev/null
scripts/bridge-manifest.sh # the dev-linked bridge gets the new version too

echo "== CHANGELOG"
today=$(date -u +%Y-%m-%d)
prev=$(git tag -l 'v*' --sort=-v:refname | head -1)
node scripts/release-changelog.js cut "$VERSION" "$today" "$prev" "$REPO_URL"

echo "== tests"
make -s test >/dev/null || fail "the tests fail"

echo "== build"
scripts/build-xpi.sh

git add -A
git commit -q -m "Release v$VERSION"
echo
echo "Committed the release of v$VERSION. Check it (git show), then publish:"
if [[ $BRANCH == master ]]; then
  echo "  git push origin master    (CI tags v$VERSION on it and publishes the release)"
else
  echo "  git push origin $BRANCH && git tag v$VERSION && git push origin v$VERSION"
fi
