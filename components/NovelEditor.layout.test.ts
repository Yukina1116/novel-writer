import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// 「本文を直接入力」パネルを開いた状態で画面の高さが低いと、下部パネルが画面外にあふれ
// 「本文に追加」ボタンに届かなくなる不具合の構造的な再発防止（CSS 配置は node 環境では計測できないため、
// 原因だった 2 点を grep で固定する。実際の座標は Playwright の実測で検証済み）。
//
// 原因:
//  1. 本文エリアが `p-6 pb-32` で、余白だけで最小 152px あり縮められない
//  2. 下部パネルが `flex-shrink-0` で縮まず、足りない分が画面外にあふれる（画面は overflow-hidden で届かない）

const source = readFileSync(resolve(__dirname, 'NovelEditor.tsx'), 'utf-8');

const classNameOf = (marker: RegExp): string => {
    const line = source.split('\n').find(l => marker.test(l));
    if (!line) throw new Error(`marker not found: ${marker}`);
    return line;
};

describe('NovelEditor bottom panel layout (small viewport height)', () => {
    it('本文エリアの下パディング(pb-32)は縮められるよう内側の要素に置く（スクロールコンテナ自体に置かない）', () => {
        const scrollContainer = classNameOf(/className=\{`flex-1 [^`]*overflow-y-auto/);
        expect(scrollContainer).not.toMatch(/\bpb-32\b/);
        expect(source).toMatch(/prose-custom-font[^'"`]*\bpb-32\b/);
    });

    it('本文エリアは最小の高さを確保しつつ縮められる（min-h-0 ではなく最小高さを指定）', () => {
        expect(source).toMatch(/flex-1[^`]*overflow-y-auto[^`]*\bmin-h-\[6rem\]/);
    });

    it('下部パネル（本文を直接入力）は flex-shrink-0 にしない（縮められる構造にする）', () => {
        const bottomBar = classNameOf(/shadow-\[0_-4px_12px_rgba\(0,0,0,0\.15\)\]/);
        expect(bottomBar).not.toMatch(/flex-shrink-0/);
        expect(bottomBar).toMatch(/\bmin-h-0\b/);
    });

    it('開いた入力パネル(#new-chunk-panel)はあふれた分をパネル内でスクロールできる', () => {
        const panel = classNameOf(/id="new-chunk-panel"/);
        expect(panel).toMatch(/overflow-y-auto/);
        expect(panel).toMatch(/\bmin-h-0\b/);
    });

    it('「最下部へ」ボタンは下部枠の直下の子に置く（スクロール/clip するラッパーで包まない）', () => {
        // ボタンは `absolute -top-16` で枠の外に出る。スクロール可能な要素や overflow の祖先に入れると切られる。
        // 枠の開きタグからボタンの手前までに別の <div> が挟まらないことで、直下の子であることを固定する
        const barMarker = source.indexOf('shadow-[0_-4px_12px_rgba(0,0,0,0.15)]');
        const buttonStart = source.indexOf('{!isAtBottom');
        expect(barMarker).toBeGreaterThan(-1);
        expect(buttonStart).toBeGreaterThan(barMarker);
        expect(source.slice(barMarker, buttonStart)).not.toMatch(/<div/);
        // ボタン自体が入力パネル(#new-chunk-panel)より前にある（パネルの内側に入っていない）
        expect(source.indexOf('aria-label="一番下までスクロール"')).toBeLessThan(source.indexOf('id="new-chunk-panel"'));
    });
});
