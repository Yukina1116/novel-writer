import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// PR #233 (quota バグ修正・段階呼び出し化) で /code-review CONFIRMED の2件を static pin する。
// レンダリングテスト (RTL) はこのプロジェクトでは未導入のため、TimelineModal.handlers.test.ts と
// 同じ readFileSync + regex パターンで handleGenerate の実装を直接検証する。

describe('ImageGenerationModal.handleGenerate (PR #233 static pin)', () => {
    const source = readFileSync(resolve(__dirname, 'ImageGenerationModal.tsx'), 'utf-8');
    const handlerMatch = source.match(/const handleGenerate = async[\s\S]*?\n {4}\};/);

    it('handleGenerate 定義が抽出できる', () => {
        expect(handlerMatch).toBeTruthy();
    });

    it('回帰防止: setSelectedImage(null) を append の値に関わらず無条件に実行する', () => {
        // 追加生成時に旧選択画像がハイライトされたまま残る不整合バグ (code-review CONFIRMED) の
        // 修正を pin する。将来 setGeneratedImages([]) と対称にする「整理」で
        // if (!append) ブロック内に戻されると、この bug が再発する。
        const handler = handlerMatch![0];
        expect(handler).toMatch(/setSelectedImage\(null\);/);
        expect(handler).not.toMatch(/if \(!append\)\s*\{\s*setSelectedImage\(null\)/);
    });

    it('setGeneratedImages のリセットは !append の場合のみ実行する', () => {
        const handler = handlerMatch![0];
        expect(handler).toMatch(/if \(!append\)\s*\{\s*setGeneratedImages\(\[\]\);/);
    });

    it('PR #233 の目的機能: append=true の場合は既存配列に結果を追記し、false の場合は置換する', () => {
        // 三項演算子が逆転すると「追加生成」を押しても既存画像が消えて置換されるだけになり、
        // 段階呼び出し化 (quota バグ修正) の目的そのものが壊れる。
        const handler = handlerMatch![0];
        expect(handler).toMatch(/setGeneratedImages\(prev => append \? \[\.\.\.prev, \.\.\.result\] : result\);/);
    });
});
