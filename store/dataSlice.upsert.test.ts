import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../analysisApi', () => ({
    analyzeText: vi.fn(),
}));

import { computePlotTitleSync, computeEventTitleSync, createDataSlice } from './dataSlice';
import type { Project, PlotItem, TimelineEvent } from '../types';

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

const plotFixture = (overrides: Partial<PlotItem> = {}): PlotItem => ({
    id: 'plot-1',
    title: '旧タイトル',
    summary: 'プロットの要約',
    type: 'main',
    linkedEventId: 'event-1',
    lastModified: 100,
    ...overrides,
});

const eventFixture = (overrides: Partial<TimelineEvent> = {}): TimelineEvent => ({
    id: 'event-1',
    title: '旧タイトル',
    timestamp: '2026-01-01',
    description: 'プロットの要約',
    laneId: 'lane-1',
    linkedPlotId: 'plot-1',
    lastModified: 100,
    ...overrides,
});

// =========================================================================
// 純粋関数: computePlotTitleSync (プロット → タイムライン方向)
// =========================================================================
describe('computePlotTitleSync (純粋関数)', () => {
    it('title 変更時に counterpartPatch を返し syncDialog は null', () => {
        const oldPlot = plotFixture();
        const newPlot = plotFixture({ title: '新タイトル', lastModified: 200 });
        const timelineById = new Map<string, TimelineEvent>([['event-1', eventFixture()]]);
        const result = computePlotTitleSync(oldPlot, newPlot, timelineById);
        expect(result.counterpartPatch).toEqual({ eventId: 'event-1', newTitle: '新タイトル', newLastModified: 200 });
        expect(result.syncDialog).toBeNull();
    });

    it('title 一致 + summary 差分時に syncDialog を返し counterpartPatch は null', () => {
        const oldPlot = plotFixture();
        const newPlot = plotFixture({ summary: '新要約', lastModified: 200 });
        const timelineById = new Map<string, TimelineEvent>([['event-1', eventFixture()]]);
        const result = computePlotTitleSync(oldPlot, newPlot, timelineById);
        expect(result.counterpartPatch).toBeNull();
        expect(result.syncDialog).toEqual({ plotId: 'plot-1', eventId: 'event-1' });
    });

    it('差分なしで両方 null (AC-6: 誤発火しない)', () => {
        const oldPlot = plotFixture();
        const newPlot = plotFixture({ lastModified: 200 });
        const timelineById = new Map<string, TimelineEvent>([['event-1', eventFixture()]]);
        const result = computePlotTitleSync(oldPlot, newPlot, timelineById);
        expect(result.counterpartPatch).toBeNull();
        expect(result.syncDialog).toBeNull();
    });

    it('linkedEventId なしで両方 null', () => {
        const oldPlot = plotFixture({ linkedEventId: undefined });
        const newPlot = plotFixture({ linkedEventId: undefined, title: '新タイトル', lastModified: 200 });
        const result = computePlotTitleSync(oldPlot, newPlot, new Map());
        expect(result.counterpartPatch).toBeNull();
        expect(result.syncDialog).toBeNull();
    });

    it('plot 側 lastModified が古い時は同期されない', () => {
        const oldPlot = plotFixture({ lastModified: 200 });
        const newPlot = plotFixture({ title: '新タイトル', lastModified: 200 });
        const timelineById = new Map<string, TimelineEvent>([['event-1', eventFixture()]]);
        const result = computePlotTitleSync(oldPlot, newPlot, timelineById);
        expect(result.counterpartPatch).toBeNull();
        expect(result.syncDialog).toBeNull();
    });

    it('対向 event が存在しないとき両方 null (孤児リンク)', () => {
        const oldPlot = plotFixture();
        const newPlot = plotFixture({ title: '新タイトル', lastModified: 200 });
        const result = computePlotTitleSync(oldPlot, newPlot, new Map());
        expect(result.counterpartPatch).toBeNull();
        expect(result.syncDialog).toBeNull();
    });

    it('oldPlot 未定義 (新規追加) で両方 null', () => {
        const newPlot = plotFixture({ id: 'plot-new', title: '新規' });
        const result = computePlotTitleSync(undefined, newPlot, new Map());
        expect(result.counterpartPatch).toBeNull();
        expect(result.syncDialog).toBeNull();
    });
});

// =========================================================================
// 純粋関数: computeEventTitleSync (タイムライン → プロット方向、対称)
// =========================================================================
describe('computeEventTitleSync (純粋関数)', () => {
    it('title 変更時に counterpartPatch を返す', () => {
        const oldEvent = eventFixture();
        const newEvent = eventFixture({ title: '新タイトル', lastModified: 200 });
        const plotById = new Map<string, PlotItem>([['plot-1', plotFixture()]]);
        const result = computeEventTitleSync(oldEvent, newEvent, plotById);
        expect(result.counterpartPatch).toEqual({ plotId: 'plot-1', newTitle: '新タイトル', newLastModified: 200 });
        expect(result.syncDialog).toBeNull();
    });

    it('description 差分時に syncDialog を返す', () => {
        const oldEvent = eventFixture();
        const newEvent = eventFixture({ description: '新記述', lastModified: 200 });
        const plotById = new Map<string, PlotItem>([['plot-1', plotFixture()]]);
        const result = computeEventTitleSync(oldEvent, newEvent, plotById);
        expect(result.counterpartPatch).toBeNull();
        expect(result.syncDialog).toEqual({ plotId: 'plot-1', eventId: 'event-1' });
    });

    it('差分なしで両方 null', () => {
        const oldEvent = eventFixture();
        const newEvent = eventFixture({ lastModified: 200 });
        const plotById = new Map<string, PlotItem>([['plot-1', plotFixture()]]);
        const result = computeEventTitleSync(oldEvent, newEvent, plotById);
        expect(result.counterpartPatch).toBeNull();
        expect(result.syncDialog).toBeNull();
    });

    it('linkedPlotId なしで両方 null', () => {
        const oldEvent = eventFixture({ linkedPlotId: undefined });
        const newEvent = eventFixture({ linkedPlotId: undefined, title: '新タイトル', lastModified: 200 });
        const result = computeEventTitleSync(oldEvent, newEvent, new Map());
        expect(result.counterpartPatch).toBeNull();
        expect(result.syncDialog).toBeNull();
    });
});

// =========================================================================
// upsert / delete action の contract test
// =========================================================================
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

describe('upsertPlotItem (action)', () => {
    beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-06-14T00:00:00Z')); });
    afterEach(() => { vi.useRealTimers(); });

    it('title 変更時に Date.now() で lastModified を更新し、リンク済み event の title を同期する + toast', () => {
        const project: Project = { ...baseProject(), plotBoard: [plotFixture()], timeline: [eventFixture()] };
        const { fake, openModal, showToast, addHistory } = mountSlice(project);
        const expectedTimestamp = Date.now();

        fake.state.upsertPlotItem({ ...plotFixture(), title: '新タイトル' });

        const updated = fake.state.allProjectsData['p-1'];
        const plot = updated.plotBoard.find((p: PlotItem) => p.id === 'plot-1')!;
        const event = updated.timeline.find((e: TimelineEvent) => e.id === 'event-1')!;
        expect(plot.title).toBe('新タイトル');
        expect(plot.lastModified).toBe(expectedTimestamp);
        expect(event.title).toBe('新タイトル');
        expect(event.lastModified).toBe(expectedTimestamp);

        expect(showToast).toHaveBeenCalledWith(expect.stringContaining('タイムライン'), 'success');
        expect(openModal).not.toHaveBeenCalled();
        // H4 history 汚染防止: upsertPlotItem は history ノードを積まない
        expect(addHistory).not.toHaveBeenCalled();
    });

    it('title 無変更で lastModified を維持し、同期発火しない (Codex M: 無変更保存で優先権奪わない)', () => {
        const project: Project = { ...baseProject(), plotBoard: [plotFixture()], timeline: [eventFixture()] };
        const { fake, showToast } = mountSlice(project);

        fake.state.upsertPlotItem({ ...plotFixture(), summary: '要約だけ変更' });

        const updated = fake.state.allProjectsData['p-1'];
        const plot = updated.plotBoard.find((p: PlotItem) => p.id === 'plot-1')!;
        expect(plot.lastModified).toBe(100); // 元の値を維持
        expect(showToast).not.toHaveBeenCalled();
    });

    it('新規追加時はデフォルト position {x:120, y:120} が追加される', () => {
        const project: Project = { ...baseProject() };
        const { fake } = mountSlice(project);

        fake.state.upsertPlotItem(plotFixture({ id: 'plot-new', title: '新規', linkedEventId: undefined }));

        const updated = fake.state.allProjectsData['p-1'];
        expect(updated.plotBoard).toHaveLength(1);
        expect(updated.plotNodePositions).toContainEqual({ plotId: 'plot-new', x: 120, y: 120 });
    });

    it('既存更新時は position 配列が変更されない', () => {
        const existingPosition = { plotId: 'plot-1', x: 500, y: 300 };
        const project: Project = {
            ...baseProject(),
            plotBoard: [plotFixture()],
            plotNodePositions: [existingPosition],
        };
        const { fake } = mountSlice(project);

        fake.state.upsertPlotItem({ ...plotFixture(), title: '新タイトル' });

        const updated = fake.state.allProjectsData['p-1'];
        expect(updated.plotNodePositions).toEqual([existingPosition]);
    });
});

describe('deletePlotItem (action)', () => {
    it('plotBoard / plotRelations / plotNodePositions から削除、孤児リンクの event は linkedPlotId が undefined になる', () => {
        const project: Project = {
            ...baseProject(),
            plotBoard: [plotFixture(), plotFixture({ id: 'plot-2', title: '残す', linkedEventId: undefined })],
            plotRelations: [
                { id: 'r-1', source: 'plot-1', target: 'plot-2', label: '' },
                { id: 'r-2', source: 'plot-2', target: 'plot-1', label: '' },
                { id: 'r-3', source: 'plot-2', target: 'plot-2', label: '' },
            ],
            plotNodePositions: [
                { plotId: 'plot-1', x: 100, y: 100 },
                { plotId: 'plot-2', x: 200, y: 200 },
            ],
            timeline: [eventFixture()],
        };
        const { fake, addHistory } = mountSlice(project);

        fake.state.deletePlotItem('plot-1');

        const updated = fake.state.allProjectsData['p-1'];
        expect(updated.plotBoard.map((p: PlotItem) => p.id)).toEqual(['plot-2']);
        expect(updated.plotRelations.map((r: any) => r.id)).toEqual(['r-3']);
        expect(updated.plotNodePositions).toEqual([{ plotId: 'plot-2', x: 200, y: 200 }]);
        expect(updated.timeline[0].linkedPlotId).toBeUndefined();
        // history ノードは積まない
        expect(addHistory).not.toHaveBeenCalled();
    });
});

describe('upsertTimelineEvent (action)', () => {
    beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-06-14T00:00:00Z')); });
    afterEach(() => { vi.useRealTimers(); });

    it('title 変更時に Date.now() で lastModified 更新し、リンク済み plot の title を同期する + toast', () => {
        const project: Project = { ...baseProject(), plotBoard: [plotFixture()], timeline: [eventFixture()] };
        const { fake, openModal, showToast, addHistory } = mountSlice(project);
        const expectedTimestamp = Date.now();

        fake.state.upsertTimelineEvent({ ...eventFixture(), title: '新タイトル' });

        const updated = fake.state.allProjectsData['p-1'];
        const event = updated.timeline.find((e: TimelineEvent) => e.id === 'event-1')!;
        const plot = updated.plotBoard.find((p: PlotItem) => p.id === 'plot-1')!;
        expect(event.title).toBe('新タイトル');
        expect(event.lastModified).toBe(expectedTimestamp);
        expect(plot.title).toBe('新タイトル');
        expect(plot.lastModified).toBe(expectedTimestamp);

        expect(showToast).toHaveBeenCalledWith(expect.stringContaining('プロット'), 'success');
        expect(openModal).not.toHaveBeenCalled();
        expect(addHistory).not.toHaveBeenCalled();
    });
});

describe('deleteTimelineEvent (action)', () => {
    it('timeline から削除し、孤児リンクの plot は linkedEventId が undefined になる', () => {
        const project: Project = {
            ...baseProject(),
            plotBoard: [plotFixture()],
            timeline: [eventFixture(), eventFixture({ id: 'event-2', title: '残す', linkedPlotId: undefined })],
        };
        const { fake, addHistory } = mountSlice(project);

        fake.state.deleteTimelineEvent('event-1');

        const updated = fake.state.allProjectsData['p-1'];
        expect(updated.timeline.map((e: TimelineEvent) => e.id)).toEqual(['event-2']);
        expect(updated.plotBoard[0].linkedEventId).toBeUndefined();
        expect(addHistory).not.toHaveBeenCalled();
    });
});
