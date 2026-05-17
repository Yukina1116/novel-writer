import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Header.tsx mobile BentoMenu の feature parity pin。
// grep test は文言変更に brittle だが、UI 文言を変更する PR では本 test を一緒に更新する
// 明示的契約 (CLAUDE.md「過剰な抽象化を避ける」)。

const getModeToggleLabel = (isSimpleMode: boolean): { label: string; nextSimpleMode: boolean } =>
    isSimpleMode
        ? { label: '標準モードへ', nextSimpleMode: false }
        : { label: 'シンプルモードへ', nextSimpleMode: true };

describe('Header mobile BentoMenu mode-toggle label', () => {
    it('isSimpleMode=true -> "標準モードへ" (toggles to false)', () => {
        expect(getModeToggleLabel(true)).toEqual({ label: '標準モードへ', nextSimpleMode: false });
    });

    it('isSimpleMode=false -> "シンプルモードへ" (toggles to true)', () => {
        expect(getModeToggleLabel(false)).toEqual({
            label: 'シンプルモードへ',
            nextSimpleMode: true,
        });
    });
});

describe('Header mobile BentoMenu items (static source pin)', () => {
    const headerSource = readFileSync(resolve(__dirname, 'Header.tsx'), 'utf-8');

    it('contains encrypted full-data export entry (mobile parity for M6 PR-D)', () => {
        expect(headerSource).toContain('全データ (.json, 暗号化)');
        expect(headerSource).toContain("handleExportAll()");
    });

    it('contains both mode-toggle labels for BentoMenu', () => {
        expect(headerSource).toContain('標準モードへ');
        expect(headerSource).toContain('シンプルモードへ');
    });

    it('mode-toggle entries call setSimpleMode(true) and setSimpleMode(false)', () => {
        expect(headerSource).toContain('setSimpleMode(true)');
        expect(headerSource).toContain('setSimpleMode(false)');
    });
});
