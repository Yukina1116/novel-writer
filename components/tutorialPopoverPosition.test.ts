import { describe, it, expect } from 'vitest';
import { computePopoverPosition, type TargetRect } from './tutorialPopoverPosition';

const rect = (top: number, left: number, width: number, height: number): TargetRect => ({
    top, left, width, height, right: left + width, bottom: top + height,
});

const base = { popoverWidth: 300, popoverHeight: 200, viewportWidth: 1024, viewportHeight: 1080, gap: 12, margin: 8 };

const expectInside = (p: { top: number; left: number }, o = base) => {
    expect(p.top).toBeGreaterThanOrEqual(o.margin);
    expect(p.left).toBeGreaterThanOrEqual(o.margin);
    expect(p.top + o.popoverHeight).toBeLessThanOrEqual(o.viewportHeight - o.margin);
    expect(p.left + o.popoverWidth).toBeLessThanOrEqual(o.viewportWidth - o.margin);
};

describe('computePopoverPosition', () => {
    it('REGRESSION: 対象が画面ほぼ全高でも bottom 配置のカードが画面内に収まる（モバイル STEP3）', () => {
        // 実測: 本文エリアが top=128 / bottom=1004 / vh=1080 → 旧実装は top=1016 で「次へ」が y=1203
        const p = computePopoverPosition({ ...base, placement: 'bottom', rect: rect(128, 0, 1024, 876), isMobile: true });
        expectInside(p);
        expect(p.top).toBe(1080 - 8 - 200); // 反転できず画面下端に clamp
    });

    it('bottom: 下に余裕があれば対象の直下（rect.bottom + gap）に置く', () => {
        const p = computePopoverPosition({ ...base, placement: 'bottom', rect: rect(100, 100, 200, 100), isMobile: false });
        expect(p).toEqual({ top: 212, left: 100 });
    });

    it('bottom: 下に収まらず上に余裕があれば対象の上へ反転する', () => {
        const p = computePopoverPosition({ ...base, placement: 'bottom', rect: rect(700, 100, 200, 300), isMobile: false });
        expect(p.top).toBe(700 - 12 - 200);
    });

    it('bottom: 上下とも収まらない場合は画面下端に clamp する', () => {
        const p = computePopoverPosition({ ...base, placement: 'bottom', rect: rect(0, 0, 1024, 1080), isMobile: true });
        expect(p.top).toBe(1080 - 8 - 200);
    });

    it('bottom（モバイル）: 水平方向は画面中央に置く', () => {
        const p = computePopoverPosition({ ...base, placement: 'bottom', rect: rect(100, 100, 200, 100), isMobile: true });
        expect(p.left).toBe((1024 - 300) / 2);
    });

    it('bottom-end: 対象の右端に右揃え。右が画面外なら clamp', () => {
        const p = computePopoverPosition({ ...base, placement: 'bottom-end', rect: rect(10, 900, 200, 40), isMobile: true });
        expect(p.left).toBe(1024 - 8 - 300);
        expect(p.top).toBe(62);
    });

    it('left: 対象の左隣。左が画面外にはみ出すなら左端に clamp', () => {
        const p = computePopoverPosition({ ...base, placement: 'left', rect: rect(0, 100, 400, 800), isMobile: false });
        expect(p.left).toBe(8);
    });

    it('right: 対象の右隣。右が画面外なら右端に clamp', () => {
        const p = computePopoverPosition({ ...base, placement: 'right', rect: rect(0, 900, 124, 800), isMobile: false });
        expect(p.left).toBe(1024 - 8 - 300);
    });

    it('top: 対象の上に置く（上に余裕がなければ clamp で上端 margin）', () => {
        const ok = computePopoverPosition({ ...base, placement: 'top', rect: rect(500, 100, 200, 100), isMobile: false });
        expect(ok.top).toBe(500 - 12 - 200);
        const tight = computePopoverPosition({ ...base, placement: 'top', rect: rect(50, 100, 200, 100), isMobile: false });
        expect(tight.top).toBe(8);
    });

    it('top-start: 対象の内側左上（rect.top + gap, rect.left + gap）', () => {
        const p = computePopoverPosition({ ...base, placement: 'top-start', rect: rect(146, 414, 568, 576), isMobile: false });
        expect(p).toEqual({ top: 158, left: 426 });
    });

    it('rect が null → 画面中央', () => {
        const p = computePopoverPosition({ ...base, placement: undefined, rect: null, isMobile: false });
        expect(p).toEqual({ top: (1080 - 200) / 2, left: (1024 - 300) / 2 });
    });

    it('境界: カードが画面より大きい場合も top/left は margin 以上（負にならない）', () => {
        const o = { ...base, popoverHeight: 2000, viewportHeight: 500 };
        const p = computePopoverPosition({ ...o, placement: 'bottom', rect: rect(0, 0, 100, 100), isMobile: false });
        expect(p.top).toBe(8);
        expect(p.left).toBeGreaterThanOrEqual(8);
    });

    it('境界: placement 未指定は bottom と同じ扱い', () => {
        const a = computePopoverPosition({ ...base, placement: undefined, rect: rect(100, 100, 200, 100), isMobile: false });
        const b = computePopoverPosition({ ...base, placement: 'bottom', rect: rect(100, 100, 200, 100), isMobile: false });
        expect(a).toEqual(b);
    });

    // --- clamp に頼らない通常ケース（座標式そのものを検証） ---
    it('right: clamp されない通常ケースは (rect.top, rect.right + gap)', () => {
        const p = computePopoverPosition({ ...base, placement: 'right', rect: rect(100, 100, 200, 100), isMobile: false });
        expect(p).toEqual({ top: 100, left: 312 });
    });

    it('left: clamp されない通常ケースは (rect.top, rect.left - width - gap)', () => {
        const p = computePopoverPosition({ ...base, placement: 'left', rect: rect(100, 500, 200, 100), isMobile: false });
        expect(p).toEqual({ top: 100, left: 188 });
    });

    it('bottom-end: clamp されない通常ケースは対象の右端に右揃え（rect.right - width）', () => {
        const p = computePopoverPosition({ ...base, placement: 'bottom-end', rect: rect(100, 400, 400, 40), isMobile: true });
        expect(p).toEqual({ top: 152, left: 500 });
    });

    it('bottom-end: 下に収まらず上に余裕があれば上へ反転する', () => {
        const p = computePopoverPosition({ ...base, placement: 'bottom-end', rect: rect(700, 400, 300, 300), isMobile: true });
        expect(p).toEqual({ top: 700 - 12 - 200, left: 700 - 300 });
    });

    // --- 反転条件の境界値（maxTop = 1080 - 8 - 200 = 872） ---
    it('境界: 直下の top がちょうど maxTop なら反転しない', () => {
        // rect.bottom = 860 → below = 872 (== maxTop)。反転すると 300 - 212 = 88 になるので 872 なら反転していない
        const p = computePopoverPosition({ ...base, placement: 'bottom', rect: rect(300, 100, 200, 560), isMobile: false });
        expect(p.top).toBe(872);
    });

    it('境界: 直下の top が maxTop + 1 なら上へ反転する', () => {
        // rect.bottom = 861 → below = 873 (> 872)。上側は 300 - 212 = 88 ≥ 8 なので反転
        const p = computePopoverPosition({ ...base, placement: 'bottom', rect: rect(300, 100, 200, 561), isMobile: false });
        expect(p.top).toBe(88);
    });

    it('境界: 反転後の top がちょうど margin なら反転する', () => {
        // rect.top = 220 → 220 - 212 = 8 (== margin)
        const p = computePopoverPosition({ ...base, placement: 'bottom', rect: rect(220, 100, 200, 641), isMobile: false });
        expect(p.top).toBe(8);
    });

    it('境界: 反転後の top が margin - 1 なら反転せず画面下端に clamp する', () => {
        // rect.top = 219 → 219 - 212 = 7 (< margin)
        const p = computePopoverPosition({ ...base, placement: 'bottom', rect: rect(219, 100, 200, 642), isMobile: false });
        expect(p.top).toBe(872);
    });

    // --- 縦・横の clamp ---
    it('right: rect.top が大きくても下端に clamp する', () => {
        const p = computePopoverPosition({ ...base, placement: 'right', rect: rect(1000, 100, 200, 50), isMobile: false });
        expect(p).toEqual({ top: 872, left: 312 });
    });

    it('top-start: 右寄りの対象でも右端に clamp する', () => {
        const p = computePopoverPosition({ ...base, placement: 'top-start', rect: rect(100, 900, 100, 100), isMobile: false });
        expect(p).toEqual({ top: 112, left: 716 });
    });

    it('境界: カードの幅が viewport より大きい場合 left は margin に一致する', () => {
        const p = computePopoverPosition({ ...base, popoverWidth: 2000, viewportWidth: 500, placement: 'bottom', rect: rect(100, 100, 200, 100), isMobile: false });
        expect(p.left).toBe(8);
    });

    it('境界: 狭い viewport（320px、カード幅 288）でも画面内に収まる', () => {
        const o = { ...base, popoverWidth: 288, viewportWidth: 320, viewportHeight: 640 };
        const p = computePopoverPosition({ ...o, placement: 'bottom', rect: rect(60, 0, 320, 560), isMobile: true });
        expectInside(p, o);
    });
});
