import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// 色付けボタン（パレット本体 / プリセット色 / キャラクターのテーマ色）の 3 経路が、必ず `applyColor` を経由し、
// 範囲未選択では本文を変更しない契約を固定する。コンポーネントは node 環境ではマウントできないため grep で守る。
// 経緯: 旧実装は選択なしで押すと先頭に「テキスト」入りのタグを挿入し、気づかず保存されて本文に残った
// （Issue #102 が B/U/H/ルビで撤去したのと同じリスク。色付けだけ残っていた）。
//
// 選択の有無の判定ロジック自体は pure helper `applyColorTag` が持ち（applyMarkdown.test.ts で実行時に検証）、
// ここでは「コンポーネントがそれを本番経路で使い、null を『何もせずヒントを出す』合図として扱う」ことを固定する。

const source = readFileSync(resolve(__dirname, 'EditableParagraph.tsx'), 'utf-8');

const applyColorBody = (() => {
    const start = source.indexOf('const applyColor');
    const end = source.indexOf('const wrapperClassName');
    if (start < 0 || end < start) throw new Error('applyColor の範囲を特定できない');
    return source.slice(start, end);
})();

describe('EditableParagraph color buttons — 範囲未選択では本文を変更しない', () => {
    it('色付けの 3 経路すべてが applyColor を経由し、適用できたときだけパルスを止める', () => {
        expect(source).toMatch(/applyColor\(brushColor\)/);
        expect(source).toMatch(/applyColor\(color\)/);
        expect(source).toMatch(/applyColor\(char\.themeColor/);
        // 未適用（選択なし）でパルス(適用を促す演出)を消さない: 戻り値で分岐する
        expect((source.match(/if \(applyColor\(/g) ?? []).length).toBe(3);
    });

    it('色タグを applyMarkdown へ直接渡さない（placeholder 付きの直接呼び出しを復活させない）', () => {
        expect(source).not.toMatch(/applyMarkdown\(`<c:/);
        expect(source).not.toMatch(/placeholder:\s*'テキスト'/);
    });

    it('applyColor は tested な applyColorTag を使い、null を「何もせずヒントを出して false」の合図として扱う', () => {
        expect(applyColorBody).toMatch(/applyColorTag\(\{[\s\S]*?color[\s\S]*?\}\)/);
        // `if (!result)` のブロック内でヒントを出し、return false する（反転した判定を許さない）
        expect(applyColorBody).toMatch(/if \(!result\) \{[\s\S]*?setColorHint\([\s\S]*?return false;[\s\S]*?\}/);
        // 本文の更新(setEditText)は null 判定の後ろにだけある
        expect(applyColorBody.indexOf('if (!result)')).toBeLessThan(applyColorBody.indexOf('setEditText('));
    });

    it('ヒントはトーストではなくインライン表示にする（モバイルは Toast 非描画、設定でオフにもできるため）', () => {
        expect(applyColorBody).not.toMatch(/showToast/);
        // role="status" の要素で colorHint を表示する（スクリーンリーダーにも伝わる）
        expect(source).toMatch(/role="status"[\s\S]{0,300}\{colorHint\}/);
    });

    it('ライブ領域(role=status)は常時マウントし、内容だけを更新する（メッセージ入りで新規挿入すると読み上げられないことがある）', () => {
        // 条件付き描画 `{colorHint && (<div role="status">…)}` にしない
        expect(source).not.toMatch(/\{colorHint && \(/);
        // 空のときは視覚的に隠す(sr-only)だけで、要素自体は残す
        expect(source).toMatch(/role="status"[\s\S]{0,200}sr-only/);
    });

    it('適用できなかったときはテキストエリアへフォーカスを戻す（スウォッチ経由でパレットが閉じてもフォーカスが body に落ちない）', () => {
        const failBranch = applyColorBody.slice(applyColorBody.indexOf('if (!result)'), applyColorBody.indexOf('setColorHint(null)'));
        expect(failBranch).toMatch(/textarea\.focus\(/);
        // フォーカスを戻すのは、ヒントを出した後・return false の前
        expect(failBranch.indexOf('setColorHint(')).toBeLessThan(failBranch.indexOf('textarea.focus('));
        expect(failBranch.indexOf('textarea.focus(')).toBeLessThan(failBranch.indexOf('return false;'));
    });
});
