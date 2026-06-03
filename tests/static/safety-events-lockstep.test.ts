// Static check: server/utils/promptSafetyEvents.ts の SAFETY_EVENTS と
// scripts/setup-safety-event-metrics.sh の SAFETY_EVENTS bash array が
// 集合一致することを強制する (Issue #137 #7 AC-4c)。
//
// drift は Cloud Logging metric filter regex を壊す:
//   gcloud script の SAFETY_EVENTS に追加し忘れ → metric 作成されず alert 効かない
//   TS enum に追加し忘れ → runtime emit されず metric が常に 0
//
// 値を変更する場合、(1) server/utils/promptSafetyEvents.ts
// (2) scripts/setup-safety-event-metrics.sh の SAFETY_EVENTS 配列
// (3) docs/runbook/cloud-logging-safety-event-metrics.md の metric 名表
// を同時に更新する規律。本テストが drift を機械的に検知する。

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PROJECT_ROOT = resolve(__dirname, '../..');
const TS_PATH = resolve(PROJECT_ROOT, 'server/utils/promptSafetyEvents.ts');
const SH_PATH = resolve(PROJECT_ROOT, 'scripts/setup-safety-event-metrics.sh');

function extractTsEventValues(): Set<string> {
    const src = readFileSync(TS_PATH, 'utf-8');
    // SAFETY_EVENTS の object literal から 'event-name' を抽出。
    // 形式: KEY: 'event-name',
    // SCREAMING_SNAKE_CASE key + kebab-case 値 のみマッチ (誤検出防止)。
    const blockMatch = src.match(/SAFETY_EVENTS\s*=\s*\{([\s\S]*?)\}\s*as\s+const/);
    if (!blockMatch) {
        throw new Error('SAFETY_EVENTS const block not found in promptSafetyEvents.ts');
    }
    const block = blockMatch[1];
    const valueRegex = /[A-Z][A-Z0-9_]*\s*:\s*'([a-z][a-z0-9-]*)'/g;
    const values = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = valueRegex.exec(block)) !== null) {
        values.add(match[1]);
    }
    return values;
}

function extractShEventValues(): Set<string> {
    const src = readFileSync(SH_PATH, 'utf-8');
    // SAFETY_EVENTS=( ... ) bash array から "event-name" を抽出。
    // ALERT_ENABLED_BY_DEFAULT 等の別 array と区別するため、SAFETY_EVENTS= に限定。
    const blockMatch = src.match(/^SAFETY_EVENTS=\(([\s\S]*?)^\)/m);
    if (!blockMatch) {
        throw new Error('SAFETY_EVENTS bash array not found in setup-safety-event-metrics.sh');
    }
    const block = blockMatch[1];
    const valueRegex = /"([a-z][a-z0-9-]*)"/g;
    const values = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = valueRegex.exec(block)) !== null) {
        values.add(match[1]);
    }
    return values;
}

describe('safety-events lockstep — TS enum ↔ bash script SAFETY_EVENTS (AC-4c)', () => {
    it('extracts exactly 6 values from TS SAFETY_EVENTS', () => {
        const tsValues = extractTsEventValues();
        expect(tsValues.size).toBe(6);
    });

    it('extracts exactly 6 values from bash SAFETY_EVENTS', () => {
        const shValues = extractShEventValues();
        expect(shValues.size).toBe(6);
    });

    it('TS and bash SAFETY_EVENTS contain identical sets', () => {
        const tsValues = extractTsEventValues();
        const shValues = extractShEventValues();
        const onlyInTs = [...tsValues].filter((v) => !shValues.has(v));
        const onlyInSh = [...shValues].filter((v) => !tsValues.has(v));
        expect(onlyInTs).toEqual([]);
        expect(onlyInSh).toEqual([]);
    });

    it('values match the design-doc canonical 6 entries', () => {
        const expected = new Set([
            'image-omitted',
            'non-image-data-uri-omitted',
            'oversized-truncated',
            'recursion-depth-exceeded',
            'collection-overflow',
            'histogram-overflow',
        ]);
        expect(extractTsEventValues()).toEqual(expected);
        expect(extractShEventValues()).toEqual(expected);
    });
});
