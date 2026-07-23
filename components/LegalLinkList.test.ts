import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// LegalLinkList の extraLinks はデフォルト空配列であることを pin する。
// TermsConsentModal は extraLinks を渡さずこのデフォルトに依存しているため、
// デフォルト値が誤って削除/必須化されると [...LEGAL_DOCS, ...undefined] となり
// スプレッド構文が TypeError で落ちる。同意ゲート画面のクラッシュに直結するため
// 静的 grep で防御する（このプロジェクトのコンポーネントテスト規約に準拠）。

describe('LegalLinkList contract', () => {
    const source = readFileSync(resolve(__dirname, 'LegalLinkList.tsx'), 'utf-8');

    it('defaults extraLinks to an empty array', () => {
        expect(source).toMatch(/extraLinks\s*=\s*\[\]/);
    });

    it('concatenates LEGAL_DOCS before extraLinks (legal docs first, SNS links after)', () => {
        expect(source).toMatch(/\[\.\.\.LEGAL_DOCS,\s*\.\.\.extraLinks\]/);
    });

    it('renders aria-label from doc.ariaLabel (WCAG 2.4.4 Link Purpose)', () => {
        expect(source).toMatch(/aria-label=\{doc\.ariaLabel\}/);
    });
});
