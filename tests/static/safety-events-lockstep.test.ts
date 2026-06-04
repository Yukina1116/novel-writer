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
//
// 規律:
//   TS 側は import で値を取得 (構文表現の変化に頑健)、sh 側は regex で抽出 (text なので)。

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SAFETY_EVENTS, ALL_SAFETY_EVENT_NAMES } from '../../server/utils/promptSafetyEvents';

const PROJECT_ROOT = resolve(__dirname, '../..');
const SH_PATH = resolve(PROJECT_ROOT, 'scripts/setup-safety-event-metrics.sh');

function tsEventValues(): Set<string> {
    return new Set(Object.values(SAFETY_EVENTS));
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
    it('TS SAFETY_EVENTS has exactly ALL_SAFETY_EVENT_NAMES.length entries', () => {
        const ts = tsEventValues();
        expect(ts.size).toBe(ALL_SAFETY_EVENT_NAMES.length);
    });

    it('extracts the same number of values from bash SAFETY_EVENTS as TS', () => {
        const ts = tsEventValues();
        const sh = extractShEventValues();
        expect(sh.size).toBe(ts.size);
    });

    it('TS and bash SAFETY_EVENTS contain identical sets', () => {
        const ts = tsEventValues();
        const sh = extractShEventValues();
        const onlyInTs = [...ts].filter((v) => !sh.has(v));
        const onlyInSh = [...sh].filter((v) => !ts.has(v));
        expect(onlyInTs).toEqual([]);
        expect(onlyInSh).toEqual([]);
    });

    it('values match the design-doc canonical entries', () => {
        // 設計文書 AC-2 の canonical entries. enum 拡張時はここを更新する規律
        // (runbook §7.3 のチェックリスト項目)。
        const expected = new Set([
            'image-omitted',
            'non-image-data-uri-omitted',
            'oversized-truncated',
            'recursion-depth-exceeded',
            'collection-overflow',
            'histogram-overflow',
            'bytes-estimation-failed',
        ]);
        expect(tsEventValues()).toEqual(expected);
        expect(extractShEventValues()).toEqual(expected);
    });
});
