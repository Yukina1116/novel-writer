import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../analysisApi', () => ({
    analyzeText: vi.fn(),
}));

import { createDataSlice } from './dataSlice';
import type { Project, TimelineEvent, PlotItem } from '../types';

const baseProject = (): Project => ({
    id: 'p-1',
    name: 'P',
    lastModified: new Date(0).toISOString(),
    settings: [],
    novelContent: [],
    chatHistory: [],
    knowledgeBase: [],
    plotBoard: [],
    plotTypeColors: {},
    plotRelations: [],
    plotNodePositions: [],
    timeline: [],
    timelineLanes: [],
    characterRelations: [],
    nodePositions: [],
    aiSettings: {} as Project['aiSettings'],
    displaySettings: {} as Project['displaySettings'],
});

interface FakeStore { state: Record<string, any>; set: (p: any) => void; get: () => Record<string, any>; }

const createFakeStore = (initial: Record<string, any>): FakeStore => {
    const fake: FakeStore = { state: { ...initial }, set: () => undefined, get: () => fake.state };
    fake.set = (partial: any) => {
        const next = typeof partial === 'function' ? partial(fake.state) : partial;
        fake.state = { ...fake.state, ...next };
    };
    fake.get = () => fake.state;
    return fake;
};

const mountSlice = (project: Project) => {
    const fake = createFakeStore({});
    const slice = createDataSlice(fake.set, fake.get);
    const openModal = vi.fn();
    const showToast = vi.fn();
    const addHistory = vi.fn();
    const markDirty = vi.fn();
    fake.state = {
        ...slice,
        activeProjectId: 'p-1',
        allProjectsData: { 'p-1': project },
        openModal,
        showToast,
        addHistory,
        markDirty,
        closeModal: vi.fn(),
    };
    return { slice, fake, openModal, showToast, addHistory, markDirty };
};

const event = (id: string, laneId: string, title = `event-${id}`): TimelineEvent => ({
    id, laneId, title, timestamp: '', description: '', lastModified: 0,
});

describe('moveTimelineEvent (action) — Issue #181 Phase 2 single-save (drag-drop)', () => {
    beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-06-19T00:00:00Z')); });
    afterEach(() => { vi.useRealTimers(); });

    it('AC-3e (/code-review must-fix): targetLane の最後の event の id を insertBeforeEventId に渡すと、その直前=lane 末尾位置に挿入される', () => {
        // 回帰防止: handler 側の else 分岐 (dragOverInfo===null) で store と local の挿入位置が
        // 不一致になる bug の規律 pin。handler が「lane 末尾」を狙うときは、配列末尾でなく
        // 「次の lane の最初の event の id」を insertBeforeEventId として渡す契約。
        const project: Project = {
            ...baseProject(),
            timeline: [
                event('a1', 'laneA'),
                event('a2', 'laneA'),
                event('b1', 'laneB'),  // ← laneA の末尾は a2 / 配列末尾は b1
                event('c1', 'laneC'),
            ],
        };
        const { fake } = mountSlice(project);

        // c1 を laneA の末尾 (a2 と b1 の間) に挿入する → insertBeforeEventId='b1'
        fake.state.moveTimelineEvent('c1', 'laneA', 'b1');

        const updated = fake.state.allProjectsData['p-1'];
        expect(updated.timeline.map((e: TimelineEvent) => e.id)).toEqual(['a1', 'a2', 'c1', 'b1']);
        const moved = updated.timeline.find((e: TimelineEvent) => e.id === 'c1');
        expect(moved.laneId).toBe('laneA');
    });

    it('AC-3a: lane 間移動 — eventId の laneId が targetLaneId に更新される', () => {
        const project: Project = {
            ...baseProject(),
            timeline: [event('e1', 'lane-A'), event('e2', 'lane-B')],
        };
        const { fake } = mountSlice(project);

        fake.state.moveTimelineEvent('e1', 'lane-B', null);

        const updated = fake.state.allProjectsData['p-1'];
        const moved = updated.timeline.find((e: TimelineEvent) => e.id === 'e1');
        expect(moved.laneId).toBe('lane-B');
    });

    it('AC-3b: insertBeforeEventId=null は配列末尾に挿入', () => {
        const project: Project = {
            ...baseProject(),
            timeline: [event('e1', 'lane-A'), event('e2', 'lane-A'), event('e3', 'lane-A')],
        };
        const { fake } = mountSlice(project);

        fake.state.moveTimelineEvent('e1', 'lane-A', null);

        const updated = fake.state.allProjectsData['p-1'];
        expect(updated.timeline.map((e: TimelineEvent) => e.id)).toEqual(['e2', 'e3', 'e1']);
    });

    it('AC-3c: insertBeforeEventId 指定で当該 event の直前に挿入', () => {
        const project: Project = {
            ...baseProject(),
            timeline: [event('e1', 'lane-A'), event('e2', 'lane-A'), event('e3', 'lane-A')],
        };
        const { fake } = mountSlice(project);

        // e3 を e2 の直前に動かす
        fake.state.moveTimelineEvent('e3', 'lane-A', 'e2');

        const updated = fake.state.allProjectsData['p-1'];
        expect(updated.timeline.map((e: TimelineEvent) => e.id)).toEqual(['e1', 'e3', 'e2']);
    });

    it('AC-3d: 同一 event を同一 lane の同一位置に動かす — 順序維持 (no-op 相当)', () => {
        const project: Project = {
            ...baseProject(),
            timeline: [event('e1', 'lane-A'), event('e2', 'lane-A')],
        };
        const { fake } = mountSlice(project);

        // e1 を e2 の前に動かす = 既に e2 の前にいる → 順序維持
        fake.state.moveTimelineEvent('e1', 'lane-A', 'e2');

        const updated = fake.state.allProjectsData['p-1'];
        expect(updated.timeline.map((e: TimelineEvent) => e.id)).toEqual(['e1', 'e2']);
    });

    it('存在しない eventId は no-op (例外を投げない、timeline 不変)', () => {
        const project: Project = {
            ...baseProject(),
            timeline: [event('e1', 'lane-A')],
        };
        const { fake, markDirty } = mountSlice(project);
        const beforeTimeline = project.timeline;

        expect(() => fake.state.moveTimelineEvent('non-existent', 'lane-A', null)).not.toThrow();
        expect(fake.state.allProjectsData['p-1'].timeline).toEqual(beforeTimeline);
        expect(markDirty).not.toHaveBeenCalled();
    });

    it('insertBeforeEventId が存在しない event の ID の場合は末尾挿入 (fallback)', () => {
        const project: Project = {
            ...baseProject(),
            timeline: [event('e1', 'lane-A'), event('e2', 'lane-A')],
        };
        const { fake } = mountSlice(project);

        fake.state.moveTimelineEvent('e1', 'lane-A', 'non-existent');

        const updated = fake.state.allProjectsData['p-1'];
        expect(updated.timeline.map((e: TimelineEvent) => e.id)).toEqual(['e2', 'e1']);
    });

    it('Codex 指摘: plotBoard を変更しない (link cleanup は責務外、deleteTimelineEvent の責務)', () => {
        const project: Project = {
            ...baseProject(),
            timeline: [event('e1', 'lane-A')],
            plotBoard: [{ id: 'p1', title: 'P', summary: '', plotType: 'main', linkedEventId: 'e1', lastModified: 100 } as unknown as PlotItem],
        };
        const beforePlotBoard = project.plotBoard;
        const { fake } = mountSlice(project);

        fake.state.moveTimelineEvent('e1', 'lane-B', null);

        const updated = fake.state.allProjectsData['p-1'];
        expect(updated.plotBoard).toEqual(beforePlotBoard);
    });

    it('Codex 指摘: title sync を発火しない (computePlotTitleSync は呼ばれない)', () => {
        // moveTimelineEvent は title を変更しない契約。
        // 万一 title 変更ロジックが混入したら plotBoard 側の title が変わってしまうため、
        // event.title 不変を確認することで間接的に title sync 不発火を pin する。
        const project: Project = {
            ...baseProject(),
            timeline: [event('e1', 'lane-A', '元タイトル')],
            plotBoard: [{ id: 'p1', title: '他タイトル', summary: '', plotType: 'main', linkedEventId: 'e1', lastModified: 100 } as unknown as PlotItem],
        };
        const { fake } = mountSlice(project);

        fake.state.moveTimelineEvent('e1', 'lane-B', null);

        const updated = fake.state.allProjectsData['p-1'];
        const moved = updated.timeline.find((e: TimelineEvent) => e.id === 'e1');
        expect(moved.title).toBe('元タイトル');
        expect((updated.plotBoard[0] as PlotItem).title).toBe('他タイトル');
    });

    it('lastModified が更新される (markDirty 経由で自動保存トリガー)', () => {
        const project: Project = {
            ...baseProject(),
            timeline: [event('e1', 'lane-A')],
        };
        const { fake } = mountSlice(project);
        const before = fake.state.allProjectsData['p-1'].lastModified;

        fake.state.moveTimelineEvent('e1', 'lane-B', null);

        const updated = fake.state.allProjectsData['p-1'];
        expect(updated.lastModified).not.toBe(before);
    });

    it('成功時に markDirty が 1 回呼ばれる (auto-save signal positive pin)', () => {
        const project: Project = {
            ...baseProject(),
            timeline: [event('e1', 'lane-A')],
        };
        const { fake, markDirty } = mountSlice(project);

        fake.state.moveTimelineEvent('e1', 'lane-B', null);

        expect(markDirty).toHaveBeenCalledTimes(1);
    });

    it('history を積まない (addHistory が呼ばれない、PR-A1/A2 規約に準拠)', () => {
        const project: Project = {
            ...baseProject(),
            timeline: [event('e1', 'lane-A')],
        };
        const { fake, addHistory } = mountSlice(project);

        fake.state.moveTimelineEvent('e1', 'lane-B', null);

        expect(addHistory).not.toHaveBeenCalled();
    });

    it('activeProjectId が null の場合は no-op (例外を投げない)', () => {
        const project: Project = { ...baseProject(), timeline: [event('e1', 'lane-A')] };
        const { fake } = mountSlice(project);
        fake.state.activeProjectId = null;

        expect(() => fake.state.moveTimelineEvent('e1', 'lane-B', null)).not.toThrow();
        expect(fake.state.allProjectsData['p-1'].timeline[0].laneId).toBe('lane-A');
    });
});
