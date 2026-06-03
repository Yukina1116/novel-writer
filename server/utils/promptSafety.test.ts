import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logger } from './logger';
import {
  IMAGE_OMITTED_MARKER,
  OVERSIZED_STRING_MARKER,
  MAX_FIELD_BYTES,
  stripPromptHeavyFields,
  truncateOversizedStrings,
  sanitizeForPrompt,
  createWarnAggregator,
} from './promptSafety';

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Buffer as any).byteLength = (str: any, encoding?: BufferEncoding) => {
      byteLengthCalls++;
      return originalByteLength(str, encoding as BufferEncoding);
    };
    try {
      stripPromptHeavyFields({ gallery: items });
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (Buffer as any).byteLength = originalByteLength;
    }

    // 旧 eager 設計: 100 leaf × 2 回 = 200 回
    // 新 lazy 設計: 100 leaf × 1 回 (isImageDataUri) + 50 leaf × 1 回 (tick builder) = 150 回
    // 厳密に 150 回でなくても、200 回未満であれば lazy 化は効いている
    expect(byteLengthCalls).toBeLessThan(200);
    expect(byteLengthCalls).toBeGreaterThanOrEqual(150);
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

  it('flush() emits nothing when tick() was never called (totalCount === 0)', () => {
    const agg = createWarnAggregator('test-event', 'promptSafety: test event');
    agg.flush();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('flush() emits nothing when tick() was called exactly MAX_WARN_PER_CALL (50) times (boundary 直下)', () => {
    const agg = createWarnAggregator('test-event', 'promptSafety: test event');
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
    const agg = createWarnAggregator('test-event', 'promptSafety: test event');
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
    const agg = createWarnAggregator('test-event', 'promptSafety: test event');
    // 型上は `message?: never` / `safetyEvent?: never` で禁止されているが、
    // 実行時の構造的防御 (spread 順) も pin する。`as any` で型 guard を bypass して悪意 payload を作る。
    agg.tick(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    const agg = createWarnAggregator('demo-omitted', 'promptSafety: demo something');
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
    const agg = createWarnAggregator('test-event', 'promptSafety: test event');
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
