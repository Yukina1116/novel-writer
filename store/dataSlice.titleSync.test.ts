import { describe, it, expect, vi } from 'vitest';

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

interface FakeStore {
    state: Record<string, any>;
    set: (partial: any) => void;
    get: () => Record<string, any>;
}

const createFakeStore = (initial: Record<string, any>): FakeStore => {
    const fake: FakeStore = { state: { ...initial }, set: () => ({}), get: () => fake.state };
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
    let capturedUpdater: ((d: Project) => Project) | null = null;
    fake.state = {
        ...slice,
        activeProjectId: 'p-1',
        allProjectsData: { 'p-1': project },
        openModal,
        showToast,
        addHistory: vi.fn(),
        markDirty: vi.fn(),
        closeModal: vi.fn(),
        setActiveProjectData: (updater: (d: Project) => Project) => {
            capturedUpdater = updater;
        },
    };
    return { slice, openModal, showToast, project, getUpdated: () => capturedUpdater!(project) };
};

describe('handleSaveTimeline — タイトル自動同期 (タイムライン → プロット)', () => {
    const makeProject = (overrides?: { plotSummary?: string; plotLastModified?: number; eventLastModified?: number }): Project => ({
        ...baseProject(),
        plotBoard: [{
            id: 'plot-1',
            title: '旧タイトル',
            summary: overrides?.plotSummary ?? 'プロットの要約',
            type: 'main',
            linkedEventId: 'event-1',
            lastModified: overrides?.plotLastModified ?? 100,
        }],
        timeline: [{
            id: 'event-1',
            title: '旧タイトル',
            timestamp: '2026-01-01',
            description: 'プロットの要約',
            laneId: 'lane-1',
            linkedPlotId: 'plot-1',
            lastModified: overrides?.eventLastModified ?? 100,
        }],
        timelineLanes: [{ id: 'lane-1', name: 'L', color: '#fff' }],
    });

    it('タイムライン側のタイトル変更で、リンク済みプロットのタイトルが同期され、SyncDialog は開かない', () => {
        const project = makeProject();
        const { slice, openModal, showToast, getUpdated } = mountSlice(project);

        const newTimeline: TimelineEvent[] = [{
            ...project.timeline[0],
            title: '新タイトル',
            lastModified: 200,
        }];

        slice.handleSaveTimeline(newTimeline, project.timelineLanes);

        const updated = getUpdated();
        const syncedPlot = updated.plotBoard.find(p => p.id === 'plot-1')!;
        expect(syncedPlot.title).toBe('新タイトル');
        expect(syncedPlot.lastModified).toBe(200);
        expect(syncedPlot.summary).toBe('プロットの要約');

        expect(openModal).not.toHaveBeenCalled();
        expect(showToast).toHaveBeenCalledWith(expect.stringContaining('1件'), 'success');
    });

    it('タイトル一致 + description (= プロットの summary) 違いのみの場合は SyncDialog が開く', () => {
        const project = makeProject({ plotSummary: '旧要約' });
        const { slice, openModal, showToast } = mountSlice(project);

        const newTimeline: TimelineEvent[] = [{
            ...project.timeline[0],
            description: '新しい記述',
            lastModified: 200,
        }];

        slice.handleSaveTimeline(newTimeline, project.timelineLanes);

        expect(openModal).toHaveBeenCalledWith('syncDialog', { plotId: 'plot-1', eventId: 'event-1' });
        expect(showToast).not.toHaveBeenCalled();
    });

    it('差分なしの場合は openModal も showToast も呼ばれない', () => {
        const project = makeProject();
        const { slice, openModal, showToast } = mountSlice(project);

        slice.handleSaveTimeline(project.timeline, project.timelineLanes);

        expect(openModal).not.toHaveBeenCalled();
        expect(showToast).not.toHaveBeenCalled();
    });

    it('lastModified が同一の場合は自動同期されない', () => {
        const project = makeProject({ plotLastModified: 200, eventLastModified: 200 });
        const { slice, openModal, showToast } = mountSlice(project);

        const newTimeline: TimelineEvent[] = [{
            ...project.timeline[0],
            title: '新タイトル',
            lastModified: 200,
        }];

        slice.handleSaveTimeline(newTimeline, project.timelineLanes);

        expect(openModal).not.toHaveBeenCalled();
        expect(showToast).not.toHaveBeenCalled();
    });

    it('linkedPlotId なしのイベントでは同期されない', () => {
        const project = makeProject();
        const { slice, openModal, showToast } = mountSlice(project);
        const newTimeline: TimelineEvent[] = [{
            ...project.timeline[0],
            linkedPlotId: undefined,
            title: '新タイトル',
            lastModified: 200,
        }];

        slice.handleSaveTimeline(newTimeline, project.timelineLanes);

        expect(openModal).not.toHaveBeenCalled();
        expect(showToast).not.toHaveBeenCalled();
    });

    it('リンク切れ (linkedPlotId が指す plot が存在しない) の場合は同期されない', () => {
        const project = { ...makeProject(), plotBoard: [] as PlotItem[] };
        const { slice, openModal, showToast } = mountSlice(project);

        const newTimeline: TimelineEvent[] = [{
            ...project.timeline[0],
            title: '新タイトル',
            lastModified: 200,
        }];

        slice.handleSaveTimeline(newTimeline, project.timelineLanes);

        expect(openModal).not.toHaveBeenCalled();
        expect(showToast).not.toHaveBeenCalled();
    });
});

describe('handleSavePlotBoard — タイトル自動同期 (プロット → タイムライン)', () => {
    const makeProject = (overrides?: { eventDescription?: string; plotLastModified?: number; eventLastModified?: number }): Project => ({
        ...baseProject(),
        plotBoard: [{
            id: 'plot-1',
            title: '旧タイトル',
            summary: 'プロットの要約',
            type: 'main',
            linkedEventId: 'event-1',
            lastModified: overrides?.plotLastModified ?? 100,
        }],
        timeline: [{
            id: 'event-1',
            title: '旧タイトル',
            timestamp: '2026-01-01',
            description: overrides?.eventDescription ?? 'プロットの要約',
            laneId: 'lane-1',
            linkedPlotId: 'plot-1',
            lastModified: overrides?.eventLastModified ?? 100,
        }],
        timelineLanes: [{ id: 'lane-1', name: 'L', color: '#fff' }],
    });

    it('プロット側のタイトル変更で、リンク済みイベントのタイトルが同期される + showToast', () => {
        const project = makeProject();
        const { slice, openModal, showToast, getUpdated } = mountSlice(project);

        const newPlots: PlotItem[] = [{
            ...project.plotBoard[0],
            title: '新タイトル',
            lastModified: 200,
        }];

        slice.handleSavePlotBoard({
            items: newPlots,
            relations: project.plotRelations,
            positions: project.plotNodePositions,
            colors: project.plotTypeColors,
        });

        const updated = getUpdated();
        const syncedEvent = updated.timeline.find(e => e.id === 'event-1')!;
        expect(syncedEvent.title).toBe('新タイトル');
        expect(syncedEvent.lastModified).toBe(200);
        expect(syncedEvent.description).toBe('プロットの要約');

        expect(openModal).not.toHaveBeenCalled();
        expect(showToast).toHaveBeenCalledWith(expect.stringContaining('1件'), 'success');
    });

    it('タイトル一致 + summary (= イベントの description) 違いのみの場合は SyncDialog が開く', () => {
        const project = makeProject({ eventDescription: '旧記述' });
        const { slice, openModal, showToast } = mountSlice(project);

        const newPlots: PlotItem[] = [{
            ...project.plotBoard[0],
            summary: '新しい要約',
            lastModified: 200,
        }];

        slice.handleSavePlotBoard({
            items: newPlots,
            relations: project.plotRelations,
            positions: project.plotNodePositions,
            colors: project.plotTypeColors,
        });

        expect(openModal).toHaveBeenCalledWith('syncDialog', { plotId: 'plot-1', eventId: 'event-1' });
        expect(showToast).not.toHaveBeenCalled();
    });

    it('lastModified が同一の場合は自動同期されない', () => {
        const project = makeProject({ plotLastModified: 200, eventLastModified: 200 });
        const { slice, openModal, showToast } = mountSlice(project);

        const newPlots: PlotItem[] = [{
            ...project.plotBoard[0],
            title: '新タイトル',
            lastModified: 200,
        }];

        slice.handleSavePlotBoard({
            items: newPlots,
            relations: project.plotRelations,
            positions: project.plotNodePositions,
            colors: project.plotTypeColors,
        });

        expect(openModal).not.toHaveBeenCalled();
        expect(showToast).not.toHaveBeenCalled();
    });
});
