#!/usr/bin/env bash
# List every failed test file from Vitest JSON reports (frontend/test-results/*.json)
# in the job summary and the log, so a second failure under load doesn't scroll
# off (#728). Run from frontend/. Exits 0: the test step itself carries the failure.
set -uo pipefail
shopt -s nullglob

files=(test-results/*.json)
if [ ${#files[@]} -eq 0 ]; then
  echo "No result files written."
  exit 0
fi

failed=$(jq -r '.testResults[] | select(.status == "failed") | .name | sub(".*/frontend/"; "")' "${files[@]}" | sort -u)

{
  echo "### Failed test files"
  if [ -z "$failed" ]; then
    echo "None."
  else
    echo "$failed" | sed 's/.*/- `&`/'
  fi
} >> "${GITHUB_STEP_SUMMARY:-/dev/stdout}"

echo "${failed:-No failed test files.}"
