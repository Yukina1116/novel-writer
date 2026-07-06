import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Issue #232 計測: 「追加生成」フラグが handleGenerateImage → imageApi.generateImage まで
// 正しく伝搬することを static pin する。RTL 未導入のため
// ImageGenerationModal.handlers.test.ts と同じ readFileSync + regex パターンで検証する。
// store/firebaseClient への transitive import を避けるため（CI で VITE_FIREBASE_*
// 必須化を防ぐ既存規律、CLAUDE.md「pure helper 分離パターン」参照）、レンダリングでは
// なくソース文字列を直接検証する。

describe('SettingModals.handleGenerateImage (Issue #232 計測 static pin)', () => {
    const source = readFileSync(resolve(__dirname, 'SettingModals.tsx'), 'utf-8');
    const handlerMatch = source.match(/const handleGenerateImage = async[\s\S]*?\n {4}\};/);

    it('handleGenerateImage 定義が抽出できる', () => {
        expect(handlerMatch).toBeTruthy();
    });

    it('isAdditionalGeneration をデフォルト false で受け取る', () => {
        const handler = handlerMatch![0];
        expect(handler).toMatch(/isAdditionalGeneration: boolean = false/);
    });

    it('imageApi.generateImage に isAdditionalGeneration をそのまま渡す', () => {
        // ここで isAdditionalGeneration の受け渡しが握りつぶされると、
        // 追加生成ボタンを押しても常に isAdditionalGeneration=false が送信され、
        // imageGenerationCounts.additional が永久に 0 のまま計測が破綻する。
        const handler = handlerMatch![0];
        expect(handler).toMatch(/imageApi\.generateImage\(\{ prompt, isAdditionalGeneration \}\)/);
    });
});
