import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../analysisApi', () => ({
    analyzeText: vi.fn(),
}));

import { createDataSlice } from './dataSlice';
import type { Project, TimelineLane, TimelineEvent } from '../types';

const eventFixture = (overrides: Partial<TimelineEvent> = {}): TimelineEvent => ({
    id: 'event-1',
    title: 'タイトル',
    timestamp: '2026-01-01',
    description: '',
    laneId: 'orphan-lane',
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

describe('ensureDefaultLane (action) — Issue #181 Phase 1 hotfix', () => {
    beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-06-18T00:00:00Z')); });
    afterEach(() => { vi.useRealTimers(); });

    it('AC-1: timelineLanes 空時に 1 件のデフォルトレーン (メインストーリー / #6b7280) を store に追加する', () => {
        const project: Project = { ...baseProject() };
        const { fake } = mountSlice(project);

        fake.state.ensureDefaultLane();

        const updated = fake.state.allProjectsData['p-1'];
        expect(updated.timelineLanes).toHaveLength(1);
        expect(updated.timelineLanes[0].name).toBe('メインストーリー');
        expect(updated.timelineLanes[0].color).toBe('#6b7280');
        expect(typeof updated.timelineLanes[0].id).toBe('string');
        expect(updated.timelineLanes[0].id.length).toBeGreaterThan(0);
    });

    it('AC-3: timelineLanes に既存 lane がある場合は no-op (既存 lane を破壊しない / lastModified 不変)', () => {
        const existingLane: TimelineLane = { id: 'existing-lane-1', name: '別のレーン', color: '#aabbcc' };
        const project: Project = { ...baseProject(), timelineLanes: [existingLane] };
        const { fake, markDirty } = mountSlice(project);
        const beforeLastModified = fake.state.allProjectsData['p-1'].lastModified;

        fake.state.ensureDefaultLane();

        const updated = fake.state.allProjectsData['p-1'];
        expect(updated.timelineLanes).toHaveLength(1);
        expect(updated.timelineLanes[0]).toEqual(existingLane);
        expect(updated.lastModified).toBe(beforeLastModified);
        expect(markDirty).not.toHaveBeenCalled();
    });

    it('複数 lane が既存にある場合も no-op (既存配列を順序含めて維持)', () => {
        const laneA: TimelineLane = { id: 'a', name: 'A', color: '#111111' };
        const laneB: TimelineLane = { id: 'b', name: 'B', color: '#222222' };
        const project: Project = { ...baseProject(), timelineLanes: [laneA, laneB] };
        const { fake } = mountSlice(project);

        fake.state.ensureDefaultLane();

        const updated = fake.state.allProjectsData['p-1'];
        expect(updated.timelineLanes).toEqual([laneA, laneB]);
    });

    it('連続呼出で 2 回目以降は no-op (idempotent、ID 再生成しない)', () => {
        const project: Project = { ...baseProject() };
        const { fake } = mountSlice(project);

        fake.state.ensureDefaultLane();
        const firstLaneId = fake.state.allProjectsData['p-1'].timelineLanes[0].id;
        fake.state.ensureDefaultLane();
        const secondLanes = fake.state.allProjectsData['p-1'].timelineLanes;

        expect(secondLanes).toHaveLength(1);
        expect(secondLanes[0].id).toBe(firstLaneId);
    });

    it('activeProjectId が null の場合は no-op (例外を投げない)', () => {
        const project: Project = { ...baseProject() };
        const { fake } = mountSlice(project);
        fake.state.activeProjectId = null;

        expect(() => fake.state.ensureDefaultLane()).not.toThrow();
        expect(fake.state.allProjectsData['p-1'].timelineLanes).toEqual([]);
    });

    it('activeProjectId に対応する project が存在しない場合は no-op (例外を投げない)', () => {
        const project: Project = { ...baseProject() };
        const { fake } = mountSlice(project);
        fake.state.activeProjectId = 'non-existent';

        expect(() => fake.state.ensureDefaultLane()).not.toThrow();
    });

    it('AC-7 (Codex 指摘): PR-A2 リグレッション孤児 event があれば、その laneId を新 default lane の id として採用する', () => {
        // 既に PR-A2 リグレッションで event.laneId='orphan-lane' / timelineLanes=[] が永続化済みの想定。
        // この状態で hotfix 実装が新 uuid を生成すると、event は引き続き孤児化したまま。
        // → 既存 event の laneId を採用することで孤児を救済する。
        const orphanEvent = eventFixture({ laneId: 'pre-existing-uuid-xyz' });
        const project: Project = { ...baseProject(), timeline: [orphanEvent] };
        const { fake } = mountSlice(project);

        fake.state.ensureDefaultLane();

        const updated = fake.state.allProjectsData['p-1'];
        expect(updated.timelineLanes).toHaveLength(1);
        expect(updated.timelineLanes[0].id).toBe('pre-existing-uuid-xyz');
        expect(updated.timelineLanes[0].name).toBe('メインストーリー');
        expect(updated.timelineLanes[0].color).toBe('#6b7280');
        // event 側は不変 (最小侵襲)
        expect(updated.timeline[0]).toEqual(orphanEvent);
    });

    it("AC-7: createEventFromPlot のフォールバック値 'default' を持つ event があれば、'default' を採用する", () => {
        // createEventFromPlot は timelineLanes 空時に laneId='default' でイベントを作る (Issue #182)。
        // Phase 1 hotfix では Issue #182 の完全解決はしないが、'default' を採用することで救済する。
        const orphanEvent = eventFixture({ laneId: 'default' });
        const project: Project = { ...baseProject(), timeline: [orphanEvent] };
        const { fake } = mountSlice(project);

        fake.state.ensureDefaultLane();

        const updated = fake.state.allProjectsData['p-1'];
        expect(updated.timelineLanes[0].id).toBe('default');
    });

    it('AC-7: 複数 event が distinct laneId を持つ場合、最初の event の laneId を採用 (残りは Phase 2/3 で対応)', () => {
        const eventA = eventFixture({ id: 'e1', laneId: 'lane-A' });
        const eventB = eventFixture({ id: 'e2', laneId: 'lane-B' });
        const project: Project = { ...baseProject(), timeline: [eventA, eventB] };
        const { fake } = mountSlice(project);

        fake.state.ensureDefaultLane();

        const updated = fake.state.allProjectsData['p-1'];
        expect(updated.timelineLanes).toHaveLength(1);
        expect(updated.timelineLanes[0].id).toBe('lane-A');
        // event 側は不変 (eventB は引き続き孤児、Phase 2/3 スコープ)
        expect(updated.timeline).toEqual([eventA, eventB]);
    });

    it('AC-7: event が空の場合は uuidv4 で新規生成 (既存挙動を維持)', () => {
        const project: Project = { ...baseProject(), timeline: [] };
        const { fake } = mountSlice(project);

        fake.state.ensureDefaultLane();

        const updated = fake.state.allProjectsData['p-1'];
        expect(updated.timelineLanes).toHaveLength(1);
        // uuidv4 の生成パターンを正規表現で確認
        expect(updated.timelineLanes[0].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it('追加後の lastModified が更新される (markDirty 経由で自動保存トリガー)', () => {
        const project: Project = { ...baseProject() };
        const { fake } = mountSlice(project);
        const beforeLastModified = fake.state.allProjectsData['p-1'].lastModified;

        fake.state.ensureDefaultLane();

        const updated = fake.state.allProjectsData['p-1'];
        expect(updated.lastModified).not.toBe(beforeLastModified);
        expect(new Date(updated.lastModified).getTime()).toBe(new Date('2026-06-18T00:00:00Z').getTime());
    });
});
