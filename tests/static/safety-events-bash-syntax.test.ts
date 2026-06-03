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

    it('exits 1 when --project is missing (AC-4d)', () => {
        let exitCode = 0;
        try {
            execFileSync('bash', [SH_PATH], { stdio: 'pipe' });
        } catch (e) {
            exitCode = (e as { status?: number }).status ?? -1;
        }
        expect(exitCode).toBe(1);
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

    it('exits 1 when --project value looks like a flag (M-1 defensive)', () => {
        let exitCode = 0;
        try {
            execFileSync('bash', [SH_PATH, '--project', '--dry-run'], { stdio: 'pipe' });
        } catch (e) {
            exitCode = (e as { status?: number }).status ?? -1;
        }
        expect(exitCode).toBe(1);
    });

    it('exits 1 when --project value is malformed (M-1 GCP project ID format)', () => {
        let exitCode = 0;
        try {
            // GCP project ID は小文字始まり、6-30 文字、hyphen 末尾不可。
            // 'UpperCase' は invalid。
            execFileSync('bash', [SH_PATH, '--project', 'UpperCase'], { stdio: 'pipe' });
        } catch (e) {
            exitCode = (e as { status?: number }).status ?? -1;
        }
        expect(exitCode).toBe(1);
    });
});
