import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../novelApi', () => ({
    generateNovelContinuation: vi.fn(),
}));
vi.mock('../utilityApi', () => ({
    extractCharacterInfo: vi.fn(),
}));

import { createAiSlice } from './aiSlice';
import { normalizeChapterIds, __resetChapterIdWarnState } from '../utils';
import type { Project, NovelChunk } from '../types';

// PR-2 F-E: aiSlice の chapterId 継承 (R2 + title invariant) の wiring guard。
// handleAdoptContinuation が呼ばれたとき、新規追加 chunk の chapterId が
// assignChapterIdForAppend 経由で正しく決まることを pin する。

beforeEach(() => {
    __resetChapterIdWarnState();
});

const baseProject = (novelContent: NovelChunk[] = []): Project => ({
    id: 'p-1',
    name: 'P',
    lastModified: new Date(0).toISOString(),
    settings: [],
    novelContent,
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

const mkChunk = (id: string, text: string): NovelChunk => ({ id, text });

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
    const slice = createAiSlice(fake.set, fake.get);
    let capturedUpdater: ((d: Project) => Project) | null = null;
    fake.state = {
        ...slice,
        activeProjectId: 'p-1',
        allProjectsData: { 'p-1': project },
        openModal: vi.fn(),
        closeModal: vi.fn(),
        showToast: vi.fn(),
        addHistory: vi.fn(),
        markDirty: vi.fn(),
        setActiveProjectData: (updater: (d: Project) => Project) => {
            capturedUpdater = updater;
        },
    };
    return { slice, fake, getUpdated: () => capturedUpdater!(project) };
};

describe('handleAdoptContinuation (R2 + F-A title invariant)', () => {
    it('採用テキストが body chunk なら最終章の chapterId を継承する (R2)', () => {
        const content = normalizeChapterIds([
            mkChunk('A', '# 第1章'),
            mkChunk('B', '第1章本文'),
        ]);
        const project = baseProject(content);
        const { slice, getUpdated } = mountSlice(project);

        slice.handleAdoptContinuation('AIが生成した続きの本文');

        const updated = getUpdated();
        expect(updated.novelContent).toHaveLength(3);
        const appended = updated.novelContent[2];
        expect(appended.text).toBe('AIが生成した続きの本文');
        expect(appended.chapterId).toBe('A'); // 末尾 chunk B の chapterId === 'A' を継承
    });

    it('採用テキストが `# 第2章` で始まる title chunk なら self.id (F-A)', () => {
        const content = normalizeChapterIds([
            mkChunk('A', '# 第1章'),
            mkChunk('B', '第1章本文'),
        ]);
        const project = baseProject(content);
        const { slice, getUpdated } = mountSlice(project);

        slice.handleAdoptContinuation('# 第2章');

        const updated = getUpdated();
        const appended = updated.novelContent[updated.novelContent.length - 1];
        expect(appended.text).toBe('# 第2章');
        expect(appended.chapterId).toBe(appended.id); // F-A: title invariant
    });

    it('空 novel に採用すると chapterId === null (uncategorized)', () => {
        const project = baseProject([]);
        const { slice, getUpdated } = mountSlice(project);

        slice.handleAdoptContinuation('最初の本文');

        const updated = getUpdated();
        expect(updated.novelContent[0].chapterId).toBe(null);
    });

    it('空 novel + title chunk 採用は self.id (uncategorized append にしない)', () => {
        const project = baseProject([]);
        const { slice, getUpdated } = mountSlice(project);

        slice.handleAdoptContinuation('# はじめての章');

        const updated = getUpdated();
        const appended = updated.novelContent[0];
        expect(appended.chapterId).toBe(appended.id);
    });

    it('末尾が uncategorized chunk のとき body 採用は null 継承', () => {
        const content = normalizeChapterIds([mkChunk('A', '本文')]);
        const project = baseProject(content);
        const { slice, getUpdated } = mountSlice(project);

        slice.handleAdoptContinuation('続きの本文');

        const updated = getUpdated();
        expect(updated.novelContent[updated.novelContent.length - 1].chapterId).toBe(null);
    });
});
