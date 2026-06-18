import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Issue #181 Phase 2: 4 handler (handleSaveLane / handleDeleteLane / handleDeleteEvent / handleDrop) に
// 対応する store action 呼び出し (upsertTimelineLane / deleteTimelineLane / deleteTimelineEvent /
// moveTimelineEvent) が存在することを grep で pin する。
// 将来の refactor で「local state のみ更新」パスに戻ると、フッター保存なしで閉じた時に変更が消える
// PR-A2 由来の UX バグ family が再発するため、構造的に阻止する。

describe('TimelineModal Phase 2 handler→store wiring (Issue #181 Phase 2)', () => {
    const source = readFileSync(resolve(__dirname, 'TimelineModal.tsx'), 'utf-8');

    it('4 つの store action を useStore 経由で取得している', () => {
        expect(source).toMatch(/upsertTimelineLane\s*=\s*useStore\(state\s*=>\s*state\.upsertTimelineLane\)/);
        expect(source).toMatch(/deleteTimelineLane\s*=\s*useStore\(state\s*=>\s*state\.deleteTimelineLane\)/);
        expect(source).toMatch(/deleteTimelineEvent\s*=\s*useStore\(state\s*=>\s*state\.deleteTimelineEvent\)/);
        expect(source).toMatch(/moveTimelineEvent\s*=\s*useStore\(state\s*=>\s*state\.moveTimelineEvent\)/);
    });

    it('handleSaveLane が upsertTimelineLane を呼ぶ (lane 単体保存)', () => {
        // handleSaveLane 定義から次の handler までの範囲で upsertTimelineLane の呼び出しを確認
        const handlerMatch = source.match(/const handleSaveLane[\s\S]*?(?=const handleDeleteLane)/);
        expect(handlerMatch).toBeTruthy();
        expect(handlerMatch![0]).toMatch(/upsertTimelineLane\s*\(\s*laneToSave\s*\)/);
    });

    it('handleDeleteLane が deleteTimelineLane を呼ぶ (lane + cascade + plot link cleanup)', () => {
        const handlerMatch = source.match(/const handleDeleteLane[\s\S]*?(?=const handleSaveEvent)/);
        expect(handlerMatch).toBeTruthy();
        expect(handlerMatch![0]).toMatch(/deleteTimelineLane\s*\(\s*laneId\s*\)/);
    });

    it('handleDeleteEvent が deleteTimelineEvent を呼ぶ (event + plot link cleanup)', () => {
        const handlerMatch = source.match(/const handleDeleteEvent[\s\S]*?(?=\/\/ Drag and Drop)/);
        expect(handlerMatch).toBeTruthy();
        expect(handlerMatch![0]).toMatch(/deleteTimelineEvent\s*\(\s*eventId\s*\)/);
    });

    it('handleDrop が moveTimelineEvent を呼ぶ (drag-drop 順序計算ベース)', () => {
        // handleDrop は最後の handler なので、関数末尾の閉じ括弧まで
        const handlerMatch = source.match(/const handleDrop\s*=\s*\([^)]*\)\s*=>\s*\{[\s\S]*?handleDragEnd\(\);[\s\S]*?\};/);
        expect(handlerMatch).toBeTruthy();
        expect(handlerMatch![0]).toMatch(/moveTimelineEvent\s*\(/);
    });

    it('Codex 推奨: handleDrop の moveTimelineEvent 呼び出しに insertBeforeEventId 引数が渡されている', () => {
        // 全置換 setTimeline(newTimeline) ではなく、(eventId, targetLaneId, insertBeforeEventId) の
        // 3 引数で呼ぶ責務縮小契約を pin。
        const handlerMatch = source.match(/const handleDrop\s*=\s*\([^)]*\)\s*=>\s*\{[\s\S]*?handleDragEnd\(\);[\s\S]*?\};/);
        expect(handlerMatch).toBeTruthy();
        // 引数 3 つを取る call を確認
        expect(handlerMatch![0]).toMatch(/moveTimelineEvent\s*\(\s*draggedEventId\s*,\s*targetLaneId\s*,\s*insertBeforeEventId\s*\)/);
    });

    it('Codex 推奨: setTimeline(newTimeline) のような全置換パターンを使用していない', () => {
        // setTimeline は責務が広すぎるため採用せず moveTimelineEvent に分割した経緯を grep で pin。
        // 将来「シンプルにするため setTimeline に戻す」refactor を阻止する。
        expect(source).not.toMatch(/state\.setTimeline\b/);
        expect(source).not.toMatch(/=\s*useStore\(state\s*=>\s*state\.setTimeline\)/);
    });

    it('PR-A2 リグレッション防止: handleSaveEvent の upsertTimelineEvent 呼び出しが維持されている', () => {
        // Phase 2 で他 handler 追加に紛れて誤って消されるのを防ぐ。
        const handlerMatch = source.match(/const handleSaveEvent[\s\S]*?(?=const handleDeleteEvent)/);
        expect(handlerMatch).toBeTruthy();
        expect(handlerMatch![0]).toMatch(/upsertTimelineEvent\s*\(\s*eventToSave\s*\)/);
    });
});
