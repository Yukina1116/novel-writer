// Static check: scripts/setup-safety-event-metrics.sh が bash 構文として
// 有効であることを保証する (Issue #137 #7 AC-4a)。
//
// `bash -n` は parse-only 実行で副作用ゼロ。gcloud 等の external command 呼出は
// 実行されない。CI で構文 regression を早期検知する。

import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { ALL_SAFETY_EVENT_NAMES } from '../../server/utils/promptSafetyEvents';

const PROJECT_ROOT = resolve(__dirname, '../..');
const SH_PATH = resolve(PROJECT_ROOT, 'scripts/setup-safety-event-metrics.sh');

describe('setup-safety-event-metrics.sh bash syntax (AC-4a)', () => {
    it('passes bash -n syntax check', () => {
        // throws on non-zero exit (= syntax error). stderr/stdout は inherit せず capture。
        expect(() => {
            execFileSync('bash', ['-n', SH_PATH], { stdio: 'pipe' });
        }).not.toThrow();
    });

    // review-pr silent-failure 指摘: status === null (signal kill) や ENOENT (bash 不在)
    // で wrong-cause 報告にならないよう、status/signal/stderr/stdout を全て capture して
    // assertion failure 時に diagnostics として surface する helper。
    function runScriptExpectingExit(args: string[]): {
        status: number | null;
        signal: NodeJS.Signals | null;
        stderr: string;
        stdout: string;
    } {
        try {
            execFileSync('bash', [SH_PATH, ...args], { stdio: 'pipe' });
            return { status: 0, signal: null, stderr: '', stdout: '' };
        } catch (e) {
            const err = e as {
                status?: number | null;
                signal?: NodeJS.Signals | null;
                stdout?: Buffer;
                stderr?: Buffer;
            };
            return {
                status: err.status ?? null,
                signal: err.signal ?? null,
                stderr: err.stderr?.toString() ?? '',
                stdout: err.stdout?.toString() ?? '',
            };
        }
    }

    it('exits 1 when --project is missing (AC-4d)', () => {
        const result = runScriptExpectingExit([]);
        expect(
            result.status,
            `status=${result.status} signal=${result.signal}\nstderr:\n${result.stderr}\nstdout:\n${result.stdout}`
        ).toBe(1);
        expect(result.stderr).toContain('--project <PROJECT_ID> required');
    });

    it('--dry-run --project xxx outputs metric scaffolds for all SAFETY_EVENTS (AC-4b)', () => {
        const stdout = execFileSync(
            'bash',
            [SH_PATH, '--project', 'test-project-id', '--dry-run'],
            { stdio: 'pipe', encoding: 'utf-8' }
        );
        // ALL_SAFETY_EVENT_NAMES.length 分の "would create/update log-based metric:"
        // 行を確認 (enum 拡張時に test 側を手で更新する必要なし)。
        const matches = stdout.match(/would create\/update log-based metric:/g);
        expect(matches).not.toBeNull();
        expect(matches?.length).toBe(ALL_SAFETY_EVENT_NAMES.length);
    });

    it('exits 1 when --project value looks like a flag (defensive against flag-value collision)', () => {
        const result = runScriptExpectingExit(['--project', '--dry-run']);
        expect(
            result.status,
            `status=${result.status} signal=${result.signal}\nstderr:\n${result.stderr}\nstdout:\n${result.stdout}`
        ).toBe(1);
        expect(result.stderr).toContain('looks like a flag');
    });

    it('exits 1 when --project value is malformed (GCP project ID format)', () => {
        // GCP project ID は小文字始まり、6-30 文字、hyphen 末尾不可。
        // 'UpperCase' は invalid。
        const result = runScriptExpectingExit(['--project', 'UpperCase']);
        expect(
            result.status,
            `status=${result.status} signal=${result.signal}\nstderr:\n${result.stderr}\nstdout:\n${result.stdout}`
        ).toBe(1);
        expect(result.stderr).toContain('invalid GCP project ID format');
    });

    // Issue #149 残-A: dry-run output に実 gcloud command 文字列が含まれることを pin。
    // CI 環境 (gcloud 不在) では --dry-run の echo 出力のみが検証対象となる silent
    // failure path に対し、command 行の paired signal で flag rename / quoting bug /
    // metric 命名規約 typo / filter regex syntax regression を機械検知する。
    it('--dry-run output exposes actual gcloud command line for regression detection (Issue #149 残-A)', () => {
        const stdout = execFileSync(
            'bash',
            [SH_PATH, '--project', 'test-project-id', '--dry-run'],
            { stdio: 'pipe', encoding: 'utf-8' }
        );

        // (a) command 行が ALL_SAFETY_EVENT_NAMES.length (= 6) 件出力される
        const cmdLines = stdout.match(/command:\s+gcloud logging metrics create /g);
        expect(cmdLines).not.toBeNull();
        expect(cmdLines?.length).toBe(ALL_SAFETY_EVENT_NAMES.length);

        // (b) metric 命名規約 prompt_safety_<event-with-underscores>_count が全 event 分含まれる
        for (const event of ALL_SAFETY_EVENT_NAMES) {
            const expectedMetricName = `prompt_safety_${event.replace(/-/g, '_')}_count`;
            expect(stdout).toContain(`gcloud logging metrics create ${expectedMetricName}`);
        }

        // (c) filter regex pattern `jsonPayload.safetyEvent=~"^<event>(-batch)?$"` が
        //     全 event 分含まれる (filter syntax の regression を検知)
        for (const event of ALL_SAFETY_EVENT_NAMES) {
            const expectedFilter = `jsonPayload.safetyEvent=~"^${event}(-batch)?$"`;
            expect(stdout).toContain(expectedFilter);
        }

        // (d) --project=<value> 形式で project ID が展開されている
        expect(stdout).toContain('--project=test-project-id');
    });
});
