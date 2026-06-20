import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// バグ修正 (Issue: タイムライン編集→プロット戻り時の編集モーダル復元バグ):
// 旧実装は `useEffect([isOpen, plotItems, ..., itemToEdit])` の単一 effect 内で
// itemToEdit から editingCard を毎回再注入していたため、plotItems が変わるたびに
// (= upsertPlotItem の保存後やタイムライン編集の title sync の度に) CardEditorModal が
// 自動再オープンしてしまい「保存ボタンが押せない」UX バグを生んでいた。
// 加えてキャンセル後に別カードを開いた瞬間に editingCard が itemToEdit の plotA に
// 上書き注入される経路もあり「以前の未保存のものが勝手に入る」現象につながった。
//
// 修正: effect を 2 つに分割。
//   1. store→local 同期 (plotItems / relations / positions / colors の追随)
//   2. itemToEdit→editingCard 初期表示 (handledItemToEditIdRef で ID 単位 1 回ガード)
//
// 本テストは構造的に pin して、将来の refactor で単一 effect 内に戻るのを阻止する。

describe('PlotBoardModal itemToEdit re-entry guard (bug fix)', () => {
    const source = readFileSync(resolve(__dirname, 'PlotBoardModal.tsx'), 'utf-8');

    it('handledItemToEditIdRef を useRef で宣言している', () => {
        expect(source).toMatch(/handledItemToEditIdRef\s*=\s*useRef<\s*string\s*\|\s*null\s*>\(\s*null\s*\)/);
    });

    it('useEffect が 2 つ以上に分割されている (PlotBoardModal コンポーネント内、isOpen 同期 + itemToEdit ガード)', () => {
        // PlotBoardModal export = (...) => { ... } の中身を抽出
        const compMatch = source.match(/export const PlotBoardModal[\s\S]*$/);
        expect(compMatch).toBeTruthy();
        // useEffect( の出現回数を数える (Tutorial 用 1 + 同期 1 + itemToEdit 1 = 3 以上)
        const useEffectCount = (compMatch![0].match(/useEffect\(/g) || []).length;
        expect(useEffectCount).toBeGreaterThanOrEqual(3);
    });

    it('itemToEdit を扱う useEffect は ref ガード経由でのみ setEditingCard を呼ぶ', () => {
        // ref ガードの直後に setEditingCard が来ることを構造的に確認
        // パターン: handledItemToEditIdRef.current !== itemToEdit.id → setEditingCard
        expect(source).toMatch(
            /handledItemToEditIdRef\.current\s*!==\s*itemToEdit\.id[\s\S]{0,400}setEditingCard\s*\(\s*card\s*\)/
        );
    });

    it('ref ガード成立後に handledItemToEditIdRef.current を更新している', () => {
        // setEditingCard と同じスコープで ref.current = itemToEdit.id を代入する
        expect(source).toMatch(
            /setEditingCard\s*\(\s*card\s*\)[\s\S]{0,200}handledItemToEditIdRef\.current\s*=\s*itemToEdit\.id/
        );
    });

    it('!isOpen 時に handledItemToEditIdRef.current を null にリセットしている', () => {
        // モーダルを閉じた次に同じ ID で再 open しても動くようリセット必須
        expect(source).toMatch(
            /!\s*isOpen[\s\S]{0,200}handledItemToEditIdRef\.current\s*=\s*null/
        );
    });

    it('旧バグパターン: itemToEdit を直接条件にして無ガードで setEditingCard を呼ぶ単一 effect が存在しない', () => {
        // 修正前の構造: `if(itemToEdit) { const card = plotItems.find...; if (card) setEditingCard(card); }`
        // が単一 effect 内にあるのを禁止。ref ガード `handledItemToEditIdRef.current !== itemToEdit.id` を
        // 伴わない `if (itemToEdit)` → `setEditingCard(card)` の直線パターンを検出する。
        const oldPattern = /if\s*\(\s*itemToEdit\s*\)\s*\{\s*const\s+card\s*=\s*plotItems\.find[\s\S]{0,150}if\s*\(\s*card\s*\)\s*setEditingCard\s*\(\s*card\s*\)\s*;?\s*\}/;
        expect(source).not.toMatch(oldPattern);
    });
});
