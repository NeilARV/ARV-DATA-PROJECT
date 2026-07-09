#!/usr/bin/env bash
# DS.NO-HARDCODED-COLOR — flag unsanctioned color literals in frontend code.
#
#   check-hex.sh                 # check files changed vs HEAD
#   check-hex.sh --staged        # check the staged diff (pre-commit hook)
#   check-hex.sh path/to/File.tsx [...]
#
# Exit 0 = clean. Exit 1 = violations found (printed to stderr).
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ALLOWLIST="$SKILL_DIR/hex-allowlist.txt"
[ -f "$ALLOWLIST" ] || { echo "missing $ALLOWLIST" >&2; exit 1; }

# Tailwind palettes that have no business in a component. `primary`, `card`,
# `muted-foreground` etc. are tokens and are absent from this list by design.
BANNED_PALETTES='gray|slate|zinc|neutral|stone|red|orange|yellow|green|blue|indigo|purple|pink'
# ...minus the four sanctioned utility families, which are matched and excused below.
SANCTIONED_UTILS='amber-400|amber-500|amber-600|amber-700|amber-50|amber-100|violet-400'

mapfile -t EXEMPT_PATHS < <(grep '^path:' "$ALLOWLIST" | sed 's/^path://')
mapfile -t ALLOWED_HEX  < <(grep -oiE '^#[0-9a-f]{6}' "$ALLOWLIST" | tr '[:lower:]' '[:upper:]')

case "${1-}" in
  --staged) mapfile -t FILES < <(git diff --cached --name-only --diff-filter=ACM) ;;
  "")       mapfile -t FILES < <(git diff --name-only HEAD --diff-filter=ACM) ;;
  *)        FILES=("$@") ;;
esac

is_exempt() {
  for p in "${EXEMPT_PATHS[@]}"; do [ "$1" = "$p" ] && return 0; done
  return 1
}
is_allowed_hex() {
  for h in "${ALLOWED_HEX[@]}"; do [ "$1" = "$h" ] && return 0; done
  return 1
}

violations=0
for f in "${FILES[@]}"; do
  [ -f "$f" ] || continue
  case "$f" in client/src/*|tailwind.config.ts) ;; *) continue ;; esac
  is_exempt "$f" && continue

  # Unsanctioned hex literals
  while IFS=: read -r line match; do
    [ -z "${match-}" ] && continue
    upper=$(printf '%s' "$match" | tr '[:lower:]' '[:upper:]')
    if ! is_allowed_hex "$upper"; then
      echo "$f:$line: DS.NO-HARDCODED-COLOR — unsanctioned hex $match" >&2
      violations=$((violations + 1))
    fi
  done < <(grep -noE '#[0-9a-fA-F]{6}' "$f" || true)

  # Tailwind palette colors (text-gray-300, bg-slate-800/50, border-red-500)
  while IFS=: read -r line match; do
    [ -z "${match-}" ] && continue
    printf '%s' "$match" | grep -qE "($SANCTIONED_UTILS)" && continue
    echo "$f:$line: DS.NO-HARDCODED-COLOR — palette color '$match' (use a semantic token)" >&2
    violations=$((violations + 1))
  done < <(grep -noE "(text|bg|border|fill|stroke|ring|from|to|via)-($BANNED_PALETTES)-[0-9]{2,3}" "$f" || true)

  # Sub-12px type outside the two sanctioned contexts (DS.TYPE-FLOOR)
  case "$f" in
    */UserAvatar.tsx|*/PropertyTransactions.tsx) ;;
    *)
      while IFS=: read -r line match; do
        [ -z "${match-}" ] && continue
        echo "$f:$line: DS.TYPE-FLOOR — arbitrary type size '$match' (12px floor)" >&2
        violations=$((violations + 1))
      done < <(grep -noE 'text-\[[0-9]+px\]' "$f" || true)
      ;;
  esac
done

if [ "$violations" -gt 0 ]; then
  echo "" >&2
  echo "$violations violation(s). Tokens: .claude/skills/ui-design/references/colors.md" >&2
  echo "If a value is genuinely categorical, add it to scripts/hex-allowlist.txt AND colors.md." >&2
  exit 1
fi
exit 0