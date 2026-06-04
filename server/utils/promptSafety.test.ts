import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logger } from './logger';
import {
  IMAGE_OMITTED_MARKER,
  NON_IMAGE_DATA_URI_MARKER,
  OVERSIZED_STRING_MARKER,
  RECURSION_DEPTH_EXCEEDED_MARKER,
  COLLECTION_OVERFLOW_MARKER,
  MAX_FIELD_BYTES,
  stripPromptHeavyFields,
  truncateOversizedStrings,
  sanitizeForPrompt,
  createWarnAggregator,
} from './promptSafety';
import type { SafetyEventName } from './promptSafetyEvents';

describe('stripPromptHeavyFields - content-based 画像 dataURI 検出 (Issue #134)', () => {
  it('replaces character appearance.imageUrl dataURI with marker (regression: known image field still stripped after content-based switch)', () => {
    const big = `data:image/png;base64,${'A'.repeat(1_000_000)}`;
    const data = { name: 'Alice', appearance: { imageUrl: big, traits: [{ key: '髪', value: '金' }] } };
    const out = stripPromptHeavyFields(data) as typeof data;
    expect(out.appearance.imageUrl).toBe(IMAGE_OMITTED_MARKER);
    expect(out.appearance.traits).toEqual([{ key: '髪', value: '金' }]);
    expect(out.name).toBe('Alice');
  });

  it('replaces world mapImageUrl dataURI with marker (regression: known image field still stripped after content-based switch)', () => {
    const big = `data:image/jpeg;base64,${'B'.repeat(500_000)}`;
    const data = { name: '王国', mapImageUrl: big, exportDescription: '広大な大陸' };
    const out = stripPromptHeavyFields(data) as typeof data;
    expect(out.mapImageUrl).toBe(IMAGE_OMITTED_MARKER);
    expect(out.name).toBe('王国');
    expect(out.exportDescription).toBe('広大な大陸');
  });

  it('handles both character and world fields simultaneously', () => {
    const big = `data:image/png;base64,${'C'.repeat(1000)}`;
    const both = {
      appearance: { imageUrl: big },
      mapImageUrl: big,
    };
    const out = stripPromptHeavyFields(both) as typeof both;
    expect(out.appearance.imageUrl).toBe(IMAGE_OMITTED_MARKER);
    expect(out.mapImageUrl).toBe(IMAGE_OMITTED_MARKER);
  });

  it('keeps non-dataURI URLs intact (http URL passes through)', () => {
    const data = {
      appearance: { imageUrl: 'https://cdn.example.com/a.png' },
      mapImageUrl: 'https://maps.example.com/world.png',
    };
    const out = stripPromptHeavyFields(data) as typeof data;
    expect(out.appearance.imageUrl).toBe('https://cdn.example.com/a.png');
    expect(out.mapImageUrl).toBe('https://maps.example.com/world.png');
  });

  // === Issue #134: content-based 検出 (register-or-forget 解消) ===

  it('detects dataURI at ANY unknown field (no whitelist required)', () => {
    // 将来追加されうるフィールド (PR #134 想定: characterPortraitDataUrl 等)
    const big = `data:image/png;base64,${'A'.repeat(1000)}`;
    const data = { characterPortraitDataUrl: big, name: 'Alice' };
    const out = stripPromptHeavyFields(data) as typeof data;
    expect(out.characterPortraitDataUrl).toBe(IMAGE_OMITTED_MARKER);
    expect(out.name).toBe('Alice');
  });

  it('detects dataURI inside deeply nested arrays (e.g. gallery[].url)', () => {
    const big = `data:image/jpeg;base64,${'X'.repeat(1000)}`;
    const data = {
      appearance: {
        gallery: [
          { url: big, caption: '正面' },
          { url: 'https://cdn.example.com/b.png', caption: '横向き' },
        ],
      },
    };
    const out = stripPromptHeavyFields(data) as typeof data;
    expect(out.appearance.gallery[0].url).toBe(IMAGE_OMITTED_MARKER);
    expect(out.appearance.gallery[0].caption).toBe('正面');
    expect(out.appearance.gallery[1].url).toBe('https://cdn.example.com/b.png');
  });

  it('detects multiple image variants (png / jpeg / webp / svg+xml / gif)', () => {
    // payload は MIN_IMAGE_DATA_URI_BYTES (500) を超える必要があるため 600 chars に統一。
    const variants = [
      `data:image/png;base64,${'A'.repeat(600)}`,
      `data:image/jpeg;base64,${'B'.repeat(600)}`,
      `data:image/webp;base64,${'C'.repeat(600)}`,
      `data:image/svg+xml;base64,${'D'.repeat(600)}`,
      `data:image/gif;base64,${'E'.repeat(600)}`,
    ];
    for (const v of variants) {
      const out = stripPromptHeavyFields({ field: v }) as { field: string };
      expect(out.field).toBe(IMAGE_OMITTED_MARKER);
    }
  });

  it('does NOT replace non-image dataURI (e.g. application/pdf, audio, video)', () => {
    // 非画像の dataURI は image marker を出さない。
    // size guard が backstop として truncate するため、ここでは image marker 経路にだけ
    // 該当しないことを確認する (出力は素通し)。
    const data = {
      pdf: `data:application/pdf;base64,${'A'.repeat(200)}`,
      audio: `data:audio/mp3;base64,${'B'.repeat(200)}`,
      text: 'data:text/plain;base64,SGVsbG8=',
    };
    const out = stripPromptHeavyFields(data) as typeof data;
    expect(out.pdf).not.toBe(IMAGE_OMITTED_MARKER);
    expect(out.audio).not.toBe(IMAGE_OMITTED_MARKER);
    expect(out.text).not.toBe(IMAGE_OMITTED_MARKER);
  });

  it('does NOT replace short strings that incidentally start with "data:image/" (false positive guard)', () => {
    // ナレッジ等に「`data:image/png` という形式の文字列」が短文として含まれる可能性。
    // 500 bytes 未満は素通し (Issue #137 #2 で 100 → 500 へ引き上げ、cumulative bypass 縮小)。
    const data = {
      knowledge: 'data:image/png は base64 形式',
      hint: 'data:image/jpeg;base64,QQ==', // 構文的には有効だが極小
    };
    const out = stripPromptHeavyFields(data) as typeof data;
    expect(out.knowledge).toBe('data:image/png は base64 形式');
    expect(out.hint).toBe('data:image/jpeg;base64,QQ==');
  });

  // === Issue #137 #2: 境界値テスト (MIN_IMAGE_DATA_URI_BYTES = 500) ===

  it('boundary: dataURI of exactly MIN_IMAGE_DATA_URI_BYTES bytes IS replaced', () => {
    // prefix `data:image/png;base64,` = 22 bytes, payload 478 bytes → total 500 bytes ちょうど。
    // 仕様 `>= MIN_IMAGE_DATA_URI_BYTES` で marker 化される。
    const exactlyMin = `data:image/png;base64,${'A'.repeat(478)}`;
    expect(Buffer.byteLength(exactlyMin, 'utf8')).toBe(500);
    const out = stripPromptHeavyFields({ field: exactlyMin }) as { field: string };
    expect(out.field).toBe(IMAGE_OMITTED_MARKER);
  });

  it('boundary: dataURI 1 byte below MIN_IMAGE_DATA_URI_BYTES passes through unchanged', () => {
    // 499 bytes = prefix 22 + payload 477 → 素通し。
    const justBelow = `data:image/png;base64,${'A'.repeat(477)}`;
    expect(Buffer.byteLength(justBelow, 'utf8')).toBe(499);
    const out = stripPromptHeavyFields({ field: justBelow }) as { field: string };
    expect(out.field).toBe(justBelow);
  });

  it('boundary: dataURI 1 byte above MIN_IMAGE_DATA_URI_BYTES IS replaced', () => {
    // 501 bytes = prefix 22 + payload 479 → marker 化される。
    const justAbove = `data:image/png;base64,${'A'.repeat(479)}`;
    expect(Buffer.byteLength(justAbove, 'utf8')).toBe(501);
    const out = stripPromptHeavyFields({ field: justAbove }) as { field: string };
    expect(out.field).toBe(IMAGE_OMITTED_MARKER);
  });

  it('returns null/undefined/primitive unchanged', () => {
    expect(stripPromptHeavyFields(null)).toBe(null);
    expect(stripPromptHeavyFields(undefined)).toBe(undefined);
    expect(stripPromptHeavyFields('hello')).toBe('hello');
    expect(stripPromptHeavyFields(42)).toBe(42);
  });

  it('does not mutate input (immutability)', () => {
    const big = `data:image/png;base64,${'A'.repeat(1000)}`;
    const data = { appearance: { imageUrl: big, traits: [{ key: 'k', value: 'v' }] }, mapImageUrl: big };
    const snapshot = JSON.stringify(data);
    stripPromptHeavyFields(data);
    expect(JSON.stringify(data)).toBe(snapshot);
  });

  it('returns same reference when no changes needed (perf hint)', () => {
    const data = { name: 'Alice', appearance: { imageUrl: 'https://x' } };
    expect(stripPromptHeavyFields(data)).toBe(data);
  });

  it('gracefully handles missing nested object (appearance absent)', () => {
    const data = { name: 'Alice', personality: 'gentle' };
    expect(stripPromptHeavyFields(data)).toEqual(data);
  });

  // === Issue #134 code-review CONFIRMED: depth guard (stack overflow on deep nesting) ===

  it('replaces deeply nested payload with RECURSION_DEPTH_EXCEEDED_MARKER instead of stack-overflowing', () => {
    // Build 2000-deep nested object: { a: { a: { a: ... { url: dataURI } } } }
    // Without depth guard, V8 default stack overflows around 2-3k levels → 500 INTERNAL.
    const big = `data:image/png;base64,${'A'.repeat(200)}`;
    let payload: Record<string, unknown> = { url: big };
    for (let i = 0; i < 2000; i++) payload = { a: payload };

    // Should NOT throw RangeError.
    expect(() => stripPromptHeavyFields(payload)).not.toThrow();

    // The deep inner content gets replaced with the depth-exceeded marker
    // (we cannot easily walk back to assert which leaf became the marker, so just
    // assert the call returns and no RangeError is raised).
    const out = stripPromptHeavyFields(payload);
    expect(out).toBeDefined();
  });

  // === Issue #134 code-review PLAUSIBLE: prototype pollution skip ===

  it('drops __proto__ key so sanitized object prototype is not poisoned', () => {
    // Simulate JSON.parse output where __proto__ is an own enumerable property
    // (Object.defineProperty is needed because object literal `{ __proto__: ... }` uses the setter,
    // not creating an own property; JSON.parse however does create the own property).
    // appearance.imageUrl payload は MIN_IMAGE_DATA_URI_BYTES (500) を超える必要があるため 600 chars。
    const malicious: Record<string, unknown> = JSON.parse(
      '{"__proto__":{"polluted":true},"name":"Alice","appearance":{"imageUrl":"data:image/png;base64,' + 'A'.repeat(600) + '"}}'
    );
    const out = stripPromptHeavyFields(malicious) as Record<string, unknown>;

    // Returned object's prototype must remain Object.prototype, not the attacker subtree.
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    // Inheritance MUST NOT expose `polluted` via the prototype chain.
    expect((out as { polluted?: boolean }).polluted).toBeUndefined();
    // Legitimate own properties are preserved + sanitized.
    expect(out.name).toBe('Alice');
    expect((out.appearance as { imageUrl: string }).imageUrl).toBe(IMAGE_OMITTED_MARKER);
  });

  it('also drops constructor and prototype as own keys (defense-in-depth)', () => {
    const malicious: Record<string, unknown> = JSON.parse(
      '{"constructor":"x","prototype":"y","name":"Alice"}'
    );
    const out = stripPromptHeavyFields(malicious) as Record<string, unknown>;
    expect(out.constructor).toBe(Object.prototype.constructor); // inherited, not overridden
    expect((out as { prototype?: unknown }).prototype).toBeUndefined();
    expect(out.name).toBe('Alice');
  });
});

describe('truncateOversizedStrings - size guard safety-net', () => {
  it('truncates leaf string exceeding maxBytes (ASCII = 1 byte/char)', () => {
    const data = { secret: 'X'.repeat(MAX_FIELD_BYTES + 1) };
    const out = truncateOversizedStrings(data) as typeof data;
    expect(out.secret).toBe(OVERSIZED_STRING_MARKER);
  });

  it('keeps ASCII strings at exactly maxBytes intact (boundary)', () => {
    const data = { secret: 'X'.repeat(MAX_FIELD_BYTES) };
    const out = truncateOversizedStrings(data) as typeof data;
    expect(out.secret).toBe(data.secret);
  });

  it('measures Japanese (CJK) strings in UTF-8 bytes, not UTF-16 code units (code-review #133 fix)', () => {
    // 日本語 BMP 文字は UTF-8 で 3 bytes / UTF-16 で 1 code unit。
    // 30,000 文字 = UTF-8 90,000 bytes (< 100,000) → 素通し
    // 40,000 文字 = UTF-8 120,000 bytes (> 100,000) → truncate
    const safeJa = { text: 'あ'.repeat(30_000) };
    const overJa = { text: 'あ'.repeat(40_000) };
    expect((truncateOversizedStrings(safeJa) as typeof safeJa).text).toBe(safeJa.text);
    expect((truncateOversizedStrings(overJa) as typeof overJa).text).toBe(OVERSIZED_STRING_MARKER);
  });

  it('measures emoji (surrogate pair) strings correctly in UTF-8 bytes', () => {
    // 絵文字 surrogate pair は UTF-16 で 2 code unit / UTF-8 で 4 bytes。
    // 30,000 emoji = UTF-8 120,000 bytes → truncate (旧実装の length=60,000 では素通し)
    const overEmoji = { text: '🎉'.repeat(30_000) };
    expect((truncateOversizedStrings(overEmoji) as typeof overEmoji).text).toBe(OVERSIZED_STRING_MARKER);
  });

  it('recurses into nested objects and arrays', () => {
    const big = 'Z'.repeat(MAX_FIELD_BYTES + 1);
    const data = {
      list: [{ note: big }],
      nested: { deep: { value: big } },
    };
    const out = truncateOversizedStrings(data) as typeof data;
    expect(out.list[0].note).toBe(OVERSIZED_STRING_MARKER);
    expect(out.nested.deep.value).toBe(OVERSIZED_STRING_MARKER);
  });

  it('respects custom maxBytes argument', () => {
    const data = { value: 'abcdef' };
    const out = truncateOversizedStrings(data, 3) as typeof data;
    expect(out.value).toBe(OVERSIZED_STRING_MARKER);
  });

  it('returns same reference when no truncation needed', () => {
    const data = { name: 'Alice', personality: 'gentle' };
    expect(truncateOversizedStrings(data)).toBe(data);
  });

  it('does not mutate input', () => {
    const big = 'X'.repeat(MAX_FIELD_BYTES + 1);
    const data = { secret: big };
    const snapshot = data.secret;
    truncateOversizedStrings(data);
    expect(data.secret).toBe(snapshot);
  });
});

describe('observability (silent fail paired signal)', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
  });

  it('emits warn log with path + UTF-8 bytes when dataURI is stripped', () => {
    const big = `data:image/png;base64,${'A'.repeat(1000)}`;
    stripPromptHeavyFields({ appearance: { imageUrl: big } });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        safetyEvent: 'image-omitted',
        path: 'appearance.imageUrl',
        bytes: Buffer.byteLength(big, 'utf8'),
      })
    );
  });

  it('emits warn log with dot-path + array index for nested detection (Issue #134)', () => {
    const big = `data:image/png;base64,${'A'.repeat(1000)}`;
    stripPromptHeavyFields({ appearance: { gallery: [{ url: big }] } });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        safetyEvent: 'image-omitted',
        path: 'appearance.gallery[0].url',
        bytes: Buffer.byteLength(big, 'utf8'),
      })
    );
  });

  it('emits warn log with UTF-8 bytes + maxBytes when string is truncated', () => {
    const big = 'X'.repeat(MAX_FIELD_BYTES + 1);
    truncateOversizedStrings({ unknownField: big });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        safetyEvent: 'oversized-truncated',
        bytes: Buffer.byteLength(big, 'utf8'),
        maxBytes: MAX_FIELD_BYTES,
      })
    );
  });

  it('does NOT log when nothing is sanitized (no-op case)', () => {
    stripPromptHeavyFields({ name: 'Alice', appearance: { imageUrl: 'https://example.com/a.png' } });
    truncateOversizedStrings({ name: 'Alice', personality: 'gentle' });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  // === Issue #137 #3: log amplification 対策 (per-call warn 集約) ===

  it('emits individual warn for each finding when total ≤ MAX_WARN_PER_CALL (50)', () => {
    // 50 個ちょうど = 全件個別 warn、集約 log 出ない (boundary 直下)。
    const big = `data:image/png;base64,${'A'.repeat(600)}`;
    const items = Array.from({ length: 50 }, () => ({ url: big }));
    stripPromptHeavyFields({ gallery: items });
    expect(warnSpy).toHaveBeenCalledTimes(50);
    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ safetyEvent: 'image-omitted-batch' })
    );
  });

  it('suppresses individual warns and emits aggregate log when total > MAX_WARN_PER_CALL (boundary 51)', () => {
    // 51 個 = 50 件個別 warn + 1 件集約 log (boundary 直上)。
    const big = `data:image/png;base64,${'A'.repeat(600)}`;
    const items = Array.from({ length: 51 }, () => ({ url: big }));
    stripPromptHeavyFields({ gallery: items });
    // 個別 image-omitted は 50 件で打ち止め
    const individualCalls = warnSpy.mock.calls.filter(
      (c) => (c[0] as { safetyEvent?: string }).safetyEvent === 'image-omitted'
    );
    expect(individualCalls).toHaveLength(50);
    // 集約 log が 1 件出る
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        safetyEvent: 'image-omitted-batch',
        totalCount: 51,
        loggedCount: 50,
        omittedCount: 1,
      })
    );
  });

  it('aggregate log carries accurate totalCount / omittedCount for large bursts (100 items)', () => {
    const big = `data:image/png;base64,${'A'.repeat(600)}`;
    const items = Array.from({ length: 100 }, () => ({ url: big }));
    stripPromptHeavyFields({ gallery: items });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        safetyEvent: 'image-omitted-batch',
        totalCount: 100,
        loggedCount: 50,
        omittedCount: 50,
      })
    );
  });

  it('truncateOversizedStrings also aggregates oversized-truncated warns', () => {
    // truncate 側も同じ pattern: 51 件超で集約 log。
    const big = 'Y'.repeat(MAX_FIELD_BYTES + 1);
    const items = Array.from({ length: 51 }, () => ({ note: big }));
    truncateOversizedStrings({ list: items });
    const individualCalls = warnSpy.mock.calls.filter(
      (c) => (c[0] as { safetyEvent?: string }).safetyEvent === 'oversized-truncated'
    );
    expect(individualCalls).toHaveLength(50);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        safetyEvent: 'oversized-truncated-batch',
        totalCount: 51,
        loggedCount: 50,
        omittedCount: 1,
      })
    );
  });

  it('boundary: exactly 49 items emits 49 individual warns and NO aggregate log', () => {
    // 49 = 集約しきい値手前 -1
    const big = `data:image/png;base64,${'A'.repeat(600)}`;
    const items = Array.from({ length: 49 }, () => ({ url: big }));
    stripPromptHeavyFields({ gallery: items });
    expect(warnSpy).toHaveBeenCalledTimes(49);
    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ safetyEvent: 'image-omitted-batch' })
    );
  });

  // === Issue #137 #3 code-review CONFIRMED: depth-exceeded amplification も同 counter 対象 ===

  /** depth > MAX_RECURSION_DEPTH を確実に踏む payload (1500 段ネスト object) */
  function buildDeepChain(levels: number): Record<string, unknown> {
    let node: Record<string, unknown> = { leaf: 'end' };
    for (let i = 0; i < levels; i++) node = { a: node };
    return node;
  }

  it('depth-exceeded warns are aggregated when total > MAX_WARN_PER_CALL (sibling × 51 deep chains)', () => {
    // 51 個の sibling subtree が各々 depth 1001 超に到達 → 50 件個別 warn + 1 件 batch。
    const deep = buildDeepChain(1500);
    const payload: Record<string, unknown> = {};
    for (let i = 0; i < 51; i++) payload[`sib${i}`] = deep;
    stripPromptHeavyFields(payload);

    const individualCalls = warnSpy.mock.calls.filter(
      (c) => (c[0] as { safetyEvent?: string }).safetyEvent === 'recursion-depth-exceeded'
    );
    expect(individualCalls).toHaveLength(50);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        safetyEvent: 'recursion-depth-exceeded-batch',
        totalCount: 51,
        loggedCount: 50,
        omittedCount: 1,
      })
    );
  });

  it('depth-exceeded boundary: 50 sibling deep chains emits 50 individual, NO batch', () => {
    const deep = buildDeepChain(1500);
    const payload: Record<string, unknown> = {};
    for (let i = 0; i < 50; i++) payload[`sib${i}`] = deep;
    stripPromptHeavyFields(payload);

    const individualCalls = warnSpy.mock.calls.filter(
      (c) => (c[0] as { safetyEvent?: string }).safetyEvent === 'recursion-depth-exceeded'
    );
    expect(individualCalls).toHaveLength(50);
    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ safetyEvent: 'recursion-depth-exceeded-batch' })
    );
  });

  it('truncateOversizedStrings also aggregates recursion-depth-exceeded warns', () => {
    const deep = buildDeepChain(1500);
    const payload: Record<string, unknown> = {};
    for (let i = 0; i < 51; i++) payload[`sib${i}`] = deep;
    truncateOversizedStrings(payload);

    const individualCalls = warnSpy.mock.calls.filter(
      (c) => (c[0] as { safetyEvent?: string }).safetyEvent === 'recursion-depth-exceeded'
    );
    expect(individualCalls).toHaveLength(50);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        safetyEvent: 'recursion-depth-exceeded-batch',
        totalCount: 51,
        loggedCount: 50,
        omittedCount: 1,
      })
    );
  });

  // === Issue #137 #4: createWarnAggregator factory の不変条件 (cross-event 独立性) ===

  it('lazy builder skips payload evaluation when threshold exceeded (Buffer.byteLength regression fix)', () => {
    // PR #140 code-review CONFIRMED: tick({...}) の eager evaluation で旧 PR #139 から
    // perf regression が入っていた。tick(() => ({...})) に切り替えて threshold 超後は
    // payload builder closure を呼ばない (Buffer.byteLength も走らない) ことを pin する。
    const big = `data:image/png;base64,${'A'.repeat(600)}`;
    // 100 個 (= MAX_WARN_PER_CALL の 2 倍) を array に詰める
    const items = Array.from({ length: 100 }, () => ({ url: big }));

    // Buffer.byteLength の呼出回数を spy で観測
    // (isImageDataUri 内 1 回 + tick builder 内 1 回 = 旧コードでは leaf あたり 2 回、
    //  新コードでは threshold 超後は isImageDataUri のみ 1 回)
    const originalByteLength = Buffer.byteLength;
    let byteLengthCalls = 0;
    // Buffer.byteLength は多 overload (string / Buffer / TypedArray ...) のため any 経由で差し替え。
    // 検証目的の単純 spy なので型安全性は犠牲にする。
    (Buffer as any).byteLength = (str: any, encoding?: BufferEncoding) => {
      byteLengthCalls++;
      return originalByteLength(str, encoding as BufferEncoding);
    };
    try {
      stripPromptHeavyFields({ gallery: items });
    } finally {
      (Buffer as any).byteLength = originalByteLength;
    }

    // 意図ベースの pin (review I-3): 「lazy 化の本質 = threshold 超後の tick builder skip」と
    // 「2 桁の amplification 退行を block」のみを assert する。具体値は推移するため幅広めに取る。
    // - 下限 100: 各 leaf の isImageDataUri 必須計算が 100 件確定走る
    // - 上限 500: 旧 eager amplification (~200) を 2.5x 超える退行を block
    // - 推移履歴 (参考): PR #140 lazy 化 ~150 → PR #145 collection-overflow ~250 → 将来 sanitize 関数追加で再増加可能性
    expect(byteLengthCalls).toBeGreaterThanOrEqual(100);
    expect(byteLengthCalls).toBeLessThan(500);
  });

  it('image and depth aggregators are independent (one event burst does not exhaust the other quota)', () => {
    // image-omitted 51 件 + recursion-depth-exceeded 51 件を同 payload に混在させると、
    // 各 aggregator が独立 50 件 + 各 batch 1 件 = 計 102 件 (個別 100 + batch 2) emit される。
    // factory が closure 別個に counter を保持していることを cross-event burst で pin。
    const big = `data:image/png;base64,${'A'.repeat(600)}`;
    const deep = buildDeepChain(1500);
    const payload: Record<string, unknown> = {};
    for (let i = 0; i < 51; i++) payload[`img${i}`] = big;
    for (let i = 0; i < 51; i++) payload[`deep${i}`] = deep;
    stripPromptHeavyFields(payload);

    const imageIndividual = warnSpy.mock.calls.filter(
      (c) => (c[0] as { safetyEvent?: string }).safetyEvent === 'image-omitted'
    );
    const depthIndividual = warnSpy.mock.calls.filter(
      (c) => (c[0] as { safetyEvent?: string }).safetyEvent === 'recursion-depth-exceeded'
    );
    expect(imageIndividual).toHaveLength(50);
    expect(depthIndividual).toHaveLength(50);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ safetyEvent: 'image-omitted-batch', totalCount: 51 })
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ safetyEvent: 'recursion-depth-exceeded-batch', totalCount: 51 })
    );
  });
});

describe('sanitizeForPrompt - composite (whitelist + size guard)', () => {
  it('applies whitelist FIRST then size guard (dataURI gets image marker, not oversized marker)', () => {
    const big = `data:image/png;base64,${'A'.repeat(MAX_FIELD_BYTES + 1000)}`;
    const data = { appearance: { imageUrl: big } };
    const out = sanitizeForPrompt(data) as typeof data;
    expect(out.appearance.imageUrl).toBe(IMAGE_OMITTED_MARKER);
  });

  it('catches unknown-field oversized strings via size guard (defense-in-depth)', () => {
    const data = { unknownNewField: 'Q'.repeat(MAX_FIELD_BYTES + 1) };
    const out = sanitizeForPrompt(data) as typeof data;
    expect(out.unknownNewField).toBe(OVERSIZED_STRING_MARKER);
  });

  it('preserves normal-sized data without modification', () => {
    const data = {
      name: 'Alice',
      personality: 'gentle and bookish',
      appearance: { imageUrl: 'https://cdn.example.com/a.png', traits: [{ key: '髪', value: '金' }] },
    };
    expect(sanitizeForPrompt(data)).toEqual(data);
  });

  it('end-to-end: realistic character with 1MB image produces compact output', () => {
    const big = `data:image/png;base64,${'A'.repeat(1_000_000)}`;
    const data = {
      name: 'Alice',
      personality: '明るい',
      appearance: { imageUrl: big, traits: [{ key: '髪', value: '金' }] },
    };
    const serialized = JSON.stringify(sanitizeForPrompt(data));
    expect(serialized.length).toBeLessThan(1_000);
    expect(serialized).toContain(IMAGE_OMITTED_MARKER);
  });
});

describe('createWarnAggregator factory unit (Issue #137 #4 残り)', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
  });

  // factory 自体の internal behavior を pin する test fixture では、本物の SAFETY_EVENTS
  // とは独立した dummy event 名 (`test-event` / `demo-omitted`) を使う。createWarnAggregator
  // signature は SafetyEventName narrow されたため、test ファイル内で cast escape hatch
  // を使用する (review-pr type-design 指摘 B 反映)。
  const TEST_FIXTURE_EVENT = 'test-event' as SafetyEventName;
  const DEMO_FIXTURE_EVENT = 'demo-omitted' as SafetyEventName;

  it('flush() emits nothing when tick() was never called (totalCount === 0)', () => {
    const agg = createWarnAggregator(TEST_FIXTURE_EVENT, 'promptSafety: test event');
    agg.flush();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('flush() emits nothing when tick() was called exactly MAX_WARN_PER_CALL (50) times (boundary 直下)', () => {
    const agg = createWarnAggregator(TEST_FIXTURE_EVENT, 'promptSafety: test event');
    for (let i = 0; i < 50; i++) agg.tick(() => ({ idx: i }));
    agg.flush();
    // 個別 warn 50 件、batch 0 件
    const batchCalls = warnSpy.mock.calls.filter(
      (c) => (c[0] as { safetyEvent?: string }).safetyEvent === 'test-event-batch'
    );
    expect(batchCalls).toHaveLength(0);
    const individualCalls = warnSpy.mock.calls.filter(
      (c) => (c[0] as { safetyEvent?: string }).safetyEvent === 'test-event'
    );
    expect(individualCalls).toHaveLength(50);
  });

  it('flush() emits 1 batch when tick() was called 51 times (boundary 直上)', () => {
    const agg = createWarnAggregator(TEST_FIXTURE_EVENT, 'promptSafety: test event');
    for (let i = 0; i < 51; i++) agg.tick(() => ({ idx: i }));
    agg.flush();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        safetyEvent: 'test-event-batch',
        message: 'promptSafety: test-event warn amplification suppressed',
        totalCount: 51,
        loggedCount: 50,
        omittedCount: 1,
      })
    );
  });

  it('individual warn payload cannot override message or safetyEvent (payload spread shadowing 構造的閉鎖、Issue #137 #4 残り a)', () => {
    const agg = createWarnAggregator(TEST_FIXTURE_EVENT, 'promptSafety: test event');
    // 型上は `message?: never` / `safetyEvent?: never` で禁止されているが、
    // 実行時の構造的防御 (spread 順) も pin する。`as any` で型 guard を bypass して悪意 payload を作る。
    agg.tick(
      () => ({ message: 'HIJACKED', safetyEvent: 'HIJACKED-event', path: 'a' } as any)
    );
    // factory 固定値が必ず残ることを pin
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'promptSafety: test event',
        safetyEvent: 'test-event',
      })
    );
    // HIJACKED が message / safetyEvent に入っていないことを pin
    const call = warnSpy.mock.calls[0][0] as { message: string; safetyEvent: string };
    expect(call.message).not.toBe('HIJACKED');
    expect(call.safetyEvent).not.toBe('HIJACKED-event');
  });

  it('derives batchEvent and batchMessage from individualEvent (Issue #137 #4 残り b)', () => {
    const agg = createWarnAggregator(DEMO_FIXTURE_EVENT, 'promptSafety: demo something');
    for (let i = 0; i < 51; i++) agg.tick(() => ({}));
    agg.flush();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        safetyEvent: 'demo-omitted-batch',
        message: 'promptSafety: demo-omitted warn amplification suppressed',
      })
    );
  });

  it('tick() lazy builder is NOT called when threshold exceeded (PR #140 regression fix)', () => {
    const agg = createWarnAggregator(TEST_FIXTURE_EVENT, 'promptSafety: test event');
    let buildCalls = 0;
    const buildPayload = () => {
      buildCalls++;
      return { idx: buildCalls };
    };
    for (let i = 0; i < 100; i++) agg.tick(buildPayload);
    // 最初の 50 件のみ builder が呼ばれる
    expect(buildCalls).toBe(50);
  });
});

// === Issue #137 #1: 非画像 dataURI 検出層 (PDF / audio / font 等の 500B〜100KB 帯 gap 閉鎖) ===

describe('stripPromptHeavyFields - 非画像 dataURI 検出 (Issue #137 #1)', () => {
  // AC-1〜3: 主要 MIME 種別での marker 置換 (基本動作)

  it('AC-1: replaces non-image dataURI (application/pdf, 800B) with NON_IMAGE_DATA_URI_MARKER', () => {
    const big = `data:application/pdf;base64,${'A'.repeat(800)}`;
    const out = stripPromptHeavyFields({ pdf: big }) as { pdf: string };
    expect(out.pdf).toBe(NON_IMAGE_DATA_URI_MARKER);
  });

  it('AC-2: replaces non-image dataURI (audio/mp3, 800B) with NON_IMAGE_DATA_URI_MARKER', () => {
    const big = `data:audio/mp3;base64,${'B'.repeat(800)}`;
    const out = stripPromptHeavyFields({ audio: big }) as { audio: string };
    expect(out.audio).toBe(NON_IMAGE_DATA_URI_MARKER);
  });

  it('AC-3: replaces non-image dataURI (font/woff2, 800B) with NON_IMAGE_DATA_URI_MARKER', () => {
    const big = `data:font/woff2;base64,${'C'.repeat(800)}`;
    const out = stripPromptHeavyFields({ font: big }) as { font: string };
    expect(out.font).toBe(NON_IMAGE_DATA_URI_MARKER);
  });

  // AC-4, AC-5: false positive guard (既存規律の維持 pin)

  it('AC-4: pdf 200B (~228B, < 500) passes through unchanged (false positive guard)', () => {
    const data = { pdf: `data:application/pdf;base64,${'A'.repeat(200)}` };
    const out = stripPromptHeavyFields(data) as typeof data;
    expect(out.pdf).toBe(data.pdf);
    expect(out.pdf).not.toBe(NON_IMAGE_DATA_URI_MARKER);
  });

  it('AC-5: data:text/plain;base64,SGVsbG8= (~30B) passes through unchanged (短文 MIME 説明)', () => {
    const data = { text: 'data:text/plain;base64,SGVsbG8=' };
    const out = stripPromptHeavyFields(data) as typeof data;
    expect(out.text).toBe(data.text);
    expect(out.text).not.toBe(NON_IMAGE_DATA_URI_MARKER);
  });

  // AC-6: 境界値 (MIN_NON_IMAGE_DATA_URI_BYTES = 500)

  it('AC-6a: non-image dataURI of exactly 499 bytes passes through unchanged', () => {
    // prefix `data:application/pdf;base64,` = 28 bytes, payload 471 bytes → total 499 bytes
    const justBelow = `data:application/pdf;base64,${'A'.repeat(471)}`;
    expect(Buffer.byteLength(justBelow, 'utf8')).toBe(499);
    const out = stripPromptHeavyFields({ pdf: justBelow }) as { pdf: string };
    expect(out.pdf).toBe(justBelow);
  });

  it('AC-6b: non-image dataURI of exactly 500 bytes IS replaced with marker', () => {
    const exactlyMin = `data:application/pdf;base64,${'A'.repeat(472)}`;
    expect(Buffer.byteLength(exactlyMin, 'utf8')).toBe(500);
    const out = stripPromptHeavyFields({ pdf: exactlyMin }) as { pdf: string };
    expect(out.pdf).toBe(NON_IMAGE_DATA_URI_MARKER);
  });

  it('AC-6c: non-image dataURI of exactly 501 bytes IS replaced with marker', () => {
    const justAbove = `data:application/pdf;base64,${'A'.repeat(473)}`;
    expect(Buffer.byteLength(justAbove, 'utf8')).toBe(501);
    const out = stripPromptHeavyFields({ pdf: justAbove }) as { pdf: string };
    expect(out.pdf).toBe(NON_IMAGE_DATA_URI_MARKER);
  });

  // AC-7: 判定順 regression pin (image 先評価)

  it('AC-7: image dataURI gets IMAGE_OMITTED_MARKER (not NON_IMAGE_DATA_URI_MARKER, image 先評価 pin)', () => {
    const big = `data:image/png;base64,${'X'.repeat(800)}`;
    const out = stripPromptHeavyFields({ image: big }) as { image: string };
    expect(out.image).toBe(IMAGE_OMITTED_MARKER);
    expect(out.image).not.toBe(NON_IMAGE_DATA_URI_MARKER);
  });

  // AC-11〜14: codex セカンドオピニオン Medium 指摘の test 化

  it('AC-11: DATA:application/pdf;base64,... (大文字 prefix, 800B) is replaced with NON_IMAGE_DATA_URI_MARKER (case insensitive)', () => {
    const big = `DATA:application/pdf;base64,${'A'.repeat(800)}`;
    const out = stripPromptHeavyFields({ pdf: big }) as { pdf: string };
    expect(out.pdf).toBe(NON_IMAGE_DATA_URI_MARKER);
  });

  it('AC-12: leading whitespace + data:... (\\n + space prefix, 800B) is replaced with NON_IMAGE_DATA_URI_MARKER', () => {
    const big = `\n data:application/pdf;base64,${'A'.repeat(800)}`;
    const out = stripPromptHeavyFields({ pdf: big }) as { pdf: string };
    expect(out.pdf).toBe(NON_IMAGE_DATA_URI_MARKER);
  });

  it('AC-13: data:;base64,... (空 MIME, 800B) is replaced with NON_IMAGE_DATA_URI_MARKER', () => {
    const big = `data:;base64,${'A'.repeat(800)}`;
    const out = stripPromptHeavyFields({ empty: big }) as { empty: string };
    expect(out.empty).toBe(NON_IMAGE_DATA_URI_MARKER);
  });

  it('AC-14: data:,... (no mediatype/base64, byte ≥ 500) is replaced with NON_IMAGE_DATA_URI_MARKER', () => {
    const big = `data:,${'A'.repeat(800)}`;
    const out = stripPromptHeavyFields({ noB64: big }) as { noB64: string };
    expect(out.noB64).toBe(NON_IMAGE_DATA_URI_MARKER);
  });
});

describe('stripPromptHeavyFields - 画像 dataURI 検出 case insensitive 化 (Issue #137 #1 / codex 指摘)', () => {
  it('AC-15: DATA:IMAGE/PNG;base64,... (image 大文字, 800B) is replaced with IMAGE_OMITTED_MARKER (existing isImageDataUri case insensitive 化の regression pin)', () => {
    const big = `DATA:IMAGE/PNG;base64,${'X'.repeat(800)}`;
    const out = stripPromptHeavyFields({ image: big }) as { image: string };
    expect(out.image).toBe(IMAGE_OMITTED_MARKER);
  });
});

describe('non-image dataURI observability + cross-event independence (Issue #137 #1)', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
  });

  it('AC-8: image array 100 + non-image array 100 emits image-omitted-batch と non-image-data-uri-omitted-batch 別 event で集約 (cross-event independence)', () => {
    const imageBig = `data:image/png;base64,${'A'.repeat(600)}`;
    const nonImageBig = `data:application/pdf;base64,${'B'.repeat(600)}`;
    const payload = {
      images: Array.from({ length: 100 }, () => imageBig),
      pdfs: Array.from({ length: 100 }, () => nonImageBig),
    };
    stripPromptHeavyFields(payload);

    // image-omitted: 50 個別 + 1 batch
    const imageIndividual = warnSpy.mock.calls.filter(
      (c) => (c[0] as { safetyEvent?: string }).safetyEvent === 'image-omitted'
    );
    expect(imageIndividual).toHaveLength(50);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        safetyEvent: 'image-omitted-batch',
        totalCount: 100,
        loggedCount: 50,
        omittedCount: 50,
      })
    );

    // non-image-data-uri-omitted: 50 個別 + 1 batch
    const nonImageIndividual = warnSpy.mock.calls.filter(
      (c) => (c[0] as { safetyEvent?: string }).safetyEvent === 'non-image-data-uri-omitted'
    );
    expect(nonImageIndividual).toHaveLength(50);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        safetyEvent: 'non-image-data-uri-omitted-batch',
        totalCount: 100,
        loggedCount: 50,
        omittedCount: 50,
      })
    );
  });

  it('AC-9: path log differentiates image (appearance.imageUrl) from non-image (memo) in individual warn', () => {
    const imageBig = `data:image/png;base64,${'A'.repeat(800)}`;
    const nonImageBig = `data:application/pdf;base64,${'B'.repeat(800)}`;
    stripPromptHeavyFields({
      appearance: { imageUrl: imageBig },
      memo: nonImageBig,
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        safetyEvent: 'image-omitted',
        path: 'appearance.imageUrl',
        bytes: Buffer.byteLength(imageBig, 'utf8'),
      })
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        safetyEvent: 'non-image-data-uri-omitted',
        path: 'memo',
        bytes: Buffer.byteLength(nonImageBig, 'utf8'),
      })
    );
  });
});

// === PR #143 review-pr (pr-test-analyzer Medium) hardening 追加 ===

describe('非画像 dataURI 検出 hardening (PR #143 review-pr 指摘反映)', () => {
  it('mixed array: image + non-image + plain + 空文字 が混在しても各 marker が正しい位置・順序で置換される', () => {
    // pr-test-analyzer Medium: 混在 array で aggregator state が乱れず、recursion 順序が保たれることを pin。
    const imageBig = `data:image/png;base64,${'A'.repeat(600)}`;
    const nonImageBig = `data:application/pdf;base64,${'B'.repeat(600)}`;
    const data = {
      mixed: [imageBig, nonImageBig, 'plain text', '', 'https://x', imageBig],
    };
    const out = stripPromptHeavyFields(data) as { mixed: string[] };
    expect(out.mixed[0]).toBe(IMAGE_OMITTED_MARKER);
    expect(out.mixed[1]).toBe(NON_IMAGE_DATA_URI_MARKER);
    expect(out.mixed[2]).toBe('plain text');
    expect(out.mixed[3]).toBe('');
    expect(out.mixed[4]).toBe('https://x');
    expect(out.mixed[5]).toBe(IMAGE_OMITTED_MARKER);
  });

  it('depth boundary × non-image dataURI: depth === MAX_RECURSION_DEPTH (1000) では non-image marker、depth > では depth marker (guard 順序 pin)', () => {
    // pr-test-analyzer Medium: depth-exceeded vs non-image marker の判定順 (depth guard が先) を pin。
    // depth guard は recurse 冒頭で評価される (promptSafety.ts:330)。
    // 1000 段ネスト内に non-image dataURI を置くと、leaf に到達した時点では depth === 1000 で
    // guard 内 ((depth > MAX_RECURSION_DEPTH) === false)、よって non-image marker になる。
    // 1001 段以降のネスト構造を組むと depth > 1000 で depth marker。
    const nonImageBig = `data:application/pdf;base64,${'A'.repeat(800)}`;

    // depth ちょうど 1000 (recurse 内 depth 値が 1000) — non-image marker になるべき
    let atLimit: Record<string, unknown> = { leaf: nonImageBig };
    for (let i = 0; i < 999; i++) atLimit = { a: atLimit };
    // depth 0 (root) → depth 1 (a.) → ... → depth 999 (.a.) → depth 1000 (leaf)
    // recurse(value=nonImageBig, path=..., depth=1000) で if (depth > 1000) false → string 判定で non-image marker
    const outAtLimit = stripPromptHeavyFields(atLimit) as Record<string, unknown>;
    // 最深 leaf を辿るのは煩雑なので JSON.stringify でマーカー出現を確認
    const serializedAtLimit = JSON.stringify(outAtLimit);
    expect(serializedAtLimit).toContain(NON_IMAGE_DATA_URI_MARKER);
    expect(serializedAtLimit).not.toContain(RECURSION_DEPTH_EXCEEDED_MARKER);

    // depth 1001 超 (over limit) — depth marker になるべき
    let beyondLimit: Record<string, unknown> = { leaf: nonImageBig };
    for (let i = 0; i < 1500; i++) beyondLimit = { a: beyondLimit };
    const outBeyond = stripPromptHeavyFields(beyondLimit) as Record<string, unknown>;
    const serializedBeyond = JSON.stringify(outBeyond);
    expect(serializedBeyond).toContain(RECURSION_DEPTH_EXCEEDED_MARKER);
    // beyondLimit は途中で depth marker に置換されるため、深い non-image leaf は到達せず marker 化されない
    expect(serializedBeyond).not.toContain(NON_IMAGE_DATA_URI_MARKER);
  });

  it('prototype pollution skip × non-image dataURI: __proto__ key を持つ payload で non-image dataURI も sanitize される (対称性 pin)', () => {
    // pr-test-analyzer Medium: 既存テスト (L195 付近) は image dataURI + __proto__。
    // 非画像 dataURI でも同じ規律 (key drop + 残り subtree の sanitize) が適用されることを pin。
    const malicious: Record<string, unknown> = JSON.parse(
      '{"__proto__":{"polluted":true},"name":"Bob","memo":"data:application/pdf;base64,' +
        'A'.repeat(600) +
        '"}'
    );
    const out = stripPromptHeavyFields(malicious) as Record<string, unknown>;

    // prototype 汚染が防御されている
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect((out as { polluted?: boolean }).polluted).toBeUndefined();
    // 正当な own properties は保持
    expect(out.name).toBe('Bob');
    // 非画像 dataURI は marker 置換される (image 側と対称)
    expect(out.memo).toBe(NON_IMAGE_DATA_URI_MARKER);
  });
});

// === Issue #137 #5: batch log の pathPrefixes histogram (51 件目以降の path 喪失復旧) ===

describe('createWarnAggregator path histogram (Issue #137 #5)', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
  });

  it('AC-1: 単一 path 多発 (gallery[N].url × 100) → pathPrefixes に gallery[*].url が count 100 で記録 (末尾 prop 保持の AC-4 と end-to-end 整合)', () => {
    // PR #144 review-pr comment-analyzer Critical 解消:
    // 元 test は `gallery: items` (string array) で末尾 prop `.url` が含まれず title と矛盾。
    // payload を `[{url: big}, ...]` 形式に拡張し、bucket が `gallery[*].url` になることで AC-4
    // (「末尾 prop は normalize 対象外で残す」) を end-to-end で実証する。
    const big = `data:image/png;base64,${'A'.repeat(600)}`;
    const items = Array.from({ length: 100 }, () => ({ url: big }));
    stripPromptHeavyFields({ gallery: items });

    const batchCall = warnSpy.mock.calls.find(
      (c) => (c[0] as { safetyEvent?: string }).safetyEvent === 'image-omitted-batch'
    );
    expect(batchCall).toBeDefined();
    const payload = batchCall![0] as { pathPrefixes: Array<{ path: string; count: number }> };
    expect(payload.pathPrefixes).toBeDefined();
    expect(payload.pathPrefixes).toContainEqual({ path: 'gallery[*].url', count: 100 });
  });

  it('AC-2: 異種 path 混在 → 各 prefix が count とともに記録される (top-5 内に収まるケース)', () => {
    // 3 種類 × 各 60 件 = 180 件 (>50 で batch 発火)、top-5 内なので全部出る
    const imageBig = `data:image/png;base64,${'A'.repeat(600)}`;
    const payload: Record<string, unknown> = {
      gallery: Array.from({ length: 60 }, () => imageBig),
      portraits: Array.from({ length: 60 }, () => imageBig),
      avatars: Array.from({ length: 60 }, () => imageBig),
    };
    stripPromptHeavyFields(payload);

    const batchCall = warnSpy.mock.calls.find(
      (c) => (c[0] as { safetyEvent?: string }).safetyEvent === 'image-omitted-batch'
    );
    expect(batchCall).toBeDefined();
    const batchPayload = batchCall![0] as { pathPrefixes: Array<{ path: string; count: number }> };
    const map = new Map(batchPayload.pathPrefixes.map(({ path, count }) => [path, count]));
    expect(map.get('gallery[*]')).toBe(60);
    expect(map.get('portraits[*]')).toBe(60);
    expect(map.get('avatars[*]')).toBe(60);
  });

  it('AC-3: top-5 超 → 上位 5 prefix のみ残り、低頻度 path は drop される', () => {
    // 6 種類の path、各々 count が違う → top-5 を切り捨て
    const imageBig = `data:image/png;base64,${'A'.repeat(600)}`;
    const payload: Record<string, unknown> = {
      a: Array.from({ length: 20 }, () => imageBig), // count 20
      b: Array.from({ length: 15 }, () => imageBig), // count 15
      c: Array.from({ length: 10 }, () => imageBig), // count 10
      d: Array.from({ length: 5 }, () => imageBig),  // count 5
      e: Array.from({ length: 3 }, () => imageBig),  // count 3
      f: Array.from({ length: 2 }, () => imageBig),  // count 2 → drop (top-5 圏外)
    };
    stripPromptHeavyFields(payload);

    const batchCall = warnSpy.mock.calls.find(
      (c) => (c[0] as { safetyEvent?: string }).safetyEvent === 'image-omitted-batch'
    );
    expect(batchCall).toBeDefined();
    const batchPayload = batchCall![0] as { pathPrefixes: Array<{ path: string; count: number }> };
    expect(batchPayload.pathPrefixes).toHaveLength(5);
    const paths = batchPayload.pathPrefixes.map(({ path }) => path);
    expect(paths).toContain('a[*]');
    expect(paths).toContain('b[*]');
    expect(paths).toContain('e[*]');
    expect(paths).not.toContain('f[*]');
  });

  it('AC-4: array index normalize: gallery[0] / gallery[1] / gallery[2] が同 prefix gallery[*] にまとまる', () => {
    // 100 件の image (各 idx 違い) → 全部 'gallery[*]' bucket
    const imageBig = `data:image/png;base64,${'A'.repeat(600)}`;
    stripPromptHeavyFields({ gallery: Array.from({ length: 100 }, () => imageBig) });

    const batchCall = warnSpy.mock.calls.find(
      (c) => (c[0] as { safetyEvent?: string }).safetyEvent === 'image-omitted-batch'
    );
    expect(batchCall).toBeDefined();
    const batchPayload = batchCall![0] as { pathPrefixes: Array<{ path: string; count: number }> };
    // gallery[*] 1 件のみ (array index が normalize されている)
    expect(batchPayload.pathPrefixes).toEqual([{ path: 'gallery[*]', count: 100 }]);
  });

  it('AC-5: path が渡されない aggregator (oversized / truncate 経由) では (no-path) bucket になる', () => {
    // truncateOversizedStrings は recurse が path を渡さない → (no-path)
    const big = 'X'.repeat(MAX_FIELD_BYTES + 1);
    const items = Array.from({ length: 60 }, () => big);
    truncateOversizedStrings({ list: items });

    const batchCall = warnSpy.mock.calls.find(
      (c) => (c[0] as { safetyEvent?: string }).safetyEvent === 'oversized-truncated-batch'
    );
    expect(batchCall).toBeDefined();
    const batchPayload = batchCall![0] as { pathPrefixes: Array<{ path: string; count: number }> };
    expect(batchPayload.pathPrefixes).toContainEqual({ path: '(no-path)', count: 60 });
  });

  it('AC-6: 50 件以下 → batch event 自体 emit されない (pathPrefixes も発火しない)', () => {
    const imageBig = `data:image/png;base64,${'A'.repeat(600)}`;
    stripPromptHeavyFields({ gallery: Array.from({ length: 50 }, () => imageBig) });

    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ safetyEvent: 'image-omitted-batch' })
    );
  });

  it('AC-7: cross-aggregator independence: image-omitted-batch と non-image-data-uri-omitted-batch の pathPrefixes は別 histogram', () => {
    const imageBig = `data:image/png;base64,${'A'.repeat(600)}`;
    const nonImageBig = `data:application/pdf;base64,${'B'.repeat(600)}`;
    const payload = {
      images: Array.from({ length: 60 }, () => imageBig),
      pdfs: Array.from({ length: 60 }, () => nonImageBig),
    };
    stripPromptHeavyFields(payload);

    const imageBatch = warnSpy.mock.calls.find(
      (c) => (c[0] as { safetyEvent?: string }).safetyEvent === 'image-omitted-batch'
    );
    const nonImageBatch = warnSpy.mock.calls.find(
      (c) => (c[0] as { safetyEvent?: string }).safetyEvent === 'non-image-data-uri-omitted-batch'
    );
    expect(imageBatch).toBeDefined();
    expect(nonImageBatch).toBeDefined();

    const imagePrefixes = (imageBatch![0] as { pathPrefixes: Array<{ path: string; count: number }> }).pathPrefixes;
    const nonImagePrefixes = (
      nonImageBatch![0] as { pathPrefixes: Array<{ path: string; count: number }> }
    ).pathPrefixes;
    const imageMap = new Map(imagePrefixes.map(({ path, count }) => [path, count]));
    const nonImageMap = new Map(nonImagePrefixes.map(({ path, count }) => [path, count]));
    // 各 batch は自分の path のみ持ち、互いに混入しない
    expect(imageMap.get('images[*]')).toBe(60);
    expect(imageMap.has('pdfs[*]')).toBe(false);
    expect(nonImageMap.get('pdfs[*]')).toBe(60);
    expect(nonImageMap.has('images[*]')).toBe(false);
  });

  it('AC-8: non-image-data-uri-omitted-batch でも pathPrefixes が乗る (PR #143 経路継承)', () => {
    const nonImageBig = `data:application/pdf;base64,${'A'.repeat(600)}`;
    stripPromptHeavyFields({ docs: Array.from({ length: 60 }, () => nonImageBig) });

    const batchCall = warnSpy.mock.calls.find(
      (c) => (c[0] as { safetyEvent?: string }).safetyEvent === 'non-image-data-uri-omitted-batch'
    );
    expect(batchCall).toBeDefined();
    const batchPayload = batchCall![0] as { pathPrefixes: Array<{ path: string; count: number }> };
    expect(batchPayload.pathPrefixes).toContainEqual({ path: 'docs[*]', count: 60 });
  });

  it('AC-9: recursion-depth-exceeded-batch でも pathPrefixes が乗る (stripPromptHeavyFields 経路は path 付き)', () => {
    /** 1500 段ネスト object */
    function buildDeepChain(levels: number): Record<string, unknown> {
      let node: Record<string, unknown> = { leaf: 'end' };
      for (let i = 0; i < levels; i++) node = { a: node };
      return node;
    }
    const deep = buildDeepChain(1500);
    const payload: Record<string, unknown> = {};
    for (let i = 0; i < 60; i++) payload[`sib${i}`] = deep;
    stripPromptHeavyFields(payload);

    const batchCall = warnSpy.mock.calls.find(
      (c) => (c[0] as { safetyEvent?: string }).safetyEvent === 'recursion-depth-exceeded-batch'
    );
    expect(batchCall).toBeDefined();
    const batchPayload = batchCall![0] as { pathPrefixes: Array<{ path: string; count: number }>; truncatedBucketCount: number };
    expect(batchPayload.pathPrefixes).toBeDefined();
    // PR #144 review-pr: pathPrefixes は top-N (5) を超えない (cardinality 暴走 sentinel)
    expect(batchPayload.pathPrefixes.length).toBeLessThanOrEqual(5);
    // sib0.a.a.... の prefix なので 'sib*' 等にはならず 'sib0.a.a.a.a...' のような長い path が並ぶ
    // (sib0 / sib1 ... は dot-path 区切りで array index 表記でないため normalize 対象外)
    // top-5 内 count 合計を pin
    const totalCount = batchPayload.pathPrefixes.reduce((sum, { count }) => sum + count, 0);
    expect(totalCount).toBeLessThanOrEqual(60);
    expect(totalCount).toBeGreaterThan(0);
  });

  // === PR #144 review-pr 指摘反映 hardening (cardinality cap + sort 安定性 + truncatedBucketCount) ===

  it('AC-10: histogram cardinality 上限 (MAX_HISTOGRAM_BUCKETS=256) 到達後の新規 path は (overflow) bucket に集約 + histogram-overflow warn 1 件 emit (paired signal)', () => {
    // 257 種類の unique path を 1 件ずつ振る (sib0, sib1, ..., sib256) — 256 種類 buckets 充填後の追加は overflow へ。
    // 'sib0.a.a...' の 1500 段ネスト path は normalize 対象外 (array index なし) で各 sibling 1 bucket 占有。
    // 個別 warn 上限 50、batch event 発火条件 totalCount > 50 を満たすため batch emit される想定。
    function buildDeepChain(levels: number): Record<string, unknown> {
      let node: Record<string, unknown> = { leaf: 'end' };
      for (let i = 0; i < levels; i++) node = { a: node };
      return node;
    }
    const deep = buildDeepChain(1500);
    const payload: Record<string, unknown> = {};
    for (let i = 0; i < 300; i++) payload[`sib${i}`] = deep;
    stripPromptHeavyFields(payload);

    // 1 件以上の histogram-overflow warn が emit され、parentEvent が recursion-depth-exceeded である
    const overflowCalls = warnSpy.mock.calls.filter(
      (c) => (c[0] as { safetyEvent?: string }).safetyEvent === 'histogram-overflow'
    );
    expect(overflowCalls.length).toBeGreaterThan(0);
    // 1 度だけ emit される (per aggregator-instance 規律)。300 件で recursion-depth-exceeded aggregator が overflow を 1 回出す
    const depthOverflows = overflowCalls.filter(
      (c) => (c[0] as { parentEvent?: string }).parentEvent === 'recursion-depth-exceeded'
    );
    expect(depthOverflows).toHaveLength(1);
    expect(depthOverflows[0][0]).toMatchObject({
      safetyEvent: 'histogram-overflow',
      parentEvent: 'recursion-depth-exceeded',
      maxBuckets: 256,
    });
    // Issue #149 残-C: 飽和を引き起こした path (firstOverflowPath) が forensic 情報として
    // payload に含まれることを pin。MAX_HISTOGRAM_BUCKETS=256 を超えた最初の path が
    // 含まれていれば、attack payload の path family を Cloud Logging から特定可能。
    expect(depthOverflows[0][0]).toHaveProperty('firstOverflowPath');
    expect(typeof (depthOverflows[0][0] as { firstOverflowPath?: unknown }).firstOverflowPath).toBe('string');
    expect((depthOverflows[0][0] as { firstOverflowPath: string }).firstOverflowPath.length).toBeGreaterThan(0);

    // batch payload に (overflow) bucket が含まれる (top-5 の中、または truncated 外に集約)
    const batchCall = warnSpy.mock.calls.find(
      (c) => (c[0] as { safetyEvent?: string }).safetyEvent === 'recursion-depth-exceeded-batch'
    );
    expect(batchCall).toBeDefined();
    const batchPayload = batchCall![0] as {
      pathPrefixes: Array<{ path: string; count: number }>;
      truncatedBucketCount: number;
    };
    // truncatedBucketCount は MAX_HISTOGRAM_BUCKETS (256) - top-5 = 251 以下 (overflow が bucket 1 つを占めるため厳密 251)
    expect(batchPayload.truncatedBucketCount).toBeGreaterThan(0);
  });

  it('AC-11: sort 安定性 — count 同値の bucket 6 件で top-5 を抽出した時、Map insertion order × stable sort で deterministic に残る 5 件が決まる', () => {
    // 6 種類の path、全て count 20 → V8 sort は stable で、Map iteration 順 = insertion 順。
    // 最後に insert された 1 件 (`f[*]`) のみが drop され、`a[*]` 〜 `e[*]` が top-5 に残る。
    const imageBig = `data:image/png;base64,${'A'.repeat(600)}`;
    const payload: Record<string, unknown> = {
      a: Array.from({ length: 20 }, () => imageBig),
      b: Array.from({ length: 20 }, () => imageBig),
      c: Array.from({ length: 20 }, () => imageBig),
      d: Array.from({ length: 20 }, () => imageBig),
      e: Array.from({ length: 20 }, () => imageBig),
      f: Array.from({ length: 20 }, () => imageBig),
    };
    stripPromptHeavyFields(payload);

    const batchCall = warnSpy.mock.calls.find(
      (c) => (c[0] as { safetyEvent?: string }).safetyEvent === 'image-omitted-batch'
    );
    expect(batchCall).toBeDefined();
    const batchPayload = batchCall![0] as { pathPrefixes: Array<{ path: string; count: number }>; truncatedBucketCount: number };
    const paths = batchPayload.pathPrefixes.map(({ path }) => path);
    // 最初に insert された 5 件 (a, b, c, d, e) が残る (Map insertion order × stable sort)
    expect(paths).toEqual(['a[*]', 'b[*]', 'c[*]', 'd[*]', 'e[*]']);
    // 6 番目 (f) は drop されて truncatedBucketCount に計上
    expect(batchPayload.truncatedBucketCount).toBe(1);
  });

  it('AC-12: truncatedBucketCount: top-5 内に収まる場合は 0、超過分は distinct bucket 数 - 5 を反映', () => {
    const imageBig = `data:image/png;base64,${'A'.repeat(600)}`;

    // case 1: 3 distinct path × 各 60 → top-5 内、truncatedBucketCount = 0
    stripPromptHeavyFields({
      a: Array.from({ length: 60 }, () => imageBig),
      b: Array.from({ length: 60 }, () => imageBig),
      c: Array.from({ length: 60 }, () => imageBig),
    });
    const case1 = warnSpy.mock.calls.find(
      (c) => (c[0] as { safetyEvent?: string }).safetyEvent === 'image-omitted-batch'
    );
    expect(case1).toBeDefined();
    expect((case1![0] as { truncatedBucketCount: number }).truncatedBucketCount).toBe(0);
  });
});

describe('stripPromptHeavyFields - collection-level guard (Issue #137 #2 残り)', () => {
  // 設計文書 §5 prose / pseudo-code が境界 semantics の正本: `cumulativeBytes > MAX_COLLECTION_BYTES`
  // 演算子なので「閾値ちょうど (=200,000) は保持、次から marker」。各 element X byte のとき
  // floor(200,000 / X) + 1 件目までは保持 (入口で cumulative ≤ 200,000) され、その次が marker。
  // 設計文書 AC-3 table の "201 件×1000B → 200 件保持" は pseudo-code と矛盾し誤植扱い (実機では 202 件で
  // 初めて 1 件 marker)。handoff に記録する。
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
  });

  function buildElementOfBytes(byteLength: number): string {
    // JSON.stringify(s) で `"..."` の前後の quote 2 byte 込で byte 計測されることを考慮し、
    // estimateElementBytes(s) = byteLength + 2 になる。ここでは raw byte 長で指定して
    // テスト側で +2 を含めた cumulative 計算をする規律にする (テスト名で byte 数を明示)。
    return 'a'.repeat(byteLength);
  }

  it('AC-1: 199KB array (cumulative < 200,000) → 全 element 保持、collection-overflow 不発火', () => {
    // 1000B raw 文字列 200 件で JSON.stringify 後は 1002B/件 × 200 = 200,400 byte
    // → cumulative 200,400 で fire するが、AC-1 は「199KB の領域」の確認なので 800B raw × 200 件
    // (= 802B/件 × 200 = 160,400 cumulative) を使う。閾値内で全保持を pin する。
    const arr = Array.from({ length: 200 }, () => buildElementOfBytes(800));
    const out = stripPromptHeavyFields({ list: arr }) as { list: string[] };
    expect(out.list).toHaveLength(200);
    expect(out.list.every((s) => s === 'a'.repeat(800))).toBe(true);
    const fired = warnSpy.mock.calls.find(
      (c) => (c[0] as { safetyEvent?: string }).safetyEvent === 'collection-overflow'
    );
    expect(fired).toBeUndefined();
  });

  it('AC-2: ~1MB array (500 件 × 2000B) → 閾値到達後 element が COLLECTION_OVERFLOW_MARKER に置換', () => {
    const elem = buildElementOfBytes(2000); // estimateElementBytes(elem) = 2002
    const arr = Array.from({ length: 500 }, () => elem);
    const out = stripPromptHeavyFields({ list: arr }) as { list: string[] };
    // 先頭 N 件は保持、残りは marker。N は cumulative ≤ 200,000 を満たす最大件数 + 1。
    // 2002 * 100 = 200,200 > 200,000、2002 * 99 = 198,198 ≤ 200,000。
    // idx=99 入口 cumulative=198,198 → 保持 → 200,200。idx=100 入口 200,200 > 200,000 → marker。
    expect(out.list).toHaveLength(500);
    expect(out.list[0]).toBe(elem); // 保持
    expect(out.list[99]).toBe(elem); // 最後の保持 (cumulative ちょうど超え)
    expect(out.list[100]).toBe(COLLECTION_OVERFLOW_MARKER); // 1 件目 marker
    expect(out.list[499]).toBe(COLLECTION_OVERFLOW_MARKER); // 末尾も marker
  });

  it('AC-3a: 200 件 × 999B raw (estimateElementBytes 1001 × 200 = 200,200) → idx=199 までは入口で <=200,000 で保持、idx=200 はないので全 200 件保持', () => {
    // 1001 × 199 = 199,199 ≤ 200,000、idx=199 入口 199,199 → 保持 → 200,200。終了。
    const arr = Array.from({ length: 200 }, () => buildElementOfBytes(999));
    const out = stripPromptHeavyFields({ list: arr }) as { list: string[] };
    expect(out.list).toHaveLength(200);
    expect(out.list.every((s) => s === 'a'.repeat(999))).toBe(true);
  });

  it('AC-3b: 閾値超で部分 marker — 250 件 × 1000B → 先頭 N 件保持後 marker', () => {
    // 1002 × 199 = 199,398 ≤ 200,000、idx=199 入口 199,398 → 保持 → 200,400。
    // idx=200 入口 200,400 > 200,000 → marker。droppedIndex=200。
    const arr = Array.from({ length: 250 }, () => buildElementOfBytes(1000));
    const out = stripPromptHeavyFields({ list: arr }) as { list: string[] };
    expect(out.list).toHaveLength(250);
    expect(out.list[199]).toBe('a'.repeat(1000));
    expect(out.list[200]).toBe(COLLECTION_OVERFLOW_MARKER);
    expect(out.list[249]).toBe(COLLECTION_OVERFLOW_MARKER);
  });

  it('AC-4: nested object in array → per-element JSON.stringify 累積で評価', () => {
    // 各 element = { value: 'a'.repeat(1000) } → JSON.stringify は {"value":"a..a"} ≈ 1012 byte
    // 1012 × 197 = 199,364 ≤ 200,000、idx=197 入口 199,364 → 保持 → 200,376。
    // idx=198 入口 200,376 > 200,000 → marker。droppedIndex=198。
    const arr = Array.from({ length: 250 }, () => ({ value: 'a'.repeat(1000) }));
    const out = stripPromptHeavyFields({ list: arr }) as { list: Array<unknown> };
    expect(out.list[197]).toEqual({ value: 'a'.repeat(1000) });
    expect(out.list[198]).toBe(COLLECTION_OVERFLOW_MARKER);
  });

  it('AC-5: image dataURI marker と co-existence — leaf 化された marker (~60B) で cumulative を圧迫しない', () => {
    // 各 element が大型 dataURI (5000B raw) → IMAGE_OMITTED_MARKER (~58B) に marker 化
    // marker 化後の processed element 1 件は約 60B、JSON.stringify で 62B 程度
    // → 62 × N で N=3000 でも cumulative ≈ 186,000 で閾値以下、collection-overflow 不発火
    const bigImage = `data:image/png;base64,${'A'.repeat(5000)}`;
    const arr = Array.from({ length: 1000 }, () => bigImage);
    const out = stripPromptHeavyFields({ list: arr }) as { list: string[] };
    expect(out.list).toHaveLength(1000);
    expect(out.list.every((s) => s === IMAGE_OMITTED_MARKER)).toBe(true);
    // collection-overflow は発火していない (image-omitted marker 化で cumulative が圧迫されない)
    const collectionFired = warnSpy.mock.calls.find(
      (c) => (c[0] as { safetyEvent?: string }).safetyEvent === 'collection-overflow'
    );
    expect(collectionFired).toBeUndefined();
  });

  it('AC-6: warn log payload に 6 フィールド (path / arrayLength / cumulativeBytes / droppedIndex / maxCollectionBytes / keptCount) が含まれる', () => {
    const arr = Array.from({ length: 250 }, () => buildElementOfBytes(1000));
    stripPromptHeavyFields({ items: arr });
    const overflowCall = warnSpy.mock.calls.find(
      (c) => (c[0] as { safetyEvent?: string }).safetyEvent === 'collection-overflow'
    );
    expect(overflowCall).toBeDefined();
    const payload = overflowCall![0] as {
      path: string;
      arrayLength: number;
      cumulativeBytes: number;
      droppedIndex: number;
      maxCollectionBytes: number;
      keptCount: number;
      safetyEvent: string;
      message: string;
    };
    expect(payload.safetyEvent).toBe('collection-overflow');
    expect(payload.message).toContain('cumulative byte threshold');
    expect(payload.path).toBe('items[200]');
    expect(payload.arrayLength).toBe(250);
    expect(payload.droppedIndex).toBe(200);
    expect(payload.maxCollectionBytes).toBe(200_000);
    expect(payload.keptCount).toBe(200);
    // cumulativeBytes 具体値 pin (review I-2): 1002 byte/件 × 200 件 = 200,400 byte
    // idx=199 を保持して cumulative=200,400 → idx=200 入口で 200,400 > 200,000 で fire。
    // Cloud Logging 運用 dashboard の信頼性担保のため厳密値で固定。
    expect(payload.cumulativeBytes).toBe(200_400);
  });

  it('AC-7: sibling array 独立 — {a: [overflow], b: [overflow]} は batch.pathPrefixes で各々観測', () => {
    // 個別 warn は MAX_WARN_PER_CALL=50 で打ち止まるため (a[] 50 件で枯渇)、sibling 独立性は
    // batch event の pathPrefixes histogram で観測する規律 (PR #144 で確立)。
    const elem = buildElementOfBytes(1000); // 1002 byte/件
    const data = {
      a: Array.from({ length: 250 }, () => elem),
      b: Array.from({ length: 250 }, () => elem),
    };
    stripPromptHeavyFields(data);
    const batchCall = warnSpy.mock.calls.find(
      (c) => (c[0] as { safetyEvent?: string }).safetyEvent === 'collection-overflow-batch'
    );
    expect(batchCall).toBeDefined();
    const pathPrefixes = (batchCall![0] as { pathPrefixes: Array<{ path: string; count: number }> }).pathPrefixes;
    const paths = pathPrefixes.map((p) => p.path);
    // a[*] と b[*] が両方とも histogram bucket に存在 (sibling array で独立に counter が回る)
    expect(paths).toContain('a[*]');
    expect(paths).toContain('b[*]');
  });

  it('AC-8: nested array — 内側 array の collection guard は外側 cumulative counter とは独立 closure', () => {
    // 「内側 array で 200,000 を超えて counter が回っても、外側 array に counter が持ち越されない」を
    // pin する。外側 array を **1 件構成** にすることで「外側自身は overflow せず、内側だけが overflow」を
    // 観測する。外側に複数 inner を入れると inner recurse 結果 (~200KB) が外側 cumulative を圧迫して
    // 外側も overflow するため、AC-8 の本質 (内側 closure 独立性) が観測できない。
    const inner = Array.from({ length: 250 }, () => buildElementOfBytes(1000));
    const data = { matrix: [inner] };
    const out = stripPromptHeavyFields(data) as { matrix: string[][] };
    expect(out.matrix).toHaveLength(1);
    expect(out.matrix[0]).toHaveLength(250);
    // 内側 array で閾値到達後 marker
    expect(out.matrix[0][199]).toBe('a'.repeat(1000));
    expect(out.matrix[0][200]).toBe(COLLECTION_OVERFLOW_MARKER);
    expect(out.matrix[0][249]).toBe(COLLECTION_OVERFLOW_MARKER);
  });

  it('AC-9: non-array (object/scalar) には影響なし、collection-overflow 不発火', () => {
    const data = {
      name: 'Alice',
      age: 42,
      profile: { bio: 'a'.repeat(50_000) },
      nullField: null,
      undefinedField: undefined,
    };
    const out = stripPromptHeavyFields(data) as typeof data;
    expect(out.name).toBe('Alice');
    expect(out.age).toBe(42);
    expect(out.profile.bio).toBe('a'.repeat(50_000));
    const collectionFired = warnSpy.mock.calls.find(
      (c) => (c[0] as { safetyEvent?: string }).safetyEvent === 'collection-overflow'
    );
    expect(collectionFired).toBeUndefined();
  });

  it('AC-9b: empty array [] は collection-overflow 不発火、changed=false で same reference (review I-1)', () => {
    // for-loop が iteration 0 回で抜けるパスを pin。将来「length===0 で marker 返却」等の bug を block。
    const inner: unknown[] = [];
    const data = { list: inner };
    const out = stripPromptHeavyFields(data) as typeof data;
    expect(out.list).toBe(inner); // changed=false で same reference
    const collectionFired = warnSpy.mock.calls.find(
      (c) => (c[0] as { safetyEvent?: string }).safetyEvent === 'collection-overflow'
    );
    expect(collectionFired).toBeUndefined();
  });

  it('AC-11: 51 件超 collection-overflow → batch event "collection-overflow-batch" 発火 + pathPrefixes 自動継承', () => {
    // 1 つの array 内で 51 件超の overflow を発生させる必要がある。
    // 1002B × 200 件で cumulative ちょうど超え → idx=200 以降 marker、合計 100 件 marker
    // 個別 warn 50 件まで + batch 1 件 (= total >50 で batch fire)。
    const arr = Array.from({ length: 300 }, () => buildElementOfBytes(1000));
    stripPromptHeavyFields({ bulk: arr });
    const batchCall = warnSpy.mock.calls.find(
      (c) => (c[0] as { safetyEvent?: string }).safetyEvent === 'collection-overflow-batch'
    );
    expect(batchCall).toBeDefined();
    const payload = batchCall![0] as {
      totalCount: number;
      loggedCount: number;
      omittedCount: number;
      pathPrefixes: Array<{ path: string; count: number }>;
    };
    expect(payload.totalCount).toBeGreaterThan(50);
    expect(payload.loggedCount).toBe(50);
    expect(payload.pathPrefixes.length).toBeGreaterThan(0);
    // pathPrefixes は array index を `[*]` に正規化済 (PR #144 規律継承)
    expect(payload.pathPrefixes[0].path).toBe('bulk[*]');
  });

  it('AC-12: collection-overflow と image-omitted の cross-event independence (別 histogram / 別 counter)', () => {
    // image-omitted (large dataURI × 多数) と collection-overflow (大量 raw string array) を同時発火
    const bigImage = `data:image/png;base64,${'A'.repeat(600)}`;
    const data = {
      images: Array.from({ length: 60 }, () => bigImage), // image-omitted のみ発火 (marker 後 cumulative 小)
      bulk: Array.from({ length: 300 }, () => buildElementOfBytes(1000)), // collection-overflow も発火
    };
    stripPromptHeavyFields(data);
    const imageBatch = warnSpy.mock.calls.find(
      (c) => (c[0] as { safetyEvent?: string }).safetyEvent === 'image-omitted-batch'
    );
    const collectionBatch = warnSpy.mock.calls.find(
      (c) => (c[0] as { safetyEvent?: string }).safetyEvent === 'collection-overflow-batch'
    );
    expect(imageBatch).toBeDefined();
    expect(collectionBatch).toBeDefined();
    // 別 histogram: image-omitted-batch.pathPrefixes は `images[*]`、collection-overflow-batch.pathPrefixes は `bulk[*]`
    const imagePaths = (imageBatch![0] as { pathPrefixes: Array<{ path: string }> }).pathPrefixes.map((p) => p.path);
    const collectionPaths = (collectionBatch![0] as { pathPrefixes: Array<{ path: string }> }).pathPrefixes.map(
      (p) => p.path
    );
    expect(imagePaths).toContain('images[*]');
    expect(collectionPaths).toContain('bulk[*]');
    expect(imagePaths).not.toContain('bulk[*]');
    expect(collectionPaths).not.toContain('images[*]');
  });

  it('AC-13 defensive: [undefined, ...] 含む array でも throw せず処理完了 (undefined は estimateElementBytes で "null" 相当 4 byte)', () => {
    const data = {
      mixed: [undefined, 'a'.repeat(2000), undefined, undefined],
    };
    expect(() => stripPromptHeavyFields(data)).not.toThrow();
    const out = stripPromptHeavyFields(data) as { mixed: Array<string | undefined | null> };
    expect(out.mixed).toHaveLength(4);
    // undefined は保持される (JSON.stringify は undefined を返すが配列で書くと null になる規律は今回は適用外、
    // recurse が undefined を素通す)
    expect(out.mixed[1]).toBe('a'.repeat(2000));
  });

  it('AC-14 defensive: [BigInt, ...] 含む array でも throw せず処理完了 (BigInt は try-catch fallback で 4 byte 扱い)', () => {
    const data = {
      mixed: [1n, 'a'.repeat(2000), 2n],
    };
    expect(() => stripPromptHeavyFields(data)).not.toThrow();
    const out = stripPromptHeavyFields(data) as { mixed: unknown[] };
    expect(out.mixed).toHaveLength(3);
    expect(out.mixed[1]).toBe('a'.repeat(2000));
  });

  it('AC-14b defensive: 循環参照を含む array element でも throw せず処理完了 (review C-1)', () => {
    // 設計文書 §11 Risk row 7 で明示宣言済の defensive 要件。BigInt と並ぶ JSON.stringify throw
    // パターンを test で hard-pin する。将来 estimateElementBytes の try-catch が「perf 改善」を
    // 名目に shallow stringify 化されると、循環参照 input で 500 INTERNAL 量産になる regression を CI で block。
    type CyclicNode = { name: string; self?: CyclicNode };
    const cyclic: CyclicNode = { name: 'self-ref' };
    cyclic.self = cyclic;
    const data = { mixed: [cyclic, 'a'.repeat(2000)] };
    expect(() => stripPromptHeavyFields(data)).not.toThrow();
    const out = stripPromptHeavyFields(data) as { mixed: unknown[] };
    expect(out.mixed).toHaveLength(2);
  });

  it('AC-15: collection-overflow aggregator も histogram-overflow paired signal を継承する (review I-4)', () => {
    // MAX_HISTOGRAM_BUCKETS=256 超過時の (overflow) bucket + histogram-overflow paired warn は
    // PR #144 で確立済の規律。aggregator factory 共通実装で本 PR の collection-overflow 経路も
    // 対称適用されるはず。257 種類の sibling array を全部 overflow させて pin する。
    const elem = buildElementOfBytes(1000);
    const payload: Record<string, unknown> = {};
    for (let i = 0; i < 257; i++) {
      payload[`sib${i}`] = Array.from({ length: 250 }, () => elem);
    }
    stripPromptHeavyFields(payload);
    const histogramOverflowCalls = warnSpy.mock.calls.filter(
      (c) =>
        (c[0] as { safetyEvent?: string }).safetyEvent === 'histogram-overflow' &&
        (c[0] as { parentEvent?: string }).parentEvent === 'collection-overflow'
    );
    // 飽和は 1 度だけ発火 (paired signal 規律: overflowEmitted で gate される)
    expect(histogramOverflowCalls).toHaveLength(1);
    const overflowPayload = histogramOverflowCalls[0]![0] as {
      maxBuckets: number;
      parentEvent: string;
    };
    expect(overflowPayload.maxBuckets).toBe(256);
    expect(overflowPayload.parentEvent).toBe('collection-overflow');
  });
});
