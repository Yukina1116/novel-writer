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

const rel = (id: string): PlotRelation => ({ id, source: 'a', target: 'b', label: '' });

describe('deletePlotRelation (action) — Issue #181 Phase 3 / #180 統合', () => {
    beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-06-19T12:00:00Z')); });
    afterEach(() => { vi.useRealTimers(); });

    it('AC-3a: 該当 id の relation を filter する (他 relation 不変)', () => {
        const project: Project = {
            ...baseProject(),
            plotRelations: [rel('r1'), rel('r2'), rel('r3')],
        };
        const { fake } = mountSlice(project);

        fake.state.deletePlotRelation('r2');

        const updated = fake.state.allProjectsData['p-1'];
        expect(updated.plotRelations).toEqual([rel('r1'), rel('r3')]);
    });

    it('AC-3b: 該当 id が存在しない場合は no-op (markDirty 発火しない、lastModified 不変)', () => {
        const project: Project = { ...baseProject(), plotRelations: [rel('r1')] };
        const { fake, markDirty } = mountSlice(project);
        const before = fake.state.allProjectsData['p-1'].lastModified;

        fake.state.deletePlotRelation('non-existent');

        const updated = fake.state.allProjectsData['p-1'];
        expect(updated.plotRelations).toEqual([rel('r1')]);
        expect(updated.lastModified).toBe(before);
        expect(markDirty).not.toHaveBeenCalled();
    });

    it('AC-3c: plotRelations が undefined でも no-op (例外を投げない)', () => {
        const project: Project = { ...baseProject(), plotRelations: undefined as any };
        const { fake, markDirty } = mountSlice(project);

        expect(() => fake.state.deletePlotRelation('r1')).not.toThrow();
        expect(markDirty).not.toHaveBeenCalled();
    });

    it('AC-3d: activeProjectId が null の場合は no-op (例外を投げない)', () => {
        const project: Project = { ...baseProject(), plotRelations: [rel('r1')] };
        const { fake, markDirty } = mountSlice(project);
        fake.state.activeProjectId = null;

        expect(() => fake.state.deletePlotRelation('r1')).not.toThrow();
        expect(markDirty).not.toHaveBeenCalled();
    });

    it('AC-3e: project が存在しない場合は no-op (例外を投げない)', () => {
        const project: Project = { ...baseProject() };
        const { fake, markDirty } = mountSlice(project);
        fake.state.activeProjectId = 'non-existent';

        expect(() => fake.state.deletePlotRelation('r1')).not.toThrow();
        expect(markDirty).not.toHaveBeenCalled();
    });

    it('AC-3f: 削除成功時に markDirty が 1 回呼ばれる + lastModified 更新 (auto-save signal pin)', () => {
        const project: Project = { ...baseProject(), plotRelations: [rel('r1')] };
        const { fake, markDirty, addHistory } = mountSlice(project);
        const before = fake.state.allProjectsData['p-1'].lastModified;

        fake.state.deletePlotRelation('r1');

        expect(markDirty).toHaveBeenCalledTimes(1);
        expect(addHistory).not.toHaveBeenCalled();
        expect(fake.state.allProjectsData['p-1'].lastModified).not.toBe(before);
    });

    it('AC-3g (CLAUDE.md partial-update 規律): 更新対象外フィールド (plotBoard / plotNodePositions / timeline / settings) が変化しないこと', () => {
        const project: Project = {
            ...baseProject(),
            plotBoard: [{ id: 'p1', title: 'P', summary: '', type: '章のまとめ', lastModified: 100 }],
            plotNodePositions: [{ plotId: 'p1', x: 10, y: 20 }],
            plotRelations: [rel('r1'), rel('r2')],
            timeline: [{ id: 'e1', title: 'E', laneId: 'L', timestamp: '', description: '', lastModified: 100 }],
            settings: [{ id: 's1', type: 'character', name: 'X' } as any],
        };
        const snapshot = JSON.stringify({ plotBoard: project.plotBoard, plotNodePositions: project.plotNodePositions, timeline: project.timeline, settings: project.settings });
        const { fake } = mountSlice(project);

        fake.state.deletePlotRelation('r1');

        const updated = fake.state.allProjectsData['p-1'];
        const after = JSON.stringify({ plotBoard: updated.plotBoard, plotNodePositions: updated.plotNodePositions, timeline: updated.timeline, settings: updated.settings });
        expect(after).toBe(snapshot);
    });
});
