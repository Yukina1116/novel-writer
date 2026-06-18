import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../analysisApi', () => ({
    analyzeText: vi.fn(),
}));

import { createDataSlice } from './dataSlice';
import type { Project, PlotRelation } from '../types';

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

const rel = (id: string, label = 'rel'): PlotRelation => ({
    id, source: 'a', target: 'b', label,
});

describe('upsertPlotRelation (action) — Issue #181 Phase 3 / #180 統合', () => {
    beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-06-19T12:00:00Z')); });
    afterEach(() => { vi.useRealTimers(); });

    it('AC-2a: 新規 id の relation は末尾に追加', () => {
        const project: Project = { ...baseProject(), plotRelations: [rel('r1')] };
        const { fake } = mountSlice(project);

        fake.state.upsertPlotRelation(rel('r2', 'new'));

        const updated = fake.state.allProjectsData['p-1'];
        expect(updated.plotRelations).toEqual([rel('r1'), rel('r2', 'new')]);
    });

    it('AC-2b: 既存 id の relation は上書き (該当 entry のみ)', () => {
        const project: Project = {
            ...baseProject(),
            plotRelations: [rel('r1'), rel('r2'), rel('r3')],
        };
        const { fake } = mountSlice(project);

        fake.state.upsertPlotRelation({ id: 'r2', source: 'X', target: 'Y', label: 'updated', color: '#fff' });

        const updated = fake.state.allProjectsData['p-1'];
        expect(updated.plotRelations).toEqual([
            rel('r1'),
            { id: 'r2', source: 'X', target: 'Y', label: 'updated', color: '#fff' },
            rel('r3'),
        ]);
    });

    it('AC-2c: plotRelations が undefined でも安全 (空配列起点)', () => {
        const project: Project = { ...baseProject(), plotRelations: undefined as any };
        const { fake } = mountSlice(project);

        expect(() => fake.state.upsertPlotRelation(rel('r1'))).not.toThrow();
        const updated = fake.state.allProjectsData['p-1'];
        expect(updated.plotRelations).toEqual([rel('r1')]);
    });

    it('AC-2d: lastModified が更新される', () => {
        const project: Project = { ...baseProject() };
        const { fake } = mountSlice(project);
        const before = fake.state.allProjectsData['p-1'].lastModified;

        fake.state.upsertPlotRelation(rel('r1'));

        expect(fake.state.allProjectsData['p-1'].lastModified).not.toBe(before);
    });

    it('AC-2e: markDirty が 1 回呼ばれる (auto-save signal pin)', () => {
        const project: Project = { ...baseProject() };
        const { fake, markDirty, addHistory } = mountSlice(project);

        fake.state.upsertPlotRelation(rel('r1'));

        expect(markDirty).toHaveBeenCalledTimes(1);
        expect(addHistory).not.toHaveBeenCalled();
    });

    it('AC-2f (CLAUDE.md partial-update 規律): 更新対象外フィールド (plotBoard / plotNodePositions / timeline / settings) が変化しないこと', () => {
        const project: Project = {
            ...baseProject(),
            plotBoard: [{ id: 'p1', title: 'P', summary: '', type: '章のまとめ', lastModified: 100 }],
            plotNodePositions: [{ plotId: 'p1', x: 10, y: 20 }],
            timeline: [{ id: 'e1', title: 'E', laneId: 'L', timestamp: '', description: '', lastModified: 100 }],
            settings: [{ id: 's1', type: 'character', name: 'X' } as any],
        };
        const snapshot = JSON.stringify({ plotBoard: project.plotBoard, plotNodePositions: project.plotNodePositions, timeline: project.timeline, settings: project.settings });
        const { fake } = mountSlice(project);

        fake.state.upsertPlotRelation(rel('new'));

        const updated = fake.state.allProjectsData['p-1'];
        const after = JSON.stringify({ plotBoard: updated.plotBoard, plotNodePositions: updated.plotNodePositions, timeline: updated.timeline, settings: updated.settings });
        expect(after).toBe(snapshot);
    });
});
