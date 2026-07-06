import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Issue #232 計測: isAdditionalGeneration が apiCall のボディに正しく含まれることを
// static pin する。RTL 未導入のため ImageGenerationModal.handlers.test.ts と同じ
// readFileSync + regex パターンで検証する。

describe('imageApi.generateImage (Issue #232 計測 static pin)', () => {
    const source = readFileSync(resolve(__dirname, 'imageApi.ts'), 'utf-8');

    it('isAdditionalGeneration をデフォルト false で受け取る', () => {
        expect(source).toMatch(/isAdditionalGeneration = false/);
    });

    it('apiCall のボディに prompt と isAdditionalGeneration を含める', () => {
        // ここが崩れると isAdditionalGeneration が BE に伝搬されず、
        // imageGenerationCounts.additional が常に 0 のまま計測が破綻する。
        expect(source).toMatch(/apiCall<string\[\]>\('\/image\/generate', \{ prompt, isAdditionalGeneration \}\)/);
    });
});
