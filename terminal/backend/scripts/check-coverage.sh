#!/usr/bin/env bash
set -euo pipefail

threshold="${1:-60}"
coverage_file="${2:-coverage.out}"

if [[ ! -f "${coverage_file}" ]]; then
  echo "Coverage file '${coverage_file}' not found. Run: go test ./... -coverprofile=${coverage_file}"
  exit 1
fi

total="$(go tool cover -func="${coverage_file}" | awk '/^total:/ {gsub("%","",$3); print $3}')"
if [[ -z "${total}" ]]; then
  echo "Failed to read total coverage from ${coverage_file}"
  exit 1
fi

echo "Backend total coverage: ${total}% (required: >=${threshold}%)"
awk -v c="${total}" -v t="${threshold}" 'BEGIN { exit (c + 0 >= t + 0 ? 0 : 1) }' || {
  echo "Coverage gate failed: expected at least ${threshold}%, got ${total}%"
  exit 1
}
