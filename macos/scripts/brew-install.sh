#!/bin/bash
# Install one of the tools the AI features use with Homebrew: brew-install.sh <formula> (node,
# poppler, tesseract). The launcher's Settings › Setup runs this for Install Node.js, Install
# pdftotext and Read scans by OCR, and shows it in Processes. Exit 3: Homebrew isn't installed
# (the launcher copies the command instead).
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
FORMULA=${1:?usage: brew-install.sh <formula>}
[[ $FORMULA =~ ^(node|poppler|tesseract)$ ]] || { echo "brew-install: not one of the launcher's tools: $FORMULA" >&2; exit 2; }

BREW=$(command -v brew || true)
for b in /opt/homebrew/bin/brew /usr/local/bin/brew; do [[ -n $BREW ]] || { [[ -x $b ]] && BREW=$b; }; done
[[ -n $BREW ]] || { echo "brew-install: Homebrew isn't installed (brew.sh)" >&2; exit 3; }

# A task in the launcher's queue, as install-runner.sh's (none while Node itself is missing).
task() {
  command -v node >/dev/null || return 0
  node --input-type=module -e "
    const t = await import(process.argv[1]);
    const [op, id, detail, pid] = process.argv.slice(2);
    if (op === 'start') { const task = t.startTask({ kind: 'install', title: 'Install ' + id, paper: 'with Homebrew', pid: Number(pid) }); process.stdout.write(task.id); }
    else {
      const dir = t.tasksDir(); const fs = await import('node:fs'); const p = dir + '/' + id + '.json';
      const task = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (op === 'done') t.finishTask(task, { detail }); else t.failTask(task, detail);
    }" "$ROOT/runner/lib/tasks.mjs" "$@" 2>/dev/null || true
}

TASK=$(task start "$FORMULA" "" "$$")
trap 'task fail "$TASK" "brew install ${FORMULA} stopped (run it in Terminal to see why)"' ERR

HOMEBREW_NO_ENV_HINTS=1 "$BREW" install "$FORMULA"

trap - ERR
task done "$TASK" "installed with ${BREW}"
echo "installed ${FORMULA} with Homebrew"
