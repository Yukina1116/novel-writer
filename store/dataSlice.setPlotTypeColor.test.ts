import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../analysisApi', () => ({
    analyzeText: vi.fn(),
}));

import { createDataSlice } from './dataSlice';
import type { Project } from '../types';

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
    const addHistory = vi.fn();
    const markDirty = vi.fn();
    fake.state = {
        ...slice,
        activeProjectId: 'p-1',
        allProjectsData: { 'p-1': project },
        openModal: vi.fn(),
        showToast: vi.fn(),
        addHistory,
        markDirty,
        closeModal: vi.fn(),
    };
    return { slice, fake, addHistory, markDirty };
};

describe('setPlotTypeColor (action) — Issue #181 Phase 3 / #180 統合', () => {
    beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-06-19T12:00:00Z')); });
    afterEach(() => { vi.useRealTimers(); });

    it('AC-4a: 新規 type を追加 (既存 type は不変)', () => {
        const project: Project = {
            ...baseProject(),
            plotTypeColors: { '章のまとめ': '#111' },
        };
        const { fake } = mountSlice(project);

        fake.state.setPlotTypeColor('伏線', '#222');

        const updated = fake.state.allProjectsData['p-1'];
        expect(updated.plotTypeColors).toEqual({ '章のまとめ': '#111', '伏線': '#222' });
    });

    it('AC-4b: 既存 type の color を上書き (他 type は不変)', () => {
        const project: Project = {
            ...baseProject(),
            plotTypeColors: { 'A': '#aaa', 'B': '#bbb', 'C': '#ccc' },
        };
        const { fake } = mountSlice(project);

        fake.state.setPlotTypeColor('B', '#222');

        const updated = fake.state.allProjectsData['p-1'];
        expect(updated.plotTypeColors).toEqual({ 'A': '#aaa', 'B': '#222', 'C': '#ccc' });
    });

    it('AC-4c: plotTypeColors が undefined でも安全 (空 object 起点)', () => {
        const project: Project = { ...baseProject(), plotTypeColors: undefined as any };
        const { fake } = mountSlice(project);

        expect(() => fake.state.setPlotTypeColor('X', '#fff')).not.toThrow();
        const updated = fake.state.allProjectsData['p-1'];
        expect(updated.plotTypeColors).toEqual({ 'X': '#fff' });
    });

    it('AC-4d: lastModified が更新される', () => {
        const project: Project = { ...baseProject() };
        const { fake } = mountSlice(project);
        const before = fake.state.allProjectsData['p-1'].lastModified;

        fake.state.setPlotTypeColor('A', '#000');

        expect(fake.state.allProjectsData['p-1'].lastModified).not.toBe(before);
    });

    it('AC-4e: markDirty が 1 回呼ばれる (auto-save signal pin)', () => {
        const project: Project = { ...baseProject() };
        const { fake, markDirty, addHistory } = mountSlice(project);

        fake.state.setPlotTypeColor('A', '#000');

        expect(markDirty).toHaveBeenCalledTimes(1);
        expect(addHistory).not.toHaveBeenCalled();
    });

    it('AC-4f (CLAUDE.md partial-update 規律): 更新対象外フィールド (plotBoard / plotRelations / plotNodePositions / timeline / settings) が変化しないこと', () => {
        const project: Project = {
            ...baseProject(),
            plotBoard: [{ id: 'p1', title: 'P', summary: '', type: '章のまとめ', lastModified: 100 }],
            plotRelations: [{ id: 'r1', source: 'p1', target: 'p2', label: '' }],
            plotNodePositions: [{ plotId: 'p1', x: 10, y: 20 }],
            timeline: [{ id: 'e1', title: 'E', laneId: 'L', timestamp: '', description: '', lastModified: 100 }],
            settings: [{ id: 's1', type: 'character', name: 'X' } as any],
            plotTypeColors: { '章のまとめ': '#111' },
        };
        const snapshot = JSON.stringify({ plotBoard: project.plotBoard, plotRelations: project.plotRelations, plotNodePositions: project.plotNodePositions, timeline: project.timeline, settings: project.settings });
        const { fake } = mountSlice(project);

        fake.state.setPlotTypeColor('伏線', '#222');

        const updated = fake.state.allProjectsData['p-1'];
        const after = JSON.stringify({ plotBoard: updated.plotBoard, plotRelations: updated.plotRelations, plotNodePositions: updated.plotNodePositions, timeline: updated.timeline, settings: updated.settings });
        expect(after).toBe(snapshot);
    });
});
