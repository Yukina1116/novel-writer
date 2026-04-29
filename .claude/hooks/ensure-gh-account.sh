#!/usr/bin/env bash
# Auto-switch `gh` active account to this project's GitHub identity before
# any Bash command that invokes `gh`.
#
# Why:
#   `gh auth` state is shared machine-wide via ~/.config/gh/hosts.yml. Other
#   claude sessions / terminals running `gh auth switch` flip the active
#   account, so `gh pr create` / `gh pr merge` from this project may run as
#   the wrong user and fail GitHub's collaborator check.
#
#   `.envrc` already calls `gh auth switch` on shell entry, but direnv relies
#   on the shell's interactive hook (`eval "$(direnv hook bash)"`); Claude
#   Code's Bash tool spawns non-interactive subshells where direnv does not
#   fire. Hence this PreToolUse hook bridges the gap.
#
# Sunset condition (remove this hook when any of the following holds):
#   1. Global ~/.claude/ enforces "restore prior gh active account at session
#      end" (i.e. the cross-session leakage stops at the source).
#   2. Claude Code's Bash tool starts firing direnv hooks (track Claude Code
#      changelog / public issues).
#   3. The project moves to per-command identity (`gh --user X` everywhere or
#      ephemeral `GH_TOKEN` injection), making the active account irrelevant.
#
# PreToolUse hook contract (Claude Code official):
#   exit 0 -> allow tool call (stderr is recorded in transcript, not blocking)
#   exit 2 -> BLOCK tool call (stderr fed back to Claude as error)
# This script never exits 2 by design: every error path falls through to
# `exit 0` so a misconfigured switch never blocks the user's Bash command.
set -euo pipefail

PROJECT_GH_USER="yasushi-honda"

if ! command -v jq >/dev/null 2>&1; then
  printf '[ensure-gh-account] WARN: jq not in PATH; auto gh-switch disabled\n' >&2
  exit 0
fi

input=$(cat)
if ! cmd=$(jq -r '.tool_input.command // ""' <<<"$input" 2>&1); then
  printf '[ensure-gh-account] WARN: jq parse error: %s\n' "$cmd" >&2
  exit 0
fi

# Match `gh` as a standalone command word.
# Left boundary:  start of string, or any whitespace (incl. \n / \t), pipe,
#                 &&, ;, paren, backtick.
# Right boundary: any whitespace, end of string, closing paren (covers
#                 `result=$(gh pr list)` form), or backtick.
# False positives avoided: something_gh, /path/to/gh, ./gh, ghostty, length.
# Known false negatives (acceptable, per PR #80 risk note): absolute-path
# invocations like `/usr/local/bin/gh`. Manual switch falls back to runbook.
if [[ "$cmd" =~ (^|[[:space:]\|\&\;\(\`])gh([[:space:]\)\`]|$) ]]; then
  if ! err=$(gh auth switch --user "$PROJECT_GH_USER" 2>&1); then
    # Surface to stderr (transcript-only, non-blocking) so a misconfigured
    # account is debuggable instead of silently retaining a wrong active user.
    printf '[ensure-gh-account] WARN: gh auth switch to %s failed: %s\n' \
      "$PROJECT_GH_USER" "$err" >&2
  fi
fi

exit 0
