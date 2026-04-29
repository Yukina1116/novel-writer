#!/usr/bin/env bash
# Auto-switch `gh` active account to yasushi-honda before any Bash command
# that invokes `gh`.
#
# Why: this project's GitHub identity is yasushi-honda, but `gh auth` state is
# shared machine-wide via ~/.config/gh/hosts.yml. Other claude sessions and
# direnv-less subshells can leave Active account pointing to a different user
# (e.g. yasushihonda-acg), which breaks `gh pr create` / `gh pr merge` etc.
# direnv `.envrc` does not fire under Claude Code's Bash tool because each
# tool call spawns a fresh subshell.
set -euo pipefail

input=$(cat)
cmd=$(jq -r '.tool_input.command // ""' <<<"$input" 2>/dev/null || echo "")

# Match `gh` as a standalone command word (start, or after pipe/&&/;/space/paren/backtick).
# Avoid false positives like `something_gh` or `/path/to/gh`.
if [[ "$cmd" =~ (^|[[:space:]\|\&\;\(\`])gh([[:space:]]|$) ]]; then
  gh auth switch --user yasushi-honda >/dev/null 2>&1 || true
fi

exit 0
