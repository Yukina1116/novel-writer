import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Contract test: characterService の防御ガードを source 内文字列で pin する。
// AI 実呼出 mock のコストを払わずに、code-review #133 で指摘された generateCharacterReply の
// null/undefined ガード asymmetry 修正が後の改修で外されないようにする。

const SOURCE_PATH = resolve(__dirname, 'characterService.ts');
const source = readFileSync(SOURCE_PATH, 'utf8');

describe('characterService - defensive guards (code-review #133 fix)', () => {
  it('generateCharacterReply guards updatedCharacterData against null/undefined with `?? {}`', () => {
    // null/undefined だと JSON.stringify(null, null, 2) === "null" → AI に literal "null" が
    // 渡る regression を防ぐ。buildCharacterContents の `?? {}` パターンと対称化。
    expect(source).toContain('sanitizeForPrompt(updatedCharacterData ?? {})');
  });

  it('generateCharacterReply routes context.appliedPatch through sanitizeForPrompt', () => {
    // appliedPatch にも appearance.imageUrl が含まれうるため、必ず sanitize 経由化。
    expect(source).toContain('sanitizeForPrompt(context.appliedPatch)');
  });
});
