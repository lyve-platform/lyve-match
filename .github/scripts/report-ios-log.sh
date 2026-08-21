#!/usr/bin/env bash
# Summarises an Xcode/altool log: prints full error context and highlights
# SDK / Xcode version problems as GitHub annotations + job summary entries.
set -uo pipefail

log_file="${1:-}"
stage="${2:-Build}"

if [ -z "$log_file" ] || [ ! -f "$log_file" ]; then
  echo "::warning::No log file found for stage '$stage' ($log_file)."
  exit 0
fi

sdk_pattern='SDK|iOS 2[0-9]|iphoneos|Xcode [0-9]|DEVELOPER_DIR|unsupported (platform|SDK)|requires a newer version|deployment target|SDK version|not installed|xcode-select'
err_pattern='(^|[[:space:]])error:|fatal error|\*\* ARCHIVE FAILED \*\*|\*\* EXPORT FAILED \*\*|\*\* BUILD FAILED \*\*|Code Signing Error|No profiles for|The operation couldn.t be completed|Provisioning profile|ITMS-[0-9]+'

echo "::group::$stage — SDK / Xcode related lines"
grep -nEi "$sdk_pattern" "$log_file" | tail -n 120 || echo "(none)"
echo "::endgroup::"

echo "::group::$stage — errors and failures"
grep -nEi "$err_pattern" "$log_file" | tail -n 120 || echo "(none)"
echo "::endgroup::"

echo "::group::$stage — last 200 log lines"
tail -n 200 "$log_file"
echo "::endgroup::"

# Annotate each distinct error so it shows up on the run summary page.
grep -Ei "$err_pattern" "$log_file" | sort -u | tail -n 25 | while IFS= read -r line; do
  clean=$(printf '%s' "$line" | tr -d '\r' | cut -c1-400)
  if printf '%s' "$clean" | grep -qEi "$sdk_pattern"; then
    echo "::error title=$stage — SDK/Xcode::$clean"
  else
    echo "::error title=$stage::$clean"
  fi
done

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "### $stage log highlights"
    echo '```'
    grep -Ei "$err_pattern" "$log_file" | sort -u | tail -n 25 || echo "(no errors detected)"
    echo '```'
  } >> "$GITHUB_STEP_SUMMARY"
fi

exit 0
