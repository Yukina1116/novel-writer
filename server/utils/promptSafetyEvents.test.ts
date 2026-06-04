import { describe, it, expect } from 'vitest';
import {
    SAFETY_EVENTS,
    SAFETY_EVENT_BATCH_SUFFIX,
    ALL_SAFETY_EVENT_NAMES,
    type SafetyEventName,
    type SafetyEventBatchName,
} from './promptSafetyEvents';

// Issue #137 #7 AC-1〜2: enum literal pin。
// 既存 Cloud Logging クエリ / runbook / docs/spec の値表と byte-for-byte 一致を強制する。
// drift は Cloud Logging metric filter regex を壊すため、ここで pin する。
describe('promptSafetyEvents — enum literal pin (AC-1, AC-2)', () => {
    it('SAFETY_EVENTS exports exactly 7 entries', () => {
        expect(Object.keys(SAFETY_EVENTS)).toHaveLength(7);
    });

    it('SAFETY_EVENTS values are byte-for-byte expected literals', () => {
        // AC-2: byte-for-byte 一致 (順序不問、集合比較)
        expect(new Set(Object.values(SAFETY_EVENTS))).toEqual(
            new Set([
                'image-omitted',
                'non-image-data-uri-omitted',
                'oversized-truncated',
                'recursion-depth-exceeded',
                'collection-overflow',
                'histogram-overflow',
                'bytes-estimation-failed',
            ])
        );
    });

    it('SAFETY_EVENTS keys follow SCREAMING_SNAKE_CASE convention', () => {
        for (const key of Object.keys(SAFETY_EVENTS)) {
            expect(key).toMatch(/^[A-Z][A-Z0-9_]*$/);
        }
    });

    it('SAFETY_EVENT_BATCH_SUFFIX equals "-batch"', () => {
        expect(SAFETY_EVENT_BATCH_SUFFIX).toBe('-batch');
    });

    it('ALL_SAFETY_EVENT_NAMES contains exactly 7 unique values', () => {
        expect(ALL_SAFETY_EVENT_NAMES).toHaveLength(7);
        expect(new Set(ALL_SAFETY_EVENT_NAMES).size).toBe(7);
    });

    it('ALL_SAFETY_EVENT_NAMES values are subset of SAFETY_EVENTS values', () => {
        const enumValues = new Set(Object.values(SAFETY_EVENTS));
        for (const name of ALL_SAFETY_EVENT_NAMES) {
            expect(enumValues.has(name)).toBe(true);
        }
    });

    // SafetyEventName / SafetyEventBatchName は compile-time type で、
    // runtime 値検証は不可能だが、型として import できることを確認 (tsc が型解決)。
    it('SafetyEventName / SafetyEventBatchName types are importable', () => {
        const image: SafetyEventName = SAFETY_EVENTS.IMAGE_OMITTED;
        const imageBatch: SafetyEventBatchName = `${SAFETY_EVENTS.IMAGE_OMITTED}${SAFETY_EVENT_BATCH_SUFFIX}` as const;
        expect(image).toBe('image-omitted');
        expect(imageBatch).toBe('image-omitted-batch');
    });
});
