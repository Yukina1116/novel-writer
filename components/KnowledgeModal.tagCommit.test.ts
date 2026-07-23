import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// バグ修正: タグ入力欄に Enter/カンマを押さず文字を残したまま保存すると、
// その未コミットのタグが tags state に一度も入らずサイレントに消えていた
// (再度開くとタグ欄・一覧のタグ表示のいずれも空白になる)。
// 修正: handleSubmit で tagInput の残留分も tags にマージしてから onSave する。
// 本テストは「送信時に tagInput を無視して tags をそのまま渡す」旧構造への退行を pin する。
//
// 併せてカテゴリ入力の list/datalist (ホバーで▼が出るがクリックしても無反応の
// ネイティブ picker indicator) を削除した修正の退行も pin する。

describe('KnowledgeModal タグ未コミット問題 (bug fix)', () => {
    const source = readFileSync(resolve(__dirname, 'KnowledgeModal.tsx'), 'utf-8');

    const handleSubmitMatch = source.match(/const handleSubmit[\s\S]*?(?=const handleKeyDown)/);

    it('handleSubmit が定義されている', () => {
        expect(handleSubmitMatch).toBeTruthy();
    });

    it('handleSubmit が tagInput.trim() を確定させてから onSave に渡す', () => {
        expect(handleSubmitMatch![0]).toMatch(/tagInput\.trim\(\)/);
        expect(handleSubmitMatch![0]).toMatch(/onSave\(\s*\{[^}]*tags:\s*finalTags/);
    });

    it('旧バグパターン: tagInput を無視して tags をそのまま onSave に渡す直線パターンが存在しない', () => {
        const oldPattern = /onSave\(\s*\{\s*\.\.\.itemToEdit,\s*name,\s*content,\s*category,\s*tags\s*\}/;
        expect(source).not.toMatch(oldPattern);
    });

    it('カテゴリ入力に list/datalist (クリック無反応の▼) が存在しない', () => {
        expect(source).not.toMatch(/list=["']category-suggestions["']/);
        expect(source).not.toMatch(/<datalist/);
    });
});
