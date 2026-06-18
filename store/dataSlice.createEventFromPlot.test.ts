import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../analysisApi', () => ({
    analyzeText: vi.fn(),
}));

import { createDataSlice } from './dataSlice';
import type { Project, TimelineLane, TimelineEvent, PlotItem } from '../types';

const plotFixture = (overrides: Partial<PlotItem> = {}): PlotItem => ({
    id: 'plot-1',
    title: 'プロットタイトル',
    summary: '要約',
    type: '章のまとめ',
    lastModified: 100,
    ...overrides,
});

const eventFixture = (overrides: Partial<TimelineEvent> = {}): TimelineEvent => ({
    id: 'event-1',
    title: 'event',
    timestamp: '2026-01-01',
    description: '',
    laneId: 'lane-x',
    lastModified: 100,
    ...overrides,
});

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

describe('createEventFromPlot (action) — Issue #182 既存バグ修正', () => {
    beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-06-19T00:00:00Z')); });
    afterEach(() => { vi.useRealTimers(); });

    it('AC-1: timelineLanes 空時、生成 event の laneId が ensureDefaultLane が作成した lane の id と一致する (孤児化しない)', () => {
        const plot = plotFixture();
        const project: Project = { ...baseProject(), plotBoard: [plot] };
        const { fake } = mountSlice(project);

        fake.state.createEventFromPlot('plot-1');

        const updated = fake.state.allProjectsData['p-1'];
        expect(updated.timelineLanes).toHaveLength(1);
        expect(updated.timeline).toHaveLength(1);
        expect(updated.timeline[0].laneId).toBe(updated.timelineLanes[0].id);
        expect(updated.timeline[0].laneId).not.toBe('default');
    });

    it('AC-2: 既存 lane が 1 つある場合、その lane id を使う (既存挙動維持)', () => {
        const lane: TimelineLane = { id: 'existing-lane', name: 'メイン', color: '#aaaaaa' };
        const plot = plotFixture();
        const project: Project = { ...baseProject(), plotBoard: [plot], timelineLanes: [lane] };
        const { fake } = mountSlice(project);

        fake.state.createEventFromPlot('plot-1');

        const updated = fake.state.allProjectsData['p-1'];
        expect(updated.timelineLanes).toEqual([lane]);
        expect(updated.timeline[0].laneId).toBe('existing-lane');
    });

    it('AC-3: 既存 lane が複数ある場合、[0] の id を使う (既存挙動維持)', () => {
        const laneA: TimelineLane = { id: 'lane-A', name: 'A', color: '#111' };
        const laneB: TimelineLane = { id: 'lane-B', name: 'B', color: '#222' };
        const plot = plotFixture();
        const project: Project = { ...baseProject(), plotBoard: [plot], timelineLanes: [laneA, laneB] };
        const { fake } = mountSlice(project);

        fake.state.createEventFromPlot('plot-1');

        const updated = fake.state.allProjectsData['p-1'];
        expect(updated.timelineLanes).toEqual([laneA, laneB]);
        expect(updated.timeline[0].laneId).toBe('lane-A');
    });

    it('AC-4: plot.linkedEventId が既存の場合は no-op + toast info (既存挙動維持)', () => {
        const plot = plotFixture({ linkedEventId: 'event-existing' });
        const project: Project = { ...baseProject(), plotBoard: [plot] };
        const { fake, showToast } = mountSlice(project);

        fake.state.createEventFromPlot('plot-1');

        const updated = fake.state.allProjectsData['p-1'];
        expect(updated.timeline).toEqual([]);
        expect(updated.timelineLanes).toEqual([]);
        expect(showToast).toHaveBeenCalledWith('このプロットはすでにリンクされています', 'info');
    });

    it('AC-5: plotId が存在しない場合は no-op (timelineLanes も増えない)', () => {
        const plot = plotFixture();
        const project: Project = { ...baseProject(), plotBoard: [plot] };
        const { fake, showToast } = mountSlice(project);

        fake.state.createEventFromPlot('non-existent');

        const updated = fake.state.allProjectsData['p-1'];
        expect(updated.timeline).toEqual([]);
        expect(updated.timelineLanes).toEqual([]);
        expect(showToast).not.toHaveBeenCalled();
    });

    it('AC-6: activeProjectId に対応する project が無い場合は no-op (例外を投げない)', () => {
        const plot = plotFixture();
        const project: Project = { ...baseProject(), plotBoard: [plot] };
        const { fake } = mountSlice(project);
        fake.state.activeProjectId = 'non-existent';

        expect(() => fake.state.createEventFromPlot('plot-1')).not.toThrow();
    });

    it('AC-7: timelineLanes 空 + 既存孤児 event がある場合、ensureDefaultLane 経由で孤児 event の laneId を採用 → 新規 event も同じ id で作られ全 event 救済', () => {
        const orphan = eventFixture({ id: 'orphan', laneId: 'pre-existing-uuid' });
        const plot = plotFixture();
        const project: Project = { ...baseProject(), plotBoard: [plot], timeline: [orphan] };
        const { fake } = mountSlice(project);

        fake.state.createEventFromPlot('plot-1');

        const updated = fake.state.allProjectsData['p-1'];
        expect(updated.timelineLanes).toHaveLength(1);
        expect(updated.timelineLanes[0].id).toBe('pre-existing-uuid');
        expect(updated.timeline).toHaveLength(2);
        expect(updated.timeline[0]).toEqual(orphan);
        expect(updated.timeline[1].laneId).toBe('pre-existing-uuid');
    });

    it('AC-8: currentPlotData が渡された場合、その items の plot を使用し、relations/positions/colors も上書きする (既存挙動維持)', () => {
        const persistedPlot = plotFixture({ id: 'plot-1', title: '旧タイトル' });
        const draftPlot = plotFixture({ id: 'plot-1', title: '新タイトル' });
        const project: Project = { ...baseProject(), plotBoard: [persistedPlot] };
        const { fake } = mountSlice(project);

        fake.state.createEventFromPlot('plot-1', {
            items: [draftPlot],
            relations: [{ id: 'r-1', from: 'a', to: 'b', label: '' } as any],
            positions: [{ plotId: 'plot-1', x: 10, y: 20 }],
            colors: { '章のまとめ': '#ff0000' },
        });

        const updated = fake.state.allProjectsData['p-1'];
        expect(updated.timeline[0].title).toBe('新タイトル');
        expect(updated.plotBoard[0].title).toBe('新タイトル');
        expect(updated.plotBoard[0].linkedEventId).toBe(updated.timeline[0].id);
        expect(updated.plotRelations).toHaveLength(1);
        expect(updated.plotNodePositions).toEqual([{ plotId: 'plot-1', x: 10, y: 20 }]);
        expect(updated.plotTypeColors).toEqual({ '章のまとめ': '#ff0000' });
    });

    it('AC-9: 成功時は showToast success + addHistory + markDirty が呼ばれる (auto-save signal pin)', () => {
        const plot = plotFixture();
        const project: Project = { ...baseProject(), plotBoard: [plot] };
        const { fake, showToast, addHistory, markDirty } = mountSlice(project);

        fake.state.createEventFromPlot('plot-1');

        expect(showToast).toHaveBeenCalledWith('タイムラインにイベントを追加しました', 'success');
        expect(addHistory).toHaveBeenCalledTimes(1);
        expect(addHistory.mock.calls[0][1]).toEqual({ type: 'timeline', label: 'プロットからイベント「プロットタイトル」を作成' });
        // ensureDefaultLane の markDirty (1 回) + setActiveProjectData の markDirty (1 回) で計 2 回
        expect(markDirty).toHaveBeenCalledTimes(2);
    });
});
