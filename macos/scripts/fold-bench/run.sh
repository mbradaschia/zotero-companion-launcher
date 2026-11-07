#!/usr/bin/env bash
# The fold reader's extraction benchmark on this Mac (README.md): the papers downloaded, foldlines built from this
# checkout's FoldPDF.swift, each paper's lines and outline written, FoldMake.js scored. With BEFORE=<git ref>, the same
# for that ref's FoldPDF.swift and FoldMake.js first.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
macos="$(cd "$here/../.." && pwd)"
work="${1:-${TMPDIR:-/tmp}/fold-bench}"
mkdir -p "$work/pdfs"
while IFS=$'\t' read -r name url _rest; do
  [[ -z "$name" || "$name" == \#* ]] && continue
  [[ -s "$work/pdfs/$name.pdf" ]] && continue
  curl -fsSL --retry 4 --retry-delay 3 -A "zotero-launcher-fold-bench" -o "$work/pdfs/$name.pdf" "$url" || echo "couldn't download $name" >&2
done < "$here/papers.tsv"

build() { # build DIR FOLDPDF.swift [shim.swift]
  mkdir -p "$1"
  swiftc -O -o "$1/foldlines" "$2" "$here/main.swift" ${3:+"$3"}
}
score() { # score LINES_DIR FOLDMAKE_DIR LABEL
  node "$here/bench.mjs" "$1" "$2" "$3"
}

if [[ -n "${BEFORE:-}" ]]; then
  old="$work/before"
  mkdir -p "$old/js"
  git -C "$macos" show "$BEFORE:macos/ZoteroLauncher/Reader/FoldPDF.swift" > "$old/FoldPDF.swift"
  git -C "$macos" show "$BEFORE:macos/ZoteroLauncher/Reader/FoldMake.js" > "$old/js/FoldMake.js"
  git -C "$macos" show "$BEFORE:macos/ZoteroLauncher/Reader/FoldCore.js" > "$old/js/FoldCore.js"
  if ! grep -q "func outlineNow" "$old/FoldPDF.swift"; then
    printf 'extension FoldPDF { func outlineNow() -> [[String: Any]] { [] } }\n' > "$old/shim.swift"
  fi
  build "$old" "$old/FoldPDF.swift" "$( [[ -f "$old/shim.swift" ]] && echo "$old/shim.swift" )"
  "$old/foldlines" "$old/lines" "$work"/pdfs/*.pdf
  score "$old/lines" "$old/js" "Before ($BEFORE)"
fi

new="$work/after"
build "$new" "$macos/ZoteroLauncher/Reader/FoldPDF.swift"
"$new/foldlines" "$new/lines" "$work"/pdfs/*.pdf
score "$new/lines" "$macos/ZoteroLauncher/Reader" "After (this checkout)"
