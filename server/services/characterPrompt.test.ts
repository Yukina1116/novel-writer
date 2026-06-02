import { describe, it, expect } from 'vitest';
import { ChatMessage } from '../../types';
import {
  MAX_HISTORY_TURNS,
  USER_FACING_LANGUAGE_RULES,
  CHARACTER_UPDATE_SYSTEM_INSTRUCTION,
  CHARACTER_REPLY_SYSTEM_INSTRUCTION,
  trimHistory,
  buildCharacterContents,
  sanitizeCharacterPatch,
  stripPromptHeavyFields,
  IMAGE_OMITTED_MARKER,
} from './characterPrompt';

const u = (text: string, mode: 'write' | 'consult' = 'write'): ChatMessage => ({ role: 'user', text, mode });
const a = (text: string): ChatMessage => ({ role: 'assistant', text, mode: 'consult' });

describe('trimHistory', () => {
  it('returns [] for non-array input', () => {
    expect(trimHistory(undefined as unknown as ChatMessage[])).toEqual([]);
    expect(trimHistory(null as unknown as ChatMessage[])).toEqual([]);
  });

  it('drops leading assistant turns so contents start with a user turn', () => {
    const history = [a('init'), u('first'), a('reply'), u('latest')];
    const trimmed = trimHistory(history);
    expect(trimmed[0].role).toBe('user');
    expect(trimmed[0].text).toBe('first');
  });

  it('keeps only the most recent MAX_HISTORY_TURNS turns', () => {
    const history: ChatMessage[] = [];
    for (let i = 0; i < MAX_HISTORY_TURNS + 10; i++) history.push(u(`m${i}`));
    const trimmed = trimHistory(history);
    expect(trimmed.length).toBe(MAX_HISTORY_TURNS);
    expect(trimmed[trimmed.length - 1].text).toBe(`m${MAX_HISTORY_TURNS + 9}`);
  });
});

describe('buildCharacterContents', () => {
  it('includes the ENTIRE conversation, not just the last message (症状A regression)', () => {
    const history = [a('init'), u('first'), a('reply'), u('latest')];
    const joined = buildCharacterContents(history, {}, 'update')
      .map((c) => c.parts[0].text)
      .join('\n');
    expect(joined).toContain('first');
    expect(joined).toContain('reply');
    expect(joined).toContain('latest');
  });

  it('maps roles to user/model', () => {
    const contents = buildCharacterContents([u('A'), a('B'), u('C')], {}, 'consult');
    expect(contents.map((c) => c.role)).toEqual(['user', 'model', 'user']);
  });

  it('appends RUNTIME_CONTEXT (intent + current data) only to the last user turn', () => {
    const data = { personality: 'X1' };
    const contents = buildCharacterContents([u('A'), u('B')], data, 'update');
    const last = contents[contents.length - 1].parts[0].text;
    const first = contents[0].parts[0].text;
    expect(last).toContain('<RUNTIME_CONTEXT>');
    expect(last).toContain('intent: update');
    expect(last).toContain('X1');
    expect(first).not.toContain('<RUNTIME_CONTEXT>');
  });

  it('tags earlier user turns with their original mode as TURN_INTENT', () => {
    const contents = buildCharacterContents([u('older', 'consult'), u('latest')], {}, 'update');
    expect(contents[0].parts[0].text).toContain('<TURN_INTENT>consult</TURN_INTENT>');
    expect(contents[1].parts[0].text).not.toContain('<TURN_INTENT>');
  });

  it('handles empty/null data as {} in RUNTIME_CONTEXT', () => {
    const contents = buildCharacterContents([u('X')], null, 'update');
    expect(contents[0].parts[0].text).toContain('currentCharacterData: {}');
  });
});

describe('sanitizeCharacterPatch', () => {
  it('removes null and undefined to protect existing values', () => {
    const patch = { personality: 'X', age: null, name: undefined, gender: 'Y' };
    expect(sanitizeCharacterPatch(patch)).toEqual({ personality: 'X', gender: 'Y' });
  });

  it('keeps falsy-but-meaningful values like empty string, 0, false', () => {
    const patch = { a: '', b: 0, c: false };
    expect(sanitizeCharacterPatch(patch)).toEqual({ a: '', b: 0, c: false });
  });
});

describe('stripPromptHeavyFields (token-bomb 対策: base64 dataURI を除外)', () => {
  it('replaces base64 data: URI in appearance.imageUrl with an omission marker', () => {
    const big = `data:image/png;base64,${'A'.repeat(1_000_000)}`;
    const data = { name: 'Alice', appearance: { imageUrl: big, traits: [{ key: '髪', value: '金' }] } };
    const stripped = stripPromptHeavyFields(data) as typeof data;
    expect(stripped.appearance.imageUrl).toBe(IMAGE_OMITTED_MARKER);
    expect(stripped.appearance.traits).toEqual([{ key: '髪', value: '金' }]);
    expect(stripped.name).toBe('Alice');
  });

  it('keeps non-dataURI imageUrl (http URL) intact', () => {
    const data = { appearance: { imageUrl: 'https://example.com/a.png' } };
    expect((stripPromptHeavyFields(data) as typeof data).appearance.imageUrl).toBe('https://example.com/a.png');
  });

  it('returns null/undefined/primitive unchanged', () => {
    expect(stripPromptHeavyFields(null)).toBe(null);
    expect(stripPromptHeavyFields(undefined)).toBe(undefined);
    expect(stripPromptHeavyFields('x')).toBe('x');
    expect(stripPromptHeavyFields(42)).toBe(42);
  });

  it('does not mutate the original input', () => {
    const big = `data:image/png;base64,${'A'.repeat(100)}`;
    const data = { appearance: { imageUrl: big, traits: [{ key: 'k', value: 'v' }] } };
    stripPromptHeavyFields(data);
    expect(data.appearance.imageUrl).toBe(big);
  });

  it('handles data missing appearance gracefully', () => {
    const data = { name: 'Alice', personality: 'gentle' };
    expect(stripPromptHeavyFields(data)).toEqual(data);
  });
});

describe('buildCharacterContents (token-bomb 対策統合)', () => {
  it('strips base64 dataURI from currentCharacterData before embedding into RUNTIME_CONTEXT', () => {
    const big = `data:image/png;base64,${'A'.repeat(500_000)}`;
    const data = { appearance: { imageUrl: big } };
    const contents = buildCharacterContents([u('describe her')], data, 'update');
    const text = contents[0].parts[0].text;
    expect(text).not.toContain('AAAAA');
    expect(text).toContain(IMAGE_OMITTED_MARKER);
    expect(text.length).toBeLessThan(5_000);
  });
});

describe('system instructions (症状B: 内部名禁止ルール埋め込み)', () => {
  it('both instructions embed the user-facing language rules', () => {
    const marker = USER_FACING_LANGUAGE_RULES.trim().slice(0, 30);
    expect(CHARACTER_UPDATE_SYSTEM_INSTRUCTION).toContain(marker);
    expect(CHARACTER_REPLY_SYSTEM_INSTRUCTION).toContain(marker);
  });

  it('forbids exposing internal field names', () => {
    expect(USER_FACING_LANGUAGE_RULES).toContain('longDescription');
    expect(USER_FACING_LANGUAGE_RULES).toContain('traits');
  });
});
