// Static behavioral check: .claude/hooks/ensure-gh-account.sh must always exit 0,
// even when the PreToolUse input is malformed / empty / missing required fields.
//
// Why: PreToolUse hook with non-zero exit blocks the entire Bash tool call from
// Claude Code. A bug here would silently break every Bash command in this
// project, with confusing failure modes. The hook script is purely advisory
// (auto-switches gh active account), so any hard failure is a regression.

import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const HOOK_PATH = resolve(__dirname, '../../.claude/hooks/ensure-gh-account.sh');

const runHook = (input: string) =>
    spawnSync('bash', [HOOK_PATH], {
        input,
        encoding: 'utf-8',
        timeout: 10_000,
    });

describe('.claude/hooks/ensure-gh-account.sh resilience', () => {
    it('exits 0 with empty input', () => {
        const result = runHook('');
        expect(result.status).toBe(0);
    });

    it('exits 0 when input is malformed JSON', () => {
        const result = runHook('not-json{{{');
        expect(result.status).toBe(0);
    });

    it('exits 0 when tool_input.command is missing', () => {
        const result = runHook(JSON.stringify({ tool_name: 'Bash' }));
        expect(result.status).toBe(0);
    });

    it('exits 0 when tool_input.command is null', () => {
        const result = runHook(JSON.stringify({ tool_input: { command: null } }));
        expect(result.status).toBe(0);
    });

    it('exits 0 when tool_input is unrelated structure', () => {
        const result = runHook(JSON.stringify({ tool_input: { other: 'value' } }));
        expect(result.status).toBe(0);
    });

    it('exits 0 for non-gh command (no switch attempted)', () => {
        const result = runHook(JSON.stringify({ tool_input: { command: 'git status' } }));
        expect(result.status).toBe(0);
    });

    it('exits 0 even when command contains gh (switch may succeed or warn)', () => {
        // The hook may attempt `gh auth switch` but must surface failure via
        // stderr WARN and still exit 0 so the Bash tool is not blocked.
        const result = runHook(JSON.stringify({ tool_input: { command: 'gh pr list' } }));
        expect(result.status).toBe(0);
    });
});
