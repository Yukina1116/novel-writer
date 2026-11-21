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
});
