import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Contract test: worldService の防御ガードを source 内文字列で pin する。
// AI 実呼出が必要な動作テストは aiClient mock 整備コスト高のため、ガード
// 削除の regression を最小コストで防ぐ static 検査 (analysisService.test.ts と同パターン)。

const SOURCE_PATH = resolve(__dirname, 'worldService.ts');
const source = readFileSync(SOURCE_PATH, 'utf8');

describe('worldService - defensive guards (code-review #133 fix)', () => {
  it('updateWorldData has empty-chatHistory guard symmetric with characterService.updateCharacterData', () => {
    // 空履歴で chatHistory[chatHistory.length - 1].text が TypeError → 500 を防ぐ。
    // characterService.ts:60-62 と同型のパターンを pin。
    expect(source).toMatch(/!Array\.isArray\(chatHistory\)\s*\|\|\s*chatHistory\.length\s*===\s*0/);
  });

  it('updateWorldData routes currentWorldData through sanitizeForPrompt', () => {
    expect(source).toContain('sanitizeForPrompt(currentWorldData || {})');
  });

  it('generateWorldReply guards updatedWorldData against null/undefined with `?? {}`', () => {
    // null/undefined だと JSON.stringify(undefined) === undefined → template literal で
    // literal "undefined" が prompt に embed される regression を防ぐ。
    expect(source).toContain('sanitizeForPrompt(updatedWorldData ?? {})');
  });
});
