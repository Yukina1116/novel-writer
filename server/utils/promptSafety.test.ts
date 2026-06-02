import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logger } from './logger';
import {
  IMAGE_OMITTED_MARKER,
  OVERSIZED_STRING_MARKER,
  MAX_FIELD_BYTES,
  stripPromptHeavyFields,
  truncateOversizedStrings,
  sanitizeForPrompt,
} from './promptSafety';

describe('stripPromptHeavyFields - whitelist 既知フィールド除去', () => {
  it('replaces character appearance.imageUrl dataURI with marker', () => {
    const big = `data:image/png;base64,${'A'.repeat(1_000_000)}`;
    const data = { name: 'Alice', appearance: { imageUrl: big, traits: [{ key: '髪', value: '金' }] } };
    const out = stripPromptHeavyFields(data) as typeof data;
    expect(out.appearance.imageUrl).toBe(IMAGE_OMITTED_MARKER);
    expect(out.appearance.traits).toEqual([{ key: '髪', value: '金' }]);
    expect(out.name).toBe('Alice');
  });

  it('replaces world mapImageUrl dataURI with marker', () => {
    const big = `data:image/jpeg;base64,${'B'.repeat(500_000)}`;
    const data = { name: '王国', mapImageUrl: big, exportDescription: '広大な大陸' };
    const out = stripPromptHeavyFields(data) as typeof data;
    expect(out.mapImageUrl).toBe(IMAGE_OMITTED_MARKER);
    expect(out.name).toBe('王国');
    expect(out.exportDescription).toBe('広大な大陸');
  });

  it('handles both character and world fields simultaneously (safe no-op if absent)', () => {
    const both = {
      appearance: { imageUrl: 'data:image/png;base64,XYZ' },
      mapImageUrl: 'data:image/png;base64,QQQ',
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

  it('returns null/undefined/primitive unchanged', () => {
    expect(stripPromptHeavyFields(null)).toBe(null);
    expect(stripPromptHeavyFields(undefined)).toBe(undefined);
    expect(stripPromptHeavyFields('hello')).toBe('hello');
    expect(stripPromptHeavyFields(42)).toBe(42);
  });

  it('does not mutate input (immutability)', () => {
    const big = `data:image/png;base64,${'A'.repeat(100)}`;
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
