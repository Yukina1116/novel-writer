import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Issue #181 Phase 1 hotfix の構造を grep で pin する。
// useEffect 内で uuidv4() を呼んでデフォルトレーンを動的生成するパターンが復活すると、
// PR-A2 リグレッション (event.laneId 孤児化 → 追加直後に画面から消える) が再発する。
// ensureDefaultLane action 経由で store に実体保存する経路に統一されていることを保証する。

describe('TimelineModal default lane hotfix (Issue #181 Phase 1)', () => {
    const source = readFileSync(resolve(__dirname, 'TimelineModal.tsx'), 'utf-8');

    it('uuidv4 import を持たない (デフォルトレーン uuid を component 内で生成しない契約)', () => {
        expect(source).not.toMatch(/from ['"]uuid['"]/);
        expect(source).not.toMatch(/\buuidv4\s*\(/);
    });

    it('ensureDefaultLane を useStore 経由で取得している', () => {
        expect(source).toMatch(/ensureDefaultLane\s*=\s*useStore\(state\s*=>\s*state\.ensureDefaultLane\)/);
    });

    it('isOpen 時に ensureDefaultLane() を呼ぶ useEffect が存在する', () => {
        // useEffect で if (isOpen) { ensureDefaultLane(); } のパターンを pin
        expect(source).toMatch(/if\s*\(isOpen\)\s*\{\s*ensureDefaultLane\(\);?\s*\}/);
    });

    it('「メインストーリー」リテラルを component 内で生成しない (store 側に集約)', () => {
        // store/dataSlice.ts の ensureDefaultLane action でのみ生成される契約
        expect(source).not.toMatch(/name:\s*['"]メインストーリー['"]/);
    });

    it('lanes 空時のフォールバック default 配列が空配列に変わっている (uuid 動的生成パスを廃止)', () => {
        // 旧パターン: lanes?.length > 0 ? [...lanes] : [{ id: uuidv4(), name: 'メインストーリー', ... }]
        // 新パターン: lanes && lanes.length > 0 ? [...lanes] : []
        expect(source).toMatch(/lanes\s*&&\s*lanes\.length\s*>\s*0\s*\?\s*\[\.\.\.lanes\]\s*:\s*\[\]/);
    });
});
