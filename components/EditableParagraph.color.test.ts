import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// 色付けボタン（パレット本体 / プリセット色 / キャラクターのテーマ色）の 3 経路が、必ず `applyColor` を経由し、
// 範囲未選択では本文を変更しない契約を固定する。コンポーネントは node 環境ではマウントできないため grep で守る。
// 経緯: 旧実装は選択なしで押すと先頭に「テキスト」入りのタグを挿入し、気づかず保存されて本文に残った
// （Issue #102 が B/U/H/ルビで撤去したのと同じリスク。色付けだけ残っていた）。

const source = readFileSync(resolve(__dirname, 'EditableParagraph.tsx'), 'utf-8');

describe('EditableParagraph color buttons — 範囲未選択では本文を変更しない', () => {
    it('色付けの 3 経路すべてが applyColor を経由する', () => {
        expect(source).toMatch(/applyColor\(brushColor\)/);
        expect(source).toMatch(/applyColor\(color\)/);
        expect(source).toMatch(/applyColor\(char\.themeColor!\)/);
    });

    it('applyMarkdown に色タグを直接渡さない（placeholder 付きの直接呼び出しを復活させない）', () => {
        // applyColor 内の 1 箇所（選択ありの場合のみ到達）以外に、色タグを applyMarkdown へ渡す呼び出しが無い
        const direct = source.match(/applyMarkdown\(`<c:/g) ?? [];
        expect(direct).toHaveLength(1);
        expect(source).not.toMatch(/placeholder:\s*'テキスト'/);
    });

    it('applyColor は選択が無いとき hasSelection で弾き、applyMarkdown の前に return する', () => {
        const fn = source.slice(source.indexOf('const applyColor'), source.indexOf('const wrapperClassName'));
        expect(fn).toMatch(/hasSelection\(/);
        expect(fn).toMatch(/showToast\(/);
        expect(fn.indexOf('hasSelection(')).toBeLessThan(fn.indexOf('applyMarkdown('));
        expect(fn).toMatch(/return false;[\s\S]*applyMarkdown\(/);
    });
});
