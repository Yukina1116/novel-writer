import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Contract test: AI prompt の文字列を pin する。
// Gemini 実応答は flaky で unit test 困難なため、systemInstruction に
// 必要な抽出指示語が含まれていることを文字列レベルで保証する。

const SOURCE_PATH = resolve(__dirname, 'analysisService.ts');
const source = readFileSync(SOURCE_PATH, 'utf8');

const REQUIRED_KEYWORDS = [
    // 人物候補抽出の積極姿勢
    '人物候補の積極抽出',
    '積極的に抽出',
    '広めに取る',
    '迷ったら抽出側に倒す',

    // 抽出対象カテゴリの明示 (代名詞・呼称・役割)
    '親族・関係呼称',
    '役割・職業呼称',
    '代名詞・指示語',

    // characters.new と extractedDetails.name の同期保証
    'characters.new と extractedDetails.name',
    '一文字一句一致',

    // 抽出例 (few-shot guidance)
    'お母さん',
    '先生',
    '主人公',
    'あの子',
];

describe('analysisService systemInstruction (contract)', () => {
    for (const keyword of REQUIRED_KEYWORDS) {
        it(`contains required keyword: "${keyword}"`, () => {
            expect(source).toContain(keyword);
        });
    }

    it('preserves existing world-context guidance', () => {
        // 既存のworld解析指示が改修で壊れていないことを確認
        expect(source).toContain('worldKeywords');
        expect(source).toMatch(/300〜400字|description/);
    });

    it('preserves existing 4-field character generation contract', () => {
        // summary / detailDescription / memo / dialogueSamples の責務定義を維持
        expect(source).toContain('summary');
        expect(source).toContain('detailDescription');
        expect(source).toContain('memo');
        expect(source).toContain('dialogueSamples');
    });
});
