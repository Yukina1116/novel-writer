import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../analysisApi', () => ({
    analyzeText: vi.fn(),
}));

import { createDataSlice } from './dataSlice';
import type { Project, TimelineLane } from '../types';

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

describe('upsertTimelineLane (action) — Issue #181 Phase 2 single-save', () => {
    beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-06-19T00:00:00Z')); });
    afterEach(() => { vi.useRealTimers(); });

    it('AC-1a: 既存に同 ID が無ければ末尾に追加 (push)', () => {
        const existing: TimelineLane = { id: 'lane-1', name: '既存', color: '#111111' };
        const project: Project = { ...baseProject(), timelineLanes: [existing] };
        const { fake } = mountSlice(project);

        const incoming: TimelineLane = { id: 'lane-2', name: '新規', color: '#222222' };
        fake.state.upsertTimelineLane(incoming);

        const updated = fake.state.allProjectsData['p-1'];
        expect(updated.timelineLanes).toEqual([existing, incoming]);
    });

    it('AC-1b: 既存に同 ID があれば in-place 更新 (map、順序維持)', () => {
        const laneA: TimelineLane = { id: 'a', name: 'A', color: '#aaaaaa' };
        const laneB: TimelineLane = { id: 'b', name: 'B', color: '#bbbbbb' };
        const project: Project = { ...baseProject(), timelineLanes: [laneA, laneB] };
        const { fake } = mountSlice(project);

        const patched: TimelineLane = { id: 'a', name: 'A-renamed', color: '#cccccc' };
        fake.state.upsertTimelineLane(patched);

        const updated = fake.state.allProjectsData['p-1'];
        expect(updated.timelineLanes).toHaveLength(2);
        expect(updated.timelineLanes[0]).toEqual(patched);
        expect(updated.timelineLanes[1]).toEqual(laneB);
    });

    it('lastModified が更新される (markDirty 経由で自動保存トリガー)', () => {
        const project: Project = { ...baseProject() };
        const { fake } = mountSlice(project);
        const before = fake.state.allProjectsData['p-1'].lastModified;

        fake.state.upsertTimelineLane({ id: 'new', name: 'N', color: '#000000' });

        const updated = fake.state.allProjectsData['p-1'];
        expect(updated.lastModified).not.toBe(before);
    });

    it('成功時に markDirty が 1 回呼ばれる (auto-save signal positive pin)', () => {
        const project: Project = { ...baseProject() };
        const { fake, markDirty } = mountSlice(project);

        fake.state.upsertTimelineLane({ id: 'new', name: 'N', color: '#000000' });

        expect(markDirty).toHaveBeenCalledTimes(1);
    });

    it('history を積まない (addHistory が呼ばれない、PR-A1/A2 規約に準拠)', () => {
        const project: Project = { ...baseProject() };
        const { fake, addHistory } = mountSlice(project);

        fake.state.upsertTimelineLane({ id: 'new', name: 'N', color: '#000000' });

        expect(addHistory).not.toHaveBeenCalled();
    });

    it('既存 timeline / plotBoard / 他フィールドを破壊しない', () => {
        const project: Project = {
            ...baseProject(),
            timeline: [{ id: 'e1', title: 'E', timestamp: '', description: '', laneId: 'lane-1', lastModified: 0 }],
            plotBoard: [{ id: 'p1', title: 'P', summary: '', plotType: 'main', linkedEventId: 'e1', lastModified: 0 } as any],
        };
        const { fake } = mountSlice(project);
        const beforeTimeline = project.timeline;
        const beforePlotBoard = project.plotBoard;

        fake.state.upsertTimelineLane({ id: 'lane-1', name: 'L', color: '#000000' });

        const updated = fake.state.allProjectsData['p-1'];
        expect(updated.timeline).toEqual(beforeTimeline);
        expect(updated.plotBoard).toEqual(beforePlotBoard);
    });

    it('activeProjectId が null の場合は no-op (例外を投げない)', () => {
        const project: Project = { ...baseProject() };
        const { fake } = mountSlice(project);
        fake.state.activeProjectId = null;

        expect(() => fake.state.upsertTimelineLane({ id: 'x', name: 'X', color: '#000' })).not.toThrow();
        expect(fake.state.allProjectsData['p-1'].timelineLanes).toEqual([]);
    });

    it('activeProjectId に対応する project が存在しない場合は no-op (例外を投げない)', () => {
        const project: Project = { ...baseProject() };
        const { fake } = mountSlice(project);
        fake.state.activeProjectId = 'non-existent';

        expect(() => fake.state.upsertTimelineLane({ id: 'x', name: 'X', color: '#000' })).not.toThrow();
    });
});
