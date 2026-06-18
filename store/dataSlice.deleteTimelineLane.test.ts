import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../analysisApi', () => ({
    analyzeText: vi.fn(),
}));

import { createDataSlice } from './dataSlice';
import type { Project, TimelineLane, TimelineEvent, PlotItem } from '../types';

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

const lane = (id: string, name = 'L'): TimelineLane => ({ id, name, color: '#000000' });
const event = (id: string, laneId: string): TimelineEvent => ({
    id, laneId, title: `event-${id}`, timestamp: '', description: '', lastModified: 0,
});
const plot = (id: string, linkedEventId?: string): PlotItem => ({
    id, title: `plot-${id}`, summary: '', plotType: 'main',
    linkedEventId, lastModified: 0,
} as any);

describe('deleteTimelineLane (action) — Issue #181 Phase 2 single-save', () => {
    beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-06-19T00:00:00Z')); });
    afterEach(() => { vi.useRealTimers(); });

    it('AC-2a: 該当 lane を timelineLanes から filter する', () => {
        const project: Project = {
            ...baseProject(),
            timelineLanes: [lane('keep-1'), lane('remove'), lane('keep-2')],
        };
        const { fake } = mountSlice(project);

        fake.state.deleteTimelineLane('remove');

        const updated = fake.state.allProjectsData['p-1'];
        expect(updated.timelineLanes.map((l: TimelineLane) => l.id)).toEqual(['keep-1', 'keep-2']);
    });

    it('AC-2b: 該当 lane に紐づく events を timeline から cascade 削除する', () => {
        const project: Project = {
            ...baseProject(),
            timelineLanes: [lane('remove'), lane('keep')],
            timeline: [event('e1', 'remove'), event('e2', 'keep'), event('e3', 'remove')],
        };
        const { fake } = mountSlice(project);

        fake.state.deleteTimelineLane('remove');

        const updated = fake.state.allProjectsData['p-1'];
        expect(updated.timeline.map((e: TimelineEvent) => e.id)).toEqual(['e2']);
    });

    it('AC-2c (Codex must-fix): cascade 削除された event を指す plotBoard.linkedEventId を undefined に解除する', () => {
        // Codex セカンドオピニオン指摘:
        // lane 削除 → 配下 event filter → 削除済 event を指す plot.linkedEventId が orphan に残る。
        // 既存 handleSaveTimeline (フッター保存) との link cleanup 責務の非対称を回避する。
        const project: Project = {
            ...baseProject(),
            timelineLanes: [lane('remove')],
            timeline: [event('e1', 'remove'), event('e2', 'remove')],
            plotBoard: [
                plot('p1', 'e1'),
                plot('p2', 'e2'),
                plot('p3', 'unrelated'),  // 削除対象外
                plot('p4'),                // link なし
            ],
        };
        const { fake } = mountSlice(project);

        fake.state.deleteTimelineLane('remove');

        const updated = fake.state.allProjectsData['p-1'];
        const plotById = new Map<string, PlotItem>(
            updated.plotBoard.map((p: PlotItem) => [p.id, p])
        );
        expect(plotById.get('p1')!.linkedEventId).toBeUndefined();
        expect(plotById.get('p2')!.linkedEventId).toBeUndefined();
        expect(plotById.get('p3')!.linkedEventId).toBe('unrelated');  // 無関係 link は維持
        expect(plotById.get('p4')!.linkedEventId).toBeUndefined();    // 元々 null
    });

    it('AC-2c: cascade 削除された plot 側の lastModified は更新される (link 解除も変更扱い)', () => {
        const project: Project = {
            ...baseProject(),
            timelineLanes: [lane('remove')],
            timeline: [event('e1', 'remove')],
            plotBoard: [plot('p1', 'e1')],
        };
        (project.plotBoard[0] as any).lastModified = 100;
        const { fake } = mountSlice(project);

        fake.state.deleteTimelineLane('remove');

        const updated = fake.state.allProjectsData['p-1'];
        expect((updated.plotBoard[0] as PlotItem).lastModified).toBeGreaterThan(100);
    });

    it('該当 lane が存在しない場合は no-op (例外を投げない、timelineLanes / timeline / plotBoard 不変)', () => {
        const project: Project = {
            ...baseProject(),
            timelineLanes: [lane('keep')],
            timeline: [event('e1', 'keep')],
            plotBoard: [plot('p1', 'e1')],
        };
        const { fake, markDirty } = mountSlice(project);
        const beforeTimelineLanes = project.timelineLanes;
        const beforeTimeline = project.timeline;
        const beforePlotBoard = project.plotBoard;

        expect(() => fake.state.deleteTimelineLane('non-existent')).not.toThrow();

        const updated = fake.state.allProjectsData['p-1'];
        expect(updated.timelineLanes).toEqual(beforeTimelineLanes);
        expect(updated.timeline).toEqual(beforeTimeline);
        expect(updated.plotBoard).toEqual(beforePlotBoard);
        expect(markDirty).not.toHaveBeenCalled();
    });

    it('cascade events ゼロでも lane 単独削除は成功 (event 連鎖なし lane の削除)', () => {
        const project: Project = {
            ...baseProject(),
            timelineLanes: [lane('lonely')],
            timeline: [],
            plotBoard: [],
        };
        const { fake, markDirty } = mountSlice(project);

        fake.state.deleteTimelineLane('lonely');

        const updated = fake.state.allProjectsData['p-1'];
        expect(updated.timelineLanes).toEqual([]);
        expect(markDirty).toHaveBeenCalledTimes(1);
    });

    it('lastModified が更新される (markDirty 経由で自動保存トリガー)', () => {
        const project: Project = {
            ...baseProject(),
            timelineLanes: [lane('x')],
        };
        const { fake } = mountSlice(project);
        const before = fake.state.allProjectsData['p-1'].lastModified;

        fake.state.deleteTimelineLane('x');

        const updated = fake.state.allProjectsData['p-1'];
        expect(updated.lastModified).not.toBe(before);
    });

    it('成功時に markDirty が 1 回呼ばれる (auto-save signal positive pin)', () => {
        const project: Project = {
            ...baseProject(),
            timelineLanes: [lane('x')],
        };
        const { fake, markDirty } = mountSlice(project);

        fake.state.deleteTimelineLane('x');

        expect(markDirty).toHaveBeenCalledTimes(1);
    });

    it('history を積まない (addHistory が呼ばれない、PR-A1/A2 規約に準拠)', () => {
        const project: Project = {
            ...baseProject(),
            timelineLanes: [lane('x')],
        };
        const { fake, addHistory } = mountSlice(project);

        fake.state.deleteTimelineLane('x');

        expect(addHistory).not.toHaveBeenCalled();
    });

    it('activeProjectId が null の場合は no-op (例外を投げない)', () => {
        const project: Project = { ...baseProject(), timelineLanes: [lane('x')] };
        const { fake } = mountSlice(project);
        fake.state.activeProjectId = null;

        expect(() => fake.state.deleteTimelineLane('x')).not.toThrow();
        expect(fake.state.allProjectsData['p-1'].timelineLanes).toHaveLength(1);
    });

    it('activeProjectId に対応する project が存在しない場合は no-op (例外を投げない)', () => {
        const project: Project = { ...baseProject() };
        const { fake } = mountSlice(project);
        fake.state.activeProjectId = 'non-existent';

        expect(() => fake.state.deleteTimelineLane('x')).not.toThrow();
    });
});
