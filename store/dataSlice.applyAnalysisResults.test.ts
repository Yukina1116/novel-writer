import { describe, it, expect, vi } from 'vitest';

// `analysisApi` re-imports the store, which would create a circular dependency
// during vitest's pure-ESM module load and leave `createDataSlice` undefined at
// init time. Stub it so the test exercises the slice in isolation.
vi.mock('../analysisApi', () => ({
    analyzeText: vi.fn(),
}));

import { createDataSlice } from './dataSlice';
import type { Project, AnalysisResult, NovelChunk, SettingItem } from '../types';

// Regression test for Issue #105: `applyAnalysisResults` must NOT push the
// imported text into `novelContent`. The slice's setActiveProjectData updater
// is captured here and exercised against a controlled project state so we can
// assert that novelContent is left untouched.

const makeBaseProject = (extras: Partial<Project> = {}): Project => ({
    id: 'p-1',
    name: 'P',
    lastModified: new Date(0).toISOString(),
    settings: [] as SettingItem[],
    novelContent: [{ id: 'c-existing', text: '既存の本文' } as NovelChunk],
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
    ...extras,
});

const makeAnalysisResult = (): AnalysisResult => ({
    characters: {
        match: [],
        similar: [],
        new: ['水澤怜'],
        extractedDetails: [
            {
                name: '水澤怜',
                age: 10,
                gender: '男の子',
                personality: 'shy',
                speechStyle: 'quiet',
                dialogueSamples: ['…'],
                summary: 's',
                detailDescription: 'd',
                memo: 'm',
                role: '主人公',
                confidence: 'high',
                suggestedColor: '#0000ff',
            },
        ],
    },
    worldContext: { worldKeywords: [], genre: 'fantasy', tone: 'neutral' },
    worldTerms: {
        match: [],
        similar: [],
        new: [{ name: '絵本', description: 'children book' }],
    },
    dialogues: [],
    notes: [],
});

interface FakeStore {
    state: Record<string, any>;
    set: (partial: any) => void;
    get: () => Record<string, any>;
}

const createFakeStore = (): FakeStore => {
    const fake: FakeStore = { state: {} as any, set: () => {}, get: () => fake.state };
    fake.set = (partial: any) => {
        const next = typeof partial === 'function' ? partial(fake.state) : partial;
        fake.state = { ...fake.state, ...next };
    };
    fake.get = () => fake.state;
    return fake;
};

describe('applyAnalysisResults — Issue #105 regression (novelContent must not be touched)', () => {
    it('does not append any chunk to novelContent when applying analysis results', () => {
        const fake = createFakeStore();
        const slice = createDataSlice(fake.set, fake.get);

        let capturedUpdater: ((d: Project) => Project) | null = null;
        const baseProject = makeBaseProject();

        fake.state = {
            ...slice,
            activeProjectId: 'p-1',
            allProjectsData: { 'p-1': baseProject },
            addHistory: vi.fn(),
            markDirty: vi.fn(),
            showToast: vi.fn(),
            // Capture the updater so the test can run it deterministically.
            setActiveProjectData: (updater: (d: Project) => Project) => {
                capturedUpdater = updater;
            },
            lastAnalysisResult: makeAnalysisResult(),
        };

        slice.applyAnalysisResults({
            characters: [{ name: '水澤怜', action: 'create' }],
            worldTerms: [{ name: '絵本', action: 'world' }],
        });

        expect(capturedUpdater).not.toBeNull();
        const result = capturedUpdater!(baseProject);

        // novelContent must remain identical — no chunk is appended.
        expect(result.novelContent).toEqual(baseProject.novelContent);
        expect(result.novelContent).toHaveLength(1);
        expect(result.novelContent[0].id).toBe('c-existing');
        expect(result.novelContent[0].text).toBe('既存の本文');
    });

    it('still applies character and world-term selections (regression scope is limited)', () => {
        const fake = createFakeStore();
        const slice = createDataSlice(fake.set, fake.get);

        let capturedUpdater: ((d: Project) => Project) | null = null;
        const baseProject = makeBaseProject();

        fake.state = {
            ...slice,
            activeProjectId: 'p-1',
            allProjectsData: { 'p-1': baseProject },
            addHistory: vi.fn(),
            markDirty: vi.fn(),
            showToast: vi.fn(),
            setActiveProjectData: (updater: (d: Project) => Project) => {
                capturedUpdater = updater;
            },
            lastAnalysisResult: makeAnalysisResult(),
        };

        slice.applyAnalysisResults({
            characters: [{ name: '水澤怜', action: 'create' }],
            worldTerms: [{ name: '絵本', action: 'world' }],
        });

        const result = capturedUpdater!(baseProject);

        // Character is registered as a new setting.
        const newChar = result.settings.find(s => s.name === '水澤怜');
        expect(newChar).toBeDefined();
        expect(newChar!.type).toBe('character');

        // World term is registered as a new setting.
        const newWorld = result.settings.find(s => s.name === '絵本');
        expect(newWorld).toBeDefined();
        expect(newWorld!.type).toBe('world');
    });

    it('is a no-op when activeProjectId is missing', () => {
        const fake = createFakeStore();
        const slice = createDataSlice(fake.set, fake.get);

        const setActiveProjectData = vi.fn();
        fake.state = {
            ...slice,
            activeProjectId: null,
            allProjectsData: {},
            addHistory: vi.fn(),
            markDirty: vi.fn(),
            showToast: vi.fn(),
            setActiveProjectData,
            lastAnalysisResult: makeAnalysisResult(),
        };

        slice.applyAnalysisResults({ characters: [], worldTerms: [] });
        expect(setActiveProjectData).not.toHaveBeenCalled();
    });

    it('is a no-op when lastAnalysisResult is null', () => {
        const fake = createFakeStore();
        const slice = createDataSlice(fake.set, fake.get);

        const setActiveProjectData = vi.fn();
        fake.state = {
            ...slice,
            activeProjectId: 'p-1',
            allProjectsData: { 'p-1': makeBaseProject() },
            addHistory: vi.fn(),
            markDirty: vi.fn(),
            showToast: vi.fn(),
            setActiveProjectData,
            lastAnalysisResult: null,
        };

        slice.applyAnalysisResults({ characters: [], worldTerms: [] });
        expect(setActiveProjectData).not.toHaveBeenCalled();
    });
});
