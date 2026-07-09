#!/usr/bin/env bash
#
# Collects the committed diff consumed by the `smell` skill.
# Usage: smell-diff.sh <mode> [base-or-ref]
#
#   mode = pr      -> the whole branch vs main, via the three-dot merge-base diff
#                     (BASE...HEAD). This is exactly what GitHub shows as the PR diff:
#                     every commit since the branch diverged, ignoring later main commits.
#   mode = commit  -> the unpushed commits (@{upstream}..HEAD). Falls back to the latest
#                     commit (HEAD~1..HEAD) when the branch is fully pushed or has no upstream.
#
# Committed changes only — the working tree (staged + unstaged) is intentionally excluded,
# because both modes answer "is what's *committed* clean?" (match-intent).
#
# Optional [base-or-ref] overrides the resolution:
#   pr     <branch>        -> diff vs that branch instead of main
#   commit <sha>           -> that single commit (sha^..sha)
#   commit <A>..<B>        -> that explicit range
#
# Intentionally NOT using `set -e`/`pipefail`: the base-resolution fallbacks and the
# `git ... || true` guards rely on non-zero exits being tolerated so a partial diff prints.

MODE="${1:-}"
OVERRIDE="${2:-}"

case "$MODE" in
  pr)
    if [ -n "$OVERRIDE" ]; then
      BASE="$OVERRIDE"
    else
      BASE=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed "s@^refs/remotes/@@")
      [ -z "$BASE" ] && BASE="origin/main"
      git rev-parse "$BASE" >/dev/null 2>&1 || BASE="main"
    fi
    git rev-parse "$BASE" >/dev/null 2>&1 || {
      echo "ERROR: base $BASE not found. Pass one explicitly: smell pr <branch>"
      exit 1
    }
    RANGE="$BASE...HEAD"   # three-dot: vs the branch-off point (merge-base) == the PR diff
    LABEL="PR — whole branch vs $BASE (merge-base / branch-off point)"
    ;;

  commit)
    if [ -n "$OVERRIDE" ]; then
      case "$OVERRIDE" in
        *..*) RANGE="$OVERRIDE" ;;                 # explicit range A..B or A...B
        *)    RANGE="$OVERRIDE^..$OVERRIDE" ;;     # a single commit -> its own diff
      esac
      LABEL="commit — explicit ($RANGE)"
    else
      UPSTREAM=$(git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null)
      if [ -n "$UPSTREAM" ] && [ -n "$(git rev-list "$UPSTREAM..HEAD" 2>/dev/null)" ]; then
        RANGE="$UPSTREAM..HEAD"                    # the unpushed commits
        LABEL="commit — unpushed ($UPSTREAM..HEAD)"
      else
        RANGE="HEAD~1..HEAD"                       # nothing unpushed / no upstream
        LABEL="commit — latest (HEAD~1..HEAD); no unpushed commits vs upstream"
      fi
    fi
    ;;

  *)
    echo "ERROR: mode must be 'commit' or 'pr'."
    echo "Usage: smell-diff.sh <commit|pr> [base-or-ref]"
    exit 1
    ;;
esac

echo "===== MODE: $MODE  |  $LABEL ====="
echo "===== RANGE: $RANGE ====="
echo
echo "----- Changed files -----"
git diff --name-status "$RANGE" || true
echo
echo "----- Stat -----"
git diff --stat "$RANGE" || true
echo
echo "===== Committed diff (-U10) ====="
git diff -U10 "$RANGE" || true
