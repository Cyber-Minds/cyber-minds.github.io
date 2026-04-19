#!/usr/bin/env bash
# =============================================================================
# CTF-01 Linux Basics Warmup — Deterministic Checker
#
# Usage:
#   bash ctf01-check.sh              (run from workspace dir)
#   bash ctf01-check.sh /path/to/ws  (explicit workspace path)
#
# Exit codes:
#   0 = PASS — all checks satisfied
#   1 = FAIL — one or more checks failed
#
# This script is the authoritative source for what constitutes a passing
# submission. The inline checkScript in state.js must stay in sync with
# this file. CI should run this script against a seeded fixture workspace
# before releasing the challenge.
# =============================================================================
set -euo pipefail

WORKSPACE="${1:-$(pwd)}"
REPORT="$WORKSPACE/report.txt"

# ---------------------------------------------------------------------------
# Step 1 — report.txt must exist
# ---------------------------------------------------------------------------
if [[ ! -f "$REPORT" ]]; then
  echo "FAIL [CTF-01/step-1]: report.txt not found in workspace: $WORKSPACE"
  echo "     Hint: run 'touch report.txt' or 'echo \"...\" > report.txt'"
  exit 1
fi

# ---------------------------------------------------------------------------
# Step 2 — report.txt must be non-empty
# ---------------------------------------------------------------------------
if [[ ! -s "$REPORT" ]]; then
  echo "FAIL [CTF-01/step-2]: report.txt exists but is empty."
  echo "     Hint: write one line summarising directory ownership, e.g.:"
  echo "       echo \"owner: cyberminds\" > report.txt"
  exit 1
fi

# ---------------------------------------------------------------------------
# Step 3 — must contain at least one ownership keyword (case-insensitive)
#   Accepted keywords: owner, permission, user, group
# ---------------------------------------------------------------------------
if ! grep -Eqi "(owner|permission|user|group)" "$REPORT"; then
  echo "FAIL [CTF-01/step-3]: report.txt must mention at least one of:"
  echo "     owner | permission | user | group"
  echo "     Current content of report.txt:"
  sed 's/^/     /' "$REPORT"
  exit 1
fi

# ---------------------------------------------------------------------------
# All checks passed
# ---------------------------------------------------------------------------
echo "PASS [CTF-01]: All checks satisfied. report.txt is valid."
echo "     File: $REPORT"
echo "     Size: $(wc -c < "$REPORT") bytes"
exit 0