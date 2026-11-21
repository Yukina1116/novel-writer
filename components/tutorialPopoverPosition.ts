// チュートリアルのカード位置計算（pure helper）。
// store / firebase 依存を持たない独立モジュールに置く（component 経由の import だと
// transitive import で test が壊れるため）。

export type TutorialPlacement = 'right' | 'left' | 'top' | 'top-start' | 'bottom-end' | 'bottom';

export interface TargetRect {
    top: number;
    left: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
}

export interface PopoverPositionInput {
    placement: TutorialPlacement | undefined;
    rect: TargetRect | null;
    popoverWidth: number;
    popoverHeight: number;
    viewportWidth: number;
    viewportHeight: number;
    isMobile: boolean;
    gap?: number;
    margin?: number;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

/**
 * カードの左上座標（px, position: fixed 前提）を返す。
 * 常に viewport 内（margin 以上）に収める。カードが viewport より大きい場合は top/left = margin を優先する。
 */
export const computePopoverPosition = ({
    placement,
    rect,
    popoverWidth,
    popoverHeight,
    viewportWidth,
    viewportHeight,
    isMobile,
    gap = 12,
    margin = 8,
}: PopoverPositionInput): { top: number; left: number } => {
    const maxTop = viewportHeight - popoverHeight - margin;
    const maxLeft = viewportWidth - popoverWidth - margin;
    const fit = (top: number, left: number) => ({
        top: Math.max(margin, clamp(top, margin, maxTop)),
        left: Math.max(margin, clamp(left, margin, maxLeft)),
    });

    if (!rect) {
        return fit((viewportHeight - popoverHeight) / 2, (viewportWidth - popoverWidth) / 2);
    }

    switch (placement) {
        case 'right':
            return fit(rect.top, rect.right + gap);
        case 'left':
            return fit(rect.top, rect.left - popoverWidth - gap);
        case 'top':
            return fit(rect.top - gap - popoverHeight, rect.left);
        case 'top-start':
            return fit(rect.top + gap, rect.left + gap);
        case 'bottom-end': {
            const below = rect.bottom + gap;
            const top = below > maxTop && rect.top - gap - popoverHeight >= margin ? rect.top - gap - popoverHeight : below;
            return fit(top, rect.right - popoverWidth);
        }
        case 'bottom':
        default: {
            // 下に収まらず上に余裕があれば反転（対象が画面ほぼ全高のモバイル STEP3 は clamp で画面下端に寄せる）
            const below = rect.bottom + gap;
            const top = below > maxTop && rect.top - gap - popoverHeight >= margin ? rect.top - gap - popoverHeight : below;
            const left = isMobile ? (viewportWidth - popoverWidth) / 2 : rect.left;
            return fit(top, left);
        }
    }
};
