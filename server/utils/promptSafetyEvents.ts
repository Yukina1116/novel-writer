// promptSafety が emit する safetyEvent の名前 (literal 集約)。
//
// 目的:
// - server/utils/promptSafety.ts の createWarnAggregator 呼出側で文字列リテラルを
//   ハードコードしていたのを単一 source of truth に集約し、typo 防止と
//   Cloud Logging log-based metric / runbook との drift を構造的に抑える。
// - scripts/setup-safety-event-metrics.sh の SAFETY_EVENTS bash array と
//   tests/static/safety-events-lockstep.test.ts で集合一致を強制する。
//
// 値を変更する場合、(1) 本ファイル (2) scripts/setup-safety-event-metrics.sh
// の SAFETY_EVENTS 配列 (3) docs/runbook/cloud-logging-safety-event-metrics.md
// の metric 名表 を同時に更新する規律 (T3 lockstep test が drift を検知)。
//
// Related: Issue #137 #7、docs/spec/promptSafety/2026-06-04-observability-metric-counter-design.md

export const SAFETY_EVENTS = {
    IMAGE_OMITTED: 'image-omitted',
    NON_IMAGE_DATA_URI_OMITTED: 'non-image-data-uri-omitted',
    OVERSIZED_TRUNCATED: 'oversized-truncated',
    RECURSION_DEPTH_EXCEEDED: 'recursion-depth-exceeded',
    COLLECTION_OVERFLOW: 'collection-overflow',
    HISTOGRAM_OVERFLOW: 'histogram-overflow',
    BYTES_ESTIMATION_FAILED: 'bytes-estimation-failed',
} as const;

export type SafetyEventName = typeof SAFETY_EVENTS[keyof typeof SAFETY_EVENTS];

export const SAFETY_EVENT_BATCH_SUFFIX = '-batch' as const;

export type SafetyEventBatchName = `${SafetyEventName}${typeof SAFETY_EVENT_BATCH_SUFFIX}`;

export const ALL_SAFETY_EVENT_NAMES: readonly SafetyEventName[] =
    Object.values(SAFETY_EVENTS) as readonly SafetyEventName[];
