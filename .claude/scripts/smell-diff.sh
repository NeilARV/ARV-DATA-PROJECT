#!/usr/bin/env bash
#
# Collects the diff consumed by the /smell slash command.
# $1 is an optional explicit base branch; when omitted we resolve
# origin/HEAD -> origin/main -> main.
#
# Intentionally NOT using `set -e`/`pipefail`: the base-resolution
# fallbacks and the `git diff ... || true` guards rely on non-zero
# exits being tolerated so a partial diff still prints.

BASE="${1:-}"
if [ -z "$BASE" ]; then
  BASE=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed "s@^refs/remotes/@@")
  [ -z "$BASE" ] && BASE="origin/main"
  git rev-parse "$BASE" >/dev/null 2>&1 || BASE="main"
fi

if ! git rev-parse "$BASE" >/dev/null 2>&1; then
  echo "ERROR: base $BASE not found. Pass an explicit branch: /smell <branch>"
  exit 1
fi

echo "===== BASE: $BASE ====="
echo
echo "----- Stat (committed vs $BASE) -----"
git diff --stat "$BASE"...HEAD || true
echo
echo "----- Stat (working tree, staged+unstaged) -----"
git diff --stat HEAD || true
echo
echo "===== Committed diff (vs $BASE, -U10) ====="
git diff -U10 "$BASE"...HEAD || true
echo
echo "===== Working-tree diff (staged + unstaged, -U10) ====="
git diff -U10 HEAD || true
