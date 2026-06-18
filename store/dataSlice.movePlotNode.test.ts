import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../analysisApi', () => ({
    analyzeText: vi.fn(),
}));

import { createDataSlice } from './dataSlice';
import type { Project, PlotNodePosition } from '../types';

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

const pos = (plotId: string, x: number, y: number): PlotNodePosition => ({ plotId, x, y });

describe('movePlotNode (action) — Issue #181 Phase 3 / #180 統合', () => {
    beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-06-19T12:00:00Z')); });
    afterEach(() => { vi.useRealTimers(); });

    it('AC-1a: 既存 plotId の position の x/y を更新 (該当 entry のみ)', () => {
        const project: Project = {
            ...baseProject(),
            plotNodePositions: [pos('a', 10, 20), pos('b', 30, 40), pos('c', 50, 60)],
        };
        const { fake } = mountSlice(project);

        fake.state.movePlotNode('b', 100, 200);

        const updated = fake.state.allProjectsData['p-1'];
        expect(updated.plotNodePositions).toEqual([
            pos('a', 10, 20),
            pos('b', 100, 200),
            pos('c', 50, 60),
        ]);
    });

    it('AC-1b: 新規 plotId の position は末尾に追加', () => {
        const project: Project = {
            ...baseProject(),
            plotNodePositions: [pos('a', 10, 20)],
        };
        const { fake } = mountSlice(project);

        fake.state.movePlotNode('new-id', 300, 400);

        const updated = fake.state.allProjectsData['p-1'];
        expect(updated.plotNodePositions).toEqual([
            pos('a', 10, 20),
            pos('new-id', 300, 400),
        ]);
    });

    it('AC-1c: plotNodePositions が undefined でも安全に動作 (空配列起点)', () => {
        const project: Project = {
            ...baseProject(),
            plotNodePositions: undefined as any,
        };
        const { fake } = mountSlice(project);

        expect(() => fake.state.movePlotNode('x', 1, 2)).not.toThrow();
        const updated = fake.state.allProjectsData['p-1'];
        expect(updated.plotNodePositions).toEqual([pos('x', 1, 2)]);
    });

    it('AC-1d: lastModified が更新される', () => {
        const project: Project = { ...baseProject(), plotNodePositions: [pos('a', 0, 0)] };
        const { fake } = mountSlice(project);
        const before = fake.state.allProjectsData['p-1'].lastModified;

        fake.state.movePlotNode('a', 5, 5);

        const updated = fake.state.allProjectsData['p-1'];
        expect(updated.lastModified).not.toBe(before);
    });

    it('AC-1e: markDirty が 1 回呼ばれる (auto-save signal pin)', () => {
        const project: Project = { ...baseProject(), plotNodePositions: [pos('a', 0, 0)] };
        const { fake, markDirty, addHistory } = mountSlice(project);

        fake.state.movePlotNode('a', 5, 5);

        expect(markDirty).toHaveBeenCalledTimes(1);
        // history は積まない (drag は単独操作単位ではない)
        expect(addHistory).not.toHaveBeenCalled();
    });

    it('AC-1f (CLAUDE.md partial-update 規律): 更新対象外フィールド (plotBoard / plotRelations / timeline / settings) が変化しないこと', () => {
        const project: Project = {
            ...baseProject(),
            plotBoard: [{ id: 'p1', title: 'P', summary: '', type: '章のまとめ', lastModified: 100 }],
            plotRelations: [{ id: 'r1', source: 'p1', target: 'p2', label: '' }],
            plotNodePositions: [pos('a', 0, 0)],
            timeline: [{ id: 'e1', title: 'E', laneId: 'L', timestamp: '', description: '', lastModified: 100 }],
            settings: [{ id: 's1', type: 'character', name: 'X' } as any],
        };
        const snapshot = JSON.stringify({ plotBoard: project.plotBoard, plotRelations: project.plotRelations, timeline: project.timeline, settings: project.settings });
        const { fake } = mountSlice(project);

        fake.state.movePlotNode('a', 100, 200);

        const updated = fake.state.allProjectsData['p-1'];
        const after = JSON.stringify({ plotBoard: updated.plotBoard, plotRelations: updated.plotRelations, timeline: updated.timeline, settings: updated.settings });
        expect(after).toBe(snapshot);
    });
});
